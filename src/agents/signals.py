"""Deterministic signal agents: Trend, Volatility, Spread/Cost."""

from datetime import datetime

from src.config import RISK
from src.models import Direction, Features, Regime, SignalReport


def trend_signal(features: Features) -> SignalReport:
    """Momentum/trend signal agent. Active primarily in trending regime.

    Args:
        features: Computed technical features for a single bar.

    Returns:
        SignalReport with direction and confidence.
    """
    confidence = 0.0
    evidence = {}
    direction = Direction.HOLD

    ema_aligned_bull = (
        features.ema_9 > features.ema_21 > features.ema_55
    )
    ema_aligned_bear = (
        features.ema_9 < features.ema_21 < features.ema_55
    )
    evidence["ema_aligned_bull"] = ema_aligned_bull
    evidence["ema_aligned_bear"] = ema_aligned_bear

    if ema_aligned_bull:
        confidence += 25
        direction = Direction.LONG
    elif ema_aligned_bear:
        confidence += 25
        direction = Direction.SHORT

    if features.macd_histogram > 0 and direction == Direction.LONG:
        confidence += 20
        evidence["macd_bullish"] = True
    elif features.macd_histogram < 0 and direction == Direction.SHORT:
        confidence += 20
        evidence["macd_bearish"] = True

    if features.returns_5bar > 0.01 and direction == Direction.LONG:
        confidence += 15
    elif features.returns_5bar < -0.01 and direction == Direction.SHORT:
        confidence += 15
    evidence["returns_5bar"] = features.returns_5bar

    if features.volume_ratio > 1.5:
        confidence += 10
        evidence["volume_confirmed"] = True

    if features.regime == Regime.TRENDING:
        confidence *= 1.2
    elif features.regime == Regime.RANGING:
        confidence *= 0.5

    confidence = min(100.0, confidence)

    if confidence < 30:
        direction = Direction.HOLD

    return SignalReport(
        agent_name="trend",
        pair=features.pair,
        timestamp=features.timestamp,
        direction=direction,
        confidence=confidence,
        evidence=evidence,
    )


def volatility_signal(features: Features) -> SignalReport:
    """Volatility regime and shock detection agent.

    Args:
        features: Computed technical features for a single bar.

    Returns:
        SignalReport. Direction is HOLD if volatility conditions are unfavorable.
    """
    confidence = 50.0
    evidence = {}
    direction = Direction.HOLD

    atr_pct = (features.atr_20 / features.ema_21) * 100 if features.ema_21 > 0 else 0
    evidence["atr_pct"] = round(atr_pct, 4)

    if atr_pct > 5.0:
        confidence -= 30
        evidence["shock_warning"] = True
    elif atr_pct > 3.0:
        confidence -= 10
        evidence["elevated_volatility"] = True

    evidence["adx"] = features.adx_14
    evidence["regime"] = features.regime.value

    if features.regime == Regime.RANGING:
        if features.rsi_14 < 30 and features.bb_position < 0.1:
            direction = Direction.LONG
            confidence += 25
            evidence["oversold_bounce"] = True
        elif features.rsi_14 > 70 and features.bb_position > 0.9:
            direction = Direction.SHORT
            confidence += 25
            evidence["overbought_fade"] = True

    if features.regime == Regime.TRENDING:
        if features.adx_14 > 30:
            confidence += 15
            evidence["strong_trend"] = True

    confidence = max(0.0, min(100.0, confidence))

    return SignalReport(
        agent_name="volatility",
        pair=features.pair,
        timestamp=features.timestamp,
        direction=direction,
        confidence=confidence,
        evidence=evidence,
    )


def spread_cost_signal(features: Features) -> SignalReport:
    """Spread and cost gating agent.

    Args:
        features: Computed technical features.

    Returns:
        SignalReport. Confidence drops if spread/cost conditions are bad.
    """
    confidence = 50.0
    evidence = {}
    direction = Direction.HOLD

    spread_ok = (
        features.spread_bps is not None
        and features.spread_bps <= RISK.min_spread_bps
    ) if hasattr(features, "spread_bps") and features.spread_bps else True
    evidence["spread_ok"] = spread_ok

    if not spread_ok:
        confidence = 0.0
        evidence["spread_too_wide"] = True

    expected_move_bps = abs(features.returns_1bar) * 10000
    min_edge = RISK.real_cost_bps * RISK.required_edge_multiplier
    edge_sufficient = expected_move_bps > min_edge
    evidence["expected_move_bps"] = round(expected_move_bps, 2)
    evidence["min_edge_bps"] = min_edge
    evidence["edge_sufficient"] = edge_sufficient

    if not edge_sufficient:
        confidence *= 0.3

    if features.volume_ratio < 0.5:
        confidence *= 0.5
        evidence["low_volume_warning"] = True

    confidence = max(0.0, min(100.0, confidence))

    return SignalReport(
        agent_name="spread_cost",
        pair=features.pair,
        timestamp=features.timestamp,
        direction=direction,
        confidence=confidence,
        evidence=evidence,
    )
