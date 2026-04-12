"""Agent ablation study for the Praxis backtesting paper.

Runs the in-sample and out-of-sample backtests with each of the six signal
agents disabled one at a time, and records the sensitivity of Sharpe ratio,
return, and trade count to each agent's removal.

The baseline run enables all six agents. For each ablation the script drops
exactly one agent from the enabled set and re-runs both the IS and OOS
backtests. Results are printed as a markdown table and persisted as JSON to
``logs/ablation_agents.json``.

Usage:
    python scripts/ablate_agents.py
    python scripts/ablate_agents.py --interval 240 --oos-split 2023-01-01
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


AGENT_NAMES = [
    "trend",
    "volatility",
    "mean_reversion",
    "momentum",
    "swing_structure",
]

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


def run_ablation(
    is_frames: dict,
    oos_frames: dict,
    is_features: dict,
    oos_features: dict,
    disabled_agent: str | None,
) -> dict:
    """Run a single ablation and return IS and OOS metric dicts.

    Args:
        is_frames: In-sample OHLCV frames per pair.
        oos_frames: Out-of-sample OHLCV frames per pair.
        is_features: Pre-computed IS feature frames keyed by pair.
        oos_features: Pre-computed OOS feature frames keyed by pair.
        disabled_agent: The agent name to disable, or ``None`` for baseline.

    Returns:
        A dict with ``is`` and ``oos`` metric blocks.
    """
    enabled = set(AGENT_NAMES)
    if disabled_agent is not None:
        enabled.discard(disabled_agent)

    is_result = backtest_portfolio(
        is_frames,
        initial_equity=INITIAL_EQUITY,
        precomputed_features=is_features,
        num_trials=1,
        verbose=False,
        enabled_agents=enabled,
    )
    oos_result = backtest_portfolio(
        oos_frames,
        initial_equity=INITIAL_EQUITY,
        precomputed_features=oos_features,
        num_trials=1,
        verbose=False,
        enabled_agents=enabled,
    )
    return {"is": _metrics(is_result), "oos": _metrics(oos_result)}


def _print_table(baseline: dict, ablations: dict) -> None:
    """Print a markdown summary table of the ablation study.

    Args:
        baseline: Baseline metrics dict with ``is`` and ``oos`` blocks.
        ablations: Mapping of agent name to ablation metrics dict.
    """
    header = (
        "| Agent removed     | IS Sharpe | IS dSharpe% | "
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
    for name in AGENT_NAMES:
        row = ablations[name]
        print(
            f"| {name:<17} | {row['is']['sharpe']:>9.3f} "
            f"| {row['is_sharpe_delta_pct']:>10.2f}% "
            f"| {row['oos']['sharpe']:>10.3f} "
            f"| {row['oos_sharpe_delta_pct']:>12.2f}% |"
        )


def main() -> None:
    """Run the full agent ablation suite and persist results."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interval", type=int, default=INTERVAL_DEFAULT,
                        help="Bar interval in minutes (default: 240).")
    parser.add_argument("--oos-split", default=OOS_SPLIT_DEFAULT,
                        help="ISO date for the out-of-sample split.")
    parser.add_argument("--output", default="logs/ablation_agents.json",
                        help="Path for the JSON report.")
    args = parser.parse_args()

    interval = args.interval
    oos_split = args.oos_split

    print(f"Praxis agent ablation study | interval={interval}min | "
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

    print("Running baseline (all agents enabled)...")
    baseline = run_ablation(is_frames, oos_frames,
                            is_features, oos_features, None)
    print(f"  baseline: IS Sharpe={baseline['is']['sharpe']:.3f} "
          f"OOS Sharpe={baseline['oos']['sharpe']:.3f}")

    ablations: dict = {}
    for name in AGENT_NAMES:
        print(f"Running ablation: {name} disabled...")
        ab = run_ablation(is_frames, oos_frames,
                          is_features, oos_features, name)
        ab["is_sharpe_delta_pct"] = _delta_pct(
            baseline["is"]["sharpe"], ab["is"]["sharpe"])
        ab["oos_sharpe_delta_pct"] = _delta_pct(
            baseline["oos"]["sharpe"], ab["oos"]["sharpe"])
        ab["is_return_delta_pct"] = _delta_pct(
            baseline["is"]["return_pct"], ab["is"]["return_pct"])
        ab["oos_return_delta_pct"] = _delta_pct(
            baseline["oos"]["return_pct"], ab["oos"]["return_pct"])
        ablations[name] = ab
        print(f"  {name}: IS d={ab['is_sharpe_delta_pct']:+.2f}%  "
              f"OOS d={ab['oos_sharpe_delta_pct']:+.2f}%")

    _print_table(baseline, ablations)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config_version": CONFIG_VERSION,
        "seed": SEED,
        "interval_minutes": interval,
        "oos_split": oos_split,
        "pairs": list(STRATEGY.pairs),
        "agents": list(AGENT_NAMES),
        "baseline": baseline,
        "ablations": ablations,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, default=str))
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
