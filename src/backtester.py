"""Backtester — time-synchronized multi-pair walk-forward simulation.

Runs the SAME agent pipeline the live orchestrator runs:
  6 signal agents -> cross-pair boost -> deterministic analyst fallback
  -> risk governor -> ATR-based position management

Execution model:
  - Next-bar open fills (signal at bar i, fill at bar i+1)
  - Kraken taker fees on both entry and exit
  - Vol-scaled slippage (half-spread, scales with ATR/price)
  - Cash validation before every entry

Supports CSV data loading for extended backtests — prefers the FMP CSV
(``{PAIR}_60m_fmp.csv``) which gives 10+ years of hourly data.

Usage:
    python scripts/final_report.py                 # full IS/OOS report
    python scripts/final_report.py --interval 240  # 4h aggregation
"""

import logging
import math
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats as sp_stats

from src.agents.llm_analyst import deterministic_fallback
from src.agents.risk_governor import evaluate_risk
from src.agents.signals import (
    mean_reversion_signal,
    momentum_signal,
    swing_structure_signal,
    trend_signal,
    volatility_signal,
)
from src.config import RISK, STRATEGY
from src.execution.kraken_adapter import KRAKEN_TAKER_FEE
from src.features.engine import compute_features_bulk, features_at
from src.models import ClosedTrade, Direction, Portfolio, SignalReport

logger = logging.getLogger(__name__)

FEE_RATE = KRAKEN_TAKER_FEE
TYPICAL_SPREAD_BPS = 8.0
ENTRY_SLIPPAGE_BPS = TYPICAL_SPREAD_BPS / 2.0
EXIT_SLIPPAGE_BPS = TYPICAL_SPREAD_BPS / 2.0
BASELINE_ATR_PCT = 0.025  # 2.5% — median BTC ATR/price ratio for vol-scaling

RANDOM_SEED = 42
BARS_PER_YEAR_4H = 2190  # 365.25 * 24 / 4 ≈ 2191.5; rounded to 2190 for annualization


_SIGNAL_FUNCS = {
    "trend": trend_signal,
    "volatility": volatility_signal,
    "mean_reversion": mean_reversion_signal,
    "momentum": momentum_signal,
    "swing_structure": swing_structure_signal,
}
VALID_AGENT_NAMES = frozenset(_SIGNAL_FUNCS.keys())


def _run_signals(features, enabled_agents: Optional[set[str]] = None):
    """Run deterministic signal agents, optionally restricted to a subset.

    Args:
        features: ``Features`` object with precomputed indicators.
        enabled_agents: Optional set of agent names to run. When ``None``
            (default), all six agents execute in their canonical order.
            When provided, only agents whose name appears in the set are
            invoked. Valid names are ``VALID_AGENT_NAMES``. Unknown names
            are silently ignored. This hook exists so ablation studies can
            disable individual agents without touching the orchestrator.

    Returns:
        List of ``SignalReport`` objects in the canonical agent order.
    """
    if enabled_agents is None:
        return [fn(features) for fn in _SIGNAL_FUNCS.values()]
    return [
        fn(features)
        for name, fn in _SIGNAL_FUNCS.items()
        if name in enabled_agents
    ]


def _apply_cross_pair_boost_sync(
    signals: list[SignalReport],
    pair: str,
    last_pair_signals: dict,
) -> list[SignalReport]:
    """Synchronous analogue of orchestrator._apply_cross_pair_boost.

    Mutates ``last_pair_signals`` in place with the current pair's majority
    direction and boosts confidence by 10% on every aligned signal when the
    other pair's last observed direction matches.
    """
    directional = [s for s in signals if s.direction != Direction.HOLD]
    if not directional:
        last_pair_signals[pair] = "hold"
        return signals

    longs = sum(1 for s in directional if s.direction == Direction.LONG)
    shorts = len(directional) - longs
    if longs > shorts:
        majority = "long"
    elif shorts > longs:
        majority = "short"
    else:
        majority = "hold"
    last_pair_signals[pair] = majority

    other_pair = "ETHUSD" if pair == "BTCUSD" else "BTCUSD"
    other_dir = last_pair_signals.get(other_pair, "hold")

    if other_dir != "hold" and other_dir == majority:
        for s in signals:
            if s.direction.value == majority:
                s.confidence = min(100.0, s.confidence * 1.1)
                s.evidence["cross_pair_boost"] = True

    return signals


def _simulate_close(position, close_price):
    """Compute PnL for closing a position at given price.

    Matches live Kraken paper adapter: taker fees on exit notional plus
    volatility-scaled half-spread exit slippage.
    """
    side = position["side"]
    entry = position["entry_price"]
    size = position["size_usd"]
    fees = size * FEE_RATE

    atr = position.get("atr_20", 0.0)
    slip = _vol_scaled_slip(EXIT_SLIPPAGE_BPS, atr, close_price)
    effective_exit = close_price * (1 - slip) if side == "long" else close_price * (1 + slip)

    if side == "long":
        pnl_pct = (effective_exit - entry) / entry
    else:
        pnl_pct = (entry - effective_exit) / entry

    pnl_usd = size * pnl_pct - fees
    return pnl_usd, pnl_pct


def _vol_scaled_slip(base_bps: float, atr: float, price: float) -> float:
    """Scale slippage by current volatility relative to baseline.

    During high-vol regimes (ATR/price >> baseline), spreads widen.
    Returns the slip as a fraction (not bps).
    """
    if price <= 0:
        return base_bps / 10000.0
    atr_pct = atr / price
    vol_mult = max(1.0, atr_pct / BASELINE_ATR_PCT)
    return (base_bps * vol_mult) / 10000.0


def _entry_fill_price(side: str, price: float,
                      atr: float = 0.0) -> float:
    """Apply volatility-scaled half-spread entry slippage."""
    slip = _vol_scaled_slip(ENTRY_SLIPPAGE_BPS, atr, price)
    if side == "long":
        return price * (1 + slip)
    return price * (1 - slip)


def load_csv(pair: str, interval: int) -> pd.DataFrame:
    """Load OHLCV data from CSV, preferring the FMP file when available.

    The FMP CSV (``{pair}_60m_fmp.csv``) provides 10+ years of hourly data
    and matches the dashboard's primary live feed, making backtest and
    hackathon runs share the same spot price series.

    Args:
        pair: Trading pair (e.g. ``BTCUSD``).
        interval: Source candle interval in minutes.

    Returns:
        DataFrame with OHLCV columns and DatetimeIndex.

    Raises:
        FileNotFoundError: If no CSV file exists for the pair.
    """
    data_dir = Path(__file__).resolve().parent.parent / "data"
    fmp_path = data_dir / f"{pair}_{interval}m_fmp.csv"
    legacy_path = data_dir / f"{pair}_{interval}m.csv"
    path = fmp_path if fmp_path.exists() else legacy_path
    if not path.exists():
        raise FileNotFoundError(
            f"No CSV at {fmp_path} or {legacy_path}. "
            f"Run: python scripts/download_fmp_history.py"
        )
    df = pd.read_csv(path, index_col="timestamp", parse_dates=True)
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)
    df = df[~df.index.duplicated(keep="first")].sort_index()
    return df



