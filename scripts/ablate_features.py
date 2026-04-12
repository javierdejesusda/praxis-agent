"""Feature-family ablation study for the Praxis backtesting paper.

Runs the in-sample and out-of-sample backtests with each feature family
zeroed out one at a time, and records the sensitivity of Sharpe ratio,
return, and trade count to each family's removal.

The strategy is to compute features once, then for each ablation deep-copy
the feature frames and set the disabled family's columns to zero before
passing them to ``backtest_portfolio`` via ``precomputed_features``.
Zeroing keeps the columns present (so downstream code paths that index
them do not break) but neutralises their influence on signals and filters.

Usage:
    python scripts/ablate_features.py
    python scripts/ablate_features.py --interval 240 --oos-split 2023-01-01
"""

import argparse
import copy
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from src.backtester import (
    backtest_portfolio,
    compute_features_bulk,
    load_csv,
    _resample,
)
from src.config import STRATEGY


FEATURE_FAMILIES: dict[str, list[str]] = {
    "trend": [
        "ema_9", "ema_21", "ema_34", "ema_55", "ema_80",
        "ema_100", "ema_200", "ema_spread",
    ],
    "momentum": [
        "rsi_14", "rsi_2", "macd", "macd_signal", "macd_histogram",
        "macd_slope", "returns_1bar", "returns_5bar", "returns_20bar",
    ],
    "volatility": [
        "atr_20", "adx_14", "bb_lower", "bb_middle", "bb_upper",
        "bb_position", "bb_width", "bb_width_avg",
    ],
}

FAMILY_NAMES = list(FEATURE_FAMILIES.keys())

OOS_SPLIT_DEFAULT = "2023-01-01"
INTERVAL_DEFAULT = 240
INITIAL_EQUITY = 10000.0
CONFIG_VERSION = "paper-v1"
SEED = 42


def _metrics(result: dict) -> dict:
    """Extract the subset of metrics that the ablation report tracks.

    Args:
        result: The dict returned by ``backtest_portfolio``.

    Returns:
        A dict with Sharpe, return, trade count, and max drawdown.
    """
    return {
        "sharpe": round(float(result.get("sharpe_annualized") or 0.0), 4),
        "return_pct": round(float(result.get("agent_return_pct") or 0.0), 4),
        "trades": int(result.get("total_trades") or 0),
        "max_dd_pct": round(float(result.get("max_drawdown_pct") or 0.0), 4),
    }


def _delta_pct(baseline: float, ablated: float) -> float:
    """Compute percent change from baseline to ablated value.

    Args:
        baseline: Baseline scalar value.
        ablated: Ablated scalar value.

    Returns:
        Percent change rounded to two decimal places, or 0.0 if the
        baseline is (near) zero.
    """
    if baseline is None or abs(baseline) < 1e-12:
        return 0.0
    return round((ablated - baseline) / baseline * 100.0, 2)


def _zero_family(
    features: dict[str, pd.DataFrame],
    family: str,
) -> dict[str, pd.DataFrame]:
    """Return a deep copy of ``features`` with the family columns zeroed.

    Args:
        features: Feature frames keyed by pair.
        family: Feature family name from ``FEATURE_FAMILIES``.

    Returns:
        A new dict of DataFrames with the target columns set to zero.
        Columns that are missing from a given frame are silently skipped
        so this stays robust to minor schema drift in the feature engine.
    """
    columns = FEATURE_FAMILIES[family]
    out: dict[str, pd.DataFrame] = {}
    for pair, df in features.items():
        clone = df.copy(deep=True)
        for col in columns:
            if col in clone.columns:
                clone[col] = 0.0
        out[pair] = clone
    return out


def run_feature_ablation(
    is_frames: dict,
    oos_frames: dict,
    is_features: dict,
    oos_features: dict,
    disabled_family: str | None,
) -> dict:
    """Run a single feature-family ablation and return IS + OOS metrics.

    Args:
        is_frames: In-sample OHLCV frames per pair.
        oos_frames: Out-of-sample OHLCV frames per pair.
        is_features: Pre-computed IS feature frames keyed by pair.
        oos_features: Pre-computed OOS feature frames keyed by pair.
        disabled_family: Feature family to zero out, or ``None`` for baseline.

    Returns:
        A dict with ``is`` and ``oos`` metric blocks.
    """
    if disabled_family is None:
        is_feats = is_features
        oos_feats = oos_features
    else:
        is_feats = _zero_family(is_features, disabled_family)
        oos_feats = _zero_family(oos_features, disabled_family)

    is_result = backtest_portfolio(
        is_frames,
        initial_equity=INITIAL_EQUITY,
        precomputed_features=is_feats,
        num_trials=1,
        verbose=False,
    )
    oos_result = backtest_portfolio(
        oos_frames,
        initial_equity=INITIAL_EQUITY,
        precomputed_features=oos_feats,
        num_trials=1,
        verbose=False,
    )
    return {"is": _metrics(is_result), "oos": _metrics(oos_result)}


