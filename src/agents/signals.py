"""Deterministic signal agents: Trend, Volatility, Spread/Cost, Mean-Reversion."""

from datetime import datetime

from src.config import RISK
from src.models import Direction, Features, Regime, SignalReport


def trend_signal(features: Features) -> SignalReport:
    """Trend signal agent requiring strong multi-timeframe alignment.

    Args:
        features: Computed technical features for a single bar.

    Returns:
        SignalReport with direction and confidence.
    """
    confidence = 0.0
    evidence = {}
    direction = Direction.HOLD

    full_bull = (
        features.ema_9 > features.ema_21 > features.ema_55 > features.ema_200
    )
    full_bear = (
        features.ema_9 < features.ema_21 < features.ema_55 < features.ema_200
    )
    partial_bull = (
        features.ema_9 > features.ema_21 > features.ema_55
    )
    partial_bear = (
        features.ema_9 < features.ema_21 < features.ema_55
    )

    if full_bull and features.adx_14 > 22:
        direction = Direction.LONG
        confidence += 40
        evidence["full_bull_alignment"] = True
    elif full_bear and features.adx_14 > 22:
        direction = Direction.SHORT
        confidence += 40
        evidence["full_bear_alignment"] = True
    elif partial_bull and features.adx_14 > 28:
        direction = Direction.LONG
        confidence += 25
        evidence["partial_bull_strong_adx"] = True
    elif partial_bear and features.adx_14 > 28:
        direction = Direction.SHORT
        confidence += 25
        evidence["partial_bear_strong_adx"] = True

    if direction == Direction.HOLD:
        return SignalReport(
            agent_name="trend",
            pair=features.pair,
            timestamp=features.timestamp,
            direction=Direction.HOLD,
            confidence=0.0,
            evidence=evidence,
        )

    if direction == Direction.LONG and features.macd_histogram > 0:
        confidence += 15
        if features.macd_slope > 0:
            confidence += 10
            evidence["macd_accelerating"] = True
    elif direction == Direction.SHORT and features.macd_histogram < 0:
        confidence += 15
        if features.macd_slope < 0:
            confidence += 10
            evidence["macd_accelerating"] = True

    if direction == Direction.LONG and features.returns_5bar > 0:
        confidence += 10
    elif direction == Direction.SHORT and features.returns_5bar < 0:
        confidence += 10

    if features.volume_ratio > 1.5:
        confidence += 10
        evidence["volume_confirmed"] = True

    if direction == Direction.LONG and features.engulfing == 1:
        confidence += 10
        evidence["bullish_engulfing"] = True
    elif direction == Direction.SHORT and features.engulfing == -1:
        confidence += 10
        evidence["bearish_engulfing"] = True

    if direction == Direction.LONG and features.rsi_14 > 78:
        confidence *= 0.4
        evidence["exhaustion"] = True
    elif direction == Direction.SHORT and features.rsi_14 < 22:
        confidence *= 0.4
        evidence["exhaustion"] = True

    confidence = min(100.0, confidence)

    if confidence < 35:
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

    if features.regime in (Regime.RANGING, Regime.TRANSITION):
        if features.rsi_14 < 40 and features.bb_position < 0.30:
            direction = Direction.LONG
            confidence += 25
            evidence["oversold_bounce"] = True
        elif features.rsi_14 > 60 and features.bb_position > 0.70:
            direction = Direction.SHORT
            confidence += 25
            evidence["overbought_fade"] = True

    if features.regime == Regime.TRENDING:
        if features.adx_14 > 25:
            ema_bull = features.ema_9 > features.ema_21 > features.ema_55
            ema_bear = features.ema_9 < features.ema_21 < features.ema_55
            if ema_bull:
                direction = Direction.LONG
                confidence += 20
                evidence["trend_confirmed_bull"] = True
            elif ema_bear:
                direction = Direction.SHORT
                confidence += 20
                evidence["trend_confirmed_bear"] = True
            else:
                confidence += 5
                evidence["weak_trend"] = True

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

    spread_ok = True
    if features.spread_bps is not None and features.spread_bps > RISK.min_spread_bps:
        spread_ok = False
    evidence["spread_ok"] = spread_ok
    evidence["spread_bps"] = features.spread_bps

    if not spread_ok:
        confidence = 0.0
        evidence["spread_too_wide"] = True

    atr_bps = (features.atr_20 / features.ema_21) * 10000 if features.ema_21 > 0 else 0
    min_edge = RISK.real_cost_bps * RISK.required_edge_multiplier
    edge_sufficient = atr_bps > min_edge
    evidence["expected_move_bps"] = round(atr_bps, 2)
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


