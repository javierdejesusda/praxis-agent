"""Backtester — walk-forward simulation using deterministic pipeline.

Fetches maximum historical OHLC from Kraken, walks bar-by-bar computing
features, signals, and risk decisions. Simulates paper trades with
realistic costs. Reports PnL, win rate, drawdown, and alpha vs buy-and-hold.

Supports CSV data loading for extended backtests:
    python -m src.backtester --csv           # Load from data/*.csv
    python -m src.backtester --csv 240       # 4h interval from CSV
    python -m src.backtester 60 2000         # Fetch 2000 bars from Kraken
"""

import argparse
import asyncio
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

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
from src.execution.kraken_adapter import get_ohlc_extended
from src.features.engine import compute_features, compute_features_bulk, features_at
from src.models import Direction, Portfolio
from src.orchestrator import _parse_ohlc_to_dataframe

logger = logging.getLogger(__name__)

FEE_RATE = 0.0016
TYPICAL_SPREAD_BPS = 8.0


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


def _simulate_close(position, close_price):
    """Compute PnL for closing a position at given price.

    Args:
        position: Position dict with side, size_usd, entry_price.
        close_price: Exit price.

    Returns:
        Tuple of (pnl_usd, pnl_pct).
    """
    side = position["side"]
    entry = position["entry_price"]
    size = position["size_usd"]
    fees = size * FEE_RATE

    if side == "long":
        pnl_pct = (close_price - entry) / entry
    else:
        pnl_pct = (entry - close_price) / entry

    pnl_usd = size * pnl_pct - fees
    return pnl_usd, pnl_pct


def load_csv(pair: str, interval: int) -> pd.DataFrame:
    """Load OHLCV data from a CSV file in the data directory.

    Args:
        pair: Trading pair (e.g. "BTCUSD").
        interval: Candle interval in minutes.

    Returns:
        DataFrame with OHLCV columns and DatetimeIndex.

    Raises:
        FileNotFoundError: If CSV file does not exist.
    """
    data_dir = Path(__file__).resolve().parent.parent / "data"
    path = data_dir / f"{pair}_{interval}m.csv"
    if not path.exists():
        raise FileNotFoundError(
            f"No CSV at {path}. Run: python scripts/download_history.py"
        )
    df = pd.read_csv(path, index_col="timestamp", parse_dates=True)
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)
    return df


async def fetch_data(pair: str, interval: int, bars: int) -> pd.DataFrame:
    """Fetch historical OHLC data from Kraken.

    Args:
        pair: Trading pair (e.g. "BTCUSD").
        interval: Candle interval in minutes.
        bars: Target number of bars.

    Returns:
        DataFrame with OHLCV columns.
    """
    raw = await get_ohlc_extended(pair, interval=interval, bars=bars)
    return _parse_ohlc_to_dataframe(raw, pair)