def backtest_portfolio(
    pair_frames: dict[str, pd.DataFrame],
    initial_equity: float = 10000.0,
    max_hold_bars: Optional[int] = None,
    cooldown_bars: Optional[int] = None,
    stop_mult: Optional[float] = None,
    target_mult_base: Optional[float] = None,
    target_mult_mid: Optional[float] = None,
    target_mult_hi: Optional[float] = None,
    trail_mult: Optional[float] = None,
    macro_filter: Optional[bool] = None,
    min_adx_for_entry: Optional[float] = None,
    dd_scale_threshold: Optional[float] = None,
    dd_scale_factor: Optional[float] = None,
    atr_pct_max: Optional[float] = None,
    strict_macro: Optional[bool] = None,
    mtf_daily_filter: Optional[bool] = None,
    reversal_exit: bool = False,
    cross_pair_boost: bool = True,
    be_trigger_pct: float = 0.006,
    lock_trigger_pct: float = 0.012,
    lock_value_pct: float = 0.0065,
    partial_tp_pct: float = 0.0,  # Fraction of position to close at atr_target (0=disabled, 0.5=half)
    precomputed_features: Optional[dict[str, pd.DataFrame]] = None,
    enabled_agents: Optional[set[str]] = None,
    num_trials: int = 1,
    verbose: bool = True,
) -> dict:
    """Time-synchronized multi-pair backtest matching live orchestrator flow.

    Iterates the merged timestamp index across all pairs and at each bar
    runs the pair's full pipeline in fixed pair-order (mirroring the live
    strategic cycle). This gives the cross-pair boost the same ordering
    as live, with no look-ahead from a previously-completed pair loop.

    A single shared Portfolio is mutated across all pairs, so metrics
    reflect the true combined equity curve (not two independently-sized
    $10k accounts summed).

    Args:
        pair_frames: Dict of {pair_name: OHLCV DataFrame}. Frames must
            share the same bar interval; they are not required to start
            on the same date.
        initial_equity: Starting total equity for the combined portfolio.
        max_hold_bars: Max bars held before a time-based exit.
        cooldown_bars: Bars to wait after kill criteria.
        stop_mult, target_mult_*, trail_mult: ATR multipliers.
        macro_filter: Require EMA 55/200 alignment for new entries.
        reversal_exit: Enable the RSI reversal exit.
        cross_pair_boost: Enable the live cross-pair confidence boost.
        precomputed_features: Optional pre-computed feature frames per pair.
        verbose: Print progress messages.

    Returns:
        Dict with combined metrics, per-pair metrics, trades, equity curve.
    """
    stop_mult = RISK.stop_mult if stop_mult is None else stop_mult
    target_mult_base = RISK.target_mult_base if target_mult_base is None else target_mult_base
    target_mult_mid = RISK.target_mult_mid if target_mult_mid is None else target_mult_mid
    target_mult_hi = RISK.target_mult_hi if target_mult_hi is None else target_mult_hi
    trail_mult = RISK.trail_mult if trail_mult is None else trail_mult
    max_hold_bars = RISK.max_hold_bars if max_hold_bars is None else max_hold_bars
    cooldown_bars = RISK.cooldown_bars if cooldown_bars is None else cooldown_bars
    macro_filter = RISK.macro_filter if macro_filter is None else macro_filter
    min_adx_for_entry = RISK.min_adx_for_entry if min_adx_for_entry is None else min_adx_for_entry
    dd_scale_threshold = RISK.dd_scale_threshold if dd_scale_threshold is None else dd_scale_threshold
    dd_scale_factor = RISK.dd_scale_factor if dd_scale_factor is None else dd_scale_factor
    atr_pct_max = RISK.atr_pct_max if atr_pct_max is None else atr_pct_max
    strict_macro = RISK.strict_macro if strict_macro is None else strict_macro
    mtf_daily_filter = RISK.mtf_daily_filter if mtf_daily_filter is None else mtf_daily_filter

    portfolio = Portfolio(equity=initial_equity, cash=initial_equity,
                          peak_equity=initial_equity)
    all_trades: list[dict] = []
    per_pair_trades: dict[str, list[dict]] = {p: [] for p in pair_frames}
    rejections: dict[str, dict[str, int]] = {
        p: {"NO_SIGNAL": 0, "NO_CONSENSUS": 0, "FALLBACK_NO_CONSENSUS": 0,
            "BELOW_THRESHOLD": 0, "INSUFFICIENT_ALIGNMENT": 0,
            "MAX_EXPOSURE": 0, "SHORT_BELOW_THRESHOLD": 0,
            "SHORTS_DISABLED": 0, "DOWNTREND_NO_LONG": 0,
            "UPTREND_NO_SHORT": 0, "VOLATILITY_SHOCK": 0,
            "MACRO_FILTER": 0, "KILL": 0} for p in pair_frames
    }
    warmup = 200
    last_pair_signals: dict[str, str] = {}

    bulks: dict[str, pd.DataFrame] = {}
    if precomputed_features:
        bulks.update(precomputed_features)
    for pair, df in pair_frames.items():
        if pair not in bulks:
            if verbose:
                print(f"  Pre-computing features for {pair}: {len(df):,} bars...")
            bulks[pair] = compute_features_bulk(df, pair)

    daily_ema_uptrends: dict[str, pd.Series] = {}
    if mtf_daily_filter:
        import pandas_ta as ta
        fast = RISK.mtf_daily_fast
        slow = RISK.mtf_daily_slow
        for pair, df in pair_frames.items():
            daily = df.resample("1D").agg({
                "open": "first", "high": "max", "low": "min",
                "close": "last", "volume": "sum",
            }).dropna()
            if len(daily) < slow:
                daily_ema_uptrends[pair] = pd.Series(dtype=bool)
                continue
            ema_f = ta.ema(daily["close"], length=fast)
            ema_s = ta.ema(daily["close"], length=slow)
            is_up = (ema_f > ema_s).fillna(False)
            daily_ema_uptrends[pair] = is_up

    per_pair_idx: dict[str, int] = {}
    for pair, df in pair_frames.items():
        if len(df) < warmup + 10:
            return {"error": f"{pair} needs {warmup+10}+ bars, got {len(df)}"}
        per_pair_idx[pair] = warmup

    all_timestamps = sorted(
        set().union(
            *[set(df.index[warmup:]) for df in pair_frames.values()]
        )
    )

    positions: dict[str, dict] = {}
    pending_entries: dict[str, dict] = {}
    bars_held: dict[str, int] = {}
    prev_day = None
    risk_cooldown = 0
    equity_curve: list[tuple[pd.Timestamp, float]] = []
    buy_hold_start: dict[str, float] = {
        p: float(df["close"].iloc[warmup]) for p, df in pair_frames.items()
    }

    pair_order = list(pair_frames.keys())

    for ts in all_timestamps:
        current_day = ts.date()
        if prev_day is not None and current_day != prev_day:
            portfolio.daily_pnl = 0.0
        prev_day = current_day

        if risk_cooldown > 0:
            risk_cooldown -= 1
            if risk_cooldown == 0:
                portfolio.consecutive_losses = 0

        for pair in pair_order:
            df = pair_frames[pair]
            bulk = bulks[pair]
            if ts not in df.index:
                continue
            try:
                i = df.index.get_loc(ts)
            except KeyError:
                continue
            if isinstance(i, slice):
                i = i.start

            close_price = float(df["close"].iloc[i])
            open_price = float(df["open"].iloc[i])

            try:
                features = features_at(bulk, i)
            except Exception as e:
                logger.debug("features_at failed for %s at %s: %s", pair, ts, e)
                continue

            # Fill pending entry from PREVIOUS bar's signal at THIS bar's open.
            if pair in pending_entries and pair not in positions:
                pe = pending_entries.pop(pair)
                fees = pe["size_usd"] * FEE_RATE
                if portfolio.cash < pe["size_usd"] + fees:
                    continue
                entry_fill = _entry_fill_price(pe["side"], open_price,
                                               atr=pe["atr"])
                portfolio.cash -= fees
                portfolio.equity -= fees
                portfolio.trade_count += 1

                atr = pe["atr"]
                adx = pe["adx"]
                if adx >= 35:
                    t_mult = target_mult_hi
                elif adx >= 25:
                    t_mult = target_mult_mid
                else:
                    t_mult = target_mult_base

                if pe["side"] == "long":
                    atr_stop = entry_fill - (atr * stop_mult)
                    atr_target = entry_fill + (atr * t_mult)
                else:
                    atr_stop = entry_fill + (atr * stop_mult)
                    atr_target = entry_fill - (atr * t_mult)

                positions[pair] = {
                    "side": pe["side"],
                    "size_usd": pe["size_usd"],
                    "entry_price": entry_fill,
                    "atr_stop": atr_stop,
                    "atr_target": atr_target,
                    "atr_20": atr,
                    "peak_price": entry_fill,
                    "signal_score": pe["signal_score"],
                }
                portfolio.positions[pair] = {
                    "side": pe["side"],
                    "size_usd": pe["size_usd"],
                    "entry_price": entry_fill,
                }
                bars_held[pair] = 0

            if pair in positions:
                position = positions[pair]
                bars_held[pair] = bars_held.get(pair, 0) + 1
                entry = position["entry_price"]
                side = position["side"]
                atr = position.get("atr_20", features.atr_20)
                atr_stop = position.get("atr_stop")
                atr_target = position.get("atr_target")
                peak = position.get("peak_price", entry)

                close_trade = False
                reason = ""

                be_long = 1.0 + be_trigger_pct
                lock_long = 1.0 + lock_trigger_pct
                lock_val_long = 1.0 + lock_value_pct
                be_short = 1.0 - be_trigger_pct
                lock_short = 1.0 - lock_trigger_pct
                lock_val_short = 1.0 - lock_value_pct

                if side == "long":
                    peak = max(peak, close_price)
                    trail = peak - atr * trail_mult
                    if peak > entry * be_long:
                        trail = max(trail, entry)
                    if peak > entry * lock_long:
                        trail = max(trail, entry * lock_val_long)
                    if atr_stop and close_price <= atr_stop:
                        close_trade = True
                        reason = "atr_stop"
                    elif atr_target and close_price >= atr_target:
                        if partial_tp_pct > 0 and not position.get("partial_taken"):
                            partial_size = position["size_usd"] * partial_tp_pct
                            partial_pnl = partial_size * ((close_price - entry) / entry) - partial_size * FEE_RATE
                            portfolio.equity += partial_pnl
                            portfolio.cash += partial_pnl
                            portfolio.total_pnl += partial_pnl
                            portfolio.daily_pnl += partial_pnl
                            position["size_usd"] -= partial_size
                            position["partial_taken"] = True
                            position["atr_target"] = None
                        else:
                            close_trade = True
                            reason = "atr_target"
                    elif close_price <= trail and peak > entry * be_long:
                        close_trade = True
                        reason = "trailing_stop"
                    elif (reversal_exit and features.rsi_14 < 45
                            and close_price < entry and bars_held[pair] >= 2):
                        close_trade = True
                        reason = "reversal_exit"
                else:
                    peak = min(peak, close_price)
                    trail = peak + atr * trail_mult
                    if peak < entry * be_short:
                        trail = min(trail, entry)
                    if peak < entry * lock_short:
                        trail = min(trail, entry * lock_val_short)
                    if atr_stop and close_price >= atr_stop:
                        close_trade = True
                        reason = "atr_stop"
                    elif atr_target and close_price <= atr_target:
                        if partial_tp_pct > 0 and not position.get("partial_taken"):
                            partial_size = position["size_usd"] * partial_tp_pct
                            partial_pnl = partial_size * ((entry - close_price) / entry) - partial_size * FEE_RATE
                            portfolio.equity += partial_pnl
                            portfolio.cash += partial_pnl
                            portfolio.total_pnl += partial_pnl
                            portfolio.daily_pnl += partial_pnl
                            position["size_usd"] -= partial_size
                            position["partial_taken"] = True
                            position["atr_target"] = None
                        else:
                            close_trade = True
                            reason = "atr_target"
                    elif close_price >= trail and peak < entry * be_short:
                        close_trade = True
                        reason = "trailing_stop"
                    elif (reversal_exit and features.rsi_14 > 55
                            and close_price > entry and bars_held[pair] >= 2):
                        close_trade = True
                        reason = "reversal_exit"

                position["peak_price"] = peak

                if not close_trade and bars_held[pair] >= max_hold_bars:
                    close_trade = True
                    reason = "time_exit"

                if close_trade:
                    pnl_usd, pnl_pct = _simulate_close(position, close_price)
                    portfolio.equity += pnl_usd
                    portfolio.cash += pnl_usd
                    portfolio.total_pnl += pnl_usd
                    portfolio.daily_pnl += pnl_usd

                    if pnl_usd < 0:
                        portfolio.consecutive_losses += 1
                        portfolio.total_losses += 1
                    else:
                        portfolio.consecutive_losses = 0
                        portfolio.total_wins += 1

                    portfolio.closed_trades.append(
                        ClosedTrade(
                            pair=pair,
                            pnl_pct=float(pnl_pct),
                            is_win=pnl_usd > 0,
                        )
                    )

                    portfolio.peak_equity = max(portfolio.peak_equity, portfolio.equity)
                    portfolio.drawdown_pct = (
                        (portfolio.peak_equity - portfolio.equity) / portfolio.peak_equity
                        if portfolio.peak_equity > 0 else 0.0
                    )

                    if (portfolio.consecutive_losses >= RISK.max_consecutive_losses
                            or portfolio.drawdown_pct > RISK.max_drawdown_pct):
                        risk_cooldown = cooldown_bars

                    trade = {
                        "bar": i,
                        "timestamp": str(ts),
                        "pair": pair,
                        "side": position["side"],
                        "entry": position["entry_price"],
                        "exit": close_price,
                        "pnl_usd": round(pnl_usd, 2),
                        "pnl_pct": round(pnl_pct * 100, 3),
                        "reason": reason,
                        "equity": round(portfolio.equity, 2),
                        "signal_score": position.get("signal_score", 0),
                        "bars_held": bars_held[pair],
                    }
                    all_trades.append(trade)
                    per_pair_trades[pair].append(trade)

                    del positions[pair]
                    if pair in portfolio.positions:
                        del portfolio.positions[pair]
                    bars_held[pair] = 0
                    continue

            if pair in positions or pair in pending_entries:
                continue

            signals = _run_signals(features, enabled_agents=enabled_agents)
            if cross_pair_boost:
                signals = _apply_cross_pair_boost_sync(
                    signals, pair, last_pair_signals
                )
            analyst = deterministic_fallback(signals, features)

            risk_decision, intent = evaluate_risk(
                signals=signals,
                analyst=analyst,
                features=features,
                portfolio=portfolio,
                snapshot_age_seconds=0.0,
            )

            if not risk_decision.approved:
                for code in risk_decision.reason_codes:
                    if code in rejections[pair]:
                        rejections[pair][code] += 1
                    else:
                        rejections[pair]["KILL"] = rejections[pair].get("KILL", 0) + 1
                continue

            if macro_filter:
                if strict_macro:
                    macro_up = (
                        features.ema_9 > features.ema_21 > features.ema_55 > features.ema_100
                    )
                    macro_down = (
                        features.ema_9 < features.ema_21 < features.ema_55 < features.ema_100
                    )
                else:
                    macro_up = features.ema_55 > features.ema_100
                    macro_down = not macro_up
                if intent.side == Direction.LONG and not macro_up:
                    rejections[pair]["MACRO_FILTER"] += 1
                    continue
                if intent.side == Direction.SHORT and not macro_down:
                    rejections[pair]["MACRO_FILTER"] += 1
                    continue

            if min_adx_for_entry > 0 and features.adx_14 < min_adx_for_entry:
                rejections[pair]["MACRO_FILTER"] += 1
                continue

            if atr_pct_max < 100.0 and features.ema_21 > 0:
                atr_pct = (features.atr_20 / features.ema_21) * 100
                if atr_pct > atr_pct_max:
                    rejections[pair]["VOLATILITY_SHOCK"] += 1
                    continue

            if mtf_daily_filter and pair in daily_ema_uptrends:
                is_up = daily_ema_uptrends[pair]
                if not is_up.empty:
                    day = ts.floor("D")
                    loc = is_up.index.get_indexer([day], method="ffill")[0]
                    if loc < 0:
                        rejections[pair]["MACRO_FILTER"] += 1
                        continue
                    daily_up = bool(is_up.iloc[loc])
                    if intent.side == Direction.LONG and not daily_up:
                        rejections[pair]["MACRO_FILTER"] += 1
                        continue
                    if intent.side == Direction.SHORT and daily_up:
                        rejections[pair]["MACRO_FILTER"] += 1
                        continue

            # Queue pending entry — will fill at NEXT bar's open.
            size_usd = intent.size_usd
            if dd_scale_threshold < 1.0 and portfolio.drawdown_pct > (1.0 - dd_scale_threshold):
                size_usd = size_usd * dd_scale_factor
            pending_entries[pair] = {
                "side": intent.side.value,
                "size_usd": size_usd,
                "atr": features.atr_20,
                "adx": features.adx_14,
                "signal_score": round(intent.signal_score, 1),
            }

        equity_curve.append((ts, portfolio.equity))

    last_ts = all_timestamps[-1] if all_timestamps else None
    for pair in list(positions.keys()):
        df = pair_frames[pair]
        close_price = float(df["close"].iloc[-1])
        position = positions[pair]
        pnl_usd, pnl_pct = _simulate_close(position, close_price)
        portfolio.equity += pnl_usd
        portfolio.total_pnl += pnl_usd
        portfolio.closed_trades.append(
            ClosedTrade(
                pair=pair,
                pnl_pct=float(pnl_pct),
                is_win=pnl_usd > 0,
            )
        )
        trade = {
            "bar": len(df) - 1,
            "timestamp": str(df.index[-1]),
            "pair": pair,
            "side": position["side"],
            "entry": position["entry_price"],
            "exit": close_price,
            "pnl_usd": round(pnl_usd, 2),
            "pnl_pct": round(pnl_pct * 100, 3),
            "reason": "end_of_data",
            "equity": round(portfolio.equity, 2),
            "signal_score": position.get("signal_score", 0),
            "bars_held": bars_held.get(pair, 0),
        }
        all_trades.append(trade)
        per_pair_trades[pair].append(trade)
        del positions[pair]
    equity_curve.append((last_ts, portfolio.equity))

    metrics = compute_metrics(
        trades=all_trades,
        equity_curve=equity_curve,
        initial_equity=initial_equity,
        df=None,
        warmup=warmup,
        num_trials=num_trials,
    )
    metrics["initial_equity"] = initial_equity
    metrics["pairs"] = list(pair_frames.keys())
    metrics["rejections"] = rejections
    metrics["trades"] = all_trades
    metrics["equity_curve"] = equity_curve
    metrics["per_pair_trade_counts"] = {p: len(t) for p, t in per_pair_trades.items()}
    metrics["period_start"] = str(all_timestamps[0]) if all_timestamps else None
    metrics["period_end"] = str(all_timestamps[-1]) if all_timestamps else None

    n_pairs = len(pair_frames)
    bh_alloc = initial_equity / n_pairs
    bh_final = 0.0
    for p, df in pair_frames.items():
        start_price = buy_hold_start[p]
        end_price = float(df["close"].iloc[-1])
        bh_final += bh_alloc * (end_price / start_price)
    metrics["buy_hold_final_equity"] = round(bh_final, 2)
    metrics["buy_hold_return_pct"] = round(
        (bh_final - initial_equity) / initial_equity * 100, 3
    )
    metrics["alpha_pct"] = round(
        metrics["agent_return_pct"] - metrics["buy_hold_return_pct"], 3
    )

    trade_returns_arr = np.array(
        [t.get("pnl_pct", 0.0) / 100.0 for t in all_trades],
        dtype=float,
    )
    sharpe_observed = float(metrics.get("sharpe_annualized", 0.0) or 0.0)
    if trade_returns_arr.size >= 10:
        ci_lower, ci_upper = bootstrap_sharpe_ci(
            trade_returns_arr, annualized_sharpe=sharpe_observed
        )
        psr_tc = psr_trade_count(trade_returns_arr)
    else:
        ci_lower = float("nan")
        ci_upper = float("nan")
        psr_tc = float("nan")
    metrics["psr_trade_count"] = psr_tc
    metrics["sharpe_ci_lower"] = ci_lower
    metrics["sharpe_ci_upper"] = ci_upper
    metrics["bootstrap_seed"] = RANDOM_SEED
    return metrics


