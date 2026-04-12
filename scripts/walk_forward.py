"""Walk-forward out-of-sample validation for the Praxis agent.

Splits the full history into disjoint train/test segments, sweeps hyper-
parameters on each train window to pick the best config, then evaluates
that config on the subsequent test window. Degradation between train and
test metrics tells us whether the optimizer is overfitting.

Two modes:

* Default (grid search): sweeps the full lean grid on every fold's train
  window, picks the best config by composite score, then re-evaluates it
  on the subsequent fold's test window.
* ``--validate-config``: skips the grid search entirely and runs the
  frozen reference config from ``src.config.RISK`` on each fold's test
  window. This is the reproducibility path used for the paper: it asks
  "does the one committed config hold up OOS?" rather than "what is the
  best config this slice would pick?".

Feature warmup isolation:
    Each test window is evaluated on a raw OHLCV slice that has been
    padded with ``feature_warmup_bars`` (default 200) of prior bars so
    that rolling indicators (ADX, EMA, ATR) reach steady state before
    the tradable window begins. Because ``backtest_portfolio`` already
    skips the first 200 bars for signal generation, padding the slice
    makes the entire test window tradable instead of wasting the first
    200 bars on warmup. This prevents stale-feature leakage at fold
    boundaries without touching the backtester.

Usage:
    python scripts/walk_forward.py                         # grid search, 3 folds
    python scripts/walk_forward.py --folds 4
    python scripts/walk_forward.py --validate-config       # frozen config OOS
    python scripts/walk_forward.py --validate-config --seed 7
"""

import argparse
import json
import random
import sys
from dataclasses import asdict
from itertools import product
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config
from src.backtester import (
    backtest_portfolio,
    load_csv,
    _resample,
)
from scripts.sweep_optimize import SweepConfig, apply_config, score_result

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"

FEATURE_WARMUP_BARS = 200


def build_lean_grid() -> list[SweepConfig]:
    """Independent grid for walk-forward, broad enough to falsify overfitting.

    Spans a wide range around plausible values rather than anchoring on
    any single optimized config. This ensures the walk-forward can
    genuinely test whether the strategy generalizes.

    Returns:
        Deterministically ordered list of ``SweepConfig`` instances.
    """
    intervals = [240]
    min_scores = [70, 85]
    max_holds = [60, 80, 120]
    stop_mults = [2.5, 3.0, 3.5, 4.0]
    target_bases = [2.5, 3.0, 3.5]
    trail_mults = [1.5, 2.0, 2.5, 3.0]
    dd_factors = [0.1, 0.3, 0.5]
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
            atr_pct_max=100.0,
            risk_per_trade_pct=0.015,
            max_position_pct=0.40,
        ))
    return cfgs


def build_reference_config(interval: int) -> SweepConfig:
    """Build a SweepConfig from the frozen ``src.config.RISK`` values.

    Used by ``--validate-config`` to express the committed reference
    parameters in the same shape the fold loop already consumes.

    Args:
        interval: Candle interval in minutes to stamp on the config.

    Returns:
        A ``SweepConfig`` mirroring the current ``RISK`` dataclass.
    """
    r = config.RISK
    return SweepConfig(
        interval=interval,
        min_score=r.min_signal_score_paper,
        min_short_score=r.min_signal_score_short,
        shorts_enabled=r.shorts_enabled,
        max_hold_bars=r.max_hold_bars,
        stop_mult=r.stop_mult,
        target_mult_base=r.target_mult_base,
        target_mult_mid=r.target_mult_mid,
        target_mult_hi=r.target_mult_hi,
        trail_mult=r.trail_mult,
        macro_filter=r.macro_filter,
        reversal_exit=False,
        cooldown_bars=r.cooldown_bars,
        min_adx_for_entry=r.min_adx_for_entry,
        dd_scale_threshold=r.dd_scale_threshold,
        dd_scale_factor=r.dd_scale_factor,
        atr_pct_max=r.atr_pct_max,
        strict_macro=r.strict_macro,
        risk_per_trade_pct=r.risk_per_trade_pct,
        max_position_pct=r.max_position_pct,
        be_trigger_pct=r.be_trigger_pct,
        lock_trigger_pct=r.lock_trigger_pct,
        lock_value_pct=r.lock_value_pct,
        mtf_daily_filter=r.mtf_daily_filter,
    )


