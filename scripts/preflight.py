"""Pre-flight checks before starting live trading.

Verifies Kraken API, LLM API, Sepolia, paper ledger, and agent registration
are all working before the orchestrator starts.
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import (
    OPENAI_API_KEY,
    SEPOLIA_PRIVATE_KEY,
    SEPOLIA_RPC_URL,
    STATE_DIR,
    RISK,
)
from src.execution.kraken_adapter import (
    init_paper,
    paper_balance,
    get_ticker,
)
from src.execution.risk_router import RiskRouterAdapter


def check(label: str, ok: bool, detail: str = "") -> None:
    mark = "OK  " if ok else "FAIL"
    print(f"  [{mark}] {label}", end="")
    if detail:
        print(f" — {detail}")
    else:
        print()


async def main() -> int:
    print("=" * 60)
    print("  PRAXIS AGENT — Pre-Flight Check")
    print("=" * 60)

    failed = 0

    print("\n[1/5] Environment variables")
    check(".env SEPOLIA_RPC_URL", bool(SEPOLIA_RPC_URL))
    check(".env SEPOLIA_PRIVATE_KEY", bool(SEPOLIA_PRIVATE_KEY))
    check(".env OPENAI_API_KEY", bool(OPENAI_API_KEY),
          "optional — uses deterministic fallback otherwise")
    if not (SEPOLIA_RPC_URL and SEPOLIA_PRIVATE_KEY):
        failed += 1

    print("\n[2/5] Kraken API connectivity")
    try:
        ticker = await get_ticker("BTCUSD")
        key = next((k for k in ticker if k != "last"), None)
        if key:
            ask = float(ticker[key]["a"][0])
            bid = float(ticker[key]["b"][0])
            check("BTC ticker", True, f"ask=${ask:.2f} bid=${bid:.2f}")
        else:
            check("BTC ticker", False, "no pair key in response")
            failed += 1
    except Exception as e:
        check("BTC ticker", False, str(e))
        failed += 1

    try:
        ticker = await get_ticker("ETHUSD")
        key = next((k for k in ticker if k != "last"), None)
        if key:
            ask = float(ticker[key]["a"][0])
            check("ETH ticker", True, f"ask=${ask:.2f}")
        else:
            check("ETH ticker", False)
            failed += 1
    except Exception as e:
        check("ETH ticker", False, str(e))
        failed += 1

    print("\n[3/5] Paper ledger")
    try:
        await init_paper(balance=10000.0)
        status = await paper_balance()
        check("Paper ledger initialized", status.get("status") == "ok",
              f"balance=${status.get('balance', 0):.2f} "
              f"trades={status.get('total_trades', 0)}")
    except Exception as e:
        check("Paper ledger", False, str(e))
        failed += 1

    print("\n[4/5] Sepolia / ERC-8004")
    try:
        router = RiskRouterAdapter()
        if not router.enabled:
            check("Sepolia connection", False, "adapter not enabled")
            failed += 1
        else:
            address = router._address
            balance = router._w3.from_wei(
                router._w3.eth.get_balance(address), "ether"
            )
            check("Sepolia connection", True, f"chain={router._w3.eth.chain_id}")
            check("Wallet balance", balance > 0.001,
                  f"{balance} ETH ({address[:10]}...)")
            if balance < 0.005:
                print(f"         WARNING: Low balance. Get Sepolia ETH at "
                      f"sepoliafaucet.com")

            agent_id_path = STATE_DIR / "agent_id.json"
            if agent_id_path.exists():
                saved = json.loads(agent_id_path.read_text())
                agent_id = saved.get("agent_id")
                check("Agent registered", agent_id is not None,
                      f"ID={agent_id}")
            else:
                check("Agent registered", False,
                      "run: python scripts/register_agent.py")
                failed += 1
    except Exception as e:
        check("Sepolia", False, str(e))
        failed += 1

    print("\n[5/5] Risk configuration")
    print(f"  risk_per_trade_pct:   {RISK.risk_per_trade_pct * 100}%")
    print(f"  max_position_pct:     {RISK.max_position_pct * 100}%")
    print(f"  max_drawdown_pct:     {RISK.max_drawdown_pct * 100}%")
    print(f"  min_signal_score_paper: {RISK.min_signal_score_paper}")
    print(f"  min_signal_score_short: {RISK.min_signal_score_short}")
    print(f"  shorts_enabled:       {RISK.shorts_enabled}")
    print(f"  execution_mode:       {RISK.execution_mode}")

    print("\n" + "=" * 60)
    if failed == 0:
        print("  ALL CHECKS PASSED — ready to run")
        print("  Start orchestrator with: python -m src.orchestrator")
    else:
        print(f"  {failed} checks failed — fix before running orchestrator")
    print("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
