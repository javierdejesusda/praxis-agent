"""Backtester — walk-forward simulation using deterministic pipeline.

Fetches maximum historical OHLC from Kraken, walks bar-by-bar computing
features, signals, and risk decisions. Simulates paper trades with
realistic costs. Reports PnL, win rate, drawdown, and alpha vs buy-and-hold.
"""

import asyncio
import logging
import sys
import time
from datetime import datetime, timezone

import pandas as pd

from src.agents.llm_analyst import deterministic_fallback
from src.agents.risk_governor import evaluate_risk
from src.agents.signals import (
    mean_reversion_signal,
    momentum_signal,
    spread_cost_signal,
    trend_signal,
    volatility_signal,
)
from src.config import RISK, STRATEGY
from src.execution.kraken_adapter import get_ohlc_extended
from src.features.engine import compute_features
from src.models import Direction, Portfolio
from src.orchestrator import _parse_ohlc_to_dataframe

logger = logging.getLogger(__name__)

FEE_RATE = 0.0026
TYPICAL_SPREAD_BPS = 8.0
TRAIL_ATR_MULT = 2.0
BREAKEVEN_PCT = 0.02


def _run_signals(features):
    """Run all 5 deterministic signal agents."""
    return [
        trend_signal(features),
        volatility_signal(features),
        spread_cost_signal(features),
        mean_reversion_signal(features),
        momentum_signal(features),
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


def backtest_pair(df: pd.DataFrame, pair: str, initial_equity: float = 10000.0):
    """Run walk-forward backtest on a single pair.

    Args:
        df: Full OHLCV DataFrame (must have 200+ rows).
        pair: Trading pair name.
        initial_equity: Starting equity.

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

    for i in range(warmup, total_bars):
        window = df.iloc[max(0, i - warmup):i + 1]
        if len(window) < warmup:
            continue

        close_price = float(df["close"].iloc[i])
        bars_since_trade += 1

        try:
            features = compute_features(window, pair)
            features.spread_bps = TYPICAL_SPREAD_BPS
        except Exception as e:
            logger.debug("Feature computation failed at bar %d: %s", i, e)
            continue

        if position is not None:
            entry = position["entry_price"]
            atr_stop = position.get("atr_stop")
            atr_target = position.get("atr_target")
            peak = position.get("peak_price", entry)
            atr = position.get("atr_20", features.atr_20)

            if position["side"] == "long":
                peak = max(peak, close_price)
                trail = peak - atr * TRAIL_ATR_MULT
                if peak > entry * (1 + BREAKEVEN_PCT):
                    trail = max(trail, entry)

                close_trade = False
                reason = ""
                if atr_stop and close_price <= atr_stop:
                    close_trade = True
                    reason = "atr_stop"
                elif close_price <= trail and peak > entry * (1 + BREAKEVEN_PCT):
                    close_trade = True
                    reason = "trailing_stop"
                elif atr_target and close_price >= atr_target:
                    close_trade = True
                    reason = "atr_target"
            else:
                peak = min(peak, close_price)
                trail = peak + atr * TRAIL_ATR_MULT
                if peak < entry * (1 - BREAKEVEN_PCT):
                    trail = min(trail, entry)

                close_trade = False
                reason = ""
                if atr_stop and close_price >= atr_stop:
                    close_trade = True
                    reason = "atr_stop"
                elif close_price >= trail and peak < entry * (1 - BREAKEVEN_PCT):
                    close_trade = True
                    reason = "trailing_stop"
                elif atr_target and close_price <= atr_target:
                    close_trade = True
                    reason = "atr_target"

            position["peak_price"] = peak

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
                continue

        if position is not None:
            continue

        if bars_since_trade < 2:
            continue

        signals = _run_signals(features)
        analyst = deterministic_fallback(signals, features)

        risk_decision, intent = evaluate_risk(
            signals=signals,
            analyst=analyst,
            features=features,
            portfolio=portfolio,
            snapshot_age_seconds=0.0,
        )

        if not risk_decision.approved or intent is None:
            continue

        fill_price = close_price
        fees = intent.size_usd * FEE_RATE
        portfolio.cash -= fees
        portfolio.equity -= fees
        portfolio.trade_count += 1

        position = {
            "side": intent.side.value,
            "size_usd": intent.size_usd,
            "entry_price": fill_price,
            "atr_stop": intent.atr_stop,
            "atr_target": intent.atr_target,
            "peak_price": fill_price,
            "atr_20": features.atr_20,
            "intent_id": intent.intent_id,
        }
        portfolio.positions[pair] = position
        bars_since_trade = 0

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


async def run_backtest(interval: int = 60, bars: int = 2000):
    """Run backtest for all configured pairs.

    Args:
        interval: Candle interval in minutes (60=1h, 240=4h).
        bars: Number of bars to fetch per pair.
    """
    print(f"\n{'='*70}")
    print(f"  AEGIS AGENT BACKTEST")
    print(f"  Interval: {interval}min | Target bars: {bars}")
    print(f"  Pairs: {', '.join(STRATEGY.pairs)}")
    print(f"  Fees: {FEE_RATE*100:.2f}% | Spread: {TYPICAL_SPREAD_BPS:.0f} bps")
    print(f"{'='*70}\n")

    combined_pnl = 0.0
    combined_trades = 0
    combined_wins = 0

    for pair in STRATEGY.pairs:
        print(f"Fetching {pair} data...")
        try:
            df = await fetch_data(pair, interval, bars)
        except Exception as e:
            print(f"  FAILED to fetch {pair}: {e}")
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

    interval = 60
    bars = 2000
    if len(sys.argv) > 1:
        interval = int(sys.argv[1])
    if len(sys.argv) > 2:
        bars = int(sys.argv[2])

    asyncio.run(run_backtest(interval=interval, bars=bars))