def split_frames(
    full_frames: dict[str, pd.DataFrame], n_folds: int
) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    """Split the overall time range into ``n_folds`` equal non-overlapping spans.

    Args:
        full_frames: Dict of ``{pair: OHLCV DataFrame}``. The common
            intersection of all frames defines the usable range.
        n_folds: Number of equal spans to produce.

    Returns:
        List of ``(start, end)`` tuples, one per fold.
    """
    start = max(df.index[0] for df in full_frames.values())
    end = min(df.index[-1] for df in full_frames.values())
    span = (end - start) / n_folds
    return [(start + span * i, start + span * (i + 1)) for i in range(n_folds)]


def _slice_with_warmup(
    df: pd.DataFrame,
    test_start: pd.Timestamp,
    test_end: pd.Timestamp,
    warmup_bars: int,
) -> pd.DataFrame:
    """Slice a frame to ``[test_start, test_end)`` padded with warmup bars.

    The returned frame has up to ``warmup_bars`` additional rows prepended
    from before ``test_start`` so rolling features reach steady state
    before the tradable window. ``backtest_portfolio`` already skips its
    first 200 bars for signal generation, so padding here makes the
    entire test window tradable without modifying the backtester.

    Args:
        df: Source OHLCV DataFrame sorted by DatetimeIndex.
        test_start: Inclusive lower bound of the test window.
        test_end: Exclusive upper bound of the test window.
        warmup_bars: Number of prior bars to prepend for feature warmup.

    Returns:
        Sliced DataFrame containing warmup bars followed by the test
        window. May contain fewer than ``warmup_bars`` prior rows if the
        source frame does not have enough history before ``test_start``.
    """
    pre = df[df.index < test_start]
    if warmup_bars > 0 and len(pre) > 0:
        pre = pre.iloc[-warmup_bars:]
    window = df[(df.index >= test_start) & (df.index < test_end)]
    if len(pre) == 0:
        return window
    return pd.concat([pre, window])


def build_fold_test_frames(
    full_frames: dict[str, pd.DataFrame],
    test_start: pd.Timestamp,
    test_end: pd.Timestamp,
    warmup_bars: int = FEATURE_WARMUP_BARS,
) -> dict[str, pd.DataFrame]:
    """Return per-pair test frames padded with feature warmup bars.

    Args:
        full_frames: Full per-pair OHLCV frames at the working interval.
        test_start: Inclusive start of the fold's test window.
        test_end: Exclusive end of the fold's test window.
        warmup_bars: Prior bars to prepend for feature warmup.

    Returns:
        Dict of ``{pair: padded DataFrame}`` suitable for passing to
        ``backtest_portfolio``.
    """
    return {
        pair: _slice_with_warmup(df, test_start, test_end, warmup_bars)
        for pair, df in full_frames.items()
    }


def run_one(
    pair_frames: dict[str, pd.DataFrame], cfg: SweepConfig
) -> dict:
    """Apply ``cfg`` to RISK and run a single backtest.

    Args:
        pair_frames: Per-pair OHLCV frames to evaluate.
        cfg: Sweep configuration to apply and execute.

    Returns:
        The raw result dict from ``backtest_portfolio``.
    """
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


