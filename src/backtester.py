"""Backtester — full-pipeline walk-forward simulation.

Runs the SAME agent pipeline the live orchestrator runs:
  6 signal agents -> cross-pair boost -> deterministic analyst fallback
  -> risk governor -> ATR-based position management

Costs are kept identical to the live Kraken paper adapter so the backtest
final equity reflects what the hackathon submission would actually produce
under the same market conditions.

Supports CSV data loading for extended backtests — prefers the FMP CSV
(``{PAIR}_60m_fmp.csv``) which gives 10+ years of hourly data and matches
the dashboard's primary price feed.

Usage:
    python -m src.backtester                       # default 1h CSV
    python -m src.backtester --interval 240        # 4h aggregation
    python -m src.backtester --start 2021-01-01    # windowed slice
    python -m src.backtester --json results.json   # machine-readable
"""

import argparse
import asyncio
import json
import logging
import math
from datetime import datetime, timezone

import numpy as np
from scipy import stats as sp_stats
from pathlib import Path
from typing import Optional

import pandas as pd

from src.agents.llm_analyst import deterministic_fallback
from src.agents.risk_governor import evaluate_risk
from src.agents.signals import (
    mean_reversion_signal,
    momentum_signal,
    spread_cost_signal,
    swing_structure_signal,
    trend_signal,
    volatility_signal,
)
from src.config import RISK, STRATEGY
from src.execution.kraken_adapter import KRAKEN_TAKER_FEE, get_ohlc_extended
from src.features.engine import compute_features_bulk, features_at
from src.models import Direction, Portfolio, SignalReport
from src.orchestrator import _parse_ohlc_to_dataframe

logger = logging.getLogger(__name__)

FEE_RATE = KRAKEN_TAKER_FEE
TYPICAL_SPREAD_BPS = 8.0
ENTRY_SLIPPAGE_BPS = TYPICAL_SPREAD_BPS / 2.0
EXIT_SLIPPAGE_BPS = TYPICAL_SPREAD_BPS / 2.0
BASELINE_ATR_PCT = 0.025  # 2.5% — median BTC ATR/price ratio for vol-scaling


