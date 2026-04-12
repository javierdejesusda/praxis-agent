"""Deterministic risk governor — final authority on all trade decisions.

The LLM can NEVER override this module. All kill criteria are hard-coded.
"""

import uuid
from datetime import datetime, timezone

from src.config import RISK, STRATEGY

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
    """Check all kill criteria. Returns list of violation codes."""
    violations = []

    if snapshot_age_seconds > STRATEGY.stale_data_seconds:
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

    if features.spread_bps is not None and features.spread_bps > RISK.min_spread_bps:
        violations.append("SPREAD_TOO_WIDE")

    if features.ema_21 > 0:
        atr_pct = (features.atr_20 / features.ema_21) * 100
        if atr_pct > 6.0:
            violations.append("VOLATILITY_SHOCK")

    return violations


def _estimate_win_loss_ratio(
    portfolio: Portfolio,
    pair: str,
    prior_b: float = 1.5,
    prior_n: int = 30,
) -> float:
    """Estimate the average win/loss ratio (b) from recent closed trades.

    Pulls the trailing ``prior_n`` closed trades for ``pair`` from
    ``portfolio.closed_trades`` (if present) and computes the ratio of the
    mean winning trade percent to the mean losing trade percent. The result
    is blended with a conservative prior of ``prior_b`` using a linear weight
    that grows with the number of observed trades, so thin histories remain
    anchored to the prior.

    Args:
        portfolio: Current portfolio state. May or may not expose a
            ``closed_trades`` iterable of trade records with ``pair`` and
            ``pnl_pct`` attributes.
        pair: Trading pair to filter trade history by (e.g. ``"BTCUSD"``).
        prior_b: Prior average win/loss ratio used when history is missing
            or too thin. Defaults to ``1.5``.
        prior_n: Number of trailing trades to consider and the denominator
            for the blending weight. Defaults to ``30``.

    Returns:
        Blended win/loss ratio clipped to the range ``[0.5, 10.0]``. Returns
        ``prior_b`` when ``portfolio.closed_trades`` is missing, empty, or
        contains fewer than 5 qualifying trades for ``pair``, or when the
        window lacks either wins or losses.
    """
    closed_trades = getattr(portfolio, "closed_trades", []) or []
    pair_trades = [
        t for t in closed_trades if getattr(t, "pair", None) == pair
    ][-prior_n:]

    wins = [t.pnl_pct for t in pair_trades if t.pnl_pct > 0]
    losses = [abs(t.pnl_pct) for t in pair_trades if t.pnl_pct < 0]

    if len(pair_trades) < 5 or not wins or not losses:
        return prior_b

    empirical_b = (sum(wins) / len(wins)) / (sum(losses) / len(losses))
    empirical_b = max(0.5, min(10.0, empirical_b))

    weight = min(1.0, len(pair_trades) / prior_n)
    return weight * empirical_b + (1 - weight) * prior_b


