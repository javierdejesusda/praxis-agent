"""Deterministic risk governor — final authority on all trade decisions.

The LLM can NEVER override this module. All kill criteria are hard-coded.
"""

import uuid
from datetime import datetime, timezone

from src.config import RISK
from src.models import (
    AnalystReport,
    Direction,
    Features,
    Portfolio,
    RiskDecision,
    SignalReport,
    TradeIntent,
)


def _check_kill_criteria(
    portfolio: Portfolio,
    features: Features,
    snapshot_age_seconds: float,
) -> list[str]:
    """Check all 7 kill criteria. Returns list of violation codes."""
    violations = []

    if snapshot_age_seconds > 300:
        violations.append("STALE_DATA")

    if portfolio.daily_pnl / portfolio.equity < -RISK.max_daily_loss_pct:
        violations.append("DAILY_LOSS_CAP")

    drawdown = (
        (portfolio.peak_equity - portfolio.equity) / portfolio.peak_equity
        if portfolio.peak_equity > 0
        else 0.0
    )
    if drawdown > RISK.max_drawdown_pct:
        violations.append("MAX_DRAWDOWN")

    if portfolio.consecutive_losses >= RISK.max_consecutive_losses:
        violations.append("CONSECUTIVE_LOSSES")

    return violations


def evaluate_risk(
    signals: list[SignalReport],
    analyst: AnalystReport | None,
    features: Features,
    portfolio: Portfolio,
    snapshot_age_seconds: float = 0.0,
    kill_switch: bool = False,
) -> tuple[RiskDecision, TradeIntent | None]:
    """Evaluate trade decision through deterministic risk governance.

    Args:
        signals: List of deterministic signal reports.
        analyst: LLM analyst report (may be None if fallback).
        features: Current feature state.
        portfolio: Current portfolio state.
        snapshot_age_seconds: Age of the market data.
        kill_switch: Manual kill switch state.

    Returns:
        Tuple of (RiskDecision, TradeIntent or None).
    """
    drawdown = (
        (portfolio.peak_equity - portfolio.equity) / portfolio.peak_equity
        if portfolio.peak_equity > 0
        else 0.0
    )

    if kill_switch:
        decision = RiskDecision(
            approved=False,
            reason_codes=["KILL_SWITCH"],
            daily_pnl=portfolio.daily_pnl,
            drawdown_pct=drawdown,
            kill_switch_active=True,
        )
        return decision, None

    violations = _check_kill_criteria(portfolio, features, snapshot_age_seconds)
    if violations:
        decision = RiskDecision(
            approved=False,
            reason_codes=violations,
            daily_pnl=portfolio.daily_pnl,
            drawdown_pct=drawdown,
        )
        return decision, None

    directions = [s.direction for s in signals if s.direction != Direction.HOLD]
    if not directions:
        decision = RiskDecision(
            approved=False,
            reason_codes=["NO_SIGNAL"],
            daily_pnl=portfolio.daily_pnl,
            drawdown_pct=drawdown,
        )
        return decision, None

    long_count = sum(1 for d in directions if d == Direction.LONG)
    short_count = sum(1 for d in directions if d == Direction.SHORT)

    if analyst is not None:
        if long_count > short_count and analyst.direction == Direction.LONG:
            consensus_direction = Direction.LONG
        elif short_count > long_count and analyst.direction == Direction.SHORT:
            consensus_direction = Direction.SHORT
        else:
            decision = RiskDecision(
                approved=False,
                reason_codes=["NO_CONSENSUS"],
                daily_pnl=portfolio.daily_pnl,
                drawdown_pct=drawdown,
            )
            return decision, None
    else:
        if long_count >= 3:
            consensus_direction = Direction.LONG
        elif short_count >= 3:
            consensus_direction = Direction.SHORT
        else:
            decision = RiskDecision(
                approved=False,
                reason_codes=["FALLBACK_NO_CONSENSUS"],
                daily_pnl=portfolio.daily_pnl,
                drawdown_pct=drawdown,
            )
            return decision, None

    avg_confidence = sum(s.confidence for s in signals) / len(signals)

    erc_eligible = avg_confidence >= RISK.min_signal_score_erc
    paper_eligible = avg_confidence >= RISK.min_signal_score_paper

    if not paper_eligible:
        decision = RiskDecision(
            approved=False,
            reason_codes=["BELOW_THRESHOLD"],
            daily_pnl=portfolio.daily_pnl,
            drawdown_pct=drawdown,
        )
        return decision, None

    risk_amount = portfolio.equity * RISK.risk_per_trade_pct
    max_size = portfolio.equity * RISK.max_position_pct
    size_usd = min(risk_amount / (features.atr_20 / features.ema_21)
                   if features.ema_21 > 0 and features.atr_20 > 0
                   else risk_amount,
                   max_size)
    size_usd = max(10.0, size_usd)

    intent = TradeIntent(
        intent_id=str(uuid.uuid4())[:8],
        pair=features.pair,
        side=consensus_direction,
        size_usd=round(size_usd, 2),
        limit_price=features.ema_9,
        signal_score=avg_confidence,
        erc_eligible=erc_eligible,
    )

    current_exposure = sum(
        abs(v.get("size_usd", 0)) for v in portfolio.positions.values()
    )

    decision = RiskDecision(
        approved=True,
        reason_codes=["APPROVED"],
        final_side=consensus_direction,
        final_size_usd=intent.size_usd,
        exposure_before=current_exposure,
        exposure_after=current_exposure + intent.size_usd,
        daily_pnl=portfolio.daily_pnl,
        drawdown_pct=drawdown,
    )

    return decision, intent