def _probabilistic_sharpe(sr: float, sr_benchmark: float,
                          n: int, skew: float, kurt: float) -> float:
    """Probabilistic Sharpe Ratio (PSR) — probability that true SR > benchmark.

    Bailey & Lopez de Prado (2012). Returns the CDF probability.
    """
    if n < 2:
        return 0.0
    sr_std = math.sqrt(
        (1 - skew * sr + (kurt - 1) / 4 * sr ** 2) / (n - 1)
    )
    if sr_std <= 0:
        return 0.0
    z = (sr - sr_benchmark) / sr_std
    return float(sp_stats.norm.cdf(z))


def _deflated_sharpe(sr_observed: float, num_trials: int,
                     n: int, skew: float, kurt: float,
                     sr_variance: float) -> tuple[float, float]:
    """Deflated Sharpe Ratio — adjusts for number of trials.

    Bailey & Lopez de Prado (2014). Returns (DSR probability, expected max SR).
    """
    if num_trials < 2 or n < 2:
        return 0.0, 0.0
    gamma = 0.5772156649
    e = math.e
    sr0 = math.sqrt(sr_variance) * (
        (1 - gamma) * sp_stats.norm.ppf(1 - 1 / num_trials)
        + gamma * sp_stats.norm.ppf(1 - 1 / (num_trials * e))
    )
    return _probabilistic_sharpe(sr_observed, sr0, n, skew, kurt), sr0


