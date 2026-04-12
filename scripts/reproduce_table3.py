"""Reproduce Table 3 from the Praxis paper.

Runs the time-synchronized multi-pair backtest with the frozen reference
config (``src.config.RISK``) over the in-sample and out-of-sample windows
used in the paper and asserts that the resulting metrics match the
hardcoded expected values within the documented tolerances.

The script is intentionally strict: it is a regression detector, not a
report generator. It does NOT update ``state/backtest_report.json``.

Usage:
    python scripts/reproduce_table3.py
    python scripts/reproduce_table3.py --interval 240
    python scripts/reproduce_table3.py --report-path logs/reproduction.txt
"""

import argparse
import io
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from src.backtester import backtest_portfolio, load_csv, _resample
from src.config import CONFIG_VERSION, STRATEGY


IS_PERIOD_START = "2013-12-08"
IS_PERIOD_END = "2022-12-31"
OOS_PERIOD_START = "2023-02-03"
OOS_PERIOD_END = "2026-04-09"

OOS_SPLIT = "2023-01-01"
INITIAL_EQUITY = 10000.0


@dataclass(frozen=True)
class ExpectedMetrics:
    """Expected window metrics and per-metric tolerances.

    Attributes:
        label: Human-readable window label.
        period_start: Window start date (YYYY-MM-DD).
        period_end: Window end date (YYYY-MM-DD).
        sharpe: Expected annualized Sharpe.
        sharpe_tol: Absolute tolerance for Sharpe.
        return_pct: Expected portfolio return percent.
        return_tol: Absolute tolerance for return percent.
        total_trades: Expected exact trade count.
        max_drawdown_pct: Expected max drawdown percent.
        max_drawdown_tol: Absolute tolerance for max drawdown percent.
        win_rate_pct: Expected win rate percent.
        win_rate_tol: Absolute tolerance for win rate percent.
    """

    label: str
    period_start: str
    period_end: str
    sharpe: float
    sharpe_tol: float
    return_pct: float
    return_tol: float
    total_trades: int
    max_drawdown_pct: float
    max_drawdown_tol: float
    win_rate_pct: float
    win_rate_tol: float


EXPECTED_IS = ExpectedMetrics(
    label="In-Sample",
    period_start=IS_PERIOD_START,
    period_end=IS_PERIOD_END,
    sharpe=0.699,
    sharpe_tol=0.010,
    return_pct=54.327,
    return_tol=0.50,
    total_trades=159,
    max_drawdown_pct=8.705,
    max_drawdown_tol=0.10,
    win_rate_pct=42.1,
    win_rate_tol=0.50,
)

EXPECTED_OOS = ExpectedMetrics(
    label="Out-of-Sample",
    period_start=OOS_PERIOD_START,
    period_end=OOS_PERIOD_END,
    sharpe=1.239,
    sharpe_tol=0.010,
    return_pct=54.187,
    return_tol=0.50,
    total_trades=88,
    max_drawdown_pct=8.106,
    max_drawdown_tol=0.10,
    win_rate_pct=46.6,
    win_rate_tol=0.50,
)


def _load_frames(interval: int) -> dict:
    """Load and resample bar frames for every configured pair.

    Args:
        interval: Target bar interval in minutes.

    Returns:
        Mapping from pair symbol to resampled ``pandas.DataFrame``.
    """
    frames = {}
    for pair in STRATEGY.pairs:
        df = load_csv(pair, 60)
        frames[pair] = _resample(df, interval, 60)
    return frames


def _split_frames(frames: dict) -> tuple[dict, dict]:
    """Split pair frames into in-sample and out-of-sample windows.

    Args:
        frames: Mapping from pair symbol to full history DataFrame.

    Returns:
        Tuple of ``(is_frames, oos_frames)`` dictionaries.
    """
    oos_ts = pd.Timestamp(OOS_SPLIT, tz="UTC")
    is_frames = {pair: df[df.index < oos_ts] for pair, df in frames.items()}
    oos_frames = {pair: df[df.index >= oos_ts] for pair, df in frames.items()}
    return is_frames, oos_frames


def _run_window(frames: dict) -> dict:
    """Run ``backtest_portfolio`` on a set of pair frames.

    Args:
        frames: Mapping from pair symbol to DataFrame for the window.

    Returns:
        Raw result dict from ``backtest_portfolio``.
    """
    return backtest_portfolio(
        frames, initial_equity=INITIAL_EQUITY, num_trials=1, verbose=False
    )


@dataclass
class CheckResult:
    """Single metric comparison outcome.

    Attributes:
        name: Metric name as shown in the report.
        actual: Value observed from the backtest.
        expected: Expected value from the paper.
        tolerance: Absolute tolerance (None for exact checks).
        passed: Whether the check passed.
    """

    name: str
    actual: float
    expected: float
    tolerance: Optional[float]
    passed: bool


def _check(
    name: str,
    actual: float,
    expected: float,
    tolerance: Optional[float],
) -> CheckResult:
    """Compare an actual metric against expected with optional tolerance.

    Args:
        name: Metric label.
        actual: Observed value.
        expected: Expected value.
        tolerance: Allowed absolute deviation, or ``None`` for an exact match.

    Returns:
        A populated ``CheckResult``.
    """
    if tolerance is None:
        passed = actual == expected
    else:
        passed = abs(float(actual) - float(expected)) <= tolerance + 1e-9
    return CheckResult(
        name=name,
        actual=float(actual),
        expected=float(expected),
        tolerance=tolerance,
        passed=passed,
    )