def _compute_kelly(
    portfolio: Portfolio,
    signal_confidence: float,
    pair: str | None = None,
) -> float:
    """Compute half-Kelly position fraction from trade history and signal quality.

    Uses signal confidence as a proxy for win probability when trade history
    is insufficient (< 10 trades). With enough history, blends historical
    win rate with signal confidence. When ``pair`` is provided, the average
    win/loss ratio is estimated empirically from the trailing closed trades
    on that pair and blended with a ``1.5`` prior; otherwise the legacy
    hardcoded ``1.5`` is used for backward compatibility.

    Args:
        portfolio: Current portfolio with trade count and PnL.
        signal_confidence: Average aligned signal confidence (0-100).
        pair: Optional trading pair whose closed trade history is used to
            estimate the empirical win/loss ratio. Defaults to ``None``.

    Returns:
        Half-Kelly fraction (capped at 3% for safety).
    """
    win_prob = signal_confidence / 100.0

    closed_trades = portfolio.total_wins + portfolio.total_losses
    if closed_trades >= 10 and portfolio.equity > 0:
        historical_win_rate = max(0.3, min(0.8,
            portfolio.total_wins / max(1, closed_trades)
        ))
        win_prob = 0.5 * win_prob + 0.5 * historical_win_rate

    if pair is not None:
        avg_win_loss_ratio = _estimate_win_loss_ratio(portfolio, pair)
    else:
        avg_win_loss_ratio = 1.5

    kelly = win_prob - (1 - win_prob) / avg_win_loss_ratio

    if kelly <= 0.0:
        return 0.0

    half_kelly = kelly / 2.0
    return min(half_kelly, 0.03)


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

    if analyst is not None and analyst.direction != Direction.HOLD:
        if long_count > short_count and analyst.direction == Direction.LONG:
            consensus_direction = Direction.LONG
        elif short_count > long_count and analyst.direction == Direction.SHORT:
            consensus_direction = Direction.SHORT
        elif analyst.conviction >= 60:
            consensus_direction = analyst.direction
        else:
            decision = RiskDecision(
                approved=False,
                reason_codes=["NO_CONSENSUS"],
                daily_pnl=portfolio.daily_pnl,
                drawdown_pct=drawdown,
            )
            return decision, None
    elif long_count > short_count:
        consensus_direction = Direction.LONG
    elif short_count > long_count:
        consensus_direction = Direction.SHORT
    else:
        decision = RiskDecision(
            approved=False,
            reason_codes=["FALLBACK_NO_CONSENSUS"],
            daily_pnl=portfolio.daily_pnl,
            drawdown_pct=drawdown,
        )
        return decision, None

    aligned_signals = [
        s for s in signals
        if s.direction == consensus_direction
    ]
    if not aligned_signals:
        aligned_signals = [s for s in signals if s.direction != Direction.HOLD]

    if len(aligned_signals) < 2:
        decision = RiskDecision(
            approved=False,
            reason_codes=["INSUFFICIENT_ALIGNMENT"],
            daily_pnl=portfolio.daily_pnl,
            drawdown_pct=drawdown,
        )
        return decision, None

    avg_confidence = (
        sum(s.confidence for s in aligned_signals) / len(aligned_signals)
        if aligned_signals
        else 0.0
    )

    if len(aligned_signals) >= 4:
        avg_confidence *= 1.15
    elif len(aligned_signals) >= 3:
        avg_confidence *= 1.08
    elif len(aligned_signals) >= 2:
        avg_confidence *= 1.07
    avg_confidence = min(100.0, avg_confidence)

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

    if consensus_direction == Direction.SHORT:
        if not RISK.shorts_enabled:
            decision = RiskDecision(
                approved=False,
                reason_codes=["SHORTS_DISABLED"],
                daily_pnl=portfolio.daily_pnl,
                drawdown_pct=drawdown,
            )
            return decision, None
        if avg_confidence < RISK.min_signal_score_short:
            decision = RiskDecision(
                approved=False,
                reason_codes=["SHORT_BELOW_THRESHOLD"],
                daily_pnl=portfolio.daily_pnl,
                drawdown_pct=drawdown,
            )
            return decision, None

    if consensus_direction == Direction.LONG:
        if features.ema_21 < features.ema_100:
            decision = RiskDecision(
                approved=False,
                reason_codes=["DOWNTREND_NO_LONG"],
                daily_pnl=portfolio.daily_pnl,
                drawdown_pct=drawdown,
            )
            return decision, None
    else:
        if features.ema_21 > features.ema_100:
            decision = RiskDecision(
                approved=False,
                reason_codes=["UPTREND_NO_SHORT"],
                daily_pnl=portfolio.daily_pnl,
                drawdown_pct=drawdown,
            )
            return decision, None

    kelly_fraction = _compute_kelly(portfolio, avg_confidence, pair=features.pair)
    if kelly_fraction <= 0.0:
        decision = RiskDecision(
            approved=False,
            reason_codes=["NO_EDGE"],
            daily_pnl=portfolio.daily_pnl,
            drawdown_pct=drawdown,
        )
        return decision, None

    risk_pct = min(max(kelly_fraction, 0.0), 0.03)
    risk_amount = portfolio.equity * risk_pct
    max_size = portfolio.equity * RISK.max_position_pct
    stop_mult_val = RISK.stop_mult
    if features.ema_21 > 0 and features.atr_20 > 0:
        denom = stop_mult_val * (features.atr_20 / features.ema_21)
        raw_size = risk_amount / denom if denom > 0 else risk_amount
    else:
        raw_size = risk_amount
    size_usd = min(raw_size, max_size)
    size_usd = max(10.0, size_usd)

    atr = features.atr_20
    entry_price = features.ema_9

    if features.adx_14 >= RISK.adx_hi_threshold:
        target_mult = RISK.target_mult_hi
    elif features.adx_14 >= RISK.adx_mid_threshold:
        target_mult = RISK.target_mult_mid
    else:
        target_mult = RISK.target_mult_base

    stop_mult = RISK.stop_mult

    if consensus_direction == Direction.LONG:
        atr_stop = entry_price - (atr * stop_mult)
        atr_target = entry_price + (atr * target_mult)
    else:
        atr_stop = entry_price + (atr * stop_mult)
        atr_target = entry_price - (atr * target_mult)

    intent = TradeIntent(
        intent_id=str(uuid.uuid4())[:8],
        pair=features.pair,
        side=consensus_direction,
        size_usd=round(size_usd, 2),
        limit_price=entry_price,
        signal_score=avg_confidence,
        erc_eligible=erc_eligible,
        atr_stop=round(atr_stop, 2),
        atr_target=round(atr_target, 2),
    )

    current_exposure = sum(
        abs(v.get("size_usd", 0)) for v in portfolio.positions.values()
    )
    max_total_exposure = portfolio.equity * RISK.max_position_pct * len(STRATEGY.pairs)
    pair_already_open = features.pair in portfolio.positions
    if pair_already_open or current_exposure + intent.size_usd > max_total_exposure:
        decision = RiskDecision(
            approved=False,
            reason_codes=["MAX_EXPOSURE"],
            exposure_before=current_exposure,
            daily_pnl=portfolio.daily_pnl,
            drawdown_pct=drawdown,
        )
        return decision, None

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