def _monte_carlo_pvalue(trade_pnls: list[float], observed_total: float,
                        n_sims: int = 10000,
                        seed: int = RANDOM_SEED) -> float:
    """Monte Carlo permutation test.

    Shuffles trade PnLs and counts how often the shuffled total beats
    the observed total.

    Args:
        trade_pnls: List of per-trade PnLs (any unit).
        observed_total: Observed aggregate PnL to compare against.
        n_sims: Number of random permutations.
        seed: Seed for ``numpy.random.default_rng`` so that p-values are
            reproducible across runs. Defaults to ``RANDOM_SEED``.

    Returns:
        Two-sided p-value approximation (fraction of permutations whose
        total meets or exceeds ``observed_total``).
    """
    if len(trade_pnls) < 5:
        return 1.0
    arr = np.array(trade_pnls)
    rng = np.random.default_rng(seed)
    beat_count = 0
    for _ in range(n_sims):
        rng.shuffle(arr)
        signs = rng.choice([-1, 1], size=len(arr))
        shuffled_total = float(np.sum(arr * signs))
        if shuffled_total >= observed_total:
            beat_count += 1
    return beat_count / n_sims


def bootstrap_sharpe_ci(
    trade_returns: np.ndarray,
    annualized_sharpe: Optional[float] = None,
    confidence: float = 0.95,
    seed: int = RANDOM_SEED,
) -> tuple[float, float]:
    """Analytical confidence interval on an annualized Sharpe ratio.

    Uses the Lo (2002) asymptotic standard error formula
    ``SE(S) = sqrt((1 + S^2 / 2) / T)`` where ``T`` is the number of
    trades. This gives a normal-approximation CI that matches the
    sample-size-uncertainty discussion in the backtest methodology
    paper. The name is preserved for API backward compatibility with
    earlier bootstrap implementations; the current implementation is
    purely analytical and does not use ``seed`` (kept for signature
    stability).

    Args:
        trade_returns: 1-D numpy array of per-trade fractional returns.
            Only ``len(trade_returns)`` is used to determine ``T``; the
            values themselves are used only as a fallback when
            ``annualized_sharpe`` is not provided.
        annualized_sharpe: The observed annualized Sharpe from the
            backtester. When provided (the normal case), the CI is
            centered here. When ``None``, a per-trade Sharpe is
            computed from the returns and annualized with
            ``sqrt(trades_per_year)`` assuming the trades span the
            full period (fallback only; callers should provide
            ``annualized_sharpe`` when possible).
        confidence: Two-sided coverage (e.g. 0.95 for 95% CI).
        seed: Ignored; kept for backward compatibility.

    Returns:
        Tuple ``(lower, upper)`` of floats bounding the annualized
        Sharpe ratio at the requested confidence level. Returns
        ``(nan, nan)`` when fewer than 10 trades are supplied.

    References:
        Lo, A. W. (2002). "The Statistics of Sharpe Ratios." Financial
        Analysts Journal, 58(4), 36-52.
    """
    del seed  # unused; kept for backward compatibility
    arr = np.asarray(trade_returns, dtype=float).ravel()
    n = int(arr.size)
    if n < 10:
        return (float("nan"), float("nan"))

    if annualized_sharpe is None:
        std = float(arr.std(ddof=1))
        if std <= 0:
            return (float("nan"), float("nan"))
        per_trade_sharpe = float(arr.mean()) / std
        annualized_sharpe = per_trade_sharpe * math.sqrt(max(n, 1))

    se = annualized_sharpe * math.sqrt(
        (1.0 + (annualized_sharpe ** 2) / 2.0) / n
    )
    alpha = 1.0 - confidence
    z = float(sp_stats.norm.ppf(1.0 - alpha / 2.0))
    return (
        float(annualized_sharpe - z * se),
        float(annualized_sharpe + z * se),
    )


