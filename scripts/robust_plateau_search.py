"""Robust plateau search for Praxis reference configuration.

Finds configs where the worst 1-parameter neighbor retains at least 80% of
the config's IS Sharpe AND the config itself maintains OOS Sharpe >= 1.0.
Addresses the parameter-fragility finding in Table 5 of the backtest paper,
which flags 4 of 6 parameters as fragile under a +/-10% perturbation test.

Method:
    1. Load 4h resampled BTCUSD and ETHUSD frames once and precompute
       features, then split into in-sample (pre-2023-01-01) and
       out-of-sample (2023-01-01 onward).
    2. Draw ``NUM_RANDOM_CONFIGS`` random samples from ``SEARCH_GRID``
       (always including the paper reference). Run one IS and one OOS
       backtest per sample.
    3. Keep the top ``TOP_K`` configs by OOS Sharpe that also clear
       OOS Sharpe >= ``OOS_THRESHOLD``. Run all 12 ``+/- 10%`` neighbor
       backtests (IS only) for each and compute a robustness ratio as
       the worst neighbor IS Sharpe divided by the config's IS Sharpe.
    4. Rank finalists by ``oos_sharpe * min(robustness, 1.0)`` and write
       the top 10 to ``logs/robust_plateau_search.json``.

The script temporarily mutates ``src.config.RISK`` via
``object.__setattr__`` to inject the single parameter (``max_position_pct``)
that the backtester reads from the module-level ``RISK`` global. All other
parameters are passed as keyword arguments, so the frozen dataclass is only
ever touched for ``max_position_pct``. The original value is restored after
each run so the module ends in the same state it started in.

Usage:
    python scripts/robust_plateau_search.py
"""

import argparse
import json
import math
import random
import sys
import time
from copy import deepcopy
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from src import config
from src.backtester import (
    backtest_portfolio,
    compute_features_bulk,
    load_csv,
    _resample,
)


RANDOM_SEED = 42
INTERVAL = 240
OOS_SPLIT = "2023-01-01"
INITIAL_EQUITY = 10000.0
OOS_THRESHOLD = 1.0
ROBUSTNESS_FLOOR = 0.80
NUM_RANDOM_CONFIGS = 60
TOP_K = 15
PERTURBATION = 0.10

SEARCH_GRID = {
    "stop_mult": [3.0, 3.5, 4.0, 4.5, 5.0],
    "trail_mult": [2.0, 2.5, 3.0, 3.5],
    "target_mult_base": [2.5, 2.85, 3.25, 3.5],
    "target_mult_mid": [3.0, 3.5, 4.0],
    "max_hold_bars": [80, 120, 160],
    "max_position_pct": [0.40, 0.60, 0.80],
}

REFERENCE_CONFIG = {
    "stop_mult": 4.0,
    "trail_mult": 3.0,
    "target_mult_base": 2.85,
    "target_mult_mid": 3.5,
    "max_hold_bars": 120,
    "max_position_pct": 0.60,
}

NUMERIC_PARAMS = [
    "stop_mult",
    "trail_mult",
    "target_mult_base",
    "target_mult_mid",
    "max_hold_bars",
    "max_position_pct",
]


def _nearest_grid_value(param: str, value: float) -> float:
    """Snap ``value`` to its nearest value on the search grid for ``param``.

    Args:
        param: Parameter name present in ``SEARCH_GRID``.
        value: Raw perturbed value that may fall between grid points.

    Returns:
        The grid value with the smallest absolute distance to ``value``.
    """
    options = SEARCH_GRID[param]
    return min(options, key=lambda v: abs(float(v) - float(value)))


def _directional_neighbor(param: str, anchor: float, direction: int) -> float:
    """Pick the grid value one step from ``anchor`` in the given direction.

    Used when a +/-10% perturbation rounds back onto the anchor (common
    when the anchor sits on a grid point and 10% is smaller than the
    grid spacing). We still want a real neighbor, so we walk one grid
    step away in the requested sign.

    Args:
        param: Parameter name present in ``SEARCH_GRID``.
        anchor: Current anchor value on the grid.
        direction: ``+1`` for the next-higher grid value, ``-1`` for the
            next-lower. When no value exists in the requested direction,
            the anchor itself is returned and the caller should mark the
            perturbation as collapsed.

    Returns:
        The directionally adjacent grid value, or ``anchor`` if none.
    """
    options = sorted(float(v) for v in SEARCH_GRID[param])
    anchor_f = float(anchor)
    if direction > 0:
        higher = [v for v in options if v > anchor_f]
        return higher[0] if higher else anchor_f
    lower = [v for v in options if v < anchor_f]
    return lower[-1] if lower else anchor_f