def _extract_test_metrics(result: dict) -> dict:
    """Pull the canonical test metric subset out of a backtest result.

    Args:
        result: Raw backtest_portfolio return dict.

    Returns:
        Dict with the fields walk_forward.json records per fold.
    """
    return {
        "agent_return_pct": result.get("agent_return_pct", 0),
        "sharpe_annualized": result.get("sharpe_annualized", 0) or 0,
        "sortino_annualized": result.get("sortino_annualized", 0) or 0,
        "max_drawdown_pct": result.get("max_drawdown_pct", 100),
        "total_trades": result.get("total_trades", 0),
        "win_rate_pct": result.get("win_rate_pct", 0),
        "profit_factor": result.get("profit_factor"),
    }


def main() -> None:
    """Walk-forward entry point. Parses args and dispatches the selected mode."""
    parser = argparse.ArgumentParser(
        description=(
            "Walk-forward validator. Default mode sweeps a lean grid on each "
            "fold's train window and evaluates the winner on the next test "
            "window. --validate-config skips the sweep and evaluates the "
            "frozen src.config.RISK reference on every fold's test window."
        )
    )
    parser.add_argument("--folds", type=int, default=3,
                        help="Number of equal time spans to split history into.")
    parser.add_argument("--interval", type=int, default=240,
                        help="Candle interval in minutes (resampled from 60m base).")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit grid to first N configs (for quick dev runs). "
                             "Ignored when --validate-config is set.")
    parser.add_argument(
        "--validate-config",
        action="store_true",
        default=False,
        help="Skip grid search and run the frozen src.config.RISK reference "
             "config on each fold's test window. Used for paper-reproducibility "
             "runs that ask whether the committed config holds up OOS.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (numpy + stdlib random).",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Optional path for the results JSON. Defaults to "
             "logs/walk_forward.json in grid mode and "
             "logs/walk_forward_validate.json in --validate-config mode.",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Deprecated alias for --output. Preserved for backwards compatibility.",
    )
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    if args.output is not None:
        out_path = Path(args.output)
    elif args.out is not None:
        out_path = Path(args.out)
    elif args.validate_config:
        out_path = LOG_DIR / "walk_forward_validate.json"
    else:
        out_path = LOG_DIR / "walk_forward.json"

    pairs = ["BTCUSD", "ETHUSD"]
    full_frames = {
        p: _resample(load_csv(p, 60), args.interval, 60) for p in pairs
    }
    spans = split_frames(full_frames, args.folds)
    print("Folds:")
    for i, (s, e) in enumerate(spans):
        print(f"  {i}: {s.date()} -> {e.date()}")

    mode = "validate_config" if args.validate_config else "grid_search"
    print(f"\nMode: {mode}")
    print(f"Seed: {args.seed}")
    print(f"Feature warmup bars: {FEATURE_WARMUP_BARS}")

    reference_cfg = build_reference_config(args.interval)

    if args.validate_config:
        folds_out = _run_validate_mode(full_frames, spans, reference_cfg)
        payload = {
            "mode": mode,
            "interval": args.interval,
            "seed": args.seed,
            "feature_warmup_bars": FEATURE_WARMUP_BARS,
            "fold_features_isolated": True,
            "reference_config": asdict(reference_cfg),
            "folds": folds_out,
        }
    else:
        cfgs = build_lean_grid()
        if args.limit:
            cfgs = cfgs[:args.limit]
        print(f"\nGrid: {len(cfgs)} configs per fold")
        folds_out = _run_grid_mode(full_frames, spans, cfgs, args.folds)
        payload = {
            "mode": mode,
            "interval": args.interval,
            "seed": args.seed,
            "feature_warmup_bars": FEATURE_WARMUP_BARS,
            "fold_features_isolated": True,
            "reference_config": asdict(reference_cfg),
            "folds": folds_out,
        }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, default=str))
    print(f"\nSaved {out_path}")

    if folds_out:
        avg_oos_sharpe = sum(f["test_metrics"]["sharpe_annualized"] for f in folds_out) / len(folds_out)
        avg_oos_return = sum(f["test_metrics"]["agent_return_pct"] for f in folds_out) / len(folds_out)
        max_oos_dd = max(f["test_metrics"]["max_drawdown_pct"] for f in folds_out)
        print(f"\nWalk-forward OOS summary ({len(folds_out)} folds):")
        print(f"  avg Sharpe: {avg_oos_sharpe:.3f}")
        print(f"  avg return: {avg_oos_return:+.2f}%")
        print(f"  max drawdown: {max_oos_dd:.2f}%")