def jobson_korkie_test(
    returns_a: np.ndarray,
    returns_b: np.ndarray,
    annualized_sharpe_a: Optional[float] = None,
    annualized_sharpe_b: Optional[float] = None,
) -> tuple[float, float]:
    """Sharpe-difference test handling both paired and unpaired samples.

    When ``returns_a`` and ``returns_b`` have the same length, applies
    the Jobson-Korkie (1981) test with the Memmel (2003) bias
    correction (paired case, e.g. two strategies on the same time
    window). When the lengths differ --- as is the case when comparing
    in-sample and out-of-sample windows --- falls back to an unpaired
    normal-approximation test using the Lo (2002) standard error for
    each series and ``Var(SR_a - SR_b) = Var(SR_a) + Var(SR_b)``
    assuming independence. For the unpaired case the caller may supply
    the observed annualized Sharpe ratios via ``annualized_sharpe_a``
    and ``annualized_sharpe_b``; when omitted, per-trade Sharpe is
    computed directly from the return arrays.

    Args:
        returns_a: 1-D numpy array of per-trade returns for strategy A
            (or window A).
        returns_b: 1-D numpy array of per-trade returns for strategy B
            (or window B).
        annualized_sharpe_a: Optional observed annualized Sharpe for A.
            Only used in the unpaired case; ignored when the arrays
            have the same length.
        annualized_sharpe_b: Optional observed annualized Sharpe for B.
            Only used in the unpaired case.

    Returns:
        Tuple ``(z_statistic, p_value)``. ``p_value`` is the two-sided
        probability from the standard normal distribution. Returns
        ``(nan, nan)`` when either series has fewer than 10
        observations or zero variance.

    References:
        Memmel, C. (2003). "Performance Hypothesis Testing with the
            Sharpe Ratio." Finance Letters, 1, 21-23.
        Lo, A. W. (2002). "The Statistics of Sharpe Ratios." Financial
            Analysts Journal, 58(4), 36-52.
    """
    a = np.asarray(returns_a, dtype=float).ravel()
    b = np.asarray(returns_b, dtype=float).ravel()
    if a.size < 10 or b.size < 10:
        return (float("nan"), float("nan"))

    if a.size == b.size:
        mu_a = float(a.mean())
        mu_b = float(b.mean())
        var_a = float(a.var(ddof=1))
        var_b = float(b.var(ddof=1))
        if var_a <= 0 or var_b <= 0:
            return (float("nan"), float("nan"))
        sigma_a = math.sqrt(var_a)
        sigma_b = math.sqrt(var_b)
        sr_a = mu_a / sigma_a
        sr_b = mu_b / sigma_b
        cov_ab = float(np.cov(a, b, ddof=1)[0, 1])
        n = a.size
        theta = (1.0 / n) * (
            2.0 - 2.0 * cov_ab / (sigma_a * sigma_b)
            + 0.5 * (sr_a ** 2 + sr_b ** 2)
            - sr_a * sr_b * (cov_ab ** 2) / (var_a * var_b)
        )
        if theta <= 0:
            return (float("nan"), float("nan"))
        z = (sr_a - sr_b) / math.sqrt(theta)
        p_value = float(2.0 * (1.0 - sp_stats.norm.cdf(abs(z))))
        return (float(z), p_value)

    if annualized_sharpe_a is None:
        std_a = float(a.std(ddof=1))
        if std_a <= 0:
            return (float("nan"), float("nan"))
        annualized_sharpe_a = float(a.mean()) / std_a * math.sqrt(a.size)
    if annualized_sharpe_b is None:
        std_b = float(b.std(ddof=1))
        if std_b <= 0:
            return (float("nan"), float("nan"))
        annualized_sharpe_b = float(b.mean()) / std_b * math.sqrt(b.size)

    se_a = math.sqrt((1.0 + (annualized_sharpe_a ** 2) / 2.0) / a.size)
    se_b = math.sqrt((1.0 + (annualized_sharpe_b ** 2) / 2.0) / b.size)
    se_diff = math.sqrt(se_a ** 2 + se_b ** 2)
    if se_diff <= 0:
        return (float("nan"), float("nan"))
    diff = annualized_sharpe_b - annualized_sharpe_a
    z = diff / se_diff
    p_value = float(2.0 * (1.0 - sp_stats.norm.cdf(abs(z))))
    return (float(z), p_value)


