"""Grid-sweep the Aegis backtester to optimize risk-adjusted returns.

Pre-computes features once per (pair, interval) and runs many parameter
combinations in memory. Ranks configs by a risk-adjusted score:

    score = sortino * (1 - max_drawdown) * log(1 + max(0, return))

The top N configurations are printed and saved to ``logs/sweep.json``.

Usage:
    python scripts/sweep_optimize.py                  # default grid
    python scripts/sweep_optimize.py --top 10
"""

import argparse
import json
import logging
import math
import sys
import time
from dataclasses import asdict, dataclass
from itertools import product
from pathlib import Path
from typing import Iterable

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from src import config
from src.backtester import (
    backtest_pair,
    backtest_portfolio,
    load_csv,
    _resample,
    compute_features_bulk,
)

logging.basicConfig(level=logging.WARNING)
LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)


@dataclass(frozen=True)
class SweepConfig:
    interval: int
    min_score: int
    min_short_score: int
    shorts_enabled: bool
    max_hold_bars: int
    stop_mult: float
    target_mult_base: float
    target_mult_mid: float
    target_mult_hi: float
    trail_mult: float
    macro_filter: bool
    reversal_exit: bool
    cooldown_bars: int
    min_adx_for_entry: float = 0.0
    dd_scale_threshold: float = 1.0
    dd_scale_factor: float = 1.0
    atr_pct_max: float = 100.0
    strict_macro: bool = False
    risk_per_trade_pct: float = 0.01
    max_position_pct: float = 0.22


def score_result(metrics: dict) -> float:
    """Composite score matching the ERC-8004 leaderboard emphasis.

    The hackathon's Surge 'Best Risk-Adjusted Return' prize and ERC-8004
    leaderboard weight Sharpe ratio, drawdown control, and PnL. The score
    rewards all three with a soft drawdown penalty:

        score = sharpe_eff * max(0, 1 - dd/0.30) * return_pct_scaled

    where sharpe_eff blends Sharpe and Sortino (Sortino rewarded more for
    penalising only downside volatility), and return_pct_scaled rewards
    up to +500% then saturates via log.
    """
    ret_pct = metrics.get("agent_return_pct", 0.0)
    sharpe = metrics.get("sharpe_annualized", 0.0) or 0.0
    sortino = metrics.get("sortino_annualized", 0.0) or 0.0
    dd = metrics.get("max_drawdown_pct", 100.0) / 100.0

    if ret_pct <= 0 or sharpe <= 0:
        return 0.0

    dd_component = max(0.0, 1.0 - dd / 0.30)
    if dd_component <= 0:
        return 0.0

    ret_component = math.log1p(ret_pct / 100.0)
    sharpe_effective = (sharpe + sortino) / 2.0
    return sharpe_effective * dd_component * ret_component


def apply_config(cfg: SweepConfig) -> None:
    """Push SweepConfig values into the frozen RISK dataclass."""
    object.__setattr__(config.RISK, "min_signal_score_paper", cfg.min_score)
    object.__setattr__(config.RISK, "min_signal_score_erc", cfg.min_score)
    object.__setattr__(config.RISK, "min_signal_score_short", cfg.min_short_score)
    object.__setattr__(config.RISK, "shorts_enabled", cfg.shorts_enabled)
    object.__setattr__(config.RISK, "risk_per_trade_pct", cfg.risk_per_trade_pct)
    object.__setattr__(config.RISK, "max_position_pct", cfg.max_position_pct)


