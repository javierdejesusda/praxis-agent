"""Regime-detector ablation study for the Praxis backtesting paper.

Runs the in-sample and out-of-sample backtests with alternative regime
classifiers swapped in for the baseline ADX-14 three-state detector, and
records the sensitivity of Sharpe ratio, return, and trade count to the
choice of regime scheme.

The baseline regime detector labels each bar as ``trending``, ``ranging``
or ``transition`` based on fixed ADX-14 thresholds (see
``src/features/engine.py``). Because the regime label is stored as a
plain string column in the pre-computed feature frame, this script
rewrites that column in deep copies of the baseline features and hands
the modified frames to ``backtest_portfolio`` via the
``precomputed_features`` kwarg. No source code in ``src/`` is touched.

Variants evaluated:

* **baseline** -- the committed ADX-14 three-state detector.
* **no_filter** -- forces every bar to ``trending`` so all regime-gated
  logic downstream sees the most permissive branch.
* **ema_slope** -- an EMA-55 20-bar slope proxy: if the normalized slope
  exceeds ``+0.2%`` per bar the bar is ``trending``, if below ``-0.2%``
  it is ``ranging``, otherwise ``transition``.
* **hmm_3state** -- a 3-state Gaussian HMM fitted to BTC log-returns via
  ``hmmlearn`` on the in-sample window, with states remapped to
  ``ranging``/``transition``/``trending`` in order of emission variance.
  Skipped automatically if ``hmmlearn`` is not importable.

Usage:
    python scripts/ablate_regime.py
    python scripts/ablate_regime.py --interval 240 --oos-split 2023-01-01
"""

import argparse
import copy
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd

from src.backtester import (
    backtest_portfolio,
    compute_features_bulk,
    load_csv,
    _resample,
)
from src.config import STRATEGY


OOS_SPLIT_DEFAULT = "2023-01-01"
INTERVAL_DEFAULT = 240
INITIAL_EQUITY = 10000.0
CONFIG_VERSION = "paper-v1"
SEED = 42

EMA_SLOPE_LOOKBACK = 20
EMA_SLOPE_THRESHOLD = 0.002


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


def _override_regime_no_filter(
    features: dict[str, pd.DataFrame],
) -> dict[str, pd.DataFrame]:
    """Return deep copies with every bar's regime forced to ``trending``.

    Args:
        features: Feature frames keyed by pair.

    Returns:
        Deep-copied feature frames with the ``regime`` column overwritten.
    """
    out: dict[str, pd.DataFrame] = {}
    for pair, df in features.items():
        clone = df.copy(deep=True)
        clone["regime"] = "trending"
        out[pair] = clone
    return out


def _override_regime_ema_slope(
    features: dict[str, pd.DataFrame],
    lookback: int = EMA_SLOPE_LOOKBACK,
    threshold: float = EMA_SLOPE_THRESHOLD,
) -> dict[str, pd.DataFrame]:
    """Return deep copies with regime derived from EMA-55 slope.

    The normalized slope is
    ``(ema_55 - ema_55.shift(lookback)) / (ema_55.shift(lookback) * lookback)``
    so positive values mean the 55-period EMA is rising at more than
    ``threshold`` per bar on average, and negative values mean it is
    falling at more than ``threshold`` per bar. Bars inside the threshold
    band are labelled ``transition``; the first ``lookback`` rows keep
    the ``transition`` label because the shifted value is undefined.

    Args:
        features: Feature frames keyed by pair.
        lookback: Number of bars to look back for the slope.
        threshold: Absolute normalized slope cutoff separating trending
            from transition.

    Returns:
        Deep-copied feature frames with the ``regime`` column overwritten.
    """
    out: dict[str, pd.DataFrame] = {}
    for pair, df in features.items():
        clone = df.copy(deep=True)
        ema = clone["ema_55"].astype(float)
        prior = ema.shift(lookback)
        with np.errstate(divide="ignore", invalid="ignore"):
            slope = (ema - prior) / (prior * float(lookback))
        regime = pd.Series("transition", index=clone.index, dtype=object)
        regime.loc[slope > threshold] = "trending"
        regime.loc[slope < -threshold] = "ranging"
        clone["regime"] = regime.values
        out[pair] = clone
    return out