def psr_trade_count(
    trade_returns: np.ndarray,
    benchmark_sr: float = 0.0,
) -> float:
    """Probabilistic Sharpe Ratio computed on per-trade returns.

    Implements the Bailey & Lopez de Prado (2014) PSR on the per-trade
    return series (rather than per-bar returns). The benchmark Sharpe is
    supplied on an *annualized* scale and is converted to the per-trade
    scale by dividing by ``sqrt(BARS_PER_YEAR_4H / n_trades)`` — that
    ratio is the approximate annualization factor that would have been
    applied to the sample Sharpe had it been reported on an annual
    basis. Skewness and kurtosis corrections follow Mertens's (2002)
    asymptotic variance, as used in Bailey & Lopez de Prado's paper.

    Args:
        trade_returns: 1-D numpy array of per-trade fractional returns.
        benchmark_sr: Annualized benchmark Sharpe ratio (default 0.0).

    Returns:
        Probability that the true (per-trade) Sharpe exceeds the
        benchmark, as a float in ``[0, 1]``. Returns ``nan`` when fewer
        than 5 trades are provided.

    References:
        Bailey, D. H., & Lopez de Prado, M. (2014). "The Deflated Sharpe
        Ratio: Correcting for Selection Bias, Backtest Overfitting, and
        Non-Normality." *Journal of Portfolio Management*, 40(5), 94-107.
    """
    arr = np.asarray(trade_returns, dtype=float).ravel()
    n = arr.size
    if n < 5:
        return float("nan")

    std = float(arr.std(ddof=1))
    if std <= 0:
        return float("nan")

    sr_per_trade = float(arr.mean()) / std
    skew_val = float(sp_stats.skew(arr))
    kurt_val = float(sp_stats.kurtosis(arr, fisher=False))

    annualization = math.sqrt(BARS_PER_YEAR_4H / n)
    if annualization <= 0:
        return float("nan")
    benchmark_per_trade = benchmark_sr / annualization

    denom_sq = (
        1.0
        - skew_val * sr_per_trade
        + ((kurt_val - 1.0) / 4.0) * (sr_per_trade ** 2)
    )
    if denom_sq <= 0 or n <= 1:
        return float("nan")
    sr_std = math.sqrt(denom_sq / (n - 1))
    if sr_std <= 0:
        return float("nan")

    z = (sr_per_trade - benchmark_per_trade) / sr_std
    return float(sp_stats.norm.cdf(z))


