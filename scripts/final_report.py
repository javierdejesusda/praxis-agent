"""Final performance report with in-sample / out-of-sample validation.

Runs the time-synchronized multi-pair backtest (backtest_portfolio) over
three windows:
  1. Full history (all available data)
  2. In-sample (training data up to OOS_SPLIT)
  3. Out-of-sample (unseen data from OOS_SPLIT onward)

The OOS split ensures reported metrics are defensible: parameters were
optimized on training data, and the OOS window was never seen by the
optimizer.

Usage:
    python scripts/final_report.py
    python scripts/final_report.py --interval 240
    python scripts/final_report.py --oos-split 2023-01-01
"""

import argparse
import asyncio
import json
import math
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from src.backtester import (
    backtest_portfolio, load_csv, _resample, compute_features_bulk,
    cost_sensitivity, parameter_sensitivity, regime_split,
    generate_tearsheet,
)
from src.config import RISK, STATE_DIR, STRATEGY


OOS_SPLIT_DEFAULT = "2023-01-01"
ESTIMATED_NUM_TRIALS = 3000  # Conservative estimate of total optimization trials run


def _extract_metrics(result: dict) -> dict:
    """Extract all metrics from a backtest_portfolio result."""
    keys = [
        "final_equity", "initial_equity", "total_pnl",
        "agent_return_pct", "cagr_pct",
        "sharpe_annualized", "smart_sharpe", "sortino_annualized", "calmar_ratio",
        "psr", "dsr", "dsr_expected_max_sr", "monte_carlo_p_value",
        "max_drawdown_pct", "max_drawdown_usd",
        "total_trades", "wins", "losses", "win_rate_pct",
        "profit_factor", "expectancy_usd", "avg_bars_held",
        "avg_win_pct", "avg_loss_pct",
        "buy_hold_return_pct", "buy_hold_final_equity", "alpha_pct",
        "period_start", "period_end",
        "per_pair_trade_counts",
    ]
    return {k: result.get(k) for k in keys}


def _per_pair_metrics(result: dict, pair_frames: dict) -> list[dict]:
    """Compute per-pair metrics by filtering the combined trade list."""
    trades = result.get("trades", [])
    initial_equity = result.get("initial_equity", 10000.0)
    out = []
    for pair in pair_frames:
        pair_trades = [t for t in trades if t["pair"] == pair]
        if not pair_trades:
            continue
        wins = [t for t in pair_trades if t["pnl_usd"] > 0]
        losses = [t for t in pair_trades if t["pnl_usd"] <= 0]
        gross_profit = sum(t["pnl_usd"] for t in wins)
        gross_loss = abs(sum(t["pnl_usd"] for t in losses))
        pf = gross_profit / gross_loss if gross_loss > 0 else None
        total_pnl = sum(t["pnl_usd"] for t in pair_trades)
        avg_win = (sum(t["pnl_pct"] for t in wins) / len(wins)) if wins else 0
        avg_loss = (sum(t["pnl_pct"] for t in losses) / len(losses)) if losses else 0

        df = pair_frames[pair]
        warmup = 200
        period_start = str(df.index[warmup])[:10] if len(df) > warmup else None
        period_end = str(df.index[-1])[:10]

        out.append({
            "pair": pair,
            "period_start": period_start,
            "period_end": period_end,
            "trades": len(pair_trades),
            "wins": len(wins),
            "losses": len(losses),
            "win_rate_pct": round(len(wins) / len(pair_trades) * 100, 1),
            "return_pct": round(total_pnl / initial_equity * 100, 2),
            "profit_factor": round(pf, 2) if pf and math.isfinite(pf) else None,
            "avg_win_pct": round(avg_win, 2),
            "avg_loss_pct": round(avg_loss, 2),
        })
    return out