def _override_regime_hmm(
    is_features: dict[str, pd.DataFrame],
    oos_features: dict[str, pd.DataFrame],
    random_state: int = SEED,
) -> tuple[dict[str, pd.DataFrame], dict[str, pd.DataFrame]] | None:
    """Fit a 3-state Gaussian HMM on BTC IS returns and relabel all bars.

    The HMM is fit exclusively on BTCUSD in-sample log-returns to avoid
    look-ahead into OOS data. States are remapped to
    ``ranging``/``transition``/``trending`` in order of increasing
    emission variance (low-variance = ranging, high-variance = trending)
    to mirror the intuition that trending bars have larger absolute
    directional moves. The same fitted HMM is then used to decode regime
    labels for every bar on every pair via the Viterbi path.

    Args:
        is_features: In-sample feature frames keyed by pair. Must contain
            a ``BTCUSD`` entry with a ``close`` column.
        oos_features: Out-of-sample feature frames keyed by pair.
        random_state: Seed passed to ``hmmlearn`` for reproducibility.

    Returns:
        A ``(is_features', oos_features')`` tuple with the ``regime``
        column overwritten on every pair, or ``None`` if ``hmmlearn`` is
        not importable.
    """
    try:
        from hmmlearn.hmm import GaussianHMM
    except Exception:
        return None

    if "BTCUSD" not in is_features:
        return None
    btc_is_close = is_features["BTCUSD"]["close"].astype(float)
    log_ret = np.log(btc_is_close / btc_is_close.shift(1)).dropna()
    train_x = log_ret.values.reshape(-1, 1)

    model = GaussianHMM(
        n_components=3,
        covariance_type="full",
        n_iter=200,
        random_state=random_state,
    )
    model.fit(train_x)

    covars = np.asarray(model.covars_).reshape(3, -1)[:, 0]
    order = np.argsort(covars)
    label_map = {
        int(order[0]): "ranging",
        int(order[1]): "transition",
        int(order[2]): "trending",
    }

    def _label_frame(df: pd.DataFrame) -> pd.DataFrame:
        clone = df.copy(deep=True)
        close = clone["close"].astype(float)
        r = np.log(close / close.shift(1))
        r_filled = r.fillna(0.0).values.reshape(-1, 1)
        states = model.predict(r_filled)
        clone["regime"] = [label_map[int(s)] for s in states]
        clone.loc[clone.index[0], "regime"] = "transition"
        return clone

    is_out = {pair: _label_frame(df) for pair, df in is_features.items()}
    oos_out = {pair: _label_frame(df) for pair, df in oos_features.items()}
    return is_out, oos_out


def run_regime_ablation(
    is_frames: dict,
    oos_frames: dict,
    is_features: dict,
    oos_features: dict,
) -> dict:
    """Run the baseline plus every regime-override variant.

    Args:
        is_frames: In-sample OHLCV frames per pair.
        oos_frames: Out-of-sample OHLCV frames per pair.
        is_features: Pre-computed IS feature frames keyed by pair.
        oos_features: Pre-computed OOS feature frames keyed by pair.

    Returns:
        Mapping of variant name to ``{"is": {...}, "oos": {...}}``.
    """
    variants: dict[str, dict] = {}

    print("  variant: baseline (ADX-14 3-regime)")
    is_b = backtest_portfolio(
        is_frames,
        initial_equity=INITIAL_EQUITY,
        precomputed_features=is_features,
        num_trials=1,
        verbose=False,
    )
    oos_b = backtest_portfolio(
        oos_frames,
        initial_equity=INITIAL_EQUITY,
        precomputed_features=oos_features,
        num_trials=1,
        verbose=False,
    )
    variants["baseline"] = {"is": _metrics(is_b), "oos": _metrics(oos_b)}

    print("  variant: no_filter (force trending)")
    is_nf = _override_regime_no_filter(is_features)
    oos_nf = _override_regime_no_filter(oos_features)
    is_nf_r = backtest_portfolio(
        is_frames,
        initial_equity=INITIAL_EQUITY,
        precomputed_features=is_nf,
        num_trials=1,
        verbose=False,
    )
    oos_nf_r = backtest_portfolio(
        oos_frames,
        initial_equity=INITIAL_EQUITY,
        precomputed_features=oos_nf,
        num_trials=1,
        verbose=False,
    )
    variants["no_filter"] = {
        "is": _metrics(is_nf_r),
        "oos": _metrics(oos_nf_r),
    }

    print("  variant: ema_slope (EMA-55 slope proxy)")
    is_es = _override_regime_ema_slope(is_features)
    oos_es = _override_regime_ema_slope(oos_features)
    is_es_r = backtest_portfolio(
        is_frames,
        initial_equity=INITIAL_EQUITY,
        precomputed_features=is_es,
        num_trials=1,
        verbose=False,
    )
    oos_es_r = backtest_portfolio(
        oos_frames,
        initial_equity=INITIAL_EQUITY,
        precomputed_features=oos_es,
        num_trials=1,
        verbose=False,
    )
    variants["ema_slope"] = {
        "is": _metrics(is_es_r),
        "oos": _metrics(oos_es_r),
    }

    print("  variant: hmm_3state (3-state Gaussian HMM)")
    hmm_pair = _override_regime_hmm(is_features, oos_features)
    if hmm_pair is None:
        print("    hmmlearn not available, skipping")
    else:
        is_hmm, oos_hmm = hmm_pair
        is_hmm_r = backtest_portfolio(
            is_frames,
            initial_equity=INITIAL_EQUITY,
            precomputed_features=is_hmm,
            num_trials=1,
            verbose=False,
        )
        oos_hmm_r = backtest_portfolio(
            oos_frames,
            initial_equity=INITIAL_EQUITY,
            precomputed_features=oos_hmm,
            num_trials=1,
            verbose=False,
        )
        variants["hmm_3state"] = {
            "is": _metrics(is_hmm_r),
            "oos": _metrics(oos_hmm_r),
        }

    return variants


