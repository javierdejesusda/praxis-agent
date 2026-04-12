"""ERC-8004 Risk Router adapter — EIP-712 signed TradeIntents on Sepolia."""

import json
import logging
import threading
import time
from typing import Optional

from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3

from src.config import CONTRACTS, SEPOLIA_PRIVATE_KEY, SEPOLIA_RPC_URL
from src.models import Direction, ExecutionReceipt, TradeIntent

logger = logging.getLogger(__name__)

_nonce_lock = threading.Lock()

CONTRACTS_MAP = {
    "agent_registry": "0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3",
    "hackathon_vault": "0x0E7CD8ef9743FEcf94f9103033a044caBD45fC90",
    "risk_router": "0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC",
    "reputation_registry": "0x423a9904e39537a9997fbaF0f220d79D7d545763",
    "validation_registry": "0x92bF63E5C7Ac6980f237a7164Ab413BE226187F1",
}

RISK_ROUTER_ABI = json.loads("""[
    {
        "inputs": [
            {
                "components": [
                    {"name": "agentId", "type": "uint256"},
                    {"name": "agentWallet", "type": "address"},
                    {"name": "pair", "type": "string"},
                    {"name": "action", "type": "string"},
                    {"name": "amountUsdScaled", "type": "uint256"},
                    {"name": "maxSlippageBps", "type": "uint256"},
                    {"name": "nonce", "type": "uint256"},
                    {"name": "deadline", "type": "uint256"}
                ],
                "name": "intent",
                "type": "tuple"
            },
            {"name": "signature", "type": "bytes"}
        ],
        "name": "submitTradeIntent",
        "outputs": [
            {"name": "approved", "type": "bool"},
            {"name": "reason", "type": "string"}
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "getIntentNonce",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
]""")

AGENT_REGISTRY_ABI = json.loads("""[
    {
        "inputs": [
            {"name": "agentWallet", "type": "address"},
            {"name": "name", "type": "string"},
            {"name": "description", "type": "string"},
            {"name": "capabilities", "type": "string[]"},
            {"name": "agentURI", "type": "string"}
        ],
        "name": "register",
        "outputs": [{"name": "agentId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "isRegistered",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
    }
]""")

VALIDATION_ABI = json.loads("""[
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "checkpointHash", "type": "bytes32"},
            {"name": "score", "type": "uint8"},
            {"name": "notes", "type": "string"}
        ],
        "name": "postEIP712Attestation",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "getAverageValidationScore",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
]""")

REPUTATION_ABI = json.loads("""[
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "score", "type": "uint8"},
            {"name": "outcomeRef", "type": "bytes32"},
            {"name": "comment", "type": "string"},
            {"name": "feedbackType", "type": "uint8"}
        ],
        "name": "submitFeedback",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "getAverageScore",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
]""")

VAULT_ABI = json.loads("""[
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "claimAllocation",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "hasClaimed",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
    }
]""")

EIP712_DOMAIN = {
    "name": "RiskRouter",
    "version": "1",
    "chainId": CONTRACTS.chain_id,
    "verifyingContract": CONTRACTS.risk_router,
}