def build_grid(stage: str = "coarse") -> list[SweepConfig]:
    """Return the default sweep grid for a given stage."""
    if stage == "coarse":
        intervals = [240]
        min_scores = [82, 85, 88]
        shorts = [False]
        max_holds = [50, 120]
        stop_mults = [2.0, 2.5, 3.0]
        target_bases = [2.0, 3.5]
        trail_mults = [2.0]
        macro_filters = [True, False]
    elif stage == "fine":
        intervals = [240]
        min_scores = [83, 85, 87]
        shorts = [False]
        max_holds = [80, 120, 180]
        stop_mults = [2.8, 3.0, 3.3]
        target_bases = [3.0, 3.5, 4.0]
        trail_mults = [1.8, 2.0, 2.3]
        macro_filters = [True]
    elif stage == "tf":
        intervals = [120, 240, 480]
        min_scores = [82, 85, 88]
        shorts = [False]
        max_holds = [50, 100]
        stop_mults = [2.5, 3.0]
        target_bases = [3.0, 4.0]
        trail_mults = [2.0]
        macro_filters = [True]
    elif stage == "recent":
        intervals = [240]
        min_scores = [82, 85, 88, 91]
        shorts = [False]
        max_holds = [40, 80, 120, 200]
        stop_mults = [2.0, 2.5, 3.0, 3.5]
        target_bases = [2.5, 3.0, 3.5, 4.0]
        trail_mults = [1.5, 2.0, 2.5]
        macro_filters = [True]
    elif stage == "filter":
        # Vary ADX floor and DD-adaptive sizing around the coarse winner
        intervals = [240]
        min_scores = [85]
        shorts = [False]
        max_holds = [120]
        stop_mults = [3.0]
        target_bases = [3.5]
        trail_mults = [2.0]
        macro_filters = [True]
    elif stage == "vol_filter":
        # Vary ATR ceiling + strict macro around current best
        intervals = [240]
        min_scores = [85]
        shorts = [False]
        max_holds = [120]
        stop_mults = [3.0]
        target_bases = [3.5]
        trail_mults = [2.0]
        macro_filters = [True]
    elif stage == "vol_fine":
        intervals = [240]
        min_scores = [85]
        shorts = [False]
        max_holds = [120]
        stop_mults = [3.0]
        target_bases = [3.5]
        trail_mults = [2.0]
        macro_filters = [True]
    elif stage == "joint":
        intervals = [240]
        min_scores = [82, 85, 88, 91]
        shorts = [False]
        max_holds = [80, 120, 200]
        stop_mults = [2.5, 3.0, 3.5]
        target_bases = [3.0, 3.5, 4.0]
        trail_mults = [2.0]
        macro_filters = [True]
    elif stage == "sizing":
        intervals = [240]
        min_scores = [85]
        shorts = [False]
        max_holds = [120]
        stop_mults = [3.0]
        target_bases = [3.5]
        trail_mults = [2.0]
        macro_filters = [True]
    elif stage == "trail":
        intervals = [240]
        min_scores = [85]
        shorts = [False]
        max_holds = [120]
        stop_mults = [2.5, 3.0, 3.5]
        target_bases = [3.0]  # iter 5 winner
        trail_mults = [1.0, 1.5, 1.75, 2.0, 2.25, 2.5, 3.0]
        macro_filters = [True]
    elif stage == "ultra":
        intervals = [240]
        min_scores = [85]
        shorts = [False]
        max_holds = [120]
        stop_mults = [3.0]
        target_bases = [3.0]
        trail_mults = [2.25]
        macro_filters = [True]
    elif stage == "iter8":
        # Joint sweep anchored on iter6 winner — tight multi-dim search
        intervals = [240]
        min_scores = [85]
        shorts = [False]
        max_holds = [100, 120, 140]
        stop_mults = [2.75, 3.0, 3.25]
        target_bases = [3.0, 3.25]
        trail_mults = [2.15, 2.25, 2.35]
        macro_filters = [True]
    else:
        raise ValueError(f"unknown stage {stage}")

    if stage == "filter":
        min_adx_values = [0.0, 22.0, 25.0, 28.0, 30.0, 32.0]
        dd_configs = [
            (1.0, 1.0), (0.97, 0.5), (0.95, 0.5),
            (0.95, 0.3), (0.93, 0.5), (0.90, 0.4),
        ]
        atr_max_values = [100.0]
        strict_macros = [False]
        sizing_configs = [(0.01, 0.22)]
    elif stage == "vol_filter":
        min_adx_values = [0.0]
        dd_configs = [(0.97, 0.5)]
        atr_max_values = [100.0, 5.0, 4.5, 4.0, 3.5, 3.0]
        strict_macros = [False, True]
        sizing_configs = [(0.01, 0.22)]
    elif stage == "vol_fine":
        min_adx_values = [0.0]
        dd_configs = [(0.97, 0.5)]
        atr_max_values = [4.0, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.0, 5.5]
        strict_macros = [False]
        sizing_configs = [(0.01, 0.22)]
    elif stage == "joint":
        min_adx_values = [0.0]
        dd_configs = [(0.97, 0.5)]
        atr_max_values = [4.4]
        strict_macros = [False]
        sizing_configs = [(0.015, 0.40)]  # match current aggressive config
    elif stage == "sizing":
        min_adx_values = [0.0]
        dd_configs = [(0.97, 0.5)]
        atr_max_values = [4.4]
        strict_macros = [False]
        sizing_configs = [
            (0.01, 0.22),
            (0.015, 0.30),
            (0.02, 0.35),
            (0.015, 0.40),
            (0.02, 0.50),
            (0.005, 0.15),
            (0.01, 0.30),
            (0.015, 0.22),
        ]
    elif stage == "trail":
        min_adx_values = [0.0]
        dd_configs = [(0.97, 0.5)]
        atr_max_values = [3.5, 4.0, 4.4, 5.0, 100.0]
        strict_macros = [False]
        sizing_configs = [(0.015, 0.40)]
    elif stage == "iter8":
        min_adx_values = [0.0]
        dd_configs = [(0.97, 0.5), (1.0, 1.0)]
        atr_max_values = [100.0]
        strict_macros = [False]
        sizing_configs = [(0.015, 0.40), (0.015, 0.45)]
    elif stage == "ultra":
        min_adx_values = [0.0]
        dd_configs = [
            (1.0, 1.0),     # disabled
            (0.95, 0.5),    # 5% dd, half size
            (0.97, 0.5),    # current
            (0.95, 0.4),    # 5% dd, 40% size
            (0.93, 0.5),    # 7% dd, half size
            (0.97, 0.7),    # 3% dd, 70% size (lighter scaling)
        ]
        atr_max_values = [100.0]
        strict_macros = [False]
        sizing_configs = [
            (0.015, 0.40),  # current
            (0.015, 0.45),
            (0.015, 0.50),
            (0.020, 0.40),
            (0.020, 0.50),
            (0.025, 0.50),
        ]
    else:
        min_adx_values = [0.0]
        dd_configs = [(1.0, 1.0)]
        atr_max_values = [100.0]
        strict_macros = [False]
        sizing_configs = [(0.01, 0.22)]

    cfgs = []
    for iv, ms, sh, mh, st, tb, tr, mf, adx, (dt, df), amx, sm, (rp, mp) in product(
        intervals, min_scores, shorts, max_holds, stop_mults, target_bases,
        trail_mults, macro_filters, min_adx_values, dd_configs,
        atr_max_values, strict_macros, sizing_configs,
    ):
        cfgs.append(SweepConfig(
            interval=iv,
            min_score=ms,
            min_short_score=max(ms, ms + 3),
            shorts_enabled=sh,
            max_hold_bars=mh,
            stop_mult=st,
            target_mult_base=tb,
            target_mult_mid=tb + 1.0,
            target_mult_hi=tb + 3.0,
            trail_mult=tr,
            macro_filter=mf,
            reversal_exit=False,
            cooldown_bars=6,
            min_adx_for_entry=adx,
            dd_scale_threshold=dt,
            dd_scale_factor=df,
            atr_pct_max=amx,
            strict_macro=sm,
            risk_per_trade_pct=rp,
            max_position_pct=mp,
        ))
    return cfgs


