"""Final performance report for the hackathon."""

import asyncio
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from src.backtester import backtest_pair, load_csv, _resample
from src.config import RISK, STATE_DIR, STRATEGY


def calmar_ratio(total_return_pct: float, max_dd_pct: float) -> float:
    if max_dd_pct <= 0:
        return float("inf")
    return total_return_pct / max_dd_pct


def sharpe_approx(trades: list, initial_equity: float) -> float:
    """Approximate Sharpe from trade-level returns (assumes uniform time)."""
    if len(trades) < 2:
        return 0.0
    equity_curve = [initial_equity]
    for t in trades:
        equity_curve.append(t["equity"])

    returns = []
    for i in range(1, len(equity_curve)):
        r = (equity_curve[i] - equity_curve[i - 1]) / equity_curve[i - 1]
        returns.append(r)

    if not returns:
        return 0.0

    mean = sum(returns) / len(returns)
    variance = sum((r - mean) ** 2 for r in returns) / len(returns)
    std = math.sqrt(variance)
    if std == 0:
        return 0.0
    return (mean / std) * math.sqrt(252)


async def main():
    print("\n" + "=" * 70)
    print("  AEGIS AGENT — FINAL HACKATHON BACKTEST REPORT")
    print(f"  Config: paper>={RISK.min_signal_score_paper}, shorts_thr={RISK.min_signal_score_short}, "
          f"shorts_enabled={RISK.shorts_enabled}")
    print("=" * 70 + "\n")

    combined_pnl = 0.0
    combined_trades = 0
    combined_wins = 0
    combined_gross_profit = 0.0
    combined_gross_loss = 0.0
    pair_results = []

    for pair in STRATEGY.pairs:
        df = load_csv(pair, 60)
        df = _resample(df, 240, 60)
        result = backtest_pair(df, pair)
        pair_results.append(result)

        combined_pnl += result["total_pnl"]
        combined_trades += result["total_trades"]
        combined_wins += result["wins"]

        wins = [t for t in result["trades"] if t["pnl_usd"] > 0]
        losses = [t for t in result["trades"] if t["pnl_usd"] <= 0]
        combined_gross_profit += sum(t["pnl_usd"] for t in wins)
        combined_gross_loss += abs(sum(t["pnl_usd"] for t in losses))

        sharpe = sharpe_approx(result["trades"], result["initial_equity"])
        calmar = calmar_ratio(result["agent_return_pct"], result["max_drawdown_pct"])

        print(f"### {pair}")
        print(f"  Period:          {result['period_start'][:10]} to {result['period_end'][:10]}")
        print(f"  Trades:          {result['total_trades']} ({result['wins']}W / {result['losses']}L)")
        print(f"  Win rate:        {result['win_rate_pct']:.1f}%")
        print(f"  Agent return:    {result['agent_return_pct']:+.2f}%")
        print(f"  Profit factor:   {result['profit_factor']:.2f}")
        print(f"  Max drawdown:    {result['max_drawdown_pct']:.2f}%")
        print(f"  Sharpe (approx): {sharpe:.2f}")
        print(f"  Calmar:          {calmar:.2f}")
        print(f"  Avg win:         {result['avg_win_pct']:+.2f}%")
        print(f"  Avg loss:        {result['avg_loss_pct']:+.2f}%")
        print()

    combined_wr = (combined_wins / combined_trades * 100) if combined_trades else 0
    combined_pf = (combined_gross_profit / combined_gross_loss
                   if combined_gross_loss > 0 else float("inf"))
    total_return_pct = combined_pnl / (10000.0 * len(pair_results)) * 100

    all_trades = []
    for result in pair_results:
        all_trades.extend(result["trades"])
    all_trades.sort(key=lambda t: t["timestamp"])

    peak = 0.0
    max_combined_dd = 0.0
    cumulative_equity = 10000.0 * len(pair_results)
    running = 0.0
    for t in all_trades:
        running += t["pnl_usd"]
        current_equity = 10000.0 * len(pair_results) + running
        peak = max(peak, current_equity)
        dd = (peak - current_equity) / peak if peak > 0 else 0
        max_combined_dd = max(max_combined_dd, dd)

    print("=" * 70)
    print("### COMBINED PORTFOLIO")
    print(f"  Total trades:    {combined_trades}")
    print(f"  Win rate:        {combined_wr:.1f}%")
    print(f"  Total PnL:       ${combined_pnl:+,.2f}")
    print(f"  Portfolio return: {total_return_pct:+.2f}%")
    print(f"  Profit factor:   {combined_pf:.2f}")
    print(f"  Max drawdown:    {max_combined_dd * 100:.2f}%")
    print(f"  Calmar:          {total_return_pct / (max_combined_dd * 100):.2f}"
          if max_combined_dd > 0 else "  Calmar: inf")

    recent = [t for t in all_trades if t["timestamp"] >= "2024-01-01"]
    if recent:
        wins = [t for t in recent if t["pnl_usd"] > 0]
        pnl = sum(t["pnl_usd"] for t in recent)
        gp = sum(t["pnl_usd"] for t in wins)
        gl = abs(sum(t["pnl_usd"] for t in recent if t["pnl_usd"] <= 0))
        pf = gp / gl if gl > 0 else float("inf")
        print()
        print("### RECENT PERFORMANCE (2024-2026)")
        print(f"  Trades: {len(recent)}")
        print(f"  Win rate: {len(wins)/len(recent)*100:.1f}%")
        print(f"  PnL: ${pnl:+,.2f}")
        print(f"  Profit factor: {pf:.2f}")

    print("=" * 70)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "min_signal_score_paper": RISK.min_signal_score_paper,
            "min_signal_score_short": RISK.min_signal_score_short,
            "shorts_enabled": RISK.shorts_enabled,
        },
        "combined": {
            "total_trades": combined_trades,
            "wins": combined_wins,
            "losses": combined_trades - combined_wins,
            "win_rate_pct": round(combined_wr, 2),
            "total_pnl_usd": round(combined_pnl, 2),
            "portfolio_return_pct": round(total_return_pct, 2),
            "profit_factor": round(combined_pf, 2),
            "max_drawdown_pct": round(max_combined_dd * 100, 2),
            "calmar": (
                round(total_return_pct / (max_combined_dd * 100), 2)
                if max_combined_dd > 0
                else None
            ),
        },
        "per_pair": [
            {
                "pair": result["pair"],
                "period_start": result["period_start"][:10],
                "period_end": result["period_end"][:10],
                "trades": result["total_trades"],
                "wins": result["wins"],
                "losses": result["losses"],
                "win_rate_pct": round(result["win_rate_pct"], 2),
                "return_pct": round(result["agent_return_pct"], 2),
                "profit_factor": round(result["profit_factor"], 2),
                "max_drawdown_pct": round(result["max_drawdown_pct"], 2),
                "sharpe": round(sharpe_approx(result["trades"], result["initial_equity"]), 2),
                "calmar": round(
                    calmar_ratio(result["agent_return_pct"], result["max_drawdown_pct"]),
                    2,
                ),
                "avg_win_pct": round(result["avg_win_pct"], 2),
                "avg_loss_pct": round(result["avg_loss_pct"], 2),
            }
            for result in pair_results
        ],
        "recent": (
            {
                "window_start": "2024-01-01",
                "trades": len(recent),
                "win_rate_pct": round(len(wins) / len(recent) * 100, 2),
                "pnl_usd": round(pnl, 2),
                "profit_factor": round(pf, 2),
            }
            if recent
            else None
        ),
    }

    out_path = STATE_DIR / "backtest_report.json"
    out_path.write_text(json.dumps(report, indent=2))
    print(f"\nWrote JSON report to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
