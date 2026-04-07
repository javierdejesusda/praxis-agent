"""Deterministic signal agents: Trend, Volatility, Spread/Cost, Mean-Reversion."""

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
        confidence += 30
        direction = Direction.LONG
    elif ema_aligned_bear:
        confidence += 30
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

    if direction == Direction.LONG and features.ema_9 > features.ema_200:
        confidence += 10
        evidence["above_ema200"] = True
    elif direction == Direction.SHORT and features.ema_9 < features.ema_200:
        confidence += 10
        evidence["below_ema200"] = True

    if features.regime == Regime.TRENDING:
        confidence *= 1.2
    elif features.regime == Regime.RANGING:
        confidence *= 0.7

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
        if features.rsi_14 < 35 and features.bb_position < 0.2:
            direction = Direction.LONG
            confidence += 25
            evidence["oversold_bounce"] = True
        elif features.rsi_14 > 65 and features.bb_position > 0.8:
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

    if features.regime != Regime.RANGING:
        evidence["inactive"] = True
        return SignalReport(
            agent_name="mean_reversion",
            pair=features.pair,
            timestamp=features.timestamp,
            direction=Direction.HOLD,
            confidence=0.0,
            evidence=evidence,
        )

    bb_dist_lower = features.bb_position
    bb_dist_upper = 1.0 - features.bb_position

    if features.bb_position < 0.15 and features.rsi_14 < 35:
        direction = Direction.LONG
        confidence += 30
        evidence["oversold"] = True

        if features.bb_position < 0.05:
            confidence += 15
            evidence["extreme_oversold"] = True
        if features.rsi_14 < 25:
            confidence += 10
            evidence["deep_rsi_oversold"] = True

    elif features.bb_position > 0.85 and features.rsi_14 > 65:
        direction = Direction.SHORT
        confidence += 30
        evidence["overbought"] = True

        if features.bb_position > 0.95:
            confidence += 15
            evidence["extreme_overbought"] = True
        if features.rsi_14 > 75:
            confidence += 10
            evidence["deep_rsi_overbought"] = True

    if direction != Direction.HOLD:
        if features.volume_ratio < 1.0:
            confidence += 10
            evidence["low_vol_favorable"] = True
        elif features.volume_ratio > 2.0:
            confidence *= 0.6
            evidence["high_vol_warning"] = True

        reversion_target = abs(features.ema_21 - features.bb_middle)
        if features.ema_21 > 0:
            reversion_pct = reversion_target / features.ema_21
            if reversion_pct < 0.001:
                confidence += 5
                evidence["tight_bands"] = True

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
