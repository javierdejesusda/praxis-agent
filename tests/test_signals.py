"""Tests for deterministic signal agents."""

from datetime import datetime, timezone

from src.agents.signals import (
    mean_reversion_signal,
    momentum_signal,
    spread_cost_signal,
    trend_signal,
    volatility_signal,
)
from src.models import Direction, Features, Regime


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
        returns_1bar=0.005,
        returns_5bar=0.015,
        returns_20bar=0.03,
    )
    defaults.update(overrides)
    return Features(**defaults)


def test_mean_reversion_inactive_in_trending():
    """Mean-reversion should be inactive when regime is TRENDING."""
    features = _make_features(regime=Regime.TRENDING, bb_position=0.05, rsi_14=25)
    report = mean_reversion_signal(features)
    assert report.direction == Direction.HOLD
    assert report.confidence == 0.0
    assert report.evidence.get("inactive") is True


def test_mean_reversion_long_oversold():
    """Mean-reversion should go LONG on oversold conditions in ranging regime."""
    features = _make_features(
        regime=Regime.RANGING,
        adx_14=15.0,
        bb_position=0.08,
        rsi_14=28,
        volume_ratio=0.8,
    )
    report = mean_reversion_signal(features)
    assert report.direction == Direction.LONG
    assert report.confidence >= 30
    assert report.evidence.get("oversold") is True


def test_mean_reversion_short_overbought():
    """Mean-reversion should go SHORT on overbought conditions in ranging regime."""
    features = _make_features(
        regime=Regime.RANGING,
        adx_14=15.0,
        bb_position=0.92,
        rsi_14=72,
        volume_ratio=0.9,
    )
    report = mean_reversion_signal(features)
    assert report.direction == Direction.SHORT
    assert report.confidence >= 30
    assert report.evidence.get("overbought") is True


def test_mean_reversion_extreme_oversold():
    """Extreme oversold should get extra confidence."""
    features = _make_features(
        regime=Regime.RANGING,
        adx_14=15.0,
        bb_position=0.03,
        rsi_14=22,
        volume_ratio=0.7,
    )
    report = mean_reversion_signal(features)
    assert report.direction == Direction.LONG
    assert report.confidence >= 55
    assert report.evidence.get("extreme_oversold") is True
    assert report.evidence.get("deep_rsi_oversold") is True


def test_mean_reversion_hold_in_neutral():
    """No signal when BB and RSI are in neutral territory."""
    features = _make_features(
        regime=Regime.RANGING,
        adx_14=15.0,
        bb_position=0.5,
        rsi_14=50,
    )
    report = mean_reversion_signal(features)
    assert report.direction == Direction.HOLD
    assert report.confidence == 0.0


def test_mean_reversion_high_volume_penalty():
    """High volume should penalize mean-reversion confidence."""
    features = _make_features(
        regime=Regime.RANGING,
        adx_14=15.0,
        bb_position=0.03,
        rsi_14=22,
        volume_ratio=2.5,
    )
    report = mean_reversion_signal(features)
    assert report.evidence.get("high_vol_warning") is True
    base_features = _make_features(
        regime=Regime.RANGING,
        adx_14=15.0,
        bb_position=0.03,
        rsi_14=22,
        volume_ratio=0.8,
    )
    base_report = mean_reversion_signal(base_features)
    assert report.confidence < base_report.confidence


def test_trend_signal_ema_aligned_bull():
    """Trend agent should detect bullish EMA alignment."""
    features = _make_features(
        ema_9=68500.0, ema_21=68000.0, ema_55=67000.0,
        regime=Regime.TRENDING,
        macd_histogram=50.0,
        returns_5bar=0.02,
        volume_ratio=1.8,
    )
    report = trend_signal(features)
    assert report.direction == Direction.LONG
    assert report.confidence > 50


def test_volatility_signal_shock():
    """Volatility agent should reduce confidence on high ATR."""
    features = _make_features(atr_20=4000.0, ema_21=67500.0)
    report = volatility_signal(features)
    assert report.evidence.get("shock_warning") is True
    normal = _make_features(atr_20=500.0, ema_21=67500.0)
    normal_report = volatility_signal(normal)
    assert report.confidence < normal_report.confidence


def test_trend_bullish_divergence_boost():
    """Trend agent should get a confidence boost on bullish RSI divergence."""
    base = _make_features(
        ema_9=68500.0, ema_21=68000.0, ema_55=67000.0,
        regime=Regime.TRENDING,
        macd_histogram=50.0,
        returns_5bar=0.005,
        volume_ratio=1.0,
        rsi_divergence=0,
    )
    with_div = _make_features(
        ema_9=68500.0, ema_21=68000.0, ema_55=67000.0,
        regime=Regime.TRENDING,
        macd_histogram=50.0,
        returns_5bar=0.005,
        volume_ratio=1.0,
        rsi_divergence=1,
    )
    base_report = trend_signal(base)
    div_report = trend_signal(with_div)
    assert div_report.confidence > base_report.confidence
    assert div_report.evidence.get("rsi_divergence_bull") is True


def test_momentum_adaptive_threshold():
    """Momentum agent should use ATR-adaptive threshold."""
    features = _make_features(
        atr_20=200.0, ema_21=67500.0,
        returns_5bar=0.002, returns_1bar=0.001, returns_20bar=0.005,
        macd_histogram=10.0, adx_14=30.0, volume_ratio=1.5,
        regime=Regime.TRENDING,
    )
    report = momentum_signal(features)
    assert "adaptive_threshold" in report.evidence


def test_mean_reversion_active_in_transition():
    """Mean-reversion should fire in TRANSITION regime with reduced confidence."""
    ranging = _make_features(
        regime=Regime.RANGING, adx_14=18.0,
        bb_position=0.05, rsi_14=22, volume_ratio=0.7,
    )
    transition = _make_features(
        regime=Regime.TRANSITION, adx_14=22.0,
        bb_position=0.05, rsi_14=22, volume_ratio=0.7,
    )
    ranging_report = mean_reversion_signal(ranging)
    transition_report = mean_reversion_signal(transition)
    assert transition_report.direction == Direction.LONG
    assert transition_report.confidence > 0
    assert transition_report.confidence < ranging_report.confidence
    assert transition_report.evidence.get("transition_discount") is True