def _full_config() -> dict:
    """Dump all risk and strategy config as a dict."""
    return {
        "min_signal_score_paper": RISK.min_signal_score_paper,
        "min_signal_score_erc": RISK.min_signal_score_erc,
        "min_signal_score_short": RISK.min_signal_score_short,
        "shorts_enabled": RISK.shorts_enabled,
        "stop_mult": RISK.stop_mult,
        "trail_mult": RISK.trail_mult,
        "target_mult_base": RISK.target_mult_base,
        "target_mult_mid": RISK.target_mult_mid,
        "target_mult_hi": RISK.target_mult_hi,
        "macro_filter": RISK.macro_filter,
        "mtf_daily_filter": RISK.mtf_daily_filter,
        "max_hold_bars": RISK.max_hold_bars,
        "cooldown_bars": RISK.cooldown_bars,
        "max_consecutive_losses": RISK.max_consecutive_losses,
        "dd_scale_threshold": RISK.dd_scale_threshold,
        "dd_scale_factor": RISK.dd_scale_factor,
        "risk_per_trade_pct": RISK.risk_per_trade_pct,
        "max_position_pct": RISK.max_position_pct,
        "max_daily_loss_pct": RISK.max_daily_loss_pct,
        "max_drawdown_pct": RISK.max_drawdown_pct,
    }


