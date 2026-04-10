"""Deep analysis of backtest trade log to find actionable patterns."""

import asyncio
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backtester import backtest_pair, load_csv, _resample
from src.config import STRATEGY


async def main():
    print("\n=== BACKTEST DEEP ANALYSIS ===\n")
    all_trades = []

    for pair in STRATEGY.pairs:
        df = load_csv(pair, 60)
        df = _resample(df, 240, 60)
        result = backtest_pair(df, pair)
        for t in result["trades"]:
            t["pair"] = pair
            all_trades.append(t)

    wins = [t for t in all_trades if t["pnl_usd"] > 0]
    losses = [t for t in all_trades if t["pnl_usd"] <= 0]

    print(f"Total trades: {len(all_trades)}")
    print(f"Wins: {len(wins)} ({len(wins)/len(all_trades)*100:.1f}%)")
    print(f"Losses: {len(losses)} ({len(losses)/len(all_trades)*100:.1f}%)")
    print()

    print("=== EXIT REASON BREAKDOWN ===")
    reasons = Counter(t["reason"] for t in all_trades)
    for reason, count in reasons.most_common():
        subset = [t for t in all_trades if t["reason"] == reason]
        s_wins = sum(1 for t in subset if t["pnl_usd"] > 0)
        s_pnl = sum(t["pnl_usd"] for t in subset)
        avg_pnl = s_pnl / len(subset) if subset else 0
        wr = s_wins / len(subset) * 100 if subset else 0
        print(f"  {reason:20s}: {count:4d} trades | {wr:5.1f}% WR | "
              f"total=${s_pnl:+.2f} | avg=${avg_pnl:+.2f}")
    print()

    print("=== SIDE PERFORMANCE ===")
    for side in ["long", "short"]:
        subset = [t for t in all_trades if t["side"] == side]
        if not subset:
            continue
        s_wins = sum(1 for t in subset if t["pnl_usd"] > 0)
        s_pnl = sum(t["pnl_usd"] for t in subset)
        avg_pnl = s_pnl / len(subset)
        wr = s_wins / len(subset) * 100
        print(f"  {side:5s}: {len(subset):4d} trades | {wr:5.1f}% WR | "
              f"total=${s_pnl:+.2f} | avg=${avg_pnl:+.2f}")
    print()

    print("=== SIGNAL SCORE BREAKDOWN ===")
    score_buckets = defaultdict(list)
    for t in all_trades:
        s = t.get("signal_score", 0)
        if s >= 89:
            score_buckets["89+"].append(t)
        elif s >= 85:
            score_buckets["85-88"].append(t)
        elif s >= 82:
            score_buckets["82-84"].append(t)
        else:
            score_buckets["<82"].append(t)

    for bucket in ["89+", "85-88", "82-84", "<82"]:
        subset = score_buckets[bucket]
        if not subset:
            continue
        s_wins = sum(1 for t in subset if t["pnl_usd"] > 0)
        s_pnl = sum(t["pnl_usd"] for t in subset)
        avg_pnl = s_pnl / len(subset)
        wr = s_wins / len(subset) * 100
        print(f"  score {bucket:6s}: {len(subset):4d} trades | {wr:5.1f}% WR | "
              f"total=${s_pnl:+.2f} | avg=${avg_pnl:+.2f}")
    print()

    print("=== WIN/LOSS MAGNITUDE ===")
    if wins:
        avg_win = sum(t["pnl_pct"] for t in wins) / len(wins)
        max_win = max(t["pnl_pct"] for t in wins)
        print(f"  Avg win:  {avg_win:+.3f}%")
        print(f"  Max win:  {max_win:+.3f}%")
    if losses:
        avg_loss = sum(t["pnl_pct"] for t in losses) / len(losses)
        max_loss = min(t["pnl_pct"] for t in losses)
        print(f"  Avg loss: {avg_loss:+.3f}%")
        print(f"  Max loss: {max_loss:+.3f}%")
    print()

    print("=== EXIT REASON IMPACT ===")
    total_loss = sum(t["pnl_usd"] for t in losses)
    for reason in ["time_exit", "atr_stop", "trailing_stop", "atr_target"]:
        subset = [t for t in losses if t["reason"] == reason]
        if not subset:
            continue
        total = sum(t["pnl_usd"] for t in subset)
        pct = total / total_loss * 100 if total_loss else 0
        print(f"  {reason:20s}: ${total:+.2f} ({pct:.1f}% of total losses)")
    print()

    print("=== TIME EXIT LOSERS (what's the problem?) ===")
    time_losers = [t for t in losses if t["reason"] == "time_exit"]
    print(f"  Count: {len(time_losers)}")
    if time_losers:
        avg = sum(t["pnl_pct"] for t in time_losers) / len(time_losers)
        print(f"  Avg loss: {avg:+.3f}%")
        tiny = sum(1 for t in time_losers if abs(t["pnl_pct"]) < 0.5)
        small = sum(1 for t in time_losers if 0.5 <= abs(t["pnl_pct"]) < 1.5)
        medium = sum(1 for t in time_losers if 1.5 <= abs(t["pnl_pct"]) < 3.0)
        large = sum(1 for t in time_losers if abs(t["pnl_pct"]) >= 3.0)
        print(f"  Tiny (<0.5%):   {tiny}")
        print(f"  Small (0.5-1.5%): {small}")
        print(f"  Medium (1.5-3%):  {medium}")
        print(f"  Large (3%+):      {large}")


if __name__ == "__main__":
    asyncio.run(main())
