"""Central configuration for Aegis trading agent."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class RiskParams:
    """Deterministic risk governor parameters."""

    risk_per_trade_pct: float = 0.015
    max_position_pct: float = 0.40
    max_daily_loss_pct: float = 0.03
    max_drawdown_pct: float = 0.08
    max_consecutive_losses: int = 3
    min_spread_bps: float = 20.0
    real_cost_bps: float = 55.0
    required_edge_multiplier: float = 1.1
    min_signal_score_erc: int = 85
    min_signal_score_paper: int = 85
    min_signal_score_short: int = 88
    shorts_enabled: bool = False
    execution_mode: str = "paper"

    # ATR multipliers (shared by backtester, risk governor, orchestrator)
    stop_mult: float = 3.1  # iter8: 3.1 beats 3.0 with trail=2.1 — Sharpe 1.246 vs 1.235
    target_mult_base: float = 2.85  # iter20: 2.85/3.5/6.25 — Sharpe 1.513 (peak)
    target_mult_mid: float = 3.5  # iter20
    target_mult_hi: float = 6.25  # iter20: 6.25 (was 6.0) — Sharpe 1.513 vs 1.506
    trail_mult: float = 2.1  # iter8: 2.1 dominates 2.25 with dd_scale=0.3 — Sharpe 1.235 vs 1.200, DD 8.66% vs 8.94%
    adx_mid_threshold: float = 25.0
    adx_hi_threshold: float = 35.0

    # Position management
    max_hold_bars: int = 80  # iter8: 80 dominates 120 on Sharpe (1.198 vs 1.180) and return (+14%)
    cooldown_bars: int = 6
    macro_filter: bool = True

    # Entry quality filters
    min_adx_for_entry: float = 0.0  # 0 = disabled; sweep found 0 best (trend signal already gates on ADX>22)
    dd_scale_threshold: float = 0.97  # Reduce size after 3% drawdown
    dd_scale_factor: float = 0.001  # iter21b: 0.001 — Sharpe 1.514, DD 7.27%, ret 730.6%
    atr_pct_max: float = 999.0  # iter6: disabled — sweeping showed filter hurts Sharpe without helping OOS DD
    strict_macro: bool = False  # 3-way EMA alignment; redundant when trend_signal already enforces it
    mtf_daily_filter: bool = True  # Require daily EMA alignment for longs (big Sharpe boost)
    mtf_daily_fast: int = 55  # fast EMA length on daily chart
    mtf_daily_slow: int = 220  # iter9: 220 beats 200 — Sharpe 1.272 vs 1.246 at same DD


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


RISK = RiskParams()
STRATEGY = StrategyParams()
CONTRACTS = ContractAddresses()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.2")
SEPOLIA_RPC_URL = os.getenv("SEPOLIA_RPC_URL", "")
SEPOLIA_PRIVATE_KEY = os.getenv("SEPOLIA_PRIVATE_KEY", "")
PRISM_API_KEY = os.getenv("PRISM_API_KEY", "")
FMP_API_KEY = os.getenv("FMP_API_KEY", "")

STATE_DIR = Path("state")
ARTIFACTS_DIR = Path("artifacts")