def _print_metrics(label: str, m: dict) -> None:
    """Print a metrics block to stdout."""
    print(f"\n  --- {label} ---")
    print(f"  Period:        {str(m.get('period_start', ''))[:10]} to {str(m.get('period_end', ''))[:10]}")
    print(f"  Final equity:  ${m.get('final_equity', 0):,.2f}")
    print(f"  Total PnL:     ${m.get('total_pnl', 0):+,.2f}")
    print(f"  Return:        {m.get('agent_return_pct', 0):+.2f}%")
    print(f"  CAGR:          {m.get('cagr_pct', 0):+.2f}%")
    print(f"  Sharpe:        {m.get('sharpe_annualized', 0):.3f}")
    print(f"  Smart Sharpe:  {m.get('smart_sharpe', 0):.3f}")
    print(f"  Sortino:       {m.get('sortino_annualized', 0):.3f}")
    print(f"  Calmar:        {m.get('calmar_ratio')}")
    print(f"  PSR:           {m.get('psr', 0):.4f}")
    if m.get('dsr') is not None and m.get('dsr') != 0.0:
        print(f"  DSR:           {m.get('dsr'):.4f} (expected max SR: {m.get('dsr_expected_max_sr', 0):.4f})")
    print(f"  MC p-value:    {m.get('monte_carlo_p_value', 1.0):.4f}")
    print(f"  Max DD:        {m.get('max_drawdown_pct', 0):.2f}%  (${m.get('max_drawdown_usd', 0):,.2f})")
    print(f"  Trades:        {m.get('total_trades', 0)} ({m.get('wins', 0)}W / {m.get('losses', 0)}L)")
    print(f"  Win rate:      {m.get('win_rate_pct', 0):.1f}%")
    print(f"  Profit factor: {m.get('profit_factor')}")
    print(f"  Expectancy:    ${m.get('expectancy_usd', 0):.2f}/trade")
    print(f"  Avg bars held: {m.get('avg_bars_held', 0):.1f}")
    print(f"  Buy & Hold:    {m.get('buy_hold_return_pct', 0):+.2f}%  (${m.get('buy_hold_final_equity', 0):,.2f})")
    print(f"  Alpha:         {m.get('alpha_pct', 0):+.2f}%")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--interval", type=int, default=240)
    parser.add_argument("--oos-split", default=OOS_SPLIT_DEFAULT,
                        help="ISO date for out-of-sample split")
    args = parser.parse_args()

    interval = args.interval
    oos_split = args.oos_split
    initial_equity = 10000.0

    print(f"\n{'='*72}")
    print(f"  PRAXIS AGENT — RIGOROUS BACKTEST REPORT")
    print(f"  Interval: {interval}min | OOS split: {oos_split}")
    print(f"  Pairs: {', '.join(STRATEGY.pairs)}")
    print(f"  dd_scale_factor: {RISK.dd_scale_factor}")
    print(f"{'='*72}")

    pairs = STRATEGY.pairs
    full_frames = {}
    for pair in pairs:
        df = load_csv(pair, 60)
        df = _resample(df, interval, 60)
        full_frames[pair] = df
        print(f"  {pair}: {len(df)} bars, {df.index[0]} to {df.index[-1]}")

    oos_ts = pd.Timestamp(oos_split, tz="UTC")
    is_frames = {p: df[df.index < oos_ts] for p, df in full_frames.items()}
    oos_frames = {p: df[df.index >= oos_ts] for p, df in full_frames.items()}

    has_is = all(len(df) > 210 for df in is_frames.values())
    has_oos = all(len(df) > 210 for df in oos_frames.values())

    print(f"\n  Full: {sum(len(df) for df in full_frames.values())} bars total")
    if has_is:
        print(f"  In-sample: {sum(len(df) for df in is_frames.values())} bars (before {oos_split})")
    if has_oos:
        print(f"  Out-of-sample: {sum(len(df) for df in oos_frames.values())} bars (from {oos_split})")

    print(f"\n{'='*72}")
    print("  FULL HISTORY")
    print(f"{'='*72}")
    full_result = backtest_portfolio(full_frames, initial_equity=initial_equity,
                                     num_trials=ESTIMATED_NUM_TRIALS, verbose=True)
    full_metrics = _extract_metrics(full_result)
    full_per_pair = _per_pair_metrics(full_result, full_frames)
    _print_metrics("Full History", full_metrics)

    is_metrics = None
    is_per_pair = None
    if has_is:
        print(f"\n{'='*72}")
        print(f"  IN-SAMPLE (before {oos_split})")
        print(f"{'='*72}")
        is_result = backtest_portfolio(is_frames, initial_equity=initial_equity,
                                         num_trials=ESTIMATED_NUM_TRIALS, verbose=False)
        is_metrics = _extract_metrics(is_result)
        is_per_pair = _per_pair_metrics(is_result, is_frames)
        _print_metrics("In-Sample", is_metrics)

    oos_metrics = None
    oos_per_pair = None
    if has_oos:
        print(f"\n{'='*72}")
        print(f"  OUT-OF-SAMPLE (from {oos_split})")
        print(f"{'='*72}")
        oos_result = backtest_portfolio(oos_frames, initial_equity=initial_equity,
                                         num_trials=1, verbose=False)
        oos_metrics = _extract_metrics(oos_result)
        oos_per_pair = _per_pair_metrics(oos_result, oos_frames)
        _print_metrics("Out-of-Sample", oos_metrics)

    recent_trades = [t for t in full_result.get("trades", [])
                     if t["timestamp"] >= "2024-01-01"]
    recent = None
    if recent_trades:
        wins = [t for t in recent_trades if t["pnl_usd"] > 0]
        pnl = sum(t["pnl_usd"] for t in recent_trades)
        gp = sum(t["pnl_usd"] for t in wins)
        gl = abs(sum(t["pnl_usd"] for t in recent_trades if t["pnl_usd"] <= 0))
        pf = gp / gl if gl > 0 else None
        recent = {
            "window_start": "2024-01-01",
            "trades": len(recent_trades),
            "win_rate_pct": round(len(wins) / len(recent_trades) * 100, 1),
            "pnl_usd": round(pnl, 2),
            "profit_factor": round(pf, 2) if pf and math.isfinite(pf) else None,
        }

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "portfolio_synced",
        "interval_minutes": interval,
        "initial_equity": initial_equity,
        "oos_split": oos_split,
        "config": _full_config(),
        "available": True,
        "combined": {
            "final_equity": full_metrics.get("final_equity"),
            "total_pnl_usd": full_metrics.get("total_pnl"),
            "portfolio_return_pct": full_metrics.get("agent_return_pct"),
            "cagr_pct": full_metrics.get("cagr_pct"),
            "sharpe": full_metrics.get("sharpe_annualized"),
            "sortino": full_metrics.get("sortino_annualized"),
            "calmar": full_metrics.get("calmar_ratio"),
            "max_drawdown_pct": full_metrics.get("max_drawdown_pct"),
            "max_drawdown_usd": full_metrics.get("max_drawdown_usd"),
            "total_trades": full_metrics.get("total_trades"),
            "wins": full_metrics.get("wins"),
            "losses": full_metrics.get("losses"),
            "win_rate_pct": full_metrics.get("win_rate_pct"),
            "profit_factor": full_metrics.get("profit_factor"),
            "expectancy_usd": full_metrics.get("expectancy_usd"),
            "avg_bars_held": full_metrics.get("avg_bars_held"),
            "buy_hold_return_pct": full_metrics.get("buy_hold_return_pct"),
            "buy_hold_final_equity": full_metrics.get("buy_hold_final_equity"),
            "alpha_pct": full_metrics.get("alpha_pct"),
        },
        "per_pair": full_per_pair,
        "recent": recent,
        "period_start": full_metrics.get("period_start"),
        "period_end": full_metrics.get("period_end"),
    }

    if is_metrics:
        report["in_sample"] = {
            "period_start": is_metrics.get("period_start"),
            "period_end": is_metrics.get("period_end"),
            "final_equity": is_metrics.get("final_equity"),
            "total_pnl_usd": is_metrics.get("total_pnl"),
            "portfolio_return_pct": is_metrics.get("agent_return_pct"),
            "cagr_pct": is_metrics.get("cagr_pct"),
            "sharpe": is_metrics.get("sharpe_annualized"),
            "sortino": is_metrics.get("sortino_annualized"),
            "calmar": is_metrics.get("calmar_ratio"),
            "max_drawdown_pct": is_metrics.get("max_drawdown_pct"),
            "max_drawdown_usd": is_metrics.get("max_drawdown_usd"),
            "total_trades": is_metrics.get("total_trades"),
            "wins": is_metrics.get("wins"),
            "losses": is_metrics.get("losses"),
            "win_rate_pct": is_metrics.get("win_rate_pct"),
            "profit_factor": is_metrics.get("profit_factor"),
            "expectancy_usd": is_metrics.get("expectancy_usd"),
            "per_pair": is_per_pair,
        }

    if oos_metrics:
        report["out_of_sample"] = {
            "period_start": oos_metrics.get("period_start"),
            "period_end": oos_metrics.get("period_end"),
            "final_equity": oos_metrics.get("final_equity"),
            "total_pnl_usd": oos_metrics.get("total_pnl"),
            "portfolio_return_pct": oos_metrics.get("agent_return_pct"),
            "cagr_pct": oos_metrics.get("cagr_pct"),
            "sharpe": oos_metrics.get("sharpe_annualized"),
            "sortino": oos_metrics.get("sortino_annualized"),
            "calmar": oos_metrics.get("calmar_ratio"),
            "max_drawdown_pct": oos_metrics.get("max_drawdown_pct"),
            "max_drawdown_usd": oos_metrics.get("max_drawdown_usd"),
            "total_trades": oos_metrics.get("total_trades"),
            "wins": oos_metrics.get("wins"),
            "losses": oos_metrics.get("losses"),
            "win_rate_pct": oos_metrics.get("win_rate_pct"),
            "profit_factor": oos_metrics.get("profit_factor"),
            "expectancy_usd": oos_metrics.get("expectancy_usd"),
            "per_pair": oos_per_pair,
        }

    # Pre-compute features once for sensitivity analyses
    # Use IS frames for robustness checks to avoid contaminating OOS
    sensitivity_frames = is_frames if has_is else full_frames
    sensitivity_label = f"in-sample (before {oos_split})" if has_is else "full history"
    print(f"\n{'='*72}")
    print(f"  ROBUSTNESS ANALYSES (on {sensitivity_label})")
    print(f"{'='*72}")

    bulks = {}
    for pair, df in sensitivity_frames.items():
        if pair not in bulks:
            bulks[pair] = compute_features_bulk(df, pair)

    # Cost sensitivity
    print("\n  Running cost sensitivity (4 tiers)...")
    cost_results = cost_sensitivity(sensitivity_frames, initial_equity=initial_equity,
                                    precomputed_features=bulks)
    report["cost_sensitivity"] = cost_results
    print("  | Round-trip cost | Return     | Sharpe | Max DD  | Trades |")
    print("  |-----------------|------------|--------|---------|--------|")
    for cr in cost_results:
        print(f"  | {cr['round_trip_cost_bps']:>13.0f} bps | {cr['return_pct']:>+9.2f}% | {cr['sharpe']:>6.3f} | {cr['max_dd_pct']:>6.2f}% | {cr['trades']:>6} |")

    # Parameter sensitivity
    print("\n  Running parameter sensitivity (±10%)...")
    param_results = parameter_sensitivity(sensitivity_frames, initial_equity=initial_equity,
                                          precomputed_features=bulks)
    report["parameter_sensitivity"] = param_results
    fragile_count = sum(1 for p in param_results if p.get("fragile"))
    print(f"  Tested {len(param_results) - 1} perturbations, {fragile_count} flagged fragile (>30% Sharpe change)")
    for pr in param_results:
        flag = " ** FRAGILE" if pr.get("fragile") else ""
        if pr["parameter"] == "baseline":
            print(f"  BASELINE: Sharpe={pr['sharpe']:.3f} Return={pr['return_pct']:+.2f}%")
        else:
            print(f"  {pr['parameter']} {pr['direction']}: val={pr['value']}  Sharpe={pr['sharpe']:.3f}  delta={pr.get('sharpe_delta_pct', 0):+.1f}%{flag}")

    # Regime split
    print("\n  Analyzing regime-specific performance...")
    full_bulks = {pair: compute_features_bulk(df, pair) for pair, df in full_frames.items()}
    regime_results = regime_split(full_result.get("trades", []), full_bulks, full_frames)
    report["regime_performance"] = regime_results
    for regime, rm in regime_results.items():
        print(f"  {regime:>12s}: {rm['trades']} trades, {rm['win_rate_pct']:.1f}% win, PnL=${rm['pnl_usd']:+,.2f}, PF={rm.get('profit_factor', 'N/A')}")

    # QuantStats tearsheet
    eq_curve = full_result.get("equity_curve") or []
    if not eq_curve:
        eq_data = [(pd.Timestamp(t["timestamp"]), t["equity"]) for t in full_result.get("trades", [])]
        if eq_data:
            eq_curve = eq_data
    tearsheet_path = generate_tearsheet(eq_curve, output_path="logs/tearsheet.html")
    if tearsheet_path:
        print(f"\n  Wrote QuantStats tearsheet to {tearsheet_path}")

    # Write report
    STATE_DIR.mkdir(exist_ok=True)
    out_path = STATE_DIR / "backtest_report.json"
    out_path.write_text(json.dumps(report, indent=2, default=str))
    print(f"\nWrote {out_path}")

    # Validation summary
    if oos_metrics:
        print(f"\n{'='*72}")
        print("  VALIDATION SUMMARY")
        print(f"{'='*72}")
        print(f"  IS Sharpe:  {is_metrics.get('sharpe_annualized', 0):.3f}   |   OOS Sharpe:  {oos_metrics.get('sharpe_annualized', 0):.3f}")
        print(f"  IS DSR:     {is_metrics.get('dsr', 'N/A')} (n={ESTIMATED_NUM_TRIALS})  |   OOS PSR:     {oos_metrics.get('psr', 0):.4f}")
        print(f"  IS Return:  {is_metrics.get('agent_return_pct', 0):+.2f}%  |   OOS Return:  {oos_metrics.get('agent_return_pct', 0):+.2f}%")
        print(f"  IS CAGR:    {is_metrics.get('cagr_pct', 0):+.2f}%  |   OOS CAGR:    {oos_metrics.get('cagr_pct', 0):+.2f}%")
        print(f"  IS Max DD:  {is_metrics.get('max_drawdown_pct', 0):.2f}%   |   OOS Max DD:  {oos_metrics.get('max_drawdown_pct', 0):.2f}%")
        print(f"  IS Trades:  {is_metrics.get('total_trades', 0)}          |   OOS Trades:  {oos_metrics.get('total_trades', 0)}")
        print(f"  IS Win %:   {is_metrics.get('win_rate_pct', 0):.1f}%      |   OOS Win %:   {oos_metrics.get('win_rate_pct', 0):.1f}%")
        print(f"  IS PF:      {is_metrics.get('profit_factor')}       |   OOS PF:      {oos_metrics.get('profit_factor')}")
        print(f"  IS MC p:    {is_metrics.get('monte_carlo_p_value', 'N/A')}      |   OOS MC p:    {oos_metrics.get('monte_carlo_p_value', 'N/A')}")
        fragile_params = [p["parameter"] for p in param_results if p.get("fragile")]
        if fragile_params:
            print(f"\n  FRAGILE PARAMETERS: {', '.join(fragile_params)}")
        else:
            print(f"\n  No fragile parameters detected (all stable within ±10%)")
        print(f"{'='*72}")


if __name__ == "__main__":
    asyncio.run(main())