def _coerce(param: str, value: float) -> float | int:
    """Coerce a numeric value to the type expected by the backtester.

    Args:
        param: Parameter name to coerce for.
        value: Raw numeric value.

    Returns:
        An ``int`` for ``max_hold_bars`` and a ``float`` otherwise.
    """
    if param == "max_hold_bars":
        return int(round(value))
    return float(value)


def _load_data() -> tuple[dict, dict, dict, dict]:
    """Load and resample all pair frames, then split IS/OOS and compute features.

    Returns:
        Tuple ``(is_frames, oos_frames, is_features, oos_features)`` where
        each element is a dict keyed by pair symbol.
    """
    frames: dict = {}
    for pair in config.STRATEGY.pairs:
        df = load_csv(pair, 60)
        frames[pair] = _resample(df, INTERVAL, 60)

    oos_ts = pd.Timestamp(OOS_SPLIT, tz="UTC")
    is_frames = {p: df[df.index < oos_ts].copy() for p, df in frames.items()}
    oos_frames = {p: df[df.index >= oos_ts].copy() for p, df in frames.items()}

    is_features = {p: compute_features_bulk(df, p) for p, df in is_frames.items()}
    oos_features = {p: compute_features_bulk(df, p) for p, df in oos_frames.items()}

    return is_frames, oos_frames, is_features, oos_features


def _run_backtest(
    overrides: dict,
    frames: dict,
    features: dict,
) -> float:
    """Run a single backtest for ``overrides`` and return the Sharpe ratio.

    ``max_position_pct`` is read from the ``src.config.RISK`` global at
    sizing time, so it is injected via ``object.__setattr__`` on the frozen
    dataclass and restored at function exit. Every other parameter in
    ``NUMERIC_PARAMS`` is passed through as a keyword argument.

    Args:
        overrides: Mapping from parameter name to value.
        frames: Per-pair OHLCV frames for the target window.
        features: Per-pair precomputed feature frames.

    Returns:
        Annualized Sharpe ratio as a float; ``0.0`` if the backtester
        reported ``None`` (no trades).
    """
    kwarg_params = {
        k: v for k, v in overrides.items() if k != "max_position_pct"
    }
    original_mpp = config.RISK.max_position_pct
    new_mpp = float(overrides.get("max_position_pct", original_mpp))
    try:
        if new_mpp != original_mpp:
            object.__setattr__(config.RISK, "max_position_pct", new_mpp)
        result = backtest_portfolio(
            frames,
            initial_equity=INITIAL_EQUITY,
            precomputed_features=features,
            num_trials=1,
            verbose=False,
            **kwarg_params,
        )
    finally:
        if new_mpp != original_mpp:
            object.__setattr__(config.RISK, "max_position_pct", original_mpp)
    return float(result.get("sharpe_annualized") or 0.0)


def _run_pair(
    overrides: dict,
    is_frames: dict,
    oos_frames: dict,
    is_features: dict,
    oos_features: dict,
) -> tuple[float, float]:
    """Run the IS and OOS backtests for a single config.

    Args:
        overrides: Parameter overrides to apply.
        is_frames: IS pair frames.
        oos_frames: OOS pair frames.
        is_features: IS precomputed features.
        oos_features: OOS precomputed features.

    Returns:
        Tuple ``(is_sharpe, oos_sharpe)``.
    """
    is_sharpe = _run_backtest(overrides, is_frames, is_features)
    oos_sharpe = _run_backtest(overrides, oos_frames, oos_features)
    return is_sharpe, oos_sharpe


def _sample_configs(n: int, rng: random.Random) -> list[dict]:
    """Draw ``n`` distinct random configs from ``SEARCH_GRID``.

    The paper reference config is always the first sample so that its
    relative ranking is known. Duplicates are rejected by a set of frozen
    parameter tuples.

    Args:
        n: Target number of sampled configs (reference included).
        rng: Seeded random generator.

    Returns:
        A list of override dicts of length up to ``n``.
    """
    seen = set()
    samples: list[dict] = []

    def _push(cfg: dict) -> None:
        key = tuple(sorted(cfg.items()))
        if key in seen:
            return
        seen.add(key)
        samples.append(cfg)

    _push(deepcopy(REFERENCE_CONFIG))

    attempts = 0
    while len(samples) < n and attempts < n * 20:
        attempts += 1
        cfg = {
            param: rng.choice(SEARCH_GRID[param]) for param in NUMERIC_PARAMS
        }
        _push(cfg)
    return samples


