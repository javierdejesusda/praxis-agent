"""Phase 2 sweep: position management parameters.

Anchors on Phase 1 winner and sweeps breakeven trigger, profit lock,
partial take-profit, and cooldown.

Usage:
    python scripts/sweep_phase2.py --stop 3.1 --trail 2.1 --tgt 2.85 --hold 80 --ddsf 0.001
"""

import argparse
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

OOS_SPLIT = "2023-01-01"


def score(m: dict) -> float:
    sharpe = m.get("sharpe_annualized", 0.0) or 0.0
    dd = m.get("max_drawdown_pct", 100.0) / 100.0
    ret = m.get("agent_return_pct", 0.0)
    if sharpe <= 0 or ret <= 0:
        return 0.0
    dd_pen = max(0.0, 1.0 - dd / 0.12)
    return sharpe * dd_pen * (1.0 + math.log1p(ret / 100.0))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stop", type=float, default=3.1)
    parser.add_argument("--trail", type=float, default=2.1)
    parser.add_argument("--tgt", type=float, default=2.85)
    parser.add_argument("--hold", type=int, default=80)
    parser.add_argument("--ddsf", type=float, default=0.001)
    args = parser.parse_args()

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
        "be_trigger_pct":   [0.003, 0.005, 0.006, 0.008, 0.010],
        "lock_trigger_pct": [0.008, 0.010, 0.012, 0.015, 0.020],
        "lock_value_pct":   [0.004, 0.0067, 0.008, 0.010],
        "partial_tp_pct":   [0.0, 0.3, 0.5],
        "cooldown_bars":    [4, 6, 8],
    }

    keys = list(grid.keys())
    combos = list(product(*grid.values()))
    print(f"\nSweeping {len(combos)} combinations (anchored on Phase 1 winner)...")
    print(f"  stop={args.stop} trail={args.trail} tgt={args.tgt} hold={args.hold} ddsf={args.ddsf}")

    tb = args.tgt
    results = []
    t0 = time.time()

    for idx, vals in enumerate(combos):
        params = dict(zip(keys, vals))

        r = backtest_portfolio(
            pair_frames,
            initial_equity=10000.0,
            stop_mult=args.stop,
            trail_mult=args.trail,
            target_mult_base=tb,
            target_mult_mid=tb + 0.65,
            target_mult_hi=tb + 3.4,
            max_hold_bars=args.hold,
            dd_scale_factor=args.ddsf,
            dd_scale_threshold=0.97,
            macro_filter=True,
            mtf_daily_filter=True,
            cooldown_bars=params["cooldown_bars"],
            cross_pair_boost=True,
            be_trigger_pct=params["be_trigger_pct"],
            lock_trigger_pct=params["lock_trigger_pct"],
            lock_value_pct=params["lock_value_pct"],
            partial_tp_pct=params["partial_tp_pct"],
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
            "final_eq": round(r.get("final_equity", 0), 2),
        })

        if (idx + 1) % 20 == 0 or idx == 0:
            elapsed = time.time() - t0
            rate = (idx + 1) / elapsed
            eta = (len(combos) - idx - 1) / rate
            best = max((x["score"] for x in results), default=0)
            print(f"  [{idx+1}/{len(combos)}] {rate:.2f}/s  eta={eta/60:.1f}m  best={best:.4f}")

    results.sort(key=lambda x: x["score"], reverse=True)

    out_path = LOG_DIR / "sweep_phase2.json"
    out_path.write_text(json.dumps(results, indent=2))

    print(f"\nDone in {(time.time()-t0)/60:.1f} min — {len(results)} results")
    print(f"Saved to {out_path}\n")

    print("=" * 90)
    print(f"{'#':>3}  {'Score':>7}  {'Sharpe':>6}  {'DD%':>6}  {'Ret%':>8}  {'Trades':>6}  {'WR%':>5}  {'BE':>6}  {'Lock':>6}  {'LkVal':>6}  {'PTP':>4}  {'CD':>3}")
    print("-" * 90)
    for i, r in enumerate(results[:15]):
        p = r["params"]
        print(
            f"{i+1:3d}  {r['score']:7.4f}  {r['sharpe']:6.3f}  {r['dd_pct']:5.2f}%  {r['return_pct']:+7.1f}%  {r['trades']:6d}  {r['win_rate']:4.1f}%"
            f"  {p['be_trigger_pct']:6.4f}  {p['lock_trigger_pct']:6.4f}  {p['lock_value_pct']:6.4f}  {p['partial_tp_pct']:4.1f}  {p['cooldown_bars']:3d}"
        )

    if results:
        best = results[0]
        print(f"\n{'='*90}")
        print(f"WINNER: Sharpe {best['sharpe']:.3f} / DD {best['dd_pct']:.2f}% / Return {best['return_pct']:+.1f}%")
        for k, v in best["params"].items():
            print(f"  {k}={v}")


if __name__ == "__main__":
    main()