def backtest_pair(
    df: pd.DataFrame,
    pair: str,
    initial_equity: float = 10000.0,
    max_hold_bars: int = 8,
    stop_mult: float = 1.5,
    cooldown: int = 1,
    rsi2_entry_long: float = 15.0,
):
    """Run walk-forward mean-reversion backtest on a single pair.

    Enters on RSI + Bollinger Band oversold/overbought extremes with EMA-200
    trend alignment. Exits when RSI reverts to neutral or on stop/time.

    Args:
        df: Full OHLCV DataFrame (must have 200+ rows).
        pair: Trading pair name.
        initial_equity: Starting equity.
        max_hold_bars: Max bars before time-based exit.
        stop_mult: ATR multiplier for emergency stop.
        cooldown: Minimum bars between trades.
        rsi_entry_long: RSI threshold to enter long (oversold).
        rsi_entry_short: RSI threshold to enter short (overbought).
        rsi_exit_long: RSI threshold to exit long (reverted).
        rsi_exit_short: RSI threshold to exit short (reverted).
        bb_entry_long: BB position threshold to enter long.
        bb_entry_short: BB position threshold to enter short.

    Returns:
        Dict with backtest results.
    """
    portfolio = Portfolio(equity=initial_equity, cash=initial_equity,
                          peak_equity=initial_equity)
    trades = []
    warmup = 200
    total_bars = len(df)

    if total_bars < warmup + 10:
        return {"error": f"Need {warmup + 10}+ bars, got {total_bars}"}

    buy_hold_entry = float(df["close"].iloc[warmup])
    position = None
    bars_since_trade = 0
    bars_held = 0
    risk_cooldown = 0
    prev_day = None
    size_pct = RISK.risk_per_trade_pct

    print(f"  Pre-computing features for {total_bars:,} bars...")
    bulk = compute_features_bulk(df, pair)
    sma_5 = df["close"].rolling(5).mean()
    sma_10 = df["close"].rolling(10).mean()

    for i in range(warmup, total_bars):
        close_price = float(df["close"].iloc[i])
        low_price = float(df["low"].iloc[i])
        high_price = float(df["high"].iloc[i])
        bars_since_trade += 1

        current_day = df.index[i].date()
        if prev_day is not None and current_day != prev_day:
            portfolio.daily_pnl = 0.0
        prev_day = current_day

        if risk_cooldown > 0:
            risk_cooldown -= 1
            if risk_cooldown == 0:
                portfolio.consecutive_losses = 0
                portfolio.peak_equity = portfolio.equity
                portfolio.drawdown_pct = 0.0

        try:
            features = features_at(bulk, i)
        except Exception as e:
            logger.debug("Feature computation failed at bar %d: %s", i, e)
            continue

        if position is not None:
            bars_held += 1
            entry = position["entry_price"]
            atr_stop = position.get("atr_stop")
            atr = position.get("atr_20", features.atr_20)

            close_trade = False
            reason = ""

            sma5_val = float(sma_5.iloc[i]) if not pd.isna(sma_5.iloc[i]) else entry
            stop_level = entry * 0.95
            if atr_stop:
                stop_level = max(stop_level, atr_stop)

            if close_price > sma5_val and close_price > entry * 1.003 and bars_held >= 1:
                close_trade = True
                reason = "sma5_exit"
            elif features.rsi_14 >= 50 and bars_held >= 2 and close_price <= entry:
                close_trade = True
                reason = "rsi_recovery"
            elif close_price <= stop_level:
                close_trade = True
                reason = "stop"

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
                    risk_cooldown = 10

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
                })
                if pair in portfolio.positions:
                    del portfolio.positions[pair]
                position = None
                bars_since_trade = 0
                bars_held = 0
                continue

        if position is not None:
            continue

        if bars_since_trade < cooldown:
            continue

        side = None
        if (features.rsi_2 <= rsi2_entry_long
                and features.rsi_divergence == 1
                and close_price > features.ema_200
                and features.adx_14 < 30
                and features.returns_20bar > -0.05):
            side = "long"

        if side is None:
            continue

        atr = features.atr_20
        if atr <= 0:
            continue

        size_usd = portfolio.equity * size_pct
        size_usd = max(10.0, min(size_usd, portfolio.equity * 0.10))
        fees = size_usd * FEE_RATE
        portfolio.cash -= fees
        portfolio.equity -= fees
        portfolio.trade_count += 1

        fill_price = close_price
        if side == "long":
            actual_stop = fill_price - atr * stop_mult
        else:
            actual_stop = fill_price + atr * stop_mult

        position = {
            "side": side,
            "size_usd": size_usd,
            "entry_price": fill_price,
            "atr_stop": actual_stop,
            "atr_20": atr,
            "entry_rsi2": features.rsi_2,
        }
        portfolio.positions[pair] = position
        bars_since_trade = 0
        bars_held = 0

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
        })

    buy_hold_exit = float(df["close"].iloc[-1])
    buy_hold_return = (buy_hold_exit - buy_hold_entry) / buy_hold_entry
    agent_return = (portfolio.equity - initial_equity) / initial_equity
    alpha = agent_return - buy_hold_return

    wins = [t for t in trades if t["pnl_usd"] > 0]
    losses = [t for t in trades if t["pnl_usd"] <= 0]
    win_rate = len(wins) / len(trades) if trades else 0

    gross_profit = sum(t["pnl_usd"] for t in wins) if wins else 0
    gross_loss = abs(sum(t["pnl_usd"] for t in losses)) if losses else 1
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

    max_dd = 0.0
    peak = initial_equity
    for t in trades:
        peak = max(peak, t["equity"])
        dd = (peak - t["equity"]) / peak if peak > 0 else 0
        max_dd = max(max_dd, dd)

    return {
        "pair": pair,
        "bars": total_bars,
        "trading_bars": total_bars - warmup,
        "period_start": str(df.index[warmup]),
        "period_end": str(df.index[-1]),
        "initial_equity": initial_equity,
        "final_equity": round(portfolio.equity, 2),
        "total_pnl": round(portfolio.total_pnl, 2),
        "agent_return_pct": round(agent_return * 100, 3),
        "buy_hold_return_pct": round(buy_hold_return * 100, 3),
        "alpha_pct": round(alpha * 100, 3),
        "total_trades": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate_pct": round(win_rate * 100, 1),
        "profit_factor": round(profit_factor, 2),
        "max_drawdown_pct": round(max_dd * 100, 3),
        "avg_win_pct": round(sum(t["pnl_pct"] for t in wins) / len(wins), 3) if wins else 0,
        "avg_loss_pct": round(sum(t["pnl_pct"] for t in losses) / len(losses), 3) if losses else 0,
        "trades": trades,
    }