def _evaluate_window(
    result: dict, expected: ExpectedMetrics
) -> list[CheckResult]:
    """Run all per-window checks against a backtest result.

    Args:
        result: Dict returned by ``backtest_portfolio``.
        expected: Expected metric bundle for this window.

    Returns:
        Ordered list of ``CheckResult`` entries.
    """
    actual_return = result.get("agent_return_pct", 0.0)
    actual_sharpe = result.get("sharpe_annualized", 0.0)
    actual_dd = result.get("max_drawdown_pct", 0.0)
    actual_trades = result.get("total_trades", 0)
    actual_win_rate = result.get("win_rate_pct", 0.0)

    return [
        _check("Sharpe", actual_sharpe, expected.sharpe, expected.sharpe_tol),
        _check(
            "Return %", actual_return, expected.return_pct, expected.return_tol
        ),
        _check("Trades", actual_trades, expected.total_trades, None),
        _check(
            "Max DD %",
            actual_dd,
            expected.max_drawdown_pct,
            expected.max_drawdown_tol,
        ),
        _check(
            "Win rate %",
            actual_win_rate,
            expected.win_rate_pct,
            expected.win_rate_tol,
        ),
    ]


def _format_check_line(check: CheckResult) -> str:
    """Format a single check result as a report line.

    Args:
        check: The ``CheckResult`` to render.

    Returns:
        A formatted one-line string including status marker.
    """
    status = "OK" if check.passed else "FAIL"
    if check.name == "Trades":
        actual_str = f"{int(check.actual):<5d}"
        expected_str = f"expected {int(check.expected)} exact"
    else:
        actual_str = f"{check.actual:<5.2f}"
        if check.name == "Sharpe":
            actual_str = f"{check.actual:<5.3f}"
            expected_str = (
                f"expected {check.expected:.3f} +/- {check.tolerance:.3f}"
            )
        else:
            expected_str = (
                f"expected {check.expected:.2f} +/- {check.tolerance:.2f}"
            )
    label = f"{check.name}:".ljust(12)
    return f"  {label}{actual_str} ({expected_str}) {status}"


def _format_window_block(
    expected: ExpectedMetrics, checks: list[CheckResult]
) -> str:
    """Render the per-window report block.

    Args:
        expected: Window metadata.
        checks: Ordered check results for the window.

    Returns:
        Multiline block string.
    """
    header = (
        f"{expected.label} ({expected.period_start} -- {expected.period_end}):"
    )
    lines = [header]
    for check in checks:
        lines.append(_format_check_line(check))
    return "\n".join(lines)


def _diff_line(window_label: str, check: CheckResult) -> str:
    """Format a diagnostic diff line for a failed check.

    Args:
        window_label: Parent window label (IS / OOS).
        check: The failing ``CheckResult``.

    Returns:
        A concise one-line diff description.
    """
    if check.tolerance is None:
        return (
            f"DIFF [{window_label}] {check.name}: "
            f"actual={check.actual} expected={check.expected} (exact)"
        )
    delta = check.actual - check.expected
    return (
        f"DIFF [{window_label}] {check.name}: "
        f"actual={check.actual:.4f} expected={check.expected:.4f} "
        f"delta={delta:+.4f} tol=+/-{check.tolerance:.4f}"
    )


def _write_report(report: str, report_path: Optional[Path]) -> None:
    """Write the rendered report to disk if a path was provided.

    Args:
        report: Full report string.
        report_path: Optional destination path.
    """
    if report_path is None:
        return
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding="utf-8")


def main() -> int:
    """Run the Table 3 reproduction and exit with 0 on match, 1 on mismatch.

    Returns:
        Process exit code (0 success, 1 regression detected).
    """
    parser = argparse.ArgumentParser(
        description="Assert paper Table 3 metrics against the frozen config."
    )
    parser.add_argument("--interval", type=int, default=240)
    parser.add_argument(
        "--report-path",
        default=None,
        help="If set, write the rendered report to this file path.",
    )
    args = parser.parse_args()

    report_path = Path(args.report_path) if args.report_path else None

    buffer = io.StringIO()

    def out(line: str = "") -> None:
        print(line)
        buffer.write(line + "\n")

    out("REPRODUCIBILITY REPORT (Table 3)")
    out(f"Config version: {CONFIG_VERSION}")
    out(f"Interval: {args.interval} min")
    out("")

    frames = _load_frames(args.interval)
    is_frames, oos_frames = _split_frames(frames)

    is_result = _run_window(is_frames)
    oos_result = _run_window(oos_frames)

    is_checks = _evaluate_window(is_result, EXPECTED_IS)
    oos_checks = _evaluate_window(oos_result, EXPECTED_OOS)

    out(_format_window_block(EXPECTED_IS, is_checks))
    out("")
    out(_format_window_block(EXPECTED_OOS, oos_checks))
    out("")

    failures: list[tuple[str, CheckResult]] = []
    for check in is_checks:
        if not check.passed:
            failures.append((EXPECTED_IS.label, check))
    for check in oos_checks:
        if not check.passed:
            failures.append((EXPECTED_OOS.label, check))

    if failures:
        out("RESULT: REGRESSION DETECTED")
        for label, check in failures:
            out(_diff_line(label, check))
        _write_report(buffer.getvalue(), report_path)
        return 1

    out("RESULT: REPRODUCED")
    _write_report(buffer.getvalue(), report_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
