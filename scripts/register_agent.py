"""Register Aegis Agent on Sepolia and claim vault allocation.

Run this once before starting the live orchestrator. Saves agent ID to
state/agent_id.json for future sessions to pick up.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from web3 import Web3

from src.config import SEPOLIA_PRIVATE_KEY, SEPOLIA_RPC_URL, STATE_DIR
from src.execution.risk_router import RiskRouterAdapter


def main() -> int:
    print("=" * 60)
    print("  AEGIS AGENT — Sepolia Registration")
    print("=" * 60)

    if not SEPOLIA_RPC_URL:
        print("ERROR: SEPOLIA_RPC_URL not set in .env")
        return 1
    if not SEPOLIA_PRIVATE_KEY:
        print("ERROR: SEPOLIA_PRIVATE_KEY not set in .env")
        return 1

    w3 = Web3(Web3.HTTPProvider(SEPOLIA_RPC_URL))
    if not w3.is_connected():
        print("ERROR: Cannot connect to Sepolia RPC")
        return 1

    router = RiskRouterAdapter()
    if not router.enabled:
        print("ERROR: RiskRouterAdapter could not initialize")
        return 1

    address = router._address
    print(f"\nWallet: {address}")

    balance_wei = w3.eth.get_balance(address)
    balance_eth = w3.from_wei(balance_wei, "ether")
    print(f"Balance: {balance_eth} ETH")

    if balance_eth < 0.005:
        print(f"\nWARNING: Low balance. You need Sepolia ETH for gas.")
        print(f"  Get test ETH from:")
        print(f"    https://sepoliafaucet.com/")
        print(f"    https://www.alchemy.com/faucets/ethereum-sepolia")
        print(f"    https://cloud.google.com/application/web3/faucet/ethereum/sepolia")
        print(f"  Wallet to fund: {address}")
        if balance_eth == 0:
            return 1

    print(f"\nChain ID:    {w3.eth.chain_id}")
    print(f"Block:       {w3.eth.block_number}")

    agent_id_path = STATE_DIR / "agent_id.json"
    existing_id = None
    if agent_id_path.exists():
        saved = json.loads(agent_id_path.read_text())
        existing_id = saved.get("agent_id")
        print(f"\nExisting agent ID on disk: {existing_id}")

    if existing_id is not None:
        print(f"\nAgent already registered (ID: {existing_id})")
        print("  Skipping registration. Delete state/agent_id.json to re-register.")
        router._agent_id = existing_id
    else:
        print(f"\nRegistering agent on AgentRegistry...")
        try:
            agent_id = router.register_agent(
                name="AegisAgent",
                description="Regime-adaptive AI trading agent with 7-criteria deterministic risk governance",
                capabilities=["trading", "risk-management", "validation", "regime-adaptive"],
                agent_uri="",
            )
            print(f"  Registered successfully. Agent ID: {agent_id}")

            STATE_DIR.mkdir(exist_ok=True)
            agent_id_path.write_text(json.dumps({"agent_id": agent_id}, indent=2))
            print(f"  Saved to {agent_id_path}")
        except Exception as e:
            print(f"  ERROR: Registration failed: {e}")
            return 1

    print(f"\nChecking/claiming vault allocation...")
    try:
        claimed = router.claim_vault()
        if claimed:
            print("  Vault claim OK (already claimed or newly claimed)")
        else:
            print("  Vault claim failed — check balance and try again")
    except Exception as e:
        print(f"  WARNING: Vault claim error: {e}")

    new_balance = w3.from_wei(w3.eth.get_balance(address), "ether")
    print(f"\nNew balance: {new_balance} ETH")

    print("\n" + "=" * 60)
    print("  Registration complete. You can now run:")
    print("    python -m src.orchestrator")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