def run_sweep(
    pairs: list[str],
    cfgs: list[SweepConfig],
    top_n: int,
    start: str | None = None,
    end: str | None = None,
) -> list[dict]:
    frame_cache: dict[tuple[str, int], pd.DataFrame] = {}
    feature_cache: dict[tuple[str, int], pd.DataFrame] = {}
    results: list[dict] = []
    t_start = time.time()

    for idx, cfg in enumerate(cfgs):
        apply_config(cfg)
        pair_frames: dict[str, pd.DataFrame] = {}
        pair_features: dict[str, pd.DataFrame] = {}

        for pair in pairs:
            key = (pair, cfg.interval)
            if key not in frame_cache:
                df = load_csv(pair, 60)
                if cfg.interval > 60:
                    df = _resample(df, cfg.interval, 60)
                if start:
                    df = df[df.index >= pd.Timestamp(start, tz="UTC")]
                if end:
                    df = df[df.index <= pd.Timestamp(end, tz="UTC")]
                if len(df) < 300:
                    continue
                frame_cache[key] = df
                feature_cache[key] = compute_features_bulk(df, pair)
            pair_frames[pair] = frame_cache[key]
            pair_features[pair] = feature_cache[key]

        if not pair_frames:
            continue

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
            precomputed_features=pair_features,
            verbose=False,
        )
        if "error" in r:
            print(f"[{idx+1}] error: {r['error']}", flush=True)
            continue

        combined = {
            "agent_return_pct": r.get("agent_return_pct", 0.0),
            "sharpe_annualized": r.get("sharpe_annualized", 0.0) or 0.0,
            "sortino_annualized": r.get("sortino_annualized", 0.0) or 0.0,
            "max_drawdown_pct": r.get("max_drawdown_pct", 100.0),
            "total_trades": r.get("total_trades", 0),
            "cagr_pct": r.get("cagr_pct", 0.0),
            "profit_factor": r.get("profit_factor"),
            "win_rate_pct": r.get("win_rate_pct"),
        }
        score = score_result(combined)

        results.append({
            "score": round(score, 4),
            "config": asdict(cfg),
            "combined": combined,
            "per_pair_trades": r.get("per_pair_trade_counts", {}),
        })

        if (idx + 1) % 5 == 0 or idx == 0:
            elapsed = time.time() - t_start
            rate = (idx + 1) / elapsed if elapsed > 0 else 0
            eta = (len(cfgs) - idx - 1) / rate if rate > 0 else 0
            best_so_far = max((r["score"] for r in results), default=0)
            print(
                f"  [{idx+1}/{len(cfgs)}] rate={rate:.2f}/s eta={eta/60:.1f}m "
                f"best={best_so_far:.4f}",
                flush=True,
            )

    results.sort(key=lambda r: r["score"], reverse=True)
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=15)
    parser.add_argument("--start", type=str, default=None)
    parser.add_argument("--end", type=str, default=None)
    parser.add_argument("--out", type=str, default=str(LOG_DIR / "sweep.json"))
    parser.add_argument("--stage", type=str, default="coarse",
                        choices=["coarse", "fine", "tf", "recent", "filter",
                                 "vol_filter", "vol_fine", "joint", "sizing", "trail", "ultra", "iter8"])
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit number of configs (for quick dev runs)")
    args = parser.parse_args()

    cfgs = build_grid(stage=args.stage)
    if args.limit:
        cfgs = cfgs[: args.limit]

    pairs = ["BTCUSD", "ETHUSD"]
    print(f"Running sweep: {len(cfgs)} configs, {len(pairs)} pairs")
    t0 = time.time()
    results = run_sweep(pairs, cfgs, args.top, start=args.start, end=args.end)
    print(f"\nSweep done in {(time.time()-t0)/60:.1f} min, {len(results)} results")

    Path(args.out).write_text(json.dumps({
        "top": results[: args.top],
        "all": results,
    }, indent=2, default=str))
    print(f"Saved to {args.out}")

    print("\nTop configs:")
    for i, r in enumerate(results[: args.top]):
        c = r["config"]
        combined = r["combined"]
        print(
            f"{i+1:2d}. score={r['score']:.4f} "
            f"ret={combined['agent_return_pct']:+.1f}% "
            f"sharpe={combined['sharpe_annualized']:.2f} "
            f"sortino={combined['sortino_annualized']:.2f} "
            f"dd={combined['max_drawdown_pct']:.1f}% "
            f"trades={combined['total_trades']}"
        )
        print(
            f"    iv={c['interval']}m score>={c['min_score']} "
            f"shorts={c['shorts_enabled']} hold={c['max_hold_bars']} "
            f"stop={c['stop_mult']} tgt={c['target_mult_base']} "
            f"trail={c['trail_mult']} macro={c['macro_filter']}"
        )


if __name__ == "__main__":
    main()