def compute_metrics(
    trades: list[dict],
    equity_curve: list[tuple],
    initial_equity: float,
    df: pd.DataFrame,
    warmup: int,
    num_trials: int = 1,
) -> dict:
    """Compute institutional-grade risk/return metrics.

    Includes Sharpe, Sortino, Calmar, PSR, DSR, Monte Carlo p-value,
    VaR, CVaR, tail ratio, drawdown duration, recovery factor,
    exposure %, skewness, kurtosis, and streak analysis.

    Args:
        trades: List of trade dicts with pnl_usd, pnl_pct, bars_held.
        equity_curve: List of (timestamp, equity) tuples.
        initial_equity: Starting equity.
        df: Source OHLCV DataFrame (may be None for portfolio mode).
        warmup: Number of warmup bars skipped.
        num_trials: Number of parameter combos tested (for DSR).
    """
    if not equity_curve:
        return {"agent_return_pct": 0.0, "final_equity": initial_equity}

    eq = pd.Series(
        {ts: float(v) for ts, v in equity_curve}
    ).sort_index()
    rets = eq.pct_change().dropna()
    rets_arr = rets.values

    freq_bars_per_year = 24 * 365
    try:
        if len(eq) > 1:
            total_span_days = (eq.index[-1] - eq.index[0]).total_seconds() / 86400
            if total_span_days > 0:
                freq_bars_per_year = len(eq) / (total_span_days / 365.25)
    except Exception:
        pass

    final_equity = float(eq.iloc[-1])
    agent_return = (final_equity - initial_equity) / initial_equity
    span_days = max(
        1.0,
        (eq.index[-1] - eq.index[0]).total_seconds() / 86400 if len(eq) > 1 else 1.0,
    )
    years = span_days / 365.25
    cagr = (final_equity / initial_equity) ** (1 / years) - 1 if years > 0 else 0.0

    # Sharpe and Sortino
    sharpe = 0.0
    sortino = 0.0
    if len(rets_arr) > 1 and np.std(rets_arr) > 0:
        sharpe = float(np.mean(rets_arr) / np.std(rets_arr, ddof=1) * math.sqrt(freq_bars_per_year))
        neg = rets_arr[rets_arr < 0]
        if len(neg) > 1 and np.std(neg) > 0:
            sortino = float(np.mean(rets_arr) / np.std(neg, ddof=1) * math.sqrt(freq_bars_per_year))

    # Smart Sharpe (autocorrelation-corrected)
    smart_sharpe = sharpe
    if len(rets_arr) > 2:
        rho = float(np.corrcoef(rets_arr[:-1], rets_arr[1:])[0, 1])
        if not math.isnan(rho):
            penalty = math.sqrt(1 + 2 * rho) if rho > 0 else 1.0
            smart_sharpe = sharpe / penalty

    # Skewness, Kurtosis
    skew_val = float(sp_stats.skew(rets_arr)) if len(rets_arr) > 3 else 0.0
    kurt_val = float(sp_stats.kurtosis(rets_arr, fisher=False)) if len(rets_arr) > 3 else 3.0

    # PSR (probability Sharpe > 0)
    sr_per_bar = float(np.mean(rets_arr) / np.std(rets_arr, ddof=1)) if len(rets_arr) > 1 and np.std(rets_arr) > 0 else 0.0
    psr = _probabilistic_sharpe(sr_per_bar, 0.0, len(rets_arr), skew_val, kurt_val)

    # DSR (deflated for multiple trials)
    dsr = 0.0
    dsr_sr0 = 0.0
    if num_trials > 1 and len(rets_arr) > 1:
        sr_var = (1.0 + 0.5 * sr_per_bar ** 2) / (len(rets_arr) - 1)
        dsr, dsr_sr0 = _deflated_sharpe(sr_per_bar, num_trials, len(rets_arr),
                                         skew_val, kurt_val, sr_var)

    # Drawdown analysis
    peak = initial_equity
    max_dd = 0.0
    max_dd_abs = 0.0
    dd_start = None
    max_dd_duration_bars = 0
    current_dd_bars = 0
    time_underwater_bars = 0

    for idx, val in enumerate(eq.values):
        if val >= peak:
            peak = val
            if current_dd_bars > max_dd_duration_bars:
                max_dd_duration_bars = current_dd_bars
            current_dd_bars = 0
        else:
            current_dd_bars += 1
            time_underwater_bars += 1
        dd = (peak - val) / peak if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd
            max_dd_abs = peak - val
    if current_dd_bars > max_dd_duration_bars:
        max_dd_duration_bars = current_dd_bars

    calmar = (cagr / max_dd) if max_dd > 0 else float("inf") if cagr > 0 else 0.0
    recovery_factor = agent_return / max_dd if max_dd > 0 else 0.0

    # Exposure
    total_bars_held = sum(t.get("bars_held", 0) for t in trades)
    total_bars = len(eq)
    exposure_pct = total_bars_held / total_bars * 100 if total_bars > 0 else 0.0

    # VaR and CVaR
    var_95 = float(np.percentile(rets_arr, 5)) if len(rets_arr) > 20 else 0.0
    cvar_95 = float(np.mean(rets_arr[rets_arr <= var_95])) if len(rets_arr[rets_arr <= var_95]) > 0 else var_95

    # Tail ratio
    upper_tail = float(np.percentile(rets_arr, 95)) if len(rets_arr) > 20 else 0.0
    lower_tail = abs(float(np.percentile(rets_arr, 5))) if len(rets_arr) > 20 else 1.0
    tail_ratio = upper_tail / lower_tail if lower_tail > 0 else 0.0

    # Omega ratio (threshold = 0)
    gains = rets_arr[rets_arr > 0]
    losses_arr = rets_arr[rets_arr < 0]
    omega = float(np.sum(gains) / abs(np.sum(losses_arr))) if len(losses_arr) > 0 and np.sum(losses_arr) != 0 else 0.0

    # Trade-level stats
    wins = [t for t in trades if t["pnl_usd"] > 0]
    losses = [t for t in trades if t["pnl_usd"] <= 0]
    win_rate = len(wins) / len(trades) if trades else 0.0
    gross_profit = sum(t["pnl_usd"] for t in wins) if wins else 0.0
    gross_loss = abs(sum(t["pnl_usd"] for t in losses)) if losses else 0.0
    profit_factor = (
        gross_profit / gross_loss
        if gross_loss > 0
        else (float("inf") if gross_profit > 0 else 0.0)
    )
    expectancy_usd = (
        (sum(t["pnl_usd"] for t in trades) / len(trades)) if trades else 0.0
    )
    avg_bars_held = (
        sum(t.get("bars_held", 0) for t in trades) / len(trades) if trades else 0.0
    )

    # Streak analysis
    max_consec_wins = 0
    max_consec_losses = 0
    cw = 0
    cl = 0
    for t in trades:
        if t["pnl_usd"] > 0:
            cw += 1
            cl = 0
        else:
            cl += 1
            cw = 0
        max_consec_wins = max(max_consec_wins, cw)
        max_consec_losses = max(max_consec_losses, cl)

    # Payoff ratio
    avg_win = (sum(t["pnl_usd"] for t in wins) / len(wins)) if wins else 0.0
    avg_loss_abs = (abs(sum(t["pnl_usd"] for t in losses)) / len(losses)) if losses else 1.0
    payoff_ratio = avg_win / avg_loss_abs if avg_loss_abs > 0 else 0.0

    # Monte Carlo p-value
    trade_pnls = [t["pnl_usd"] for t in trades]
    mc_pvalue = _monte_carlo_pvalue(trade_pnls, sum(trade_pnls)) if trades else 1.0

    # Estimated DD duration in days
    try:
        bars_per_day = freq_bars_per_year / 365.25
        max_dd_duration_days = round(max_dd_duration_bars / bars_per_day, 1) if bars_per_day > 0 else 0
        time_underwater_days = round(time_underwater_bars / bars_per_day, 1) if bars_per_day > 0 else 0
    except Exception:
        max_dd_duration_days = 0
        time_underwater_days = 0

    return {
        "final_equity": round(final_equity, 2),
        "total_pnl": round(final_equity - initial_equity, 2),
        "agent_return_pct": round(agent_return * 100, 3),
        "cagr_pct": round(cagr * 100, 3),
        # Risk-adjusted ratios
        "sharpe_annualized": round(sharpe, 3),
        "smart_sharpe": round(smart_sharpe, 3),
        "sortino_annualized": round(sortino, 3),
        "calmar_ratio": round(calmar, 3) if math.isfinite(calmar) else None,
        "omega_ratio": round(omega, 3),
        # Probabilistic validation
        "psr": round(psr, 4),
        "dsr": round(dsr, 4) if num_trials > 1 else None,
        "dsr_expected_max_sr": round(dsr_sr0, 4) if num_trials > 1 else None,
        "monte_carlo_p_value": round(mc_pvalue, 4),
        # Distribution
        "skewness": round(skew_val, 3),
        "kurtosis": round(kurt_val, 3),
        # Drawdown
        "max_drawdown_pct": round(max_dd * 100, 3),
        "max_drawdown_usd": round(max_dd_abs, 2),
        "max_dd_duration_bars": max_dd_duration_bars,
        "max_dd_duration_days": max_dd_duration_days,
        "time_underwater_days": time_underwater_days,
        "recovery_factor": round(recovery_factor, 3),
        # Tail risk
        "var_95_pct": round(var_95 * 100, 3),
        "cvar_95_pct": round(cvar_95 * 100, 3),
        "tail_ratio": round(tail_ratio, 3),
        # Trade stats
        "total_trades": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate_pct": round(win_rate * 100, 1),
        "profit_factor": round(profit_factor, 3) if math.isfinite(profit_factor) else None,
        "payoff_ratio": round(payoff_ratio, 3),
        "expectancy_usd": round(expectancy_usd, 2),
        "avg_bars_held": round(avg_bars_held, 2),
        "avg_win_pct": round(sum(t["pnl_pct"] for t in wins) / len(wins), 3) if wins else 0,
        "avg_loss_pct": round(sum(t["pnl_pct"] for t in losses) / len(losses), 3) if losses else 0,
        "max_consec_wins": max_consec_wins,
        "max_consec_losses": max_consec_losses,
        "exposure_pct": round(exposure_pct, 1),
    }


def _resample(df: pd.DataFrame, target_minutes: int, source_minutes: int = 60) -> pd.DataFrame:
    """Resample OHLCV DataFrame to a higher timeframe."""
    if target_minutes <= source_minutes:
        return df
    rule = f"{target_minutes}min"
    resampled = df.resample(rule).agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
    }).dropna()
    return resampled


def cost_sensitivity(
    pair_frames: dict[str, pd.DataFrame],
    fee_rates: list[float] | None = None,
    spread_bps_list: list[float] | None = None,
    initial_equity: float = 10000.0,
    precomputed_features: dict[str, pd.DataFrame] | None = None,
    verbose: bool = False,
    fine_grid: bool = False,
) -> list[dict]:
    """Run the backtest at multiple cost tiers and report metric degradation.

    Args:
        pair_frames: Dict of {pair: OHLCV DataFrame}.
        fee_rates: List of per-side fee rates to test (e.g. [0.001, 0.002, 0.003]).
        spread_bps_list: List of typical spreads in bps to test.
        initial_equity: Starting equity.
        precomputed_features: Pre-computed feature frames to avoid recomputation.
        fine_grid: When ``True`` and neither ``fee_rates`` nor
            ``spread_bps_list`` is supplied, use a dense 10-tier grid of
            per-side fee rates (``[0.10, 0.15, 0.20, 0.26, 0.30, 0.40,
            0.50, 0.60, 0.80, 1.00]`` percent) with a matching spread
            schedule. When ``False`` (default), the historical 4-tier
            behaviour is preserved.

    Returns:
        List of dicts with fee_rate, spread_bps, and key metrics.
    """
    global FEE_RATE, TYPICAL_SPREAD_BPS, ENTRY_SLIPPAGE_BPS, EXIT_SLIPPAGE_BPS

    if fee_rates is None and spread_bps_list is None and fine_grid:
        fee_rates = [
            0.0010, 0.0015, 0.0020, 0.0026, 0.0030,
            0.0040, 0.0050, 0.0060, 0.0080, 0.0100,
        ]
        spread_bps_list = [4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0, 20.0, 24.0]

    if fee_rates is None:
        fee_rates = [0.0010, 0.0026, 0.0040, 0.0060]
    if spread_bps_list is None:
        spread_bps_list = [4.0, 8.0, 12.0, 16.0]

    original_fee = FEE_RATE
    original_spread = TYPICAL_SPREAD_BPS
    original_entry = ENTRY_SLIPPAGE_BPS
    original_exit = EXIT_SLIPPAGE_BPS

    results = []
    for fee, spread in zip(fee_rates, spread_bps_list):
        FEE_RATE = fee
        TYPICAL_SPREAD_BPS = spread
        ENTRY_SLIPPAGE_BPS = spread / 2.0
        EXIT_SLIPPAGE_BPS = spread / 2.0

        r = backtest_portfolio(pair_frames, initial_equity=initial_equity,
                               precomputed_features=precomputed_features,
                               verbose=False)
        rt_cost_bps = round((fee * 2 + spread) * 100, 1)
        results.append({
            "fee_rate_pct": round(fee * 100, 3),
            "spread_bps": spread,
            "round_trip_cost_bps": rt_cost_bps,
            "return_pct": r.get("agent_return_pct", 0),
            "sharpe": r.get("sharpe_annualized", 0),
            "max_dd_pct": r.get("max_drawdown_pct", 0),
            "trades": r.get("total_trades", 0),
            "win_rate_pct": r.get("win_rate_pct", 0),
            "profit_factor": r.get("profit_factor"),
        })

    FEE_RATE = original_fee
    TYPICAL_SPREAD_BPS = original_spread
    ENTRY_SLIPPAGE_BPS = original_entry
    EXIT_SLIPPAGE_BPS = original_exit
    return results