def _run_signals(features):
    """Run all 6 deterministic signal agents."""
    return [
        trend_signal(features),
        volatility_signal(features),
        spread_cost_signal(features),
        mean_reversion_signal(features),
        momentum_signal(features),
        swing_structure_signal(features),
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


async def fetch_data(pair: str, interval: int, bars: int) -> pd.DataFrame:
    """Fetch live OHLC data from Kraken (fallback when no CSV available)."""
    raw = await get_ohlc_extended(pair, interval=interval, bars=bars)
    return _parse_ohlc_to_dataframe(raw, pair)


def backtest_pair(
    df: pd.DataFrame,
    pair: str,
    initial_equity: float = 10000.0,
    max_hold_bars: Optional[int] = None,
    cooldown_bars: Optional[int] = None,
    last_pair_signals: Optional[dict] = None,
    stop_mult: Optional[float] = None,
    target_mult_base: Optional[float] = None,
    target_mult_mid: Optional[float] = None,
    target_mult_hi: Optional[float] = None,
    trail_mult: Optional[float] = None,
    macro_filter: Optional[bool] = None,
    reversal_exit: bool = False,
    cross_pair_boost: bool = True,
    precomputed_features: Optional[pd.DataFrame] = None,
    verbose: bool = True,
):
    """Run walk-forward backtest using the full agent pipeline on a single pair.

    Mirrors the live orchestrator: 6 signal agents -> cross-pair boost ->
    deterministic analyst fallback -> risk governor consensus -> ATR-based
    position management.

    Args:
        df: Full OHLCV DataFrame (must have 200+ rows).
        pair: Trading pair name.
        initial_equity: Starting equity.
        max_hold_bars: Max bars before a time-based exit.
        cooldown_bars: Bars to wait after kill criteria before resetting.
        last_pair_signals: Optional shared dict used to apply the
            cross-pair boost across multiple backtested pairs.
        stop_mult: ATR multiplier for the initial hard stop.
        target_mult_base: Target ATR multiplier when ADX < 25.
        target_mult_mid: Target ATR multiplier when 25 <= ADX < 35.
        target_mult_hi: Target ATR multiplier when ADX >= 35.
        trail_mult: ATR multiplier for the trailing stop.
        macro_filter: When True, only allow longs if ema_55 > ema_200 and
            shorts if ema_55 < ema_200.
        reversal_exit: When True, apply the RSI-based early reversal exit.
        precomputed_features: Optional pre-computed bulk feature frame to
            skip recomputation (useful for sweeps).
        verbose: Print per-run progress messages.

    Returns:
        Dict with backtest results including equity curve.
    """
    if last_pair_signals is None:
        last_pair_signals = {}

    stop_mult = RISK.stop_mult if stop_mult is None else stop_mult
    target_mult_base = RISK.target_mult_base if target_mult_base is None else target_mult_base
    target_mult_mid = RISK.target_mult_mid if target_mult_mid is None else target_mult_mid
    target_mult_hi = RISK.target_mult_hi if target_mult_hi is None else target_mult_hi
    trail_mult = RISK.trail_mult if trail_mult is None else trail_mult
    max_hold_bars = RISK.max_hold_bars if max_hold_bars is None else max_hold_bars
    cooldown_bars = RISK.cooldown_bars if cooldown_bars is None else cooldown_bars
    macro_filter = RISK.macro_filter if macro_filter is None else macro_filter

    portfolio = Portfolio(equity=initial_equity, cash=initial_equity,
                          peak_equity=initial_equity)
    trades = []
    rejections = {"NO_SIGNAL": 0, "NO_CONSENSUS": 0, "FALLBACK_NO_CONSENSUS": 0,
                  "BELOW_THRESHOLD": 0, "INSUFFICIENT_ALIGNMENT": 0,
                  "MAX_EXPOSURE": 0, "SHORT_BELOW_THRESHOLD": 0,
                  "SHORTS_DISABLED": 0, "DOWNTREND_NO_LONG": 0,
                  "UPTREND_NO_SHORT": 0, "VOLATILITY_SHOCK": 0,
                  "MACRO_FILTER": 0, "KILL": 0}
    warmup = 200
    total_bars = len(df)

    if total_bars < warmup + 10:
        return {"error": f"Need {warmup + 10}+ bars, got {total_bars}"}

    buy_hold_entry = float(df["close"].iloc[warmup])
    position = None
    pending_entry = None  # Deferred order: signal at bar[i], fill at bar[i+1]
    bars_held = 0
    prev_day = None
    risk_cooldown = 0
    equity_curve: list[tuple[pd.Timestamp, float]] = []

    if precomputed_features is not None:
        bulk = precomputed_features
    else:
        if verbose:
            print(f"  Pre-computing features for {total_bars:,} bars...")
        bulk = compute_features_bulk(df, pair)

    for i in range(warmup, total_bars):
        close_price = float(df["close"].iloc[i])
        open_price = float(df["open"].iloc[i])

        current_day = df.index[i].date()
        if prev_day is not None and current_day != prev_day:
            portfolio.daily_pnl = 0.0
        prev_day = current_day

        if risk_cooldown > 0:
            risk_cooldown -= 1
            if risk_cooldown == 0:
                portfolio.consecutive_losses = 0

        try:
            features = features_at(bulk, i)
        except Exception as e:
            logger.debug("Feature computation failed at bar %d: %s", i, e)
            continue

        # Fill pending entry from PREVIOUS bar's signal at THIS bar's open.
        if pending_entry is not None and position is None:
            pe = pending_entry
            pending_entry = None
            entry_fill = _entry_fill_price(pe["side"], open_price,
                                           atr=pe["atr"])
            fees = pe["size_usd"] * FEE_RATE
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

            position = {
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
            bars_held = 0

        if position is not None:
            bars_held += 1
            entry = position["entry_price"]
            side = position["side"]
            atr = position.get("atr_20", features.atr_20)
            atr_stop = position.get("atr_stop")
            atr_target = position.get("atr_target")
            peak = position.get("peak_price", entry)

            close_trade = False
            reason = ""

            if side == "long":
                peak = max(peak, close_price)
                trail = peak - atr * trail_mult
                if peak > entry * 1.005:
                    trail = max(trail, entry)
                if peak > entry * 1.015:
                    trail = max(trail, entry * 1.005)

                if atr_stop and close_price <= atr_stop:
                    close_trade = True
                    reason = "atr_stop"
                elif atr_target and close_price >= atr_target:
                    close_trade = True
                    reason = "atr_target"
                elif close_price <= trail and peak > entry * 1.005:
                    close_trade = True
                    reason = "trailing_stop"
                elif (reversal_exit and features.rsi_14 < 45 and close_price < entry
                        and bars_held >= 2):
                    close_trade = True
                    reason = "reversal_exit"
            else:
                peak = min(peak, close_price)
                trail = peak + atr * trail_mult
                if peak < entry * 0.995:
                    trail = min(trail, entry)
                if peak < entry * 0.985:
                    trail = min(trail, entry * 0.995)

                if atr_stop and close_price >= atr_stop:
                    close_trade = True
                    reason = "atr_stop"
                elif atr_target and close_price <= atr_target:
                    close_trade = True
                    reason = "atr_target"
                elif close_price >= trail and peak < entry * 0.995:
                    close_trade = True
                    reason = "trailing_stop"
                elif (reversal_exit and features.rsi_14 > 55 and close_price > entry
                        and bars_held >= 2):
                    close_trade = True
                    reason = "reversal_exit"

            position["peak_price"] = peak

            if not close_trade and bars_held >= max_hold_bars:
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
                else:
                    portfolio.consecutive_losses = 0

                portfolio.peak_equity = max(portfolio.peak_equity, portfolio.equity)
                portfolio.drawdown_pct = (
                    (portfolio.peak_equity - portfolio.equity) / portfolio.peak_equity
                    if portfolio.peak_equity > 0 else 0.0
                )

                if (portfolio.consecutive_losses >= RISK.max_consecutive_losses
                        or portfolio.drawdown_pct > RISK.max_drawdown_pct):
                    risk_cooldown = cooldown_bars

                trades.append({
                    "bar": i,
                    "timestamp": str(df.index[i]),
                    "pair": pair,
                    "side": position["side"],
                    "entry": position["entry_price"],
                    "exit": close_price,
                    "pnl_usd": round(pnl_usd, 2),
                    "pnl_pct": round(pnl_pct * 100, 3),
                    "reason": reason,
                    "equity": round(portfolio.equity, 2),
                    "signal_score": position.get("signal_score", 0),
                    "bars_held": bars_held,
                })
                if pair in portfolio.positions:
                    del portfolio.positions[pair]
                position = None
                bars_held = 0
                equity_curve.append((df.index[i], portfolio.equity))
                continue

        equity_curve.append((df.index[i], portfolio.equity))

        if position is not None or pending_entry is not None:
            continue

        signals = _run_signals(features)
        if cross_pair_boost:
            signals = _apply_cross_pair_boost_sync(signals, pair, last_pair_signals)
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
                if code in rejections:
                    rejections[code] += 1
                else:
                    rejections["KILL"] = rejections.get("KILL", 0) + 1
            continue

        if macro_filter:
            macro_up = features.ema_55 > features.ema_200
            if intent.side == Direction.LONG and not macro_up:
                rejections["MACRO_FILTER"] += 1
                continue
            if intent.side == Direction.SHORT and macro_up:
                rejections["MACRO_FILTER"] += 1
                continue

        # Queue pending entry — will fill at NEXT bar's open.
        pending_entry = {
            "side": intent.side.value,
            "size_usd": intent.size_usd,
            "atr": features.atr_20,
            "adx": features.adx_14,
            "signal_score": round(intent.signal_score, 1),
        }

    if position is not None:
        close_price = float(df["close"].iloc[-1])
        pnl_usd, pnl_pct = _simulate_close(position, close_price)
        portfolio.equity += pnl_usd
        portfolio.total_pnl += pnl_usd
        trades.append({
            "bar": total_bars - 1,
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
            "bars_held": bars_held,
        })
        equity_curve.append((df.index[-1], portfolio.equity))

    metrics = compute_metrics(
        trades=trades,
        equity_curve=equity_curve,
        initial_equity=initial_equity,
        df=df,
        warmup=warmup,
    )
    metrics["pair"] = pair
    metrics["bars"] = total_bars
    metrics["trading_bars"] = total_bars - warmup
    metrics["period_start"] = str(df.index[warmup])
    metrics["period_end"] = str(df.index[-1])
    metrics["initial_equity"] = initial_equity
    metrics["rejections"] = rejections
    metrics["trades"] = trades

    buy_hold_exit = float(df["close"].iloc[-1])
    bh_final = initial_equity * (buy_hold_exit / buy_hold_entry)
    metrics["buy_hold_final_equity"] = round(bh_final, 2)
    metrics["buy_hold_return_pct"] = round(
        (bh_final - initial_equity) / initial_equity * 100, 3
    )
    metrics["alpha_pct"] = round(
        metrics["agent_return_pct"] - metrics["buy_hold_return_pct"], 3
    )

    return metrics


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
    be_trigger_pct: float = 0.0059,
    lock_trigger_pct: float = 0.012,
    lock_value_pct: float = 0.0067,
    partial_tp_pct: float = 0.0,  # Fraction of position to close at atr_target (0=disabled, 0.5=half)
    precomputed_features: Optional[dict[str, pd.DataFrame]] = None,
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
                entry_fill = _entry_fill_price(pe["side"], open_price,
                                               atr=pe["atr"])
                fees = pe["size_usd"] * FEE_RATE
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
                    else:
                        portfolio.consecutive_losses = 0

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

            signals = _run_signals(features)
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
                        features.ema_9 > features.ema_21 > features.ema_55 > features.ema_200
                    )
                    macro_down = (
                        features.ema_9 < features.ema_21 < features.ema_55 < features.ema_200
                    )
                else:
                    macro_up = features.ema_55 > features.ema_200
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
    )
    metrics["initial_equity"] = initial_equity
    metrics["pairs"] = list(pair_frames.keys())
    metrics["rejections"] = rejections
    metrics["trades"] = all_trades
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
                        n_sims: int = 10000) -> float:
    """Monte Carlo permutation test.

    Shuffles trade PnLs and counts how often the shuffled total beats
    the observed total. Returns p-value (lower = more significant).
    """
    if len(trade_pnls) < 5:
        return 1.0
    arr = np.array(trade_pnls)
    rng = np.random.default_rng(42)
    beat_count = 0
    for _ in range(n_sims):
        rng.shuffle(arr)
        signs = rng.choice([-1, 1], size=len(arr))
        shuffled_total = float(np.sum(arr * signs))
        if shuffled_total >= observed_total:
            beat_count += 1
    return beat_count / n_sims


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
        sr_var = 1.0 / (len(rets_arr) - 1)
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


