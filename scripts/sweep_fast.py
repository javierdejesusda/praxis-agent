"""Fast targeted sweep to beat Sharpe 1.514 / DD 7.27%.

72 configs anchored around the current best, ~13 min runtime.
"""

import json
import math
import sys
import time
from itertools import product
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from src.backtester import (
    backtest_portfolio,
    load_csv,
    _resample,
    compute_features_bulk,
)

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

OOS_SPLIT = "2023-01-01"


def score(m):
    sharpe = m.get("sharpe_annualized", 0.0) or 0.0
    dd = m.get("max_drawdown_pct", 100.0) / 100.0
    ret = m.get("agent_return_pct", 0.0)
    if sharpe <= 0 or ret <= 0:
        return 0.0
    return sharpe * max(0.0, 1.0 - dd / 0.12) * (1.0 + math.log1p(ret / 100.0))


def run_one(pair_frames, pair_features, stop, trail, tgt, hold, ddsf, be, lk, lv, ptp, cd):
    r = backtest_portfolio(
        pair_frames, initial_equity=10000.0,
        stop_mult=stop, trail_mult=trail,
        target_mult_base=tgt, target_mult_mid=tgt + 0.65, target_mult_hi=tgt + 3.4,
        max_hold_bars=hold, dd_scale_factor=ddsf, dd_scale_threshold=0.97,
        macro_filter=True, mtf_daily_filter=True, cooldown_bars=cd,
        cross_pair_boost=True,
        be_trigger_pct=be, lock_trigger_pct=lk, lock_value_pct=lv, partial_tp_pct=ptp,
        precomputed_features=pair_features, verbose=False,
    )
    return r


def main():
    pairs = ["BTCUSD", "ETHUSD"]
    print(f"Loading data (OOS cutoff: {OOS_SPLIT})...", flush=True)
    pf, pft = {}, {}
    for p in pairs:
        df = load_csv(p, 60)
        df = _resample(df, 240, 60)
        df = df[df.index < pd.Timestamp(OOS_SPLIT, tz="UTC")]
        pf[p] = df
        pft[p] = compute_features_bulk(df, p)
        print(f"  {p}: {len(df):,} bars (training only, before {OOS_SPLIT})", flush=True)

    # Baseline anchors: stop=3.1 trail=2.1 tgt=2.85 hold=80 ddsf=0.001
    # be=0.0059 lock=0.012 lv=0.0067 ptp=0.0 cd=6

    configs = []

    # Phase A: Core ATR multipliers (tight grid around baseline)
    for stop, trail, tgt, hold, ddsf in product(
        [2.9, 3.1, 3.3],       # 3 stop
        [1.9, 2.1, 2.3],       # 3 trail
        [2.5, 2.85, 3.2],      # 3 target
        [60, 80],               # 2 hold
        [0.001, 0.05],          # 2 dd_scale
    ):
        configs.append(("A", stop, trail, tgt, hold, ddsf, 0.0059, 0.012, 0.0067, 0.0, 6))

    # Phase B: Position management (anchored on baseline ATR)
    for be, lk, lv, ptp, cd in product(
        [0.003, 0.005, 0.0059, 0.008],  # 4 breakeven
        [0.010, 0.012, 0.015],           # 3 lock trigger
        [0.005, 0.0067, 0.009],          # 3 lock value
        [0.0, 0.4],                      # 2 partial TP
        [4, 6],                          # 2 cooldown
    ):
        configs.append(("B", 3.1, 2.1, 2.85, 80, 0.001, be, lk, lv, ptp, cd))

    print(f"\nTotal configs: {len(configs)}", flush=True)
    results = []
    t0 = time.time()

    for idx, (phase, stop, trail, tgt, hold, ddsf, be, lk, lv, ptp, cd) in enumerate(configs):
        r = run_one(pf, pft, stop, trail, tgt, hold, ddsf, be, lk, lv, ptp, cd)
        if "error" in r:
            continue
        s = score(r)
        results.append({
            "score": round(s, 4),
            "phase": phase,
            "stop": stop, "trail": trail, "tgt": tgt, "hold": hold, "ddsf": ddsf,
            "be": be, "lk": lk, "lv": lv, "ptp": ptp, "cd": cd,
            "sharpe": round(r.get("sharpe_annualized", 0) or 0, 3),
            "sortino": round(r.get("sortino_annualized", 0) or 0, 3),
            "dd": round(r.get("max_drawdown_pct", 0), 2),
            "ret": round(r.get("agent_return_pct", 0), 1),
            "trades": r.get("total_trades", 0),
            "wr": r.get("win_rate_pct", 0),
            "pf": r.get("profit_factor"),
            "calmar": r.get("calmar_ratio"),
            "eq": round(r.get("final_equity", 0), 2),
        })
        if (idx + 1) % 10 == 0 or idx == 0:
            elapsed = time.time() - t0
            rate = (idx + 1) / elapsed
            eta = (len(configs) - idx - 1) / rate
            best = max((x["score"] for x in results), default=0)
            print(f"  [{idx+1}/{len(configs)}] {rate:.2f}/s  eta={eta/60:.1f}m  best={best:.4f}", flush=True)

    results.sort(key=lambda x: x["score"], reverse=True)
    out = LOG_DIR / "sweep_fast.json"
    out.write_text(json.dumps(results[:50], indent=2))

    elapsed = (time.time() - t0) / 60
    print(f"\nDone in {elapsed:.1f} min — {len(results)} results", flush=True)
    print(f"Saved to {out}\n", flush=True)

    print("=" * 100, flush=True)
    print(f"{'#':>3} {'Ph':>2} {'Score':>7} {'Sharpe':>6} {'DD%':>6} {'Ret%':>8} {'#Tr':>4} {'WR%':>5} | stop trail  tgt  hold  ddsf    be     lk     lv   ptp  cd", flush=True)
    print("-" * 100, flush=True)
    for i, r in enumerate(results[:20]):
        print(
            f"{i+1:3d}  {r['phase']}  {r['score']:7.4f} {r['sharpe']:6.3f} {r['dd']:5.2f}% {r['ret']:+7.1f}% {r['trades']:4d} {r['wr']:4.1f}%"
            f" | {r['stop']:.1f}  {r['trail']:.1f}  {r['tgt']:.2f}  {r['hold']:3d}  {r['ddsf']:.3f}  {r['be']:.4f} {r['lk']:.4f} {r['lv']:.4f} {r['ptp']:.1f}  {r['cd']}",
            flush=True,
        )

    if results:
        w = results[0]
        print(f"\n{'='*100}", flush=True)
        print(f"WINNER: Sharpe {w['sharpe']:.3f} / DD {w['dd']:.2f}% / Return {w['ret']:+.1f}% / Trades {w['trades']}", flush=True)
        print(f"  Phase {w['phase']}: stop={w['stop']} trail={w['trail']} tgt={w['tgt']} hold={w['hold']} ddsf={w['ddsf']}", flush=True)
        print(f"  be={w['be']} lk={w['lk']} lv={w['lv']} ptp={w['ptp']} cd={w['cd']}", flush=True)


if __name__ == "__main__":
    main()
