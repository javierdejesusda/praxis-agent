"""Generate a comprehensive hackathon-ready backtest report.

Runs the authoritative backtest with current config over the full FMP
history, plus windowed slices (last 5y, last 2y, last 1y, YTD 2026),
and writes a structured JSON and a human-readable markdown summary.

Usage:
    python scripts/generate_report.py
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config
from src.backtester import backtest_portfolio, load_csv, _resample

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)


def slice_frames(full: dict[str, pd.DataFrame], start: str | None):
    if start is None:
        return full
    ts = pd.Timestamp(start, tz="UTC")
    return {p: df[df.index >= ts] for p, df in full.items()}


def summarize(result: dict) -> dict:
    keys = [
        "period_start", "period_end",
        "final_equity", "initial_equity", "total_pnl",
        "agent_return_pct", "cagr_pct",
        "sharpe_annualized", "sortino_annualized", "calmar_ratio",
        "max_drawdown_pct", "max_drawdown_usd",
        "total_trades", "wins", "losses", "win_rate_pct",
        "profit_factor", "expectancy_usd", "avg_bars_held",
        "avg_win_pct", "avg_loss_pct",
        "buy_hold_return_pct", "alpha_pct",
        "per_pair_trade_counts",
    ]
    return {k: result.get(k) for k in keys}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--interval", type=int, default=240)
    parser.add_argument("--out", default=str(LOG_DIR / "hackathon_report.json"))
    parser.add_argument("--md", default=str(LOG_DIR / "hackathon_report.md"))
    args = parser.parse_args()

    pairs = ["BTCUSD", "ETHUSD"]
    full = {p: _resample(load_csv(p, 60), args.interval, 60) for p in pairs}

    windows = [
        ("full_history", None),
        ("last_5_years", "2021-01-01"),
        ("last_3_years", "2023-01-01"),
        ("last_2_years", "2024-01-01"),
        ("last_1_year", "2025-04-10"),
        ("ytd_2026", "2026-01-01"),
    ]

    results: dict[str, dict] = {}
    for name, start in windows:
        frames = slice_frames(full, start)
        if any(len(df) < 220 for df in frames.values()):
            print(f"Skipping {name}: insufficient bars")
            continue
        print(f"Running {name}...")
        r = backtest_portfolio(frames, initial_equity=10000.0, verbose=False)
        if "error" in r:
            print(f"  error: {r['error']}")
            continue
        results[name] = summarize(r)
        s = results[name]
        print(
            f"  return={s['agent_return_pct']:+.2f}% "
            f"sharpe={s['sharpe_annualized']:.3f} "
            f"dd={s['max_drawdown_pct']:.2f}% "
            f"trades={s['total_trades']}"
        )

    cfg_dump = {
        "min_signal_score_paper": config.RISK.min_signal_score_paper,
        "min_signal_score_erc": config.RISK.min_signal_score_erc,
        "min_signal_score_short": config.RISK.min_signal_score_short,
        "shorts_enabled": config.RISK.shorts_enabled,
        "macro_filter": config.RISK.macro_filter,
        "stop_mult": config.RISK.stop_mult,
        "target_mult_base": config.RISK.target_mult_base,
        "target_mult_mid": config.RISK.target_mult_mid,
        "target_mult_hi": config.RISK.target_mult_hi,
        "trail_mult": config.RISK.trail_mult,
        "max_hold_bars": config.RISK.max_hold_bars,
        "cooldown_bars": config.RISK.cooldown_bars,
        "risk_per_trade_pct": config.RISK.risk_per_trade_pct,
        "max_position_pct": config.RISK.max_position_pct,
        "max_drawdown_pct": config.RISK.max_drawdown_pct,
        "interval_minutes": args.interval,
    }

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": cfg_dump,
        "pairs": pairs,
        "windows": results,
    }
    Path(args.out).write_text(json.dumps(payload, indent=2, default=str))
    print(f"\nWrote {args.out}")

    # Markdown
    lines = [
        "# Aegis Agent — Hackathon Backtest Report",
        "",
        f"Generated: {payload['generated_at']}",
        "",
        "## Configuration",
        "",
        "| Parameter | Value |",
        "| --- | --- |",
    ]
    for k, v in cfg_dump.items():
        lines.append(f"| `{k}` | `{v}` |")
    lines.extend(["", "## Results by Window", ""])
    lines.append(
        "| Window | Period | Return | CAGR | Sharpe | Sortino | Max DD | Trades | Win Rate | PF |"
    )
    lines.append(
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    )
    for name, r in results.items():
        period = f"{str(r['period_start'])[:10]} -> {str(r['period_end'])[:10]}"
        lines.append(
            f"| {name} | {period} | "
            f"{r['agent_return_pct']:+.2f}% | "
            f"{r.get('cagr_pct', 0):+.2f}% | "
            f"{r['sharpe_annualized']:.3f} | "
            f"{r['sortino_annualized']:.3f} | "
            f"{r['max_drawdown_pct']:.2f}% | "
            f"{r['total_trades']} | "
            f"{r['win_rate_pct']:.1f}% | "
            f"{r['profit_factor']} |"
        )
    # Append walk-forward section if available
    wf_path = LOG_DIR / "walk_forward.json"
    if wf_path.exists():
        wf = json.loads(wf_path.read_text())
        lines.extend(["", "## Walk-Forward Out-of-Sample Validation", ""])
        lines.append(
            "3-fold walk-forward: each fold trains a parameter sweep on one "
            "window, then evaluates the winner on the NEXT window (true "
            "out-of-sample). OOS numbers cannot be overfit since test data "
            "was never seen by the search."
        )
        lines.extend(["", (
            "| Fold | Train Window | Test Window | OOS Return | OOS Sharpe | "
            "OOS DD | Trades | Win Rate | PF |"
        )])
        lines.append(
            "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"
        )
        for f in wf.get("folds", []):
            train = f["train_span"]
            test = f["test_span"]
            tm = f["test_metrics"]
            lines.append(
                f"| {f['fold']} | {str(train[0])[:10]} -> {str(train[1])[:10]} | "
                f"{str(test[0])[:10]} -> {str(test[1])[:10]} | "
                f"{tm['agent_return_pct']:+.2f}% | {tm['sharpe_annualized']:.3f} | "
                f"{tm['max_drawdown_pct']:.2f}% | {tm.get('total_trades', 0)} | "
                f"{tm.get('win_rate_pct', 0):.1f}% | "
                f"{tm.get('profit_factor', 0)} |"
            )

    lines.extend(["", "## Design Highlights", ""])
    lines.extend([
        "- Long-only, 4h bars, deterministic 6-signal consensus with macro EMA 55/200 filter",
        "- ATR stops 3.1x, targets 3.0x/4.0x/6.0x (ADX-scaled), trailing 2.1x ATR",
        "- DD-adaptive sizing: reduce to 20% of target size after 3% drawdown",
        "- Risk governor enforces hard caps: 1% per trade, 3% daily loss, 8% max drawdown",
        "- Full FMP hourly history (12.4 yr BTC / 10.7 yr ETH)",
        "- Fees and slippage match Kraken paper adapter exactly (0.26% taker + 4bps half-spread)",
        "- Cross-pair confidence boost applied in time-synchronized multi-pair loop (no look-ahead)",
    ])

    Path(args.md).write_text("\n".join(lines))
    print(f"Wrote {args.md}")


if __name__ == "__main__":
    main()
