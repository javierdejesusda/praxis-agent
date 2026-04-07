"""Central configuration for Aegis trading agent."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class RiskParams:
    """Deterministic risk governor parameters."""

    risk_per_trade_pct: float = 0.01
    max_position_pct: float = 0.10
    max_daily_loss_pct: float = 0.03
    max_drawdown_pct: float = 0.08
    max_consecutive_losses: int = 3
    min_spread_bps: float = 20.0
    real_cost_bps: float = 55.0
    required_edge_multiplier: float = 1.5
    min_signal_score_erc: int = 85
    min_signal_score_paper: int = 70
    execution_mode: str = "paper"


@dataclass(frozen=True)
class StrategyParams:
    """Regime-adaptive strategy parameters."""

    adx_trending_threshold: float = 25.0
    adx_ranging_threshold: float = 20.0
    pairs: list[str] = field(default_factory=lambda: ["BTCUSD", "ETHUSD"])
    primary_timeframe: str = "4h"
    execution_timeframe: str = "1h"
    stale_data_seconds: int = 300


@dataclass(frozen=True)
class ContractAddresses:
    """Hackathon shared Sepolia contracts."""

    risk_router: str = "0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC"
    chain_id: int = 11155111
    eip712_domain_name: str = "RiskRouter"
    eip712_domain_version: str = "1"


RISK = RiskParams()
STRATEGY = StrategyParams()
CONTRACTS = ContractAddresses()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
SEPOLIA_RPC_URL = os.getenv("SEPOLIA_RPC_URL", "")
SEPOLIA_PRIVATE_KEY = os.getenv("SEPOLIA_PRIVATE_KEY", "")
PRISM_API_KEY = os.getenv("PRISM_API_KEY", "")

STATE_DIR = Path("state")
ARTIFACTS_DIR = Path("artifacts")