def parameter_sensitivity(
    pair_frames: dict[str, pd.DataFrame],
    initial_equity: float = 10000.0,
    perturbation: float = 0.10,
    precomputed_features: dict[str, pd.DataFrame] | None = None,
) -> list[dict]:
    """Perturb each key parameter by ±perturbation and measure metric change.

    Tests fragility: if Sharpe drops >30% on a 10% parameter change,
    the strategy is fragile/overfit to that parameter.

    Args:
        pair_frames: Dict of {pair: OHLCV DataFrame}.
        initial_equity: Starting equity.
        perturbation: Fraction to perturb (0.10 = ±10%).
        precomputed_features: Pre-computed feature frames.

    Returns:
        List of dicts with parameter name, direction, value, and metrics.
    """
    params_to_test = {
        "stop_mult": RISK.stop_mult,
        "trail_mult": RISK.trail_mult,
        "target_mult_base": RISK.target_mult_base,
        "target_mult_mid": RISK.target_mult_mid,
        "target_mult_hi": RISK.target_mult_hi,
        "max_hold_bars": RISK.max_hold_bars,
    }

    baseline = backtest_portfolio(pair_frames, initial_equity=initial_equity,
                                  precomputed_features=precomputed_features,
                                  verbose=False)
    base_sharpe = baseline.get("sharpe_annualized", 0)
    base_return = baseline.get("agent_return_pct", 0)

    results = [{
        "parameter": "baseline",
        "direction": "base",
        "value": None,
        "return_pct": base_return,
        "sharpe": base_sharpe,
        "max_dd_pct": baseline.get("max_drawdown_pct", 0),
        "trades": baseline.get("total_trades", 0),
        "fragile": False,
    }]

    for param_name, base_val in params_to_test.items():
        for direction, mult in [("-10%", 1 - perturbation), ("+10%", 1 + perturbation)]:
            perturbed = base_val * mult
            if param_name == "max_hold_bars":
                perturbed = int(round(perturbed))

            kwargs = {param_name: perturbed}
            r = backtest_portfolio(pair_frames, initial_equity=initial_equity,
                                   precomputed_features=precomputed_features,
                                   verbose=False, **kwargs)
            r_sharpe = r.get("sharpe_annualized", 0)
            sharpe_delta = 0.0
            if base_sharpe != 0:
                sharpe_delta = (r_sharpe - base_sharpe) / abs(base_sharpe)
            fragile = abs(sharpe_delta) > 0.30

            results.append({
                "parameter": param_name,
                "direction": direction,
                "value": round(perturbed, 3),
                "return_pct": r.get("agent_return_pct", 0),
                "sharpe": r_sharpe,
                "sharpe_delta_pct": round(sharpe_delta * 100, 1),
                "max_dd_pct": r.get("max_drawdown_pct", 0),
                "trades": r.get("total_trades", 0),
                "fragile": fragile,
            })

    return results


def regime_split(trades: list[dict], features_bulk: dict[str, pd.DataFrame],
                 pair_frames: dict[str, pd.DataFrame]) -> dict:
    """Split trades by market regime and report per-regime performance.

    Uses the ADX-based regime classification from the feature engine.

    Args:
        trades: List of trade dicts (must have 'pair', 'bar', 'pnl_usd').
        features_bulk: Pre-computed feature DataFrames per pair.
        pair_frames: Source OHLCV DataFrames (for index mapping).

    Returns:
        Dict with per-regime metrics (trending, ranging, transition).
    """
    regime_trades: dict[str, list[dict]] = {
        "trending": [], "ranging": [], "transition": [],
    }

    for t in trades:
        pair = t.get("pair")
        bar = t.get("bar", 0)
        if pair not in features_bulk:
            regime_trades["transition"].append(t)
            continue
        bulk = features_bulk[pair]
        if bar < len(bulk):
            regime = bulk.iloc[bar].get("regime", "transition")
        else:
            regime = "transition"
        if regime not in regime_trades:
            regime = "transition"
        regime_trades[regime].append(t)

    result = {}
    for regime, rtrades in regime_trades.items():
        if not rtrades:
            result[regime] = {
                "trades": 0, "win_rate_pct": 0, "pnl_usd": 0,
                "profit_factor": None, "expectancy_usd": 0,
            }
            continue
        wins = [t for t in rtrades if t["pnl_usd"] > 0]
        gp = sum(t["pnl_usd"] for t in wins)
        gl = abs(sum(t["pnl_usd"] for t in rtrades if t["pnl_usd"] <= 0))
        pf = gp / gl if gl > 0 else None
        result[regime] = {
            "trades": len(rtrades),
            "wins": len(wins),
            "losses": len(rtrades) - len(wins),
            "win_rate_pct": round(len(wins) / len(rtrades) * 100, 1),
            "pnl_usd": round(sum(t["pnl_usd"] for t in rtrades), 2),
            "profit_factor": round(pf, 2) if pf and math.isfinite(pf) else None,
            "expectancy_usd": round(sum(t["pnl_usd"] for t in rtrades) / len(rtrades), 2),
        }
    return result


def generate_tearsheet(equity_curve: list[tuple], output_path: str = "logs/tearsheet.html",
                       title: str = "Praxis Agent") -> str | None:
    """Generate a QuantStats HTML tearsheet from the equity curve.

    Args:
        equity_curve: List of (timestamp, equity) tuples.
        output_path: Path to save the HTML file.
        title: Title for the tearsheet.

    Returns:
        Output path on success, None on failure.
    """
    try:
        import quantstats as qs
    except ImportError:
        logger.warning("quantstats not installed — skipping tearsheet")
        return None

    eq = pd.Series(
        {ts: float(v) for ts, v in equity_curve}
    ).sort_index()
    returns = eq.pct_change().dropna()
    returns.index = pd.to_datetime(returns.index, utc=True)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    qs.reports.html(returns, output=output_path, title=title, download_filename=output_path)
    return output_path

