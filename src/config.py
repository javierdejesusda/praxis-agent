"""Central configuration for Praxis trading agent."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class RiskParams:
    """Deterministic risk governor parameters."""

    risk_per_trade_pct: float = 0.015
    max_position_pct: float = 0.60
    max_daily_loss_pct: float = 0.03
    max_drawdown_pct: float = 0.08
    max_consecutive_losses: int = 3
    min_spread_bps: float = 20.0
    real_cost_bps: float = 55.0
    required_edge_multiplier: float = 1.1
    min_signal_score_erc: int = 85
    min_signal_score_paper: int = 70
    min_signal_score_short: int = 88
    shorts_enabled: bool = False
    execution_mode: str = os.getenv("EXECUTION_MODE", "paper")

    # ATR multipliers (shared by backtester, risk governor, orchestrator)
    stop_mult: float = 4.0
    target_mult_base: float = 2.85
    target_mult_mid: float = 3.5
    target_mult_hi: float = 8.0
    trail_mult: float = 3.0
    adx_mid_threshold: float = 25.0
    adx_hi_threshold: float = 35.0

    # Position management
    max_hold_bars: int = 120
    cooldown_bars: int = 2
    macro_filter: bool = True

    # Exit management (shared by backtester and orchestrator)
    be_trigger_pct: float = 0.006
    lock_trigger_pct: float = 0.012
    lock_value_pct: float = 0.0065

    # Entry quality filters
    min_adx_for_entry: float = 0.0
    dd_scale_threshold: float = 0.97
    dd_scale_factor: float = 0.5
    atr_pct_max: float = 999.0
    strict_macro: bool = False
    mtf_daily_filter: bool = True
    mtf_daily_fast: int = 55
    mtf_daily_slow: int = 220


@dataclass(frozen=True)
class StrategyParams:
    """Regime-adaptive strategy parameters."""

    adx_trending_threshold: float = 25.0
    adx_ranging_threshold: float = 20.0
    pairs: list[str] = field(default_factory=lambda: ["BTCUSD", "ETHUSD"])
    primary_timeframe: str = "4h"
    execution_timeframe: str = "1h"
    stale_data_seconds: int = 7200


@dataclass(frozen=True)
class ContractAddresses:
    """Hackathon shared Sepolia contracts."""

    risk_router: str = "0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC"
    chain_id: int = 11155111
    eip712_domain_name: str = "RiskRouter"
    eip712_domain_version: str = "1"


COMPETITION_MODE = os.getenv("COMPETITION_MODE", "").lower() in ("1", "true", "yes")

if COMPETITION_MODE:
    RISK = RiskParams(
        min_signal_score_paper=75,
        min_signal_score_erc=85,
        min_signal_score_short=80,
        shorts_enabled=True,
        max_consecutive_losses=5,
        stop_mult=2.5,
        trail_mult=2.5,
        target_mult_base=2.85,
        target_mult_mid=3.5,
        target_mult_hi=6.25,
        dd_scale_factor=0.001,
        mtf_daily_filter=True,
    )
else:
    RISK = RiskParams()

STRATEGY = StrategyParams()
CONTRACTS = ContractAddresses()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.2")
SEPOLIA_RPC_URL = os.getenv("SEPOLIA_RPC_URL", "")
SEPOLIA_PRIVATE_KEY = os.getenv("SEPOLIA_PRIVATE_KEY", "")
PRISM_API_KEY = os.getenv("PRISM_API_KEY", "")
FMP_API_KEY = os.getenv("FMP_API_KEY", "")
KRAKEN_API_KEY = os.getenv("KRAKEN_API_KEY", "")
KRAKEN_API_SECRET = os.getenv("KRAKEN_API_SECRET", "")

STATE_DIR = Path("state")
ARTIFACTS_DIR = Path("artifacts")