def _print_table(variants: dict) -> None:
    """Print a markdown summary table of the regime ablation study.

    Args:
        variants: Output of ``run_regime_ablation``.
    """
    baseline = variants["baseline"]
    header = (
        "| Regime variant    | IS Sharpe | IS dSharpe% | "
        "OOS Sharpe | OOS dSharpe% | IS Trades | OOS Trades |"
    )
    sep = (
        "|-------------------|-----------|-------------|"
        "------------|---------------|-----------|------------|"
    )
    print()
    print(header)
    print(sep)
    for name, row in variants.items():
        if name == "baseline":
            is_delta = "---"
            oos_delta = "---"
        else:
            is_delta = f"{_delta_pct(baseline['is']['sharpe'], row['is']['sharpe']):+.2f}%"
            oos_delta = f"{_delta_pct(baseline['oos']['sharpe'], row['oos']['sharpe']):+.2f}%"
        print(
            f"| {name:<17} | {row['is']['sharpe']:>9.3f} "
            f"| {is_delta:>11} "
            f"| {row['oos']['sharpe']:>10.3f} "
            f"| {oos_delta:>13} "
            f"| {row['is']['trades']:>9} "
            f"| {row['oos']['trades']:>10} |"
        )


def main() -> None:
    """Run the full regime-detector ablation suite and persist results."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interval", type=int, default=INTERVAL_DEFAULT,
                        help="Bar interval in minutes (default: 240).")
    parser.add_argument("--oos-split", default=OOS_SPLIT_DEFAULT,
                        help="ISO date for the out-of-sample split.")
    parser.add_argument("--output", default="logs/ablation_regime.json",
                        help="Path for the JSON report.")
    args = parser.parse_args()

    interval = args.interval
    oos_split = args.oos_split

    print(f"Praxis regime-detector ablation | interval={interval}min | "
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

    print("Running regime ablation variants...")
    variants = run_regime_ablation(
        is_frames, oos_frames, is_features, oos_features
    )
    _print_table(variants)

    baseline = variants["baseline"]
    enriched: dict = {}
    for name, row in variants.items():
        entry = copy.deepcopy(row)
        if name == "baseline":
            entry["is_sharpe_delta_pct"] = 0.0
            entry["oos_sharpe_delta_pct"] = 0.0
            entry["is_return_delta_pct"] = 0.0
            entry["oos_return_delta_pct"] = 0.0
        else:
            entry["is_sharpe_delta_pct"] = _delta_pct(
                baseline["is"]["sharpe"], row["is"]["sharpe"])
            entry["oos_sharpe_delta_pct"] = _delta_pct(
                baseline["oos"]["sharpe"], row["oos"]["sharpe"])
            entry["is_return_delta_pct"] = _delta_pct(
                baseline["is"]["return_pct"], row["is"]["return_pct"])
            entry["oos_return_delta_pct"] = _delta_pct(
                baseline["oos"]["return_pct"], row["oos"]["return_pct"])
        enriched[name] = entry

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config_version": CONFIG_VERSION,
        "seed": SEED,
        "interval_minutes": interval,
        "oos_split": oos_split,
        "pairs": list(STRATEGY.pairs),
        "ema_slope_lookback": EMA_SLOPE_LOOKBACK,
        "ema_slope_threshold": EMA_SLOPE_THRESHOLD,
        "variants": enriched,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, default=str))
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
