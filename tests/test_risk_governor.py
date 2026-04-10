"""Tests for the deterministic risk governor."""

from datetime import datetime, timezone

import pytest

from src.agents.risk_governor import evaluate_risk
from src.models import (
    AnalystReport,
    Direction,
    Features,
    Portfolio,
    Regime,
    SignalReport,
)


def _make_features(**overrides) -> Features:
    defaults = dict(
        pair="BTCUSD",
        timestamp=datetime.now(timezone.utc),
        ema_9=68000.0,
        ema_21=67500.0,
        ema_55=67000.0,
        ema_200=65000.0,
        rsi_14=55.0,
        macd=100.0,
        macd_signal=80.0,
        macd_histogram=20.0,
        atr_20=500.0,
        adx_14=30.0,
        bb_upper=69000.0,
        bb_middle=68000.0,
        bb_lower=67000.0,
        bb_position=0.5,
        volume_ratio=1.2,
        regime=Regime.TRENDING,
    )
    defaults.update(overrides)
    return Features(**defaults)


def _make_signal(name: str, direction: Direction, confidence: float) -> SignalReport:
    return SignalReport(
        agent_name=name,
        pair="BTCUSD",
        timestamp=datetime.now(timezone.utc),
        direction=direction,
        confidence=confidence,
    )


def _make_analyst(direction: Direction, conviction: float) -> AnalystReport:
    return AnalystReport(
        pair="BTCUSD",
        direction=direction,
        conviction=conviction,
        rationale="Test",
        regime_assessment=Regime.TRENDING,
    )


def test_kill_switch_blocks_trade():
    signals = [_make_signal("t", Direction.LONG, 90)]
    analyst = _make_analyst(Direction.LONG, 90)
    features = _make_features()
    portfolio = Portfolio()

    decision, intent = evaluate_risk(
        signals, analyst, features, portfolio, kill_switch=True
    )
    assert not decision.approved
    assert "KILL_SWITCH" in decision.reason_codes
    assert intent is None


def test_stale_data_blocks_trade():
    signals = [_make_signal("t", Direction.LONG, 90)]
    analyst = _make_analyst(Direction.LONG, 90)
    features = _make_features()
    portfolio = Portfolio()

    decision, intent = evaluate_risk(
        signals, analyst, features, portfolio, snapshot_age_seconds=8000
    )
    assert not decision.approved
    assert "STALE_DATA" in decision.reason_codes


def test_drawdown_blocks_trade():
    signals = [_make_signal("t", Direction.LONG, 90)]
    analyst = _make_analyst(Direction.LONG, 90)
    features = _make_features()
    portfolio = Portfolio(equity=9000.0, peak_equity=10000.0)

    decision, intent = evaluate_risk(signals, analyst, features, portfolio)
    assert not decision.approved
    assert "MAX_DRAWDOWN" in decision.reason_codes


def test_no_signal_blocks_trade():
    signals = [_make_signal("t", Direction.HOLD, 10)]
    analyst = _make_analyst(Direction.HOLD, 10)
    features = _make_features()
    portfolio = Portfolio()

    decision, intent = evaluate_risk(signals, analyst, features, portfolio)
    assert not decision.approved
    assert "NO_SIGNAL" in decision.reason_codes


def test_consensus_approves_trade():
    signals = [
        _make_signal("trend", Direction.LONG, 85),
        _make_signal("vol", Direction.LONG, 80),
        _make_signal("momentum", Direction.LONG, 75),
        _make_signal("spread", Direction.HOLD, 50),
    ]
    analyst = _make_analyst(Direction.LONG, 85)
    features = _make_features()
    portfolio = Portfolio()

    decision, intent = evaluate_risk(signals, analyst, features, portfolio)
    assert decision.approved
    assert intent is not None
    assert intent.side == Direction.LONG
    assert intent.size_usd > 0


def test_two_aligned_signals_insufficient():
    """Two aligned signals should be rejected (minimum is 3)."""
    signals = [
        _make_signal("trend", Direction.LONG, 90),
        _make_signal("vol", Direction.LONG, 85),
        _make_signal("spread", Direction.HOLD, 50),
    ]
    analyst = _make_analyst(Direction.LONG, 90)
    features = _make_features()
    portfolio = Portfolio()

    decision, intent = evaluate_risk(signals, analyst, features, portfolio)
    assert not decision.approved
    assert "INSUFFICIENT_ALIGNMENT" in decision.reason_codes


def test_below_threshold_blocks():
    signals = [
        _make_signal("trend", Direction.LONG, 40),
        _make_signal("vol", Direction.LONG, 30),
        _make_signal("momentum", Direction.LONG, 25),
        _make_signal("spread", Direction.HOLD, 20),
    ]
    analyst = _make_analyst(Direction.LONG, 40)
    features = _make_features()
    portfolio = Portfolio()

    decision, intent = evaluate_risk(signals, analyst, features, portfolio)
    assert not decision.approved
    assert "BELOW_THRESHOLD" in decision.reason_codes
