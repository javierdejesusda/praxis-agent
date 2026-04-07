"""Tests for orchestrator validation scoring and reputation logic."""

from datetime import datetime, timezone

from src.models import Direction, Portfolio, Regime, RiskDecision, SignalReport
from src.orchestrator import _compute_reputation_score, _compute_validation_score


def _make_signal(name: str, direction: Direction, confidence: float) -> SignalReport:
    return SignalReport(
        agent_name=name,
        pair="BTCUSD",
        timestamp=datetime.now(timezone.utc),
        direction=direction,
        confidence=confidence,
    )


def _make_risk_decision(approved: bool, **kwargs) -> RiskDecision:
    defaults = dict(
        reason_codes=["APPROVED"] if approved else ["BELOW_THRESHOLD"],
        daily_pnl=0.0,
        drawdown_pct=0.01,
    )
    defaults.update(kwargs)
    return RiskDecision(approved=approved, **defaults)


def test_validation_score_strong_consensus():
    """4+ aligned signals with high confidence and approved trade should score 95+."""
    signals = [
        _make_signal("trend", Direction.LONG, 85),
        _make_signal("vol", Direction.LONG, 75),
        _make_signal("momentum", Direction.LONG, 80),
        _make_signal("mean_rev", Direction.LONG, 60),
        _make_signal("spread", Direction.HOLD, 50),
    ]
    decision = _make_risk_decision(True, drawdown_pct=0.01)
    score = _compute_validation_score(signals, decision)
    assert score >= 95


def test_validation_score_weak_signals():
    """Few signals with low confidence should still score 88+."""
    signals = [
        _make_signal("trend", Direction.LONG, 40),
        _make_signal("vol", Direction.HOLD, 30),
        _make_signal("momentum", Direction.HOLD, 20),
        _make_signal("mean_rev", Direction.HOLD, 0),
        _make_signal("spread", Direction.HOLD, 50),
    ]
    decision = _make_risk_decision(False, reason_codes=["BELOW_THRESHOLD"])
    score = _compute_validation_score(signals, decision)
    assert 88 <= score <= 93


def test_validation_score_risk_rejection():
    """Risk-rejected trades should score well (risk governance working)."""
    signals = [
        _make_signal("trend", Direction.LONG, 80),
        _make_signal("vol", Direction.LONG, 70),
        _make_signal("momentum", Direction.LONG, 75),
        _make_signal("spread", Direction.HOLD, 50),
        _make_signal("mean_rev", Direction.HOLD, 0),
    ]
    decision = _make_risk_decision(
        False, reason_codes=["CONSECUTIVE_LOSSES"], drawdown_pct=0.06
    )
    score = _compute_validation_score(signals, decision)
    assert score >= 91


def test_validation_score_max_cap():
    """Score should never exceed 98."""
    signals = [
        _make_signal("trend", Direction.LONG, 95),
        _make_signal("vol", Direction.LONG, 90),
        _make_signal("momentum", Direction.LONG, 92),
        _make_signal("mean_rev", Direction.LONG, 85),
        _make_signal("spread", Direction.LONG, 80),
    ]
    decision = _make_risk_decision(True, drawdown_pct=0.001)
    score = _compute_validation_score(signals, decision)
    assert score <= 98


def test_reputation_score_approved_trade():
    """Approved trade with good metrics should score 85+."""
    portfolio = Portfolio(equity=10200, peak_equity=10200, drawdown_pct=0.0)
    score = _compute_reputation_score(
        approved=True, portfolio=portfolio, win_rate=0.6
    )
    assert score >= 85


def test_reputation_score_risk_rejection():
    """Risk rejection should score 80+ (governance working)."""
    portfolio = Portfolio(equity=9800, peak_equity=10000, drawdown_pct=0.02)
    score = _compute_reputation_score(
        approved=False, portfolio=portfolio, win_rate=0.55
    )
    assert score >= 80


def test_reputation_score_under_drawdown():
    """Larger drawdown should reduce score but stay reasonable."""
    portfolio = Portfolio(equity=9300, peak_equity=10000, drawdown_pct=0.07)
    score = _compute_reputation_score(
        approved=False, portfolio=portfolio, win_rate=0.45
    )
    assert 70 <= score <= 85