def mean_reversion_signal(features: Features) -> SignalReport:
    """Mean-reversion signal agent. Active primarily in ranging regime.

    Uses Bollinger Band position and RSI to detect oversold/overbought
    conditions suitable for mean-reversion trades.

    Args:
        features: Computed technical features for a single bar.

    Returns:
        SignalReport with direction and confidence.
    """
    confidence = 0.0
    evidence = {}
    direction = Direction.HOLD

    evidence["regime"] = features.regime.value
    evidence["bb_position"] = round(features.bb_position, 4)
    evidence["rsi_14"] = round(features.rsi_14, 2)

    if features.regime == Regime.TRENDING and features.adx_14 > 30:
        evidence["inactive"] = True
        return SignalReport(
            agent_name="mean_reversion",
            pair=features.pair,
            timestamp=features.timestamp,
            direction=Direction.HOLD,
            confidence=0.0,
            evidence=evidence,
        )

    if features.bb_position < 0.25 and features.rsi_14 < 40:
        direction = Direction.LONG
        confidence += 30
        evidence["oversold"] = True

        if features.bb_position < 0.10:
            confidence += 20
            evidence["extreme_oversold"] = True
        elif features.bb_position < 0.15:
            confidence += 10
        if features.rsi_14 < 28:
            confidence += 15
            evidence["deep_rsi_oversold"] = True
        elif features.rsi_14 < 35:
            confidence += 8

    elif features.bb_position > 0.75 and features.rsi_14 > 60:
        direction = Direction.SHORT
        confidence += 30
        evidence["overbought"] = True

        if features.bb_position > 0.90:
            confidence += 20
            evidence["extreme_overbought"] = True
        elif features.bb_position > 0.85:
            confidence += 10
        if features.rsi_14 > 72:
            confidence += 15
            evidence["deep_rsi_overbought"] = True
        elif features.rsi_14 > 65:
            confidence += 8

    if direction != Direction.HOLD:
        if features.volume_ratio > 1.5:
            confidence += 10
            evidence["capitulation_volume"] = True
        elif features.volume_ratio < 0.5:
            confidence *= 0.7
            evidence["low_volume_warning"] = True

    confidence = max(0.0, min(100.0, confidence))

    if confidence < 25:
        direction = Direction.HOLD

    return SignalReport(
        agent_name="mean_reversion",
        pair=features.pair,
        timestamp=features.timestamp,
        direction=direction,
        confidence=confidence,
        evidence=evidence,
    )


def momentum_signal(features: Features) -> SignalReport:
    """Momentum signal requiring multi-timeframe alignment.

    Args:
        features: Computed technical features for a single bar.

    Returns:
        SignalReport with direction and confidence.
    """
    confidence = 0.0
    evidence = {}
    direction = Direction.HOLD

    r1 = features.returns_1bar
    r5 = features.returns_5bar
    r20 = features.returns_20bar

    all_bull = r1 > 0 and r5 > 0 and r20 > 0
    all_bear = r1 < 0 and r5 < 0 and r20 < 0
    evidence["all_bull"] = all_bull
    evidence["all_bear"] = all_bear

    if all_bull and features.adx_14 > 20:
        direction = Direction.LONG
        confidence += 35
    elif all_bear and features.adx_14 > 20:
        direction = Direction.SHORT
        confidence += 35
    elif r5 > 0 and r20 > 0 and features.adx_14 > 25:
        direction = Direction.LONG
        confidence += 20
    elif r5 < 0 and r20 < 0 and features.adx_14 > 25:
        direction = Direction.SHORT
        confidence += 20

    if direction == Direction.HOLD:
        return SignalReport(
            agent_name="momentum",
            pair=features.pair,
            timestamp=features.timestamp,
            direction=Direction.HOLD,
            confidence=0.0,
            evidence=evidence,
        )

    if direction == Direction.LONG and features.macd_histogram > 0:
        confidence += 15
        if features.macd_slope > 0:
            confidence += 10
    elif direction == Direction.SHORT and features.macd_histogram < 0:
        confidence += 15
        if features.macd_slope < 0:
            confidence += 10

    if features.volume_ratio > 1.3:
        confidence += 10

    if features.adx_14 > 30:
        confidence += 10
        evidence["very_strong_trend"] = True

    if direction == Direction.LONG and features.rsi_14 > 78:
        confidence *= 0.4
    elif direction == Direction.SHORT and features.rsi_14 < 22:
        confidence *= 0.4

    confidence = min(100.0, confidence)

    if confidence < 25:
        direction = Direction.HOLD

    return SignalReport(
        agent_name="momentum",
        pair=features.pair,
        timestamp=features.timestamp,
        direction=direction,
        confidence=confidence,
        evidence=evidence,
    )


def swing_structure_signal(features: Features) -> SignalReport:
    """Price action swing structure agent requiring full alignment.

    Args:
        features: Computed technical features for a single bar.

    Returns:
        SignalReport with direction and confidence.
    """
    confidence = 0.0
    evidence = {}
    direction = Direction.HOLD

    ema_bull = features.ema_9 > features.ema_21 > features.ema_55 > features.ema_200
    ema_bear = features.ema_9 < features.ema_21 < features.ema_55 < features.ema_200

    if ema_bull and features.returns_5bar > 0 and features.returns_20bar > 0:
        direction = Direction.LONG
        confidence += 40
        evidence["full_bull_structure"] = True

        if features.macd_histogram > 0 and features.macd_slope > 0:
            confidence += 15
            evidence["macd_confirms"] = True
        if features.adx_14 > 25:
            confidence += 10
        if features.volume_ratio > 1.2:
            confidence += 10

    elif ema_bear and features.returns_5bar < 0 and features.returns_20bar < 0:
        direction = Direction.SHORT
        confidence += 40
        evidence["full_bear_structure"] = True

        if features.macd_histogram < 0 and features.macd_slope < 0:
            confidence += 15
            evidence["macd_confirms"] = True
        if features.adx_14 > 25:
            confidence += 10
        if features.volume_ratio > 1.2:
            confidence += 10

    if direction == Direction.LONG and features.rsi_14 > 80:
        confidence *= 0.3
    elif direction == Direction.SHORT and features.rsi_14 < 20:
        confidence *= 0.3

    confidence = min(100.0, confidence)

    if confidence < 30:
        direction = Direction.HOLD

    return SignalReport(
        agent_name="swing",
        pair=features.pair,
        timestamp=features.timestamp,
        direction=direction,
        confidence=confidence,
        evidence=evidence,
    )