TRADE_INTENT_TYPES = {
    "TradeIntent": [
        {"name": "agentId", "type": "uint256"},
        {"name": "agentWallet", "type": "address"},
        {"name": "pair", "type": "string"},
        {"name": "action", "type": "string"},
        {"name": "amountUsdScaled", "type": "uint256"},
        {"name": "maxSlippageBps", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
    ],
}


class RiskRouterAdapter:
    """Manages on-chain interaction with hackathon shared contracts."""

    def __init__(self):
        if not SEPOLIA_RPC_URL or not SEPOLIA_PRIVATE_KEY:
            logger.warning("Sepolia credentials not configured — on-chain disabled")
            self._enabled = False
            return

        self._enabled = True
        self._w3 = Web3(Web3.HTTPProvider(SEPOLIA_RPC_URL))
        self._account = Account.from_key(SEPOLIA_PRIVATE_KEY)
        self._address = self._account.address

        self._risk_router = self._w3.eth.contract(
            address=Web3.to_checksum_address(CONTRACTS_MAP["risk_router"]),
            abi=RISK_ROUTER_ABI,
        )
        self._agent_registry = self._w3.eth.contract(
            address=Web3.to_checksum_address(CONTRACTS_MAP["agent_registry"]),
            abi=AGENT_REGISTRY_ABI,
        )
        self._validation = self._w3.eth.contract(
            address=Web3.to_checksum_address(CONTRACTS_MAP["validation_registry"]),
            abi=VALIDATION_ABI,
        )
        self._reputation = self._w3.eth.contract(
            address=Web3.to_checksum_address(CONTRACTS_MAP["reputation_registry"]),
            abi=REPUTATION_ABI,
        )
        self._vault = self._w3.eth.contract(
            address=Web3.to_checksum_address(CONTRACTS_MAP["hackathon_vault"]),
            abi=VAULT_ABI,
        )

        self._agent_id: Optional[int] = None
        self._cached_nonce: Optional[int] = None

    @property
    def enabled(self) -> bool:
        return self._enabled

    def _send_tx(self, tx_func) -> dict:
        """Build, sign, and send a transaction with nonce locking.

        Uses the maximum of the node's pending nonce and a locally cached
        nonce, then increments the cache on success. This absorbs RPC
        replication lag where get_transaction_count briefly returns a stale
        value after a just-mined tx, which otherwise causes "nonce too low"
        errors on back-to-back sends.

        Args:
            tx_func: A contract function call (e.g. contract.functions.foo(args)).

        Returns:
            Transaction receipt dict.
        """
        with _nonce_lock:
            node_nonce = self._w3.eth.get_transaction_count(self._address, "pending")
            if self._cached_nonce is None or node_nonce > self._cached_nonce:
                nonce = node_nonce
            else:
                nonce = self._cached_nonce
            gas_price = int(self._w3.eth.gas_price * 1.5)
            tx = tx_func.build_transaction({
                "from": self._address,
                "nonce": nonce,
                "gas": 500_000,
                "gasPrice": gas_price,
                "chainId": CONTRACTS.chain_id,
            })
            signed = self._account.sign_transaction(tx)
            tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
            # Advance the cache as soon as the mempool accepts the tx. The
            # nonce is consumed at this point even if the receipt wait times
            # out, so we must not reuse it on the next send.
            self._cached_nonce = nonce + 1
            receipt = self._w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
            return receipt

    def register_agent(
        self,
        name: str = "PraxisAgent",
        description: str = "Regime-adaptive AI trading agent with deterministic risk governance",
        capabilities: Optional[list[str]] = None,
        agent_uri: str = "",
    ) -> int:
        """Register agent on the hackathon AgentRegistry.

        Args:
            name: Agent display name.
            description: Agent description.
            capabilities: List of capability strings.
            agent_uri: URI to agent metadata JSON.

        Returns:
            Assigned agent ID.
        """
        if not self._enabled:
            raise RuntimeError("On-chain not enabled")

        if capabilities is None:
            capabilities = ["trading", "risk-management", "validation"]

        receipt = self._send_tx(
            self._agent_registry.functions.register(
                self._address, name, description, capabilities, agent_uri
            )
        )

        self._agent_id = None
        for log in receipt.get("logs", []):
            topics = log.get("topics", [])
            if len(topics) >= 2:
                try:
                    candidate = int(topics[1].hex(), 16)
                    if 0 < candidate < 100_000:
                        self._agent_id = candidate
                        break
                except (ValueError, AttributeError):
                    continue
        if self._agent_id is None:
            self._agent_id = 1
            logger.warning("Could not parse agent ID from logs, defaulting to 1")

        logger.info("Agent registered with ID: %d", self._agent_id)
        return self._agent_id

    def claim_vault(self) -> bool:
        """Claim 0.05 ETH allocation from HackathonVault."""
        if not self._enabled or self._agent_id is None:
            return False

        try:
            claimed = self._vault.functions.hasClaimed(self._agent_id).call()
            if claimed:
                logger.info("Vault already claimed for agent %d", self._agent_id)
                return True

            self._send_tx(self._vault.functions.claimAllocation(self._agent_id))
            logger.info("Vault claimed for agent %d", self._agent_id)
            return True
        except Exception as e:
            logger.error("Vault claim failed: %s", e)
            return False

    def submit_trade_intent(self, intent: TradeIntent, agent_wallet: str) -> ExecutionReceipt:
        """Sign and submit a TradeIntent to the RiskRouter via EIP-712.

        Args:
            intent: The trade intent to submit.
            agent_wallet: The registered agent wallet address.

        Returns:
            ExecutionReceipt with on-chain result.
        """
        if not self._enabled or self._agent_id is None:
            return ExecutionReceipt(
                intent_id=intent.intent_id,
                adapter="risk_router",
                status="error",
                error="On-chain not enabled or agent not registered",
            )

        try:
            nonce = self._risk_router.functions.getIntentNonce(self._agent_id).call()
            deadline = int(time.time()) + 300

            action = "BUY" if intent.side == Direction.LONG else "SELL"
            amount_scaled = int(intent.size_usd * 100)

            message = {
                "agentId": self._agent_id,
                "agentWallet": Web3.to_checksum_address(agent_wallet),
                "pair": intent.pair,
                "action": action,
                "amountUsdScaled": amount_scaled,
                "maxSlippageBps": 50,
                "nonce": nonce,
                "deadline": deadline,
            }

            full_message = {
                "types": TRADE_INTENT_TYPES,
                "domain": EIP712_DOMAIN,
                "primaryType": "TradeIntent",
                "message": message,
            }

            signed = self._account.sign_typed_data(full_message=full_message)

            intent_tuple = (
                self._agent_id,
                Web3.to_checksum_address(agent_wallet),
                intent.pair,
                action,
                amount_scaled,
                50,
                nonce,
                deadline,
            )

            receipt = self._send_tx(
                self._risk_router.functions.submitTradeIntent(
                    intent_tuple, signed.signature
                )
            )

            approved = receipt["status"] == 1
            status = "approved" if approved else "rejected"

            return ExecutionReceipt(
                intent_id=intent.intent_id,
                adapter="risk_router",
                status=status,
                order_id=receipt["transactionHash"].hex(),
            )

        except Exception as e:
            logger.error("Risk Router submission failed: %s", e)
            return ExecutionReceipt(
                intent_id=intent.intent_id,
                adapter="risk_router",
                status="error",
                error=str(e),
            )

    def post_validation(
        self,
        checkpoint_hash: bytes,
        score: int,
        notes: str = "",
    ) -> Optional[str]:
        """Post a validation attestation to the ValidationRegistry.

        Args:
            checkpoint_hash: 32-byte hash of the checkpoint data.
            score: Validation score 0-100.
            notes: Human-readable notes.

        Returns:
            Transaction hash or None on failure.
        """
        if not self._enabled or self._agent_id is None:
            return None

        try:
            score = max(0, min(100, score))
            receipt = self._send_tx(
                self._validation.functions.postEIP712Attestation(
                    self._agent_id, checkpoint_hash, score, notes
                )
            )
            if receipt["status"] != 1:
                tx_hash = receipt["transactionHash"].hex()
                logger.error("Validation reverted on-chain: tx=%s", tx_hash)
                return None
            tx_hash = receipt["transactionHash"].hex()
            logger.info("Validation posted: score=%d tx=%s", score, tx_hash)
            return tx_hash
        except Exception as e:
            logger.error("Validation post failed: %s", e)
            return None

    def post_reputation(
        self,
        score: int,
        outcome_ref: bytes,
        comment: str = "",
        feedback_type: int = 0,
    ) -> Optional[str]:
        """Post reputation feedback to the ReputationRegistry.

        The hackathon ReputationRegistry blocks self-rating at the contract
        level: operator, NFT owner, and agentWallet are all forbidden from
        calling ``submitFeedback`` for their own agent, and each rater wallet
        may only post once per agent. Our operator wallet is all three roles
        for agent 35, so every call from this process reverts. We short-circuit
        here to avoid burning gas on guaranteed reverts; reputation must come
        from external counterparty or validator wallets.

        Args:
            score: Reputation score 0-100.
            outcome_ref: 32-byte reference hash.
            comment: Feedback comment.
            feedback_type: 0=TRADE_EXECUTION, 1=RISK_MANAGEMENT, 2=STRATEGY_QUALITY.

        Returns:
            Always ``None`` — kept for API compatibility with callers that
            check a truthy tx hash before recording an attestation.
        """
        if not self._enabled or self._agent_id is None:
            return None

        logger.debug(
            "Reputation skipped: self-rating not permitted by ReputationRegistry "
            "(agent=%d score=%d type=%d)",
            self._agent_id,
            score,
            feedback_type,
        )
        return None

    def get_validation_score(self) -> int:
        """Get current average validation score for our agent."""
        if not self._enabled or self._agent_id is None:
            return 0
        try:
            return self._validation.functions.getAverageValidationScore(
                self._agent_id
            ).call()
        except Exception:
            return 0

    def get_reputation_score(self) -> int:
        """Get current average reputation score for our agent."""
        if not self._enabled or self._agent_id is None:
            return 0
        try:
            return self._reputation.functions.getAverageScore(
                self._agent_id
            ).call()
        except Exception:
            return 0
