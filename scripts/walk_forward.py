"""Walk-forward out-of-sample validation for the Praxis agent.

Splits the full history into disjoint train/test segments, sweeps hyper-
parameters on each train window to pick the best config, then evaluates
that config on the subsequent test window. Degradation between train and
test metrics tells us whether the optimizer is overfitting.

Usage:
    python scripts/walk_forward.py                   # default 3 folds
    python scripts/walk_forward.py --folds 4
"""

import argparse
import json
import math
import sys
from dataclasses import asdict
from itertools import product
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config
from src.backtester import (
    backtest_portfolio,
    load_csv,
    _resample,
    compute_features_bulk,
)
from scripts.sweep_optimize import SweepConfig, apply_config, score_result

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"


def build_lean_grid() -> list[SweepConfig]:
    """Tight grid for walk-forward — ~15 configs, fast per fold.

    Uses the iter6 production config as the core anchor and only varies
    the most-sensitive params so each fold's "best train" reflects the
    same strategy family the live agent uses.
    """
    intervals = [240]
    min_scores = [85]
    max_holds = [80]
    stop_mults = [3.0, 3.1]
    target_bases = [3.0]
    trail_mults = [2.1, 2.25]
    dd_factors = [0.3, 0.5]
    macros = [True]
    cfgs = []
    for iv, ms, mh, st, tb, tr, df_, mf in product(
        intervals, min_scores, max_holds, stop_mults, target_bases, trail_mults, dd_factors, macros
    ):
        cfgs.append(SweepConfig(
            interval=iv,
            min_score=ms,
            min_short_score=ms + 3,
            shorts_enabled=False,
            max_hold_bars=mh,
            stop_mult=st,
            target_mult_base=tb,
            target_mult_mid=tb + 1.0,
            target_mult_hi=tb + 3.0,
            trail_mult=tr,
            macro_filter=mf,
            reversal_exit=False,
            cooldown_bars=6,
            dd_scale_threshold=0.97,
            dd_scale_factor=df_,
            atr_pct_max=100.0,  # iter8: disabled (sweep showed filter hurts Sharpe)
            risk_per_trade_pct=0.015,
            max_position_pct=0.40,
        ))
    return cfgs


def split_frames(
    full_frames: dict[str, pd.DataFrame], n_folds: int
) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    """Split the overall time range into n_folds equal non-overlapping spans."""
    start = max(df.index[0] for df in full_frames.values())
    end = min(df.index[-1] for df in full_frames.values())
    span = (end - start) / n_folds
    return [(start + span * i, start + span * (i + 1)) for i in range(n_folds)]


