"""Pydantic models for typed data flow across the pipeline."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Regime(str, Enum):
    TRENDING = "trending"
    RANGING = "ranging"
    TRANSITION = "transition"


class Direction(str, Enum):
    LONG = "long"
    SHORT = "short"
    HOLD = "hold"


class MarketSnapshot(BaseModel):
    """Raw market data from Kraken."""

    pair: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    bid: Optional[float] = None
    ask: Optional[float] = None
    spread_bps: Optional[float] = None


class Features(BaseModel):
    """Computed technical indicators."""

    pair: str
    timestamp: datetime
    ema_9: float
    ema_21: float
    ema_55: float
    ema_200: float
    rsi_14: float
    macd: float
    macd_signal: float
    macd_histogram: float
    atr_20: float
    adx_14: float
    bb_upper: float
    bb_middle: float
    bb_lower: float
    bb_position: float
    volume_ratio: float
    regime: Regime
    spread_bps: float | None = None
    returns_1bar: float = 0.0
    returns_5bar: float = 0.0
    returns_20bar: float = 0.0


class SignalReport(BaseModel):
    """Output from a deterministic signal agent."""

    agent_name: str
    pair: str
    timestamp: datetime
    direction: Direction
    confidence: float = Field(ge=0.0, le=100.0)
    evidence: dict = Field(default_factory=dict)


class AnalystReport(BaseModel):
    """Typed output from the LLM analyst."""

    pair: str
    direction: Direction
    conviction: float = Field(ge=0.0, le=100.0)
    rationale: str
    key_risks: list[str] = Field(default_factory=list)
    regime_assessment: Regime


class RiskDecision(BaseModel):
    """Output from the deterministic risk governor."""

    approved: bool
    reason_codes: list[str] = Field(default_factory=list)
    final_side: Optional[Direction] = None
    final_size_usd: float = 0.0
    exposure_before: float = 0.0
    exposure_after: float = 0.0
    daily_pnl: float = 0.0
    drawdown_pct: float = 0.0
    kill_switch_active: bool = False


class TradeIntent(BaseModel):
    """Trade intent for dual execution."""

    intent_id: str
    pair: str
    side: Direction
    size_usd: float
    order_type: str = "limit"
    limit_price: Optional[float] = None
    signal_score: float = 0.0
    erc_eligible: bool = False
    atr_stop: Optional[float] = None
    atr_target: Optional[float] = None


class ExecutionReceipt(BaseModel):
    """Result from Kraken paper execution."""

    intent_id: str
    adapter: str
    status: str
    order_id: Optional[str] = None
    fill_price: Optional[float] = None
    fees_usd: float = 0.0
    raw_output: Optional[str] = None
    error: Optional[str] = None


class Portfolio(BaseModel):
    """Current portfolio state."""

    equity: float = 10000.0
    cash: float = 10000.0
    positions: dict = Field(default_factory=dict)
    daily_pnl: float = 0.0
    total_pnl: float = 0.0
    peak_equity: float = 10000.0
    drawdown_pct: float = 0.0
    consecutive_losses: int = 0
    trade_count: int = 0
    daily_trade_count: int = 0