async def run_backtest(
    interval: int = 60,
    bars: int = 2000,
    use_csv: bool = True,
    start: str | None = None,
    end: str | None = None,
    json_out: str | None = None,
    quiet: bool = False,
):
    """Run backtest for all configured pairs.

    Args:
        interval: Candle interval in minutes (60=1h, 240=4h).
        bars: Number of bars to fetch per pair (ignored when use_csv=True).
        use_csv: Load data from CSV files instead of Kraken API.
        start: Optional ISO start date for slicing the data.
        end: Optional ISO end date for slicing the data.
        json_out: Optional path to write machine-readable results.
        quiet: Suppress per-trade log spam when True.
    """
    source = "CSV" if use_csv else f"Kraken API ({bars} bars)"
    print(f"\n{'='*72}")
    print(f"  AEGIS AGENT — FULL PIPELINE BACKTEST")
    print(f"  Interval: {interval}min | Source: {source}")
    print(f"  Pairs: {', '.join(STRATEGY.pairs)}")
    print(f"  Pipeline: 6 signals -> cross-pair boost -> deterministic fallback -> risk governor")
    print(f"  Fees: {FEE_RATE*100:.3f}% per side | Slippage: {ENTRY_SLIPPAGE_BPS:.1f} bps entry / {EXIT_SLIPPAGE_BPS:.1f} bps exit")
    print(f"  Thresholds: paper >= {RISK.min_signal_score_paper}, ERC >= {RISK.min_signal_score_erc}")
    print(f"{'='*72}\n")

    combined = {
        "total_pnl": 0.0,
        "total_trades": 0,
        "wins": 0,
    }
    per_pair_results: dict[str, dict] = {}
    last_pair_signals: dict[str, str] = {}

    for pair in STRATEGY.pairs:
        print(f"Loading {pair} data...")
        try:
            if use_csv:
                df = load_csv(pair, 60)
                if interval > 60:
                    df = _resample(df, interval, 60)
            else:
                df = await fetch_data(pair, interval, bars)
        except Exception as e:
            print(f"  FAILED to load {pair}: {e}")
            continue

        if start:
            df = df[df.index >= pd.Timestamp(start, tz="UTC")]
        if end:
            df = df[df.index <= pd.Timestamp(end, tz="UTC")]

        print(f"  Got {len(df)} bars: {df.index[0]} to {df.index[-1]}")
        print(f"  Running full-pipeline backtest...")

        result = backtest_pair(df, pair, last_pair_signals=last_pair_signals)

        if "error" in result:
            print(f"  ERROR: {result['error']}")
            continue

        per_pair_results[pair] = result
        combined["total_pnl"] += result["total_pnl"]
        combined["total_trades"] += result["total_trades"]
        combined["wins"] += result["wins"]

        print(f"\n  --- {pair} Results ---")
        print(f"  Period:        {result['period_start'][:10]} to {result['period_end'][:10]}")
        print(f"  Trading bars:  {result['trading_bars']}")
        print(f"  Final equity:  ${result['final_equity']:,.2f}")
        print(f"  Total PnL:     ${result['total_pnl']:+,.2f}")
        print(f"  Agent return:  {result['agent_return_pct']:+.3f}%")
        print(f"  CAGR:          {result.get('cagr_pct', 0):+.3f}%")
        print(f"  Sharpe:        {result.get('sharpe_annualized', 0):.3f}")
        print(f"  Sortino:       {result.get('sortino_annualized', 0):.3f}")
        print(f"  Calmar:        {result.get('calmar_ratio')}")
        print(f"  Buy & Hold:    {result['buy_hold_return_pct']:+.3f}%")
        print(f"  Alpha:         {result['alpha_pct']:+.3f}%")
        print(f"  Trades:        {result['total_trades']} ({result['wins']}W / {result['losses']}L)")
        print(f"  Win rate:      {result['win_rate_pct']:.1f}%")
        print(f"  Profit factor: {result.get('profit_factor')}")
        print(f"  Expectancy:    ${result.get('expectancy_usd', 0):.2f}/trade")
        print(f"  Max drawdown:  {result['max_drawdown_pct']:.3f}%  (${result.get('max_drawdown_usd',0):,.2f})")
        if result["wins"]:
            print(f"  Avg win:       {result['avg_win_pct']:+.3f}%")
        if result["losses"]:
            print(f"  Avg loss:      {result['avg_loss_pct']:+.3f}%")
        print(f"  Avg bars held: {result.get('avg_bars_held', 0):.1f}")

        rej = result["rejections"]
        total_rej = sum(rej.values())
        print(f"\n  Rejections ({total_rej} total):")
        for code, count in sorted(rej.items(), key=lambda x: -x[1]):
            if count > 0:
                print(f"    {code:30s} {count:5d}")

        if not quiet:
            print(f"\n  Trade Log (last 20):")
            for t in result["trades"][-20:]:
                marker = "+" if t["pnl_usd"] > 0 else "-"
                erc = "*" if t.get("signal_score", 0) >= RISK.min_signal_score_erc else " "
                print(f"    [{marker}]{erc} {t['timestamp'][:16]} {t['side'].upper():5s} "
                      f"entry={t['entry']:.2f} exit={t['exit']:.2f} "
                      f"pnl=${t['pnl_usd']:+.2f} ({t['pnl_pct']:+.3f}%) "
                      f"score={t.get('signal_score', 0):.0f} "
                      f"[{t['reason']}] eq=${t['equity']:.2f}")
        print()

    combined_wr = (combined["wins"] / combined["total_trades"] * 100) if combined["total_trades"] else 0
    print(f"{'='*72}")
    print(f"  COMBINED RESULTS")
    print(f"  Total PnL:     ${combined['total_pnl']:+,.2f}")
    print(f"  Total trades:  {combined['total_trades']} ({combined['wins']}W / {combined['total_trades'] - combined['wins']}L)")
    print(f"  Win rate:      {combined_wr:.1f}%")
    print(f"{'='*72}\n")

    if json_out:
        payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "interval_minutes": interval,
            "source": source,
            "fee_rate_per_side": FEE_RATE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "exit_slippage_bps": EXIT_SLIPPAGE_BPS,
            "risk_params": {
                "min_signal_score_paper": RISK.min_signal_score_paper,
                "min_signal_score_erc": RISK.min_signal_score_erc,
                "min_signal_score_short": RISK.min_signal_score_short,
                "shorts_enabled": RISK.shorts_enabled,
                "risk_per_trade_pct": RISK.risk_per_trade_pct,
                "max_position_pct": RISK.max_position_pct,
                "max_daily_loss_pct": RISK.max_daily_loss_pct,
                "max_drawdown_pct": RISK.max_drawdown_pct,
                "max_consecutive_losses": RISK.max_consecutive_losses,
            },
            "pairs": {
                pair: {k: v for k, v in r.items() if k != "trades"}
                for pair, r in per_pair_results.items()
            },
            "combined": combined,
        }
        Path(json_out).write_text(json.dumps(payload, indent=2, default=str))
        print(f"  JSON report written to {json_out}")

    return per_pair_results


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.WARNING,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="Aegis Agent Backtester")
    parser.add_argument(
        "--csv", action="store_true", default=True,
        help="Load data from CSV files (default: true).",
    )
    parser.add_argument(
        "--no-csv", action="store_false", dest="csv",
        help="Disable CSV loading and fetch from Kraken instead.",
    )
    parser.add_argument(
        "--interval", type=int, default=60,
        help="Candle interval in minutes (default: 60)",
    )
    parser.add_argument(
        "--bars", type=int, default=2000,
        help="Number of bars to fetch from Kraken (ignored with --csv)",
    )
    parser.add_argument("--start", type=str, default=None)
    parser.add_argument("--end", type=str, default=None)
    parser.add_argument("--json", type=str, default=None, dest="json_out")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    asyncio.run(run_backtest(
        interval=args.interval,
        bars=args.bars,
        use_csv=args.csv,
        start=args.start,
        end=args.end,
        json_out=args.json_out,
        quiet=args.quiet,
    ))