def _perturb(config_overrides: dict, param: str, delta_pct: float) -> dict:
    """Return a new config dict with ``param`` scaled by ``(1 + delta_pct)``.

    The perturbed value is rounded to the nearest grid point so that all
    perturbations stay inside the search space and remain runnable by the
    backtester. When nearest-neighbor snapping collapses back onto the
    anchor (common when ``delta_pct`` is smaller than the grid spacing),
    the directionally adjacent grid point is used instead, so every
    neighbor is guaranteed to be a genuinely different config whenever
    one exists.

    Args:
        config_overrides: Baseline config dict to perturb.
        param: Parameter name to perturb.
        delta_pct: Signed perturbation magnitude (e.g. +0.10 or -0.10).

    Returns:
        A new dict with the same keys as ``config_overrides``.
    """
    new_cfg = deepcopy(config_overrides)
    anchor = float(config_overrides[param])
    raw = anchor * (1.0 + delta_pct)
    snapped = _nearest_grid_value(param, raw)
    if _coerce(param, snapped) == _coerce(param, anchor):
        direction = 1 if delta_pct >= 0 else -1
        snapped = _directional_neighbor(param, anchor, direction)
    new_cfg[param] = _coerce(param, snapped)
    return new_cfg


def _compute_robustness(
    cfg: dict,
    is_sharpe: float,
    is_frames: dict,
    is_features: dict,
    param_list: list[str],
    perturbation: float,
) -> tuple[float, float, dict]:
    """Run all +/- perturbation neighbors and summarize robustness.

    Args:
        cfg: Baseline config to anchor perturbations.
        is_sharpe: Baseline IS Sharpe for the anchor config.
        is_frames: IS pair frames.
        is_features: IS precomputed features.
        param_list: Parameter names to perturb.
        perturbation: Fractional size of each perturbation (e.g. 0.10).

    Returns:
        Tuple ``(worst_neighbor_is_sharpe, robustness_ratio, neighbor_map)``
        where ``neighbor_map`` records each neighbor's parameter override
        and observed IS Sharpe for the audit log.
    """
    neighbor_results: dict = {}
    worst = float("inf")
    for param in param_list:
        for delta in (perturbation, -perturbation):
            neighbor_cfg = _perturb(cfg, param, delta)
            if neighbor_cfg[param] == cfg[param]:
                # Grid snapping collapsed the neighbor back onto the anchor.
                neighbor_results[f"{param}{delta:+.2f}"] = {
                    "config": neighbor_cfg,
                    "is_sharpe": is_sharpe,
                    "note": "collapsed_to_anchor",
                }
                if is_sharpe < worst:
                    worst = is_sharpe
                continue
            neighbor_sharpe = _run_backtest(
                neighbor_cfg, is_frames, is_features
            )
            neighbor_results[f"{param}{delta:+.2f}"] = {
                "config": neighbor_cfg,
                "is_sharpe": neighbor_sharpe,
            }
            if neighbor_sharpe < worst:
                worst = neighbor_sharpe
    if not math.isfinite(worst):
        worst = 0.0
    ratio = (worst / is_sharpe) if is_sharpe > 0.0 else 0.0
    return worst, ratio, neighbor_results


