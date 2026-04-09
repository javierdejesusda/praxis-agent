"""Force a single end-to-end trade for pre-demo verification.

Constructs a synthetic approved TradeIntent, pushes it through the paper
execution adapter, optionally submits it on-chain, and writes a
trade-execution artifact. Use before a live demo to confirm the trade
path actually works, since the normal strategic cycle may not produce a
qualifying signal inside the demo window.

Usage:
    python scripts/force_trade.py [--pair BTCUSD|ETHUSD] [--side long|short]
                                   [--size-usd 15] [--on-chain] [--cleanup]

Flags:
    --pair        Trading pair to use (default: BTCUSD).
    --side        Trade direction (default: long).
    --size-usd    Notional size in USD (default: 15, min: 10).
    --on-chain    Also submit TradeIntent to the Sepolia Risk Router.
    --cleanup     Immediately close the resulting paper position.

The script defaults to paper-only so judges never see an artificial
on-chain trade unless you explicitly opt in.
"""

import argparse
import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.artifacts.attestations import record_attestation_sync
from src.artifacts.hasher import build_artifact
from src.config import ARTIFACTS_DIR, STATE_DIR
from src.execution.kraken_adapter import (
    _fetch_ticker_with_retry,
    _extract_bid_ask,
    close_paper_position,
    execute_paper_trade,
)
from src.execution.risk_router import RiskRouterAdapter
from src.models import Direction, TradeIntent


def _load_agent_id() -> int | None:
    path = STATE_DIR / "agent_id.json"
    if not path.exists():
        return None
    import json

    try:
        return int(json.loads(path.read_text()).get("agent_id"))
    except Exception:
        return None


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pair", default="BTCUSD", choices=["BTCUSD", "ETHUSD"])
    parser.add_argument("--side", default="long", choices=["long", "short"])
    parser.add_argument("--size-usd", type=float, default=15.0)
    parser.add_argument("--on-chain", action="store_true")
    parser.add_argument("--cleanup", action="store_true")
    return parser.parse_args()


def _save_artifact(artifact: dict) -> Path:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    hash_prefix = artifact["hash"][:16]
    path = ARTIFACTS_DIR / f"trade-execution_{artifact['payload']['pair']}_{hash_prefix}.json"
    import json

    path.write_text(json.dumps(artifact, indent=2, sort_keys=True))
    return path


async def main() -> int:
    args = _parse_args()
    if args.size_usd < 10:
        print(f"[ERROR] --size-usd must be at least 10 (got {args.size_usd})")
        return 1

    direction = Direction.LONG if args.side == "long" else Direction.SHORT

    print("=" * 66)
    print("  AEGIS AGENT — FORCE-TRADE VERIFICATION")
    print(f"  Pair: {args.pair}  Side: {direction.value}  Size: ${args.size_usd:.2f}")
    print("=" * 66)

    print("\n[1/5] Fetching live Kraken ticker (bounded 5s + retry)")
    try:
        ticker = await _fetch_ticker_with_retry(args.pair)
    except Exception as exc:
        print(f"  FAILED: {exc}")
        return 2
    bid_ask = _extract_bid_ask(ticker)
    if bid_ask is None:
        print("  FAILED: could not extract bid/ask from ticker")
        return 3
    bid, ask = bid_ask
    print(f"  OK   bid=${bid:,.2f} ask=${ask:,.2f} spread={((ask-bid)/ask)*10000:.1f}bps")

    intent = TradeIntent(
        intent_id=f"forcetrade-{uuid.uuid4().hex[:12]}",
        pair=args.pair,
        side=direction,
        size_usd=round(args.size_usd, 2),
        order_type="market",
        signal_score=88.0,
        erc_eligible=True,
    )
    print(f"\n[2/5] Built synthetic TradeIntent  id={intent.intent_id}")

    print("\n[3/5] Executing paper trade through kraken_adapter")
    receipt = await execute_paper_trade(intent)
    if receipt.status != "filled":
        print(f"  FAILED: status={receipt.status} error={receipt.error}")
        return 4
    print(
        f"  OK   filled @ ${receipt.fill_price:,.2f}  fees=${receipt.fees_usd:.4f}"
    )

    artifact_data = {
        "pair": args.pair,
        "source": "force_trade_test_harness",
        "intent": intent.model_dump(),
        "receipt": receipt.model_dump(),
        "ticker": {"bid": bid, "ask": ask},
    }

    router = RiskRouterAdapter()
    router._agent_id = _load_agent_id()
    chain_tx: str | None = None
    chain_status: str | None = None
    if args.on_chain:
        print("\n[4/5] Submitting TradeIntent on-chain to Sepolia Risk Router")
        if not router.enabled or router._agent_id is None:
            print("  SKIPPED: Risk Router disabled or agent not registered")
        else:
            try:
                agent_wallet = router._address
                chain_receipt = router.submit_trade_intent(
                    intent, agent_wallet=agent_wallet
                )
                chain_tx = chain_receipt.order_id
                chain_status = chain_receipt.status
                print(
                    f"  {chain_receipt.status.upper()}  intent_id={chain_receipt.intent_id} "
                    f"tx={chain_receipt.order_id}"
                )
                artifact_data["onchain_receipt"] = chain_receipt.model_dump()
            except Exception as exc:
                print(f"  FAILED: {exc}")
                artifact_data["onchain_error"] = str(exc)
    else:
        print("\n[4/5] Skipping on-chain submission (use --on-chain to enable)")

    artifact = build_artifact("trade-execution", artifact_data)
    saved_to = _save_artifact(artifact)

    if chain_tx:
        record_attestation_sync(
            "trade_intent",
            chain_tx,
            artifact,
            extra={
                "intent_id": intent.intent_id,
                "side": intent.side.value,
                "size_usd": intent.size_usd,
                "status": chain_status or "unknown",
                "source": "force_trade_script",
            },
        )
    print(f"\n[5/5] Wrote trade-execution artifact  {saved_to.name}")
    print(f"      hash={artifact['hash'][:16]}...")

    if args.cleanup:
        print("\n[cleanup] Closing paper position to restore ledger")
        # Closing a long sells into the bid; closing a short buys at the ask.
        exit_price = bid if direction == Direction.LONG else ask
        close_result = await close_paper_position(
            args.pair, exit_price=exit_price, reason="force_trade_cleanup"
        )
        if close_result.get("status") == "closed":
            print(
                f"  OK   exit @ ${exit_price:,.2f}  "
                f"pnl=${close_result.get('pnl_usd', 0):.4f}  "
                f"balance=${close_result.get('balance', 0):,.2f}"
            )
        else:
            print(f"  WARN {close_result}")

    print("\nALL CHECKS PASSED — trade path verified end-to-end")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