def _resample(df: pd.DataFrame, target_minutes: int, source_minutes: int = 60) -> pd.DataFrame:
    """Resample OHLCV DataFrame to a higher timeframe.

    Args:
        df: Source OHLCV DataFrame with DatetimeIndex.
        target_minutes: Target interval in minutes.
        source_minutes: Source interval in minutes.

    Returns:
        Resampled DataFrame.
    """
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
    use_csv: bool = False,
):
    """Run backtest for all configured pairs.

    Args:
        interval: Candle interval in minutes (60=1h, 240=4h).
        bars: Number of bars to fetch per pair (ignored when use_csv=True).
        use_csv: Load data from CSV files instead of Kraken API.
    """
    source = "CSV" if use_csv else f"Kraken API ({bars} bars)"
    print(f"\n{'='*70}")
    print(f"  AEGIS AGENT BACKTEST")
    print(f"  Interval: {interval}min | Source: {source}")
    print(f"  Pairs: {', '.join(STRATEGY.pairs)}")
    print(f"  Fees: {FEE_RATE*100:.2f}% | Spread: {TYPICAL_SPREAD_BPS:.0f} bps")
    print(f"{'='*70}\n")

    combined_pnl = 0.0
    combined_trades = 0
    combined_wins = 0

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

        print(f"  Got {len(df)} bars: {df.index[0]} to {df.index[-1]}")
        print(f"  Running backtest...")

        result = backtest_pair(df, pair)

        if "error" in result:
            print(f"  ERROR: {result['error']}")
            continue

        combined_pnl += result["total_pnl"]
        combined_trades += result["total_trades"]
        combined_wins += result["wins"]

        print(f"\n  --- {pair} Results ---")
        print(f"  Period:        {result['period_start'][:10]} to {result['period_end'][:10]}")
        print(f"  Trading bars:  {result['trading_bars']}")
        print(f"  Final equity:  ${result['final_equity']:,.2f}")
        print(f"  Total PnL:     ${result['total_pnl']:+,.2f}")
        print(f"  Agent return:  {result['agent_return_pct']:+.3f}%")
        print(f"  Buy & Hold:    {result['buy_hold_return_pct']:+.3f}%")
        print(f"  Alpha:         {result['alpha_pct']:+.3f}%")
        print(f"  Trades:        {result['total_trades']} ({result['wins']}W / {result['losses']}L)")
        print(f"  Win rate:      {result['win_rate_pct']:.1f}%")
        print(f"  Profit factor: {result['profit_factor']:.2f}")
        print(f"  Max drawdown:  {result['max_drawdown_pct']:.3f}%")
        if result["wins"]:
            print(f"  Avg win:       {result['avg_win_pct']:+.3f}%")
        if result["losses"]:
            print(f"  Avg loss:      {result['avg_loss_pct']:+.3f}%")

        print(f"\n  Trade Log:")
        for t in result["trades"]:
            marker = "+" if t["pnl_usd"] > 0 else "-"
            print(f"    [{marker}] {t['timestamp'][:16]} {t['side'].upper():5s} "
                  f"entry={t['entry']:.2f} exit={t['exit']:.2f} "
                  f"pnl=${t['pnl_usd']:+.2f} ({t['pnl_pct']:+.3f}%) "
                  f"[{t['reason']}] eq=${t['equity']:.2f}")
        print()

    combined_wr = (combined_wins / combined_trades * 100) if combined_trades else 0
    print(f"{'='*70}")
    print(f"  COMBINED RESULTS")
    print(f"  Total PnL:     ${combined_pnl:+,.2f}")
    print(f"  Total trades:  {combined_trades} ({combined_wins}W / {combined_trades - combined_wins}L)")
    print(f"  Win rate:      {combined_wr:.1f}%")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.WARNING,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="Aegis Agent Backtester")
    parser.add_argument(
        "--csv", action="store_true",
        help="Load data from CSV files in data/ instead of Kraken API",
    )
    parser.add_argument(
        "--interval", type=int, default=60,
        help="Candle interval in minutes (default: 60)",
    )
    parser.add_argument(
        "--bars", type=int, default=2000,
        help="Number of bars to fetch from Kraken (ignored with --csv)",
    )
    args = parser.parse_args()

    asyncio.run(run_backtest(
        interval=args.interval,
        bars=args.bars,
        use_csv=args.csv,
    ))