def _print_table(baseline: dict, ablations: dict) -> None:
    """Print a markdown summary table of the feature ablation study.

    Args:
        baseline: Baseline metrics dict with ``is`` and ``oos`` blocks.
        ablations: Mapping of family name to ablation metrics dict.
    """
    header = (
        "| Family removed    | IS Sharpe | IS dSharpe% | "
        "OOS Sharpe | OOS dSharpe% |"
    )
    sep = (
        "|-------------------|-----------|-------------|"
        "------------|---------------|"
    )
    print()
    print(header)
    print(sep)
    print(
        f"| {'(baseline)':<17} | {baseline['is']['sharpe']:>9.3f} "
        f"| {'---':>11} | {baseline['oos']['sharpe']:>10.3f} "
        f"| {'---':>13} |"
    )
    for name in FAMILY_NAMES:
        row = ablations[name]
        print(
            f"| {name:<17} | {row['is']['sharpe']:>9.3f} "
            f"| {row['is_sharpe_delta_pct']:>10.2f}% "
            f"| {row['oos']['sharpe']:>10.3f} "
            f"| {row['oos_sharpe_delta_pct']:>12.2f}% |"
        )


def main() -> None:
    """Run the full feature-family ablation suite and persist results."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interval", type=int, default=INTERVAL_DEFAULT,
                        help="Bar interval in minutes (default: 240).")
    parser.add_argument("--oos-split", default=OOS_SPLIT_DEFAULT,
                        help="ISO date for the out-of-sample split.")
    parser.add_argument("--output", default="logs/ablation_features.json",
                        help="Path for the JSON report.")
    args = parser.parse_args()

    interval = args.interval
    oos_split = args.oos_split

    print(f"Praxis feature ablation study | interval={interval}min | "
          f"OOS split={oos_split}")
    print(f"Pairs: {', '.join(STRATEGY.pairs)}")

    full_frames: dict = {}
    for pair in STRATEGY.pairs:
        df = load_csv(pair, 60)
        df = _resample(df, interval, 60)
        full_frames[pair] = df
        print(f"  loaded {pair}: {len(df)} bars "
              f"({df.index[0]} to {df.index[-1]})")

    oos_ts = pd.Timestamp(oos_split, tz="UTC")
    is_frames = {p: df[df.index < oos_ts].copy()
                 for p, df in full_frames.items()}
    oos_frames = {p: df[df.index >= oos_ts].copy()
                  for p, df in full_frames.items()}

    if not all(len(df) > 210 for df in is_frames.values()):
        raise SystemExit("Insufficient in-sample bars (need > 210 per pair).")
    if not all(len(df) > 210 for df in oos_frames.values()):
        raise SystemExit("Insufficient out-of-sample bars (need > 210 per pair).")

    print("Computing features (shared across ablations)...")
    is_features = {p: compute_features_bulk(df, p)
                   for p, df in is_frames.items()}
    oos_features = {p: compute_features_bulk(df, p)
                    for p, df in oos_frames.items()}

    print("Running baseline (all families enabled)...")
    baseline = run_feature_ablation(is_frames, oos_frames,
                                    is_features, oos_features, None)
    print(f"  baseline: IS Sharpe={baseline['is']['sharpe']:.3f} "
          f"OOS Sharpe={baseline['oos']['sharpe']:.3f}")

    ablations: dict = {}
    for family in FAMILY_NAMES:
        print(f"Running ablation: {family} zeroed...")
        ab = run_feature_ablation(is_frames, oos_frames,
                                  is_features, oos_features, family)
        ab["is_sharpe_delta_pct"] = _delta_pct(
            baseline["is"]["sharpe"], ab["is"]["sharpe"])
        ab["oos_sharpe_delta_pct"] = _delta_pct(
            baseline["oos"]["sharpe"], ab["oos"]["sharpe"])
        ab["is_return_delta_pct"] = _delta_pct(
            baseline["is"]["return_pct"], ab["is"]["return_pct"])
        ab["oos_return_delta_pct"] = _delta_pct(
            baseline["oos"]["return_pct"], ab["oos"]["return_pct"])
        ab["columns"] = list(FEATURE_FAMILIES[family])
        ablations[family] = ab
        print(f"  {family}: IS d={ab['is_sharpe_delta_pct']:+.2f}%  "
              f"OOS d={ab['oos_sharpe_delta_pct']:+.2f}%")

    _print_table(baseline, ablations)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config_version": CONFIG_VERSION,
        "seed": SEED,
        "interval_minutes": interval,
        "oos_split": oos_split,
        "pairs": list(STRATEGY.pairs),
        "families": {k: list(v) for k, v in FEATURE_FAMILIES.items()},
        "baseline": baseline,
        "ablations": ablations,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, default=str))
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
