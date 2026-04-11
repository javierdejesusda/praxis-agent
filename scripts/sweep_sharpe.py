"""Focused sweep to maximize Sharpe and minimize drawdown.

Pre-computes features once, then sweeps ~120 parameter combinations
across the most impactful levers. Objective: Sharpe * (1 - DD/12%).

Usage:
    python scripts/sweep_sharpe.py
"""

import json
import math
import sys
import time
from itertools import product
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from src import config
from src.backtester import (
    backtest_portfolio,
    load_csv,
    _resample,
    compute_features_bulk,
)

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)


def score(m: dict) -> float:
    """Sharpe * drawdown penalty * return bonus."""
    sharpe = m.get("sharpe_annualized", 0.0) or 0.0
    dd = m.get("max_drawdown_pct", 100.0) / 100.0
    ret = m.get("agent_return_pct", 0.0)
    if sharpe <= 0 or ret <= 0:
        return 0.0
    dd_pen = max(0.0, 1.0 - dd / 0.12)
    return sharpe * dd_pen * (1.0 + math.log1p(ret / 100.0))


OOS_SPLIT = "2023-01-01"


def main():
    pairs = ["BTCUSD", "ETHUSD"]
    interval = 240

    print(f"Loading data and pre-computing features (OOS cutoff: {OOS_SPLIT})...")
    pair_frames = {}
    pair_features = {}
    for pair in pairs:
        df = load_csv(pair, 60)
        df = _resample(df, interval, 60)
        df = df[df.index < pd.Timestamp(OOS_SPLIT, tz="UTC")]
        pair_frames[pair] = df
        pair_features[pair] = compute_features_bulk(df, pair)
        print(f"  {pair}: {len(df):,} bars (training only, before {OOS_SPLIT})")

    grid = {
        "stop_mult":        [2.8, 3.0, 3.1, 3.3, 3.5],
        "trail_mult":       [1.7, 1.9, 2.1, 2.3],
        "target_mult_base": [2.5, 2.85, 3.2],
        "max_hold_bars":    [60, 80, 100],
        "dd_scale_factor":  [0.001, 0.05, 0.3],
    }

    keys = list(grid.keys())
    combos = list(product(*grid.values()))
    print(f"\nSweeping {len(combos)} combinations...")

    results = []
    t0 = time.time()

    for idx, vals in enumerate(combos):
        params = dict(zip(keys, vals))
        tb = params["target_mult_base"]

        r = backtest_portfolio(
            pair_frames,
            initial_equity=10000.0,
            stop_mult=params["stop_mult"],
            trail_mult=params["trail_mult"],
            target_mult_base=tb,
            target_mult_mid=tb + 0.65,
            target_mult_hi=tb + 3.4,
            max_hold_bars=params["max_hold_bars"],
            dd_scale_factor=params["dd_scale_factor"],
            dd_scale_threshold=0.97,
            macro_filter=True,
            mtf_daily_filter=True,
            cooldown_bars=6,
            cross_pair_boost=True,
            precomputed_features=pair_features,
            verbose=False,
        )

        if "error" in r:
            continue

        s = score(r)
        results.append({
            "score": round(s, 4),
            "params": params,
            "sharpe": round(r.get("sharpe_annualized", 0) or 0, 3),
            "sortino": round(r.get("sortino_annualized", 0) or 0, 3),
            "dd_pct": round(r.get("max_drawdown_pct", 0), 2),
            "return_pct": round(r.get("agent_return_pct", 0), 1),
            "trades": r.get("total_trades", 0),
            "win_rate": r.get("win_rate_pct", 0),
            "pf": r.get("profit_factor"),
            "calmar": r.get("calmar_ratio"),
            "cagr": round(r.get("cagr_pct", 0), 2),
            "final_eq": round(r.get("final_equity", 0), 2),
        })

        if (idx + 1) % 10 == 0 or idx == 0:
            elapsed = time.time() - t0
            rate = (idx + 1) / elapsed
            eta = (len(combos) - idx - 1) / rate
            best = max((x["score"] for x in results), default=0)
            print(f"  [{idx+1}/{len(combos)}] {rate:.2f}/s  eta={eta/60:.1f}m  best={best:.4f}")

    results.sort(key=lambda x: x["score"], reverse=True)

    out_path = LOG_DIR / "sweep_sharpe.json"
    out_path.write_text(json.dumps(results, indent=2))

    print(f"\nDone in {(time.time()-t0)/60:.1f} min — {len(results)} results")
    print(f"Saved to {out_path}\n")

    print("=" * 80)
    print(f"{'#':>3}  {'Score':>7}  {'Sharpe':>6}  {'DD%':>6}  {'Ret%':>8}  {'Trades':>6}  {'WR%':>5}  {'stop':>5}  {'trail':>5}  {'tgt':>5}  {'hold':>4}  {'dd_sf':>6}")
    print("-" * 80)
    for i, r in enumerate(results[:20]):
        p = r["params"]
        print(
            f"{i+1:3d}  {r['score']:7.4f}  {r['sharpe']:6.3f}  {r['dd_pct']:5.2f}%  {r['return_pct']:+7.1f}%  {r['trades']:6d}  {r['win_rate']:4.1f}%"
            f"  {p['stop_mult']:5.2f}  {p['trail_mult']:5.2f}  {p['target_mult_base']:5.2f}  {p['max_hold_bars']:4d}  {p['dd_scale_factor']:6.3f}"
        )

    if results:
        best = results[0]
        print(f"\n{'='*80}")
        print(f"WINNER: Sharpe {best['sharpe']:.3f} / DD {best['dd_pct']:.2f}% / Return {best['return_pct']:+.1f}%")
        print(f"  stop_mult={best['params']['stop_mult']}")
        print(f"  trail_mult={best['params']['trail_mult']}")
        print(f"  target_mult_base={best['params']['target_mult_base']}")
        print(f"  max_hold_bars={best['params']['max_hold_bars']}")
        print(f"  dd_scale_factor={best['params']['dd_scale_factor']}")


if __name__ == "__main__":
    main()