def run_one(
    pair_frames: dict[str, pd.DataFrame], cfg: SweepConfig
) -> dict:
    apply_config(cfg)
    r = backtest_portfolio(
        pair_frames,
        initial_equity=10000.0,
        max_hold_bars=cfg.max_hold_bars,
        cooldown_bars=cfg.cooldown_bars,
        stop_mult=cfg.stop_mult,
        target_mult_base=cfg.target_mult_base,
        target_mult_mid=cfg.target_mult_mid,
        target_mult_hi=cfg.target_mult_hi,
        trail_mult=cfg.trail_mult,
        macro_filter=cfg.macro_filter,
        min_adx_for_entry=cfg.min_adx_for_entry,
        dd_scale_threshold=cfg.dd_scale_threshold,
        dd_scale_factor=cfg.dd_scale_factor,
        atr_pct_max=cfg.atr_pct_max,
        strict_macro=cfg.strict_macro,
        reversal_exit=cfg.reversal_exit,
        cross_pair_boost=True,
        verbose=False,
    )
    return r


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--folds", type=int, default=3)
    parser.add_argument("--interval", type=int, default=240)
    parser.add_argument("--out", default=str(LOG_DIR / "walk_forward.json"))
    args = parser.parse_args()

    pairs = ["BTCUSD", "ETHUSD"]
    full_frames = {
        p: _resample(load_csv(p, 60), args.interval, 60) for p in pairs
    }
    spans = split_frames(full_frames, args.folds)
    print("Folds:")
    for i, (s, e) in enumerate(spans):
        print(f"  {i}: {s.date()} -> {e.date()}")

    cfgs = build_lean_grid()
    print(f"\nGrid: {len(cfgs)} configs per fold")

    folds_out = []
    for fold_idx in range(args.folds - 1):
        train_start, train_end = spans[fold_idx]
        test_start, test_end = spans[fold_idx + 1]

        train_frames = {
            p: df[(df.index >= train_start) & (df.index < train_end)]
            for p, df in full_frames.items()
        }
        test_frames = {
            p: df[(df.index >= test_start) & (df.index < test_end)]
            for p, df in full_frames.items()
        }
        if any(len(df) < 300 for df in train_frames.values()):
            print(f"Fold {fold_idx}: train too short, skipping")
            continue
        if any(len(df) < 300 for df in test_frames.values()):
            print(f"Fold {fold_idx}: test too short, skipping")
            continue

        print(f"\nFold {fold_idx}: training on {train_start.date()} -> {train_end.date()}")

        best = None
        for cfg_idx, cfg in enumerate(cfgs):
            r = run_one(train_frames, cfg)
            if "error" in r:
                continue
            metrics = {
                "agent_return_pct": r.get("agent_return_pct", 0),
                "sharpe_annualized": r.get("sharpe_annualized", 0) or 0,
                "sortino_annualized": r.get("sortino_annualized", 0) or 0,
                "max_drawdown_pct": r.get("max_drawdown_pct", 100),
            }
            score = score_result(metrics)
            if best is None or score > best["score"]:
                best = {
                    "score": score,
                    "config": cfg,
                    "train_metrics": metrics,
                    "train_trades": r.get("total_trades"),
                }
            if (cfg_idx + 1) % 10 == 0:
                print(
                    f"  [{cfg_idx+1}/{len(cfgs)}] train best={best['score']:.4f}",
                    flush=True,
                )

        if best is None:
            print(f"Fold {fold_idx}: no valid train config")
            continue

        print(f"Fold {fold_idx}: best train score={best['score']:.4f}")
        print(f"  metrics={best['train_metrics']}")
        print(f"  config={asdict(best['config'])}")

        # Evaluate on test
        test_result = run_one(test_frames, best["config"])
        test_metrics = {
            "agent_return_pct": test_result.get("agent_return_pct", 0),
            "sharpe_annualized": test_result.get("sharpe_annualized", 0) or 0,
            "sortino_annualized": test_result.get("sortino_annualized", 0) or 0,
            "max_drawdown_pct": test_result.get("max_drawdown_pct", 100),
            "total_trades": test_result.get("total_trades", 0),
            "win_rate_pct": test_result.get("win_rate_pct", 0),
            "profit_factor": test_result.get("profit_factor"),
        }
        print(f"  OOS metrics={test_metrics}")

        folds_out.append({
            "fold": fold_idx,
            "train_span": (str(train_start), str(train_end)),
            "test_span": (str(test_start), str(test_end)),
            "best_config": asdict(best["config"]),
            "train_metrics": best["train_metrics"],
            "test_metrics": test_metrics,
        })

    Path(args.out).write_text(json.dumps({
        "folds": folds_out,
        "interval": args.interval,
    }, indent=2, default=str))
    print(f"\nSaved {args.out}")

    # Summary
    if folds_out:
        avg_oos_sharpe = sum(f["test_metrics"]["sharpe_annualized"] for f in folds_out) / len(folds_out)
        avg_oos_return = sum(f["test_metrics"]["agent_return_pct"] for f in folds_out) / len(folds_out)
        max_oos_dd = max(f["test_metrics"]["max_drawdown_pct"] for f in folds_out)
        print(f"\nWalk-forward OOS summary ({len(folds_out)} folds):")
        print(f"  avg Sharpe: {avg_oos_sharpe:.3f}")
        print(f"  avg return: {avg_oos_return:+.2f}%")
        print(f"  max drawdown: {max_oos_dd:.2f}%")


if __name__ == "__main__":
    main()