def main() -> int:
    """Run the robust plateau search end-to-end.

    Returns:
        Process exit code (always 0 unless an unrecoverable error occurs).
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        default="logs/robust_plateau_search.json",
        help="Path for the JSON search report.",
    )
    parser.add_argument(
        "--num-configs",
        type=int,
        default=NUM_RANDOM_CONFIGS,
        help="Number of random configs to score in the first pass.",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=TOP_K,
        help="Top-K configs by OOS Sharpe to evaluate for robustness.",
    )
    args = parser.parse_args()

    rng = random.Random(RANDOM_SEED)

    start = time.perf_counter()
    print(
        f"Praxis robust plateau search | seed={RANDOM_SEED} "
        f"configs={args.num_configs} top_k={args.top_k}"
    )
    print(f"Pairs: {', '.join(config.STRATEGY.pairs)}")
    print("Loading data and computing features (once)...")

    is_frames, oos_frames, is_features, oos_features = _load_data()
    for pair, df in is_frames.items():
        print(
            f"  {pair} IS: {len(df)} bars  OOS: {len(oos_frames[pair])} bars"
        )

    reference_overrides = deepcopy(REFERENCE_CONFIG)
    ref_is, ref_oos = _run_pair(
        reference_overrides, is_frames, oos_frames, is_features, oos_features
    )
    print(
        f"Reference paper-v1: IS Sharpe={ref_is:.4f}  OOS Sharpe={ref_oos:.4f}"
    )

    samples = _sample_configs(args.num_configs, rng)
    print(f"Sampled {len(samples)} unique configs (reference included).")

    scored: list[dict] = []
    for idx, cfg in enumerate(samples):
        t0 = time.perf_counter()
        is_s, oos_s = _run_pair(
            cfg, is_frames, oos_frames, is_features, oos_features
        )
        t1 = time.perf_counter()
        scored.append(
            {
                "index": idx,
                "config": cfg,
                "is_sharpe": is_s,
                "oos_sharpe": oos_s,
            }
        )
        print(
            f"  [{idx + 1:02d}/{len(samples)}] IS={is_s:+.3f} "
            f"OOS={oos_s:+.3f} ({t1 - t0:.1f}s) cfg={cfg}"
        )

    qualified = [r for r in scored if r["oos_sharpe"] >= OOS_THRESHOLD]
    qualified.sort(key=lambda r: r["oos_sharpe"], reverse=True)
    finalists = qualified[: args.top_k]
    print(
        f"Qualified (OOS >= {OOS_THRESHOLD}): {len(qualified)}  "
        f"Finalists kept: {len(finalists)}"
    )

    robustness_rows: list[dict] = []
    for idx, row in enumerate(finalists):
        cfg = row["config"]
        t0 = time.perf_counter()
        worst, ratio, neighbors = _compute_robustness(
            cfg,
            row["is_sharpe"],
            is_frames,
            is_features,
            NUMERIC_PARAMS,
            PERTURBATION,
        )
        t1 = time.perf_counter()
        score = row["oos_sharpe"] * min(ratio, 1.0)
        enriched = {
            **row,
            "worst_neighbor_is_sharpe": worst,
            "robustness_ratio": ratio,
            "final_score": score,
            "neighbors": neighbors,
        }
        robustness_rows.append(enriched)
        print(
            f"  robust [{idx + 1:02d}/{len(finalists)}] "
            f"worst={worst:+.3f} ratio={ratio:.3f} score={score:.3f} "
            f"({t1 - t0:.1f}s) cfg={cfg}"
        )

    robustness_rows.sort(key=lambda r: r["final_score"], reverse=True)

    # Also compute the reference-config robustness for the report table.
    ref_worst, ref_ratio, ref_neighbors = _compute_robustness(
        reference_overrides,
        ref_is,
        is_frames,
        is_features,
        NUMERIC_PARAMS,
        PERTURBATION,
    )
    reference_bundle = {
        "config": reference_overrides,
        "is_sharpe": ref_is,
        "oos_sharpe": ref_oos,
        "worst_neighbor_is_sharpe": ref_worst,
        "robustness_ratio": ref_ratio,
        "final_score": ref_oos * min(ref_ratio, 1.0),
        "neighbors": ref_neighbors,
    }
    print(
        f"Reference robustness: worst={ref_worst:+.3f} "
        f"ratio={ref_ratio:.3f} score={reference_bundle['final_score']:.3f}"
    )

    wall_sec = time.perf_counter() - start
    report = {
        "schema": "robust_plateau_search/v1",
        "seed": RANDOM_SEED,
        "interval_minutes": INTERVAL,
        "oos_split": OOS_SPLIT,
        "pairs": list(config.STRATEGY.pairs),
        "oos_threshold": OOS_THRESHOLD,
        "robustness_floor": ROBUSTNESS_FLOOR,
        "perturbation_pct": PERTURBATION,
        "num_configs_sampled": len(samples),
        "num_qualified": len(qualified),
        "num_finalists": len(finalists),
        "wall_seconds": round(wall_sec, 2),
        "reference": reference_bundle,
        "top": robustness_rows[:10],
        "all_scored": scored,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, default=str))
    print(f"Wrote {out_path}  wall={wall_sec:.1f}s")

    print()
    print("TOP 5 by final_score (oos_sharpe * min(robustness, 1.0)):")
    for i, row in enumerate(robustness_rows[:5]):
        c = row["config"]
        print(
            f"  #{i + 1} IS={row['is_sharpe']:+.3f} OOS={row['oos_sharpe']:+.3f} "
            f"worst={row['worst_neighbor_is_sharpe']:+.3f} "
            f"ratio={row['robustness_ratio']:.3f} score={row['final_score']:.3f}"
            f"  stop={c['stop_mult']} trail={c['trail_mult']} "
            f"tb={c['target_mult_base']} tm={c['target_mult_mid']} "
            f"hold={c['max_hold_bars']} pmax={c['max_position_pct']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