def _run_validate_mode(
    full_frames: dict[str, pd.DataFrame],
    spans: list[tuple[pd.Timestamp, pd.Timestamp]],
    reference_cfg: SweepConfig,
) -> list[dict]:
    """Evaluate the frozen reference config on every fold's test window.

    Args:
        full_frames: Per-pair OHLCV frames spanning the full history.
        spans: Fold boundaries from ``split_frames``.
        reference_cfg: The frozen config derived from ``src.config.RISK``.

    Returns:
        List of fold result dicts in the same shape as grid mode, with
        ``train_metrics`` set to ``None`` and ``config`` set to the frozen
        reference.
    """
    folds_out: list[dict] = []
    for fold_idx, (test_start, test_end) in enumerate(spans):
        test_frames = build_fold_test_frames(
            full_frames, test_start, test_end, FEATURE_WARMUP_BARS
        )
        if any(len(df) < 300 for df in test_frames.values()):
            print(f"Fold {fold_idx}: test too short, skipping")
            continue

        print(
            f"\nFold {fold_idx}: validating frozen config on "
            f"{test_start.date()} -> {test_end.date()}"
        )
        test_result = run_one(test_frames, reference_cfg)
        if "error" in test_result:
            print(f"Fold {fold_idx}: backtest error: {test_result['error']}")
            continue
        test_metrics = _extract_test_metrics(test_result)
        print(f"  OOS metrics={test_metrics}")

        folds_out.append({
            "fold": fold_idx,
            "train_span": None,
            "test_span": (str(test_start), str(test_end)),
            "config": asdict(reference_cfg),
            "train_metrics": None,
            "test_metrics": test_metrics,
        })
    return folds_out


def _run_grid_mode(
    full_frames: dict[str, pd.DataFrame],
    spans: list[tuple[pd.Timestamp, pd.Timestamp]],
    cfgs: list[SweepConfig],
    n_folds: int,
) -> list[dict]:
    """Sweep the grid on each train window, evaluate winner on the next test window.

    Args:
        full_frames: Per-pair OHLCV frames spanning the full history.
        spans: Fold boundaries from ``split_frames``.
        cfgs: Sweep grid to evaluate on each train window.
        n_folds: Total number of folds (train uses folds 0..n-2).

    Returns:
        List of fold result dicts matching the legacy walk_forward.json
        layout, extended with ``best_config``/``train_metrics``/``test_metrics``.
    """
    folds_out: list[dict] = []
    for fold_idx in range(n_folds - 1):
        train_start, train_end = spans[fold_idx]
        test_start, test_end = spans[fold_idx + 1]

        train_frames = {
            p: df[(df.index >= train_start) & (df.index < train_end)]
            for p, df in full_frames.items()
        }
        test_frames = build_fold_test_frames(
            full_frames, test_start, test_end, FEATURE_WARMUP_BARS
        )
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
            if (cfg_idx + 1) % 10 == 0 and best is not None:
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

        test_result = run_one(test_frames, best["config"])
        test_metrics = _extract_test_metrics(test_result)
        print(f"  OOS metrics={test_metrics}")

        folds_out.append({
            "fold": fold_idx,
            "train_span": (str(train_start), str(train_end)),
            "test_span": (str(test_start), str(test_end)),
            "best_config": asdict(best["config"]),
            "config": asdict(best["config"]),
            "train_metrics": best["train_metrics"],
            "test_metrics": test_metrics,
        })
    return folds_out


if __name__ == "__main__":
    main()
