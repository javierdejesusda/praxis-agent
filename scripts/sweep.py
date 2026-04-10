"""Parameter sweep to find optimal configuration."""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from src.backtester import backtest_pair, load_csv, _resample
from src.config import RISK, STRATEGY


def run_single(df_btc, df_eth, paper_threshold, shorts_enabled, short_threshold):
    import src.config as config_mod
    config_mod.RISK = type(config_mod.RISK)(
        risk_per_trade_pct=0.01,
        max_position_pct=0.10,
        max_daily_loss_pct=0.03,
        max_drawdown_pct=0.08,
        max_consecutive_losses=3,
        min_spread_bps=20.0,
        real_cost_bps=55.0,
        required_edge_multiplier=1.1,
        min_signal_score_erc=85,
        min_signal_score_paper=paper_threshold,
        min_signal_score_short=short_threshold,
        shorts_enabled=shorts_enabled,
        execution_mode="paper",
    )
    import src.agents.risk_governor as rg
    import importlib
    importlib.reload(rg)
    import src.backtester as bt
    importlib.reload(bt)

    btc = bt.backtest_pair(df_btc, "BTCUSD")
    eth = bt.backtest_pair(df_eth, "ETHUSD")

    return {
        "paper": paper_threshold,
        "shorts": shorts_enabled,
        "short_thr": short_threshold,
        "btc_pf": btc["profit_factor"],
        "eth_pf": eth["profit_factor"],
        "btc_pnl": btc["total_pnl"],
        "eth_pnl": eth["total_pnl"],
        "btc_trades": btc["total_trades"],
        "eth_trades": eth["total_trades"],
        "btc_dd": btc["max_drawdown_pct"],
        "eth_dd": eth["max_drawdown_pct"],
        "total_pnl": btc["total_pnl"] + eth["total_pnl"],
        "total_trades": btc["total_trades"] + eth["total_trades"],
    }


async def main():
    print("Loading data...")
    df_btc = load_csv("BTCUSD", 60)
    df_btc = _resample(df_btc, 240, 60)
    df_eth = load_csv("ETHUSD", 60)
    df_eth = _resample(df_eth, 240, 60)

    print("Running sweep...")
    configs = []
    for paper in [82, 83, 84, 85, 86]:
        configs.append((paper, False, 100))
        for short_thr in [88, 90, 92]:
            configs.append((paper, True, short_thr))

    results = []
    for paper, shorts, short_thr in configs:
        label = f"paper={paper} shorts={'ON' if shorts else 'OFF'}"
        if shorts:
            label += f" thr={short_thr}"
        print(f"  {label}...")
        try:
            r = run_single(df_btc, df_eth, paper, shorts, short_thr)
            results.append(r)
        except Exception as e:
            print(f"    FAILED: {e}")

    print()
    print("=" * 100)
    print(f"{'paper':6} {'shorts':8} {'short_t':8} {'btc_pf':8} {'eth_pf':8} "
          f"{'btc_pnl':9} {'eth_pnl':9} {'total':9} {'trades':7} {'btc_dd':7} {'eth_dd':7}")
    print("=" * 100)
    for r in sorted(results, key=lambda x: -x["total_pnl"]):
        shorts = "ON" if r["shorts"] else "OFF"
        short_thr = str(r["short_thr"]) if r["shorts"] else "-"
        print(f"{r['paper']:6} {shorts:8} {short_thr:8} "
              f"{r['btc_pf']:7.2f}  {r['eth_pf']:7.2f}  "
              f"${r['btc_pnl']:+8.0f} ${r['eth_pnl']:+8.0f} "
              f"${r['total_pnl']:+8.0f} {r['total_trades']:6d}  "
              f"{r['btc_dd']:5.2f}%  {r['eth_dd']:5.2f}%")

    print()
    print("=== TOP BY PROFIT FACTOR (min 100 trades) ===")
    pf_ranked = [r for r in results if r["total_trades"] >= 100]
    pf_ranked.sort(key=lambda x: -(x["btc_pf"] + x["eth_pf"]))
    for r in pf_ranked[:5]:
        shorts = "ON" if r["shorts"] else "OFF"
        short_thr = str(r["short_thr"]) if r["shorts"] else "-"
        avg_pf = (r["btc_pf"] + r["eth_pf"]) / 2
        print(f"  paper={r['paper']} shorts={shorts} thr={short_thr} "
              f"avg_pf={avg_pf:.2f} pnl=${r['total_pnl']:+.0f} "
              f"trades={r['total_trades']}")


if __name__ == "__main__":
    asyncio.run(main())
