"""Apply a sweep's best config to src/config.py and rerun the backtest.

Reads ``logs/sweep_<stage>.json`` (default coarse), pulls the top config,
writes those values into ``src/config.py``'s RiskParams dataclass defaults,
then runs the full-history backtest and saves the authoritative results.

Usage:
    python scripts/apply_best.py                       # default: coarse
    python scripts/apply_best.py --sweep logs/sweep_fine.json
    python scripts/apply_best.py --rank 3              # pick 3rd-best
"""

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config
from src.backtester import backtest_portfolio, load_csv, _resample


def apply_config_to_file(cfg: dict, config_path: Path) -> None:
    """Overwrite RiskParams defaults in src/config.py."""
    text = config_path.read_text()

    def repl(field: str, new_value: str) -> None:
        nonlocal text
        pattern = rf"(\b{field}:\s*(?:int|float|bool)\s*=\s*)[^\n#]+"
        new = rf"\g<1>{new_value}"
        text, n = re.subn(pattern, new, text, count=1)
        if n == 0:
            raise RuntimeError(f"Could not replace {field} in {config_path}")

    repl("min_signal_score_paper", str(cfg["min_score"]))
    repl("min_signal_score_erc", str(cfg["min_score"]))
    repl("min_signal_score_short", str(cfg["min_short_score"]))
    repl("shorts_enabled", str(cfg["shorts_enabled"]))
    repl("stop_mult", str(cfg["stop_mult"]))
    repl("target_mult_base", str(cfg["target_mult_base"]))
    repl("target_mult_mid", str(cfg["target_mult_mid"]))
    repl("target_mult_hi", str(cfg["target_mult_hi"]))
    repl("trail_mult", str(cfg["trail_mult"]))
    repl("max_hold_bars", str(cfg["max_hold_bars"]))
    repl("cooldown_bars", str(cfg["cooldown_bars"]))
    repl("macro_filter", str(cfg["macro_filter"]))

    config_path.write_text(text)
    print(f"Updated {config_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--sweep",
        default=str(Path(__file__).resolve().parent.parent / "logs" / "sweep_coarse.json"),
    )
    parser.add_argument("--rank", type=int, default=1)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--out", default=str(
        Path(__file__).resolve().parent.parent / "logs" / "best_run.json"
    ))
    args = parser.parse_args()

    data = json.loads(Path(args.sweep).read_text())
    top = data["top"]
    if args.rank < 1 or args.rank > len(top):
        raise SystemExit(f"rank {args.rank} out of range (1..{len(top)})")
    picked = top[args.rank - 1]
    cfg = picked["config"]
    print(f"\nPicked rank {args.rank}:")
    print(f"  score={picked['score']}")
    print(f"  combined={picked['combined']}")
    print(f"  config={cfg}")

    project_root = Path(__file__).resolve().parent.parent
    config_path = project_root / "src" / "config.py"
    if not args.dry_run:
        apply_config_to_file(cfg, config_path)

        import importlib
        importlib.reload(config)
        print("\nRISK after reload:")
        print(f"  stop_mult={config.RISK.stop_mult}")
        print(f"  trail_mult={config.RISK.trail_mult}")
        print(f"  target_mult_base={config.RISK.target_mult_base}")
        print(f"  min_signal_score_paper={config.RISK.min_signal_score_paper}")
        print(f"  shorts_enabled={config.RISK.shorts_enabled}")
        print(f"  macro_filter={config.RISK.macro_filter}")
        print(f"  max_hold_bars={config.RISK.max_hold_bars}")

    print("\nRunning authoritative backtest...")
    pair_frames = {
        p: _resample(load_csv(p, 60), cfg["interval"], 60)
        for p in ["BTCUSD", "ETHUSD"]
    }
    result = backtest_portfolio(
        pair_frames,
        initial_equity=10000.0,
    )
    summary = {k: v for k, v in result.items() if k not in {"trades", "rejections"}}
    print("\nResult summary:")
    for k, v in summary.items():
        print(f"  {k}: {v}")

    Path(args.out).write_text(json.dumps({
        "rank": args.rank,
        "picked_from": args.sweep,
        "applied_config": cfg,
        "summary": summary,
        "trades": result.get("trades", []),
        "rejections": result.get("rejections"),
    }, indent=2, default=str))
    print(f"\nSaved {args.out}")


if __name__ == "__main__":
    main()
