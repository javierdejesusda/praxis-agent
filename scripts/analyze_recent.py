"""Analyze recent backtest trades (2024-2026) — the most relevant for hackathon."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backtester import backtest_pair, load_csv, _resample
from src.config import STRATEGY


async def main():
    print("\n=== RECENT PERIOD ANALYSIS (2024-2026) ===\n")

    all_recent = []
    for pair in STRATEGY.pairs:
        df = load_csv(pair, 60)
        df = _resample(df, 240, 60)
        result = backtest_pair(df, pair)

        recent = [t for t in result["trades"]
                  if t["timestamp"] >= "2024-01-01"]
        for t in recent:
            t["pair"] = pair
        all_recent.extend(recent)

        print(f"--- {pair} (2024-2026) ---")
        wins = [t for t in recent if t["pnl_usd"] > 0]
        total_pnl = sum(t["pnl_usd"] for t in recent)
        print(f"  Trades: {len(recent)}")
        if recent:
            print(f"  Win rate: {len(wins)/len(recent)*100:.1f}%")
            print(f"  Total PnL: ${total_pnl:+.2f}")
            gross_profit = sum(t["pnl_usd"] for t in recent if t["pnl_usd"] > 0)
            gross_loss = abs(sum(t["pnl_usd"] for t in recent if t["pnl_usd"] <= 0))
            pf = gross_profit / gross_loss if gross_loss > 0 else float("inf")
            print(f"  Profit factor: {pf:.2f}")
        print()

    print("=== COMBINED RECENT ===")
    wins = [t for t in all_recent if t["pnl_usd"] > 0]
    total = sum(t["pnl_usd"] for t in all_recent)
    print(f"Total trades: {len(all_recent)}")
    if all_recent:
        print(f"Win rate: {len(wins)/len(all_recent)*100:.1f}%")
        print(f"Total PnL: ${total:+.2f}")

    if all_recent:
        recent_6mo = [t for t in all_recent if t["timestamp"] >= "2025-10-01"]
        print(f"\n=== LAST 6 MONTHS (most relevant) ===")
        print(f"Trades: {len(recent_6mo)}")
        if recent_6mo:
            wins6 = [t for t in recent_6mo if t["pnl_usd"] > 0]
            pnl6 = sum(t["pnl_usd"] for t in recent_6mo)
            print(f"Win rate: {len(wins6)/len(recent_6mo)*100:.1f}%")
            print(f"Total PnL: ${pnl6:+.2f}")
            for t in recent_6mo:
                marker = "+" if t["pnl_usd"] > 0 else "-"
                print(f"  [{marker}] {t['timestamp'][:10]} {t['pair']} {t['side']:5s} "
                      f"entry={t['entry']:.2f} pnl=${t['pnl_usd']:+.2f} ({t['pnl_pct']:+.2f}%) "
                      f"[{t['reason']}]")


if __name__ == "__main__":
    asyncio.run(main())
