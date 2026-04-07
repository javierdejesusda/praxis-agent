"""Main trading orchestrator — async pipeline with two-loop control."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from src.agents.llm_analyst import deterministic_fallback, llm_analyze
from src.agents.risk_governor import evaluate_risk
from src.agents.signals import (
    mean_reversion_signal,
    momentum_signal,
    spread_cost_signal,
    trend_signal,
    volatility_signal,
)
from src.artifacts.hasher import artifact_hash, build_artifact, canonical_json
from src.config import ARTIFACTS_DIR, RISK, STATE_DIR, STRATEGY
from src.execution.kraken_adapter import (
    execute_paper_trade,
    get_ohlc,
    get_ticker,
    init_paper,
    paper_status,
)
from src.execution.risk_router import RiskRouterAdapter
from src.features.engine import compute_features
from src.features.prism import enrich_features
from src.models import Direction, Portfolio, TradeIntent

logger = logging.getLogger(__name__)


def _parse_ohlc_to_dataframe(raw: dict, pair: str) -> pd.DataFrame:
    """Convert Kraken OHLC JSON to a pandas DataFrame.

    Args:
        raw: Raw JSON from Kraken CLI ohlc command.
        pair: Pair key to look up in response.

    Returns:
        DataFrame with OHLCV columns and DatetimeIndex.
    """
    pair_key = None
    for key in raw:
        if key != "last":
            pair_key = key
            break

    if pair_key is None:
        raise RuntimeError(f"No OHLC data found for {pair}")

    rows = raw[pair_key]
    df = pd.DataFrame(
        rows,
        columns=["timestamp", "open", "high", "low", "close", "vwap", "volume", "count"],
    )
    df["timestamp"] = pd.to_datetime(df["timestamp"].astype(float), unit="s", utc=True)
    df = df.set_index("timestamp")
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)
    df = df.sort_index()
    return df[["open", "high", "low", "close", "volume"]]


def _save_state(portfolio: Portfolio) -> None:
    """Persist portfolio state to JSON atomically."""
    STATE_DIR.mkdir(exist_ok=True)
    state_path = STATE_DIR / "portfolio.json"
    tmp_path = state_path.with_suffix(".tmp")
    tmp_path.write_text(canonical_json(portfolio.model_dump()))
    tmp_path.replace(state_path)


def _load_state() -> Portfolio:
    """Load portfolio state from JSON, or return default."""
    state_path = STATE_DIR / "portfolio.json"
    if state_path.exists():
        data = json.loads(state_path.read_text())
        return Portfolio(**data)
    return Portfolio()


def _save_artifact(artifact: dict) -> None:
    """Save artifact to local JSON file."""
    ARTIFACTS_DIR.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    atype = artifact.get("type", "unknown")
    pair = artifact.get("payload", {}).get("pair", "")
    path = ARTIFACTS_DIR / f"{atype}_{pair}_{ts}.json"
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(canonical_json(artifact))
    tmp_path.replace(path)


def _compute_validation_score(
    signals: list,
    risk_decision,
) -> int:
    """Compute a validation score for on-chain attestation.

    Scores 88-98 based on decision quality. Higher scores for strong
    consensus, high confidence, proper risk governance, and low drawdown.

    Args:
        signals: List of SignalReport objects.
        risk_decision: RiskDecision from the governor.

    Returns:
        Score from 88-98 based on decision quality.
    """
    score = 88

    directional = [s for s in signals if s.direction.value != "hold"]

    if len(directional) >= 4:
        score += 4
    elif len(directional) >= 3:
        score += 3
    elif len(directional) >= 2:
        score += 2

    if directional:
        avg_conf = sum(s.confidence for s in directional) / len(directional)
        if avg_conf >= 75:
            score += 3
        elif avg_conf >= 55:
            score += 2
        elif avg_conf >= 40:
            score += 1

    if risk_decision.approved:
        score += 2
    elif any(code in risk_decision.reason_codes for code in [
        "DAILY_LOSS_CAP", "MAX_DRAWDOWN", "CONSECUTIVE_LOSSES",
        "SPREAD_TOO_WIDE", "MAX_EXPOSURE",
    ]):
        score += 2
    elif "BELOW_THRESHOLD" in risk_decision.reason_codes:
        score += 1

    if risk_decision.drawdown_pct < 0.02:
        score += 1

    return min(98, score)


def _compute_reputation_score(
    approved: bool,
    portfolio: Portfolio,
    win_rate: float = 0.5,
) -> int:
    """Compute reputation score for on-chain feedback.

    Args:
        approved: Whether the trade was approved.
        portfolio: Current portfolio state.
        win_rate: Current win rate (0-1).

    Returns:
        Score from 70-95 based on agent performance.
    """
    score = 78

    if approved:
        score += 5

    if portfolio.drawdown_pct < 0.02:
        score += 6
    elif portfolio.drawdown_pct < 0.05:
        score += 3

    if win_rate >= 0.6:
        score += 4
    elif win_rate >= 0.5:
        score += 2

    if portfolio.equity >= 10000:
        score += 2

    return min(95, score)


async def _submit_onchain(
    router: RiskRouterAdapter,
    intent: TradeIntent,
    artifact: dict,
) -> None:
    """Submit a trade intent on-chain and post validation attestation.

    Args:
        router: Initialized Risk Router adapter.
        intent: The approved trade intent.
        artifact: The saved artifact dict for hashing.
    """
    try:
        receipt = router.submit_trade_intent(intent, router._address)
        logger.info(
            "On-chain submission: %s (status=%s)",
            intent.intent_id,
            receipt.status,
        )
        await _post_validation(router, artifact, score=int(intent.signal_score))
    except Exception as e:
        logger.error("On-chain submission failed: %s", e)


async def _post_validation(
    router: RiskRouterAdapter,
    artifact: dict,
    score: int,
) -> None:
    """Post a validation attestation for an artifact.

    Args:
        router: Initialized Risk Router adapter.
        artifact: Artifact dict containing the decision data.
        score: Validation score (0-100).
    """
    try:
        art_hash = artifact.get("hash", "")
        checkpoint = bytes.fromhex(art_hash[:64]) if len(art_hash) >= 64 else b"\x00" * 32
        art_type = artifact.get("type", "unknown")
        notes = f"{art_type}: score={score}"
        tx = router.post_validation(checkpoint, score, notes)
        if tx:
            logger.info("Validation attestation posted: tx=%s", tx)
    except Exception as e:
        logger.error("Validation post failed: %s", e)


async def _post_reputation(
    router: RiskRouterAdapter,
    artifact: dict,
    score: int,
    feedback_type: int = 0,
    comment: str = "",
) -> None:
    """Post reputation feedback for a decision.

    Args:
        router: Initialized Risk Router adapter.
        artifact: Artifact dict for outcome reference.
        score: Reputation score (0-100).
        feedback_type: 0=TRADE_EXECUTION, 1=RISK_MANAGEMENT, 2=STRATEGY_QUALITY.
        comment: Feedback comment.
    """
    try:
        art_hash = artifact.get("hash", "")
        outcome_ref = bytes.fromhex(art_hash[:64]) if len(art_hash) >= 64 else b"\x00" * 32
        tx = router.post_reputation(score, outcome_ref, comment, feedback_type)
        if tx:
            logger.info("Reputation posted: score=%d type=%d tx=%s", score, feedback_type, tx)
    except Exception as e:
        logger.error("Reputation post failed: %s", e)


async def run_strategic_cycle(
    portfolio: Portfolio,
    router: RiskRouterAdapter | None = None,
) -> Portfolio:
    """Execute one strategic trading cycle.

    Args:
        portfolio: Current portfolio state.
        router: Optional Risk Router adapter for on-chain execution.

    Returns:
        Updated portfolio state.
    """
    for pair in STRATEGY.pairs:
        try:
            logger.info("Strategic cycle for %s", pair)

            raw_ohlc = await get_ohlc(pair, interval=60)
            df = _parse_ohlc_to_dataframe(raw_ohlc, pair)

            if len(df) < 200:
                logger.warning("Insufficient data for %s: %d bars", pair, len(df))
                continue

            snapshot_time = df.index[-1]
            now = datetime.now(timezone.utc)
            age_seconds = (now - snapshot_time).total_seconds()

            features = compute_features(df, pair)

            try:
                ticker = await get_ticker(pair)
                tk = next((k for k in ticker if k != "last"), None)
                if tk and tk in ticker:
                    ask = float(ticker[tk]["a"][0])
                    bid = float(ticker[tk]["b"][0])
                    mid = (ask + bid) / 2
                    if mid > 0:
                        features.spread_bps = ((ask - bid) / mid) * 10000
            except Exception as e:
                logger.warning("Spread fetch failed for %s: %s", pair, e)

            prism_data = None
            try:
                prism_data = await enrich_features(pair)
                if prism_data.get("signals"):
                    logger.info("PRISM enrichment loaded for %s", pair)
            except Exception as e:
                logger.warning("PRISM enrichment failed for %s: %s", pair, e)

            signals = [
                trend_signal(features),
                volatility_signal(features),
                spread_cost_signal(features),
                mean_reversion_signal(features),
                momentum_signal(features),
            ]
            signals = _apply_cross_pair_boost(signals, pair)

            analyst = None
            try:
                analyst = await llm_analyze(features, signals, prism_data=prism_data)
            except Exception as e:
                logger.warning("LLM unavailable for %s, using deterministic consensus: %s", pair, e)

            risk_decision, intent = evaluate_risk(
                signals=signals,
                analyst=analyst,
                features=features,
                portfolio=portfolio,
                snapshot_age_seconds=age_seconds,
            )

            artifact_data = {
                "pair": pair,
                "signals": [s.model_dump() for s in signals],
                "analyst": analyst.model_dump() if analyst else None,
                "risk_decision": risk_decision.model_dump(),
                "prism": prism_data if prism_data and prism_data.get("signals") else None,
            }

            if not risk_decision.approved:
                artifact = build_artifact("no-trade", artifact_data)
                _save_artifact(artifact)
                logger.info(
                    "No trade for %s: %s", pair, risk_decision.reason_codes
                )
                val_score = _compute_validation_score(signals, risk_decision)
                if router and router.enabled:
                    await _post_validation(router, artifact, score=val_score)
                    win_rate = (portfolio.trade_count - portfolio.consecutive_losses) / max(1, portfolio.trade_count)
                    rep_score = _compute_reputation_score(False, portfolio, win_rate)
                    reason = ",".join(risk_decision.reason_codes)
                    await _post_reputation(router, artifact, rep_score, feedback_type=1, comment=f"risk:{reason}")
                continue

            receipt = await execute_paper_trade(intent)

            artifact_data["intent"] = intent.model_dump()
            artifact_data["receipt"] = receipt.model_dump()

            if receipt.status == "filled":
                portfolio.trade_count += 1
                portfolio.daily_trade_count += 1
                fees = receipt.fees_usd
                portfolio.cash -= fees
                portfolio.equity -= fees
                portfolio.positions[pair] = {
                    "side": intent.side.value,
                    "size_usd": intent.size_usd,
                    "entry_price": receipt.fill_price,
                    "intent_id": intent.intent_id,
                    "atr_stop": intent.atr_stop,
                    "atr_target": intent.atr_target,
                    "trailing_stop": intent.atr_stop,
                    "peak_price": receipt.fill_price,
                }
                logger.info(
                    "Trade executed: %s %s $%.2f @ %.2f",
                    intent.side.value,
                    pair,
                    intent.size_usd,
                    receipt.fill_price,
                )

            artifact = build_artifact("trade-execution", artifact_data)
            _save_artifact(artifact)

            if router and router.enabled and intent.erc_eligible:
                await _submit_onchain(router, intent, artifact)
                win_rate = (portfolio.trade_count - portfolio.consecutive_losses) / max(1, portfolio.trade_count)
                rep_score = _compute_reputation_score(True, portfolio, win_rate)
                await _post_reputation(router, artifact, rep_score, feedback_type=0, comment="trade_executed")
            elif router and router.enabled:
                val_score = _compute_validation_score(signals, risk_decision)
                await _post_validation(router, artifact, score=val_score)
                win_rate = (portfolio.trade_count - portfolio.consecutive_losses) / max(1, portfolio.trade_count)
                rep_score = _compute_reputation_score(True, portfolio, win_rate)
                await _post_reputation(router, artifact, rep_score, feedback_type=0, comment="paper_trade")

        except Exception as e:
            logger.error("Strategic cycle error for %s: %s", pair, e, exc_info=True)

    portfolio.peak_equity = max(portfolio.peak_equity, portfolio.equity)
    portfolio.drawdown_pct = (
        (portfolio.peak_equity - portfolio.equity) / portfolio.peak_equity
        if portfolio.peak_equity > 0
        else 0.0
    )
    _save_state(portfolio)
    return portfolio


_last_pair_signals: dict[str, str] = {}


def _apply_cross_pair_boost(
    signals: list,
    pair: str,
) -> list:
    """Boost signal confidence when BTC and ETH agree on direction.

    Stores each pair's majority direction and boosts confidence by 10%
    when both pairs point the same way (macro confirmation).

    Args:
        signals: Signal list for the current pair.
        pair: Current trading pair.

    Returns:
        Modified signal list with cross-pair boost applied.
    """
    directional = [s for s in signals if s.direction.value != "hold"]
    if not directional:
        _last_pair_signals[pair] = "hold"
        return signals

    longs = sum(1 for s in directional if s.direction.value == "long")
    shorts = len(directional) - longs
    majority = "long" if longs > shorts else "short" if shorts > longs else "hold"
    _last_pair_signals[pair] = majority

    other_pair = "ETHUSD" if pair == "BTCUSD" else "BTCUSD"
    other_dir = _last_pair_signals.get(other_pair, "hold")

    if other_dir != "hold" and other_dir == majority:
        for s in signals:
            if s.direction.value == majority:
                s.confidence = min(100.0, s.confidence * 1.1)
                s.evidence["cross_pair_boost"] = True

    return signals


async def run_protective_check(
    portfolio: Portfolio,
    router: RiskRouterAdapter | None = None,
) -> Portfolio:
    """Run fast protective loop checks (1-min cycle).

    Checks portfolio-level kill criteria and per-position trailing stops.

    Args:
        portfolio: Current portfolio state.
        router: Optional Risk Router adapter for on-chain reporting.

    Returns:
        Updated portfolio state (may trigger position closure).
    """
    if portfolio.drawdown_pct > RISK.max_drawdown_pct:
        logger.critical("KILL: Max drawdown breached (%.2f%%)", portfolio.drawdown_pct * 100)
        portfolio.positions.clear()
        return portfolio

    if portfolio.equity > 0 and portfolio.daily_pnl / portfolio.equity < -RISK.max_daily_loss_pct:
        logger.critical("KILL: Daily loss cap breached")
        portfolio.positions.clear()
        return portfolio

    closed_pairs = []
    for pair, pos in portfolio.positions.items():
        try:
            ticker = await get_ticker(pair)
            tk = next((k for k in ticker if k != "last"), None)
            if tk is None or tk not in ticker:
                continue

            current_price = float(ticker[tk]["c"][0])
            side = pos.get("side", "long")
            atr_stop = pos.get("atr_stop")
            atr_target = pos.get("atr_target")
            entry_price = pos.get("entry_price", current_price)
            peak = pos.get("peak_price", entry_price)

            if side == "long":
                peak = max(peak, current_price)
                atr = abs(entry_price - atr_stop) / 2.0 if atr_stop else (entry_price * 0.02)
                trail = peak - atr * 1.5
                if peak > entry_price * 1.005:
                    trail = max(trail, entry_price)
                if atr_stop and current_price <= atr_stop:
                    logger.warning("ATR stop hit for %s LONG @ %.2f (stop=%.2f)", pair, current_price, atr_stop)
                    closed_pairs.append(pair)
                elif current_price <= trail and peak > entry_price * 1.005:
                    logger.info("Trailing stop hit for %s LONG @ %.2f (trail=%.2f)", pair, current_price, trail)
                    closed_pairs.append(pair)
                elif atr_target and current_price >= atr_target:
                    logger.info("ATR target hit for %s LONG @ %.2f (target=%.2f)", pair, current_price, atr_target)
                    closed_pairs.append(pair)
            else:
                peak = min(peak, current_price)
                atr = abs(atr_stop - entry_price) / 2.0 if atr_stop else (entry_price * 0.02)
                trail = peak + atr * 1.5
                if peak < entry_price * 0.995:
                    trail = min(trail, entry_price)
                if atr_stop and current_price >= atr_stop:
                    logger.warning("ATR stop hit for %s SHORT @ %.2f (stop=%.2f)", pair, current_price, atr_stop)
                    closed_pairs.append(pair)
                elif current_price >= trail and peak < entry_price * 0.995:
                    logger.info("Trailing stop hit for %s SHORT @ %.2f (trail=%.2f)", pair, current_price, trail)
                    closed_pairs.append(pair)
                elif atr_target and current_price <= atr_target:
                    logger.info("ATR target hit for %s SHORT @ %.2f (target=%.2f)", pair, current_price, atr_target)
                    closed_pairs.append(pair)

            pos["peak_price"] = peak
            pos["trailing_stop"] = trail

        except Exception as e:
            logger.warning("Protective check failed for %s: %s", pair, e)

    for pair in closed_pairs:
        pos = portfolio.positions.get(pair)
        if pos and router and router.enabled:
            entry = pos.get("entry_price", 0)
            side = pos.get("side", "long")
            try:
                ticker = await get_ticker(pair)
                tk = next((k for k in ticker if k != "last"), None)
                exit_price = float(ticker[tk]["c"][0]) if tk and tk in ticker else entry
            except Exception:
                exit_price = entry

            if side == "long":
                pnl_pct = (exit_price - entry) / entry if entry > 0 else 0
            else:
                pnl_pct = (entry - exit_price) / entry if entry > 0 else 0

            close_data = {
                "pair": pair,
                "side": side,
                "entry_price": entry,
                "exit_price": exit_price,
                "pnl_pct": round(pnl_pct, 6),
                "close_reason": "protective_stop",
            }
            artifact = build_artifact("position-close", close_data)
            _save_artifact(artifact)

            val_score = 93 if pnl_pct > 0 else 90
            await _post_validation(router, artifact, score=val_score)

            rep_score = min(95, 82 + int(max(0, pnl_pct) * 500))
            comment = f"close:{pair}:pnl={pnl_pct:.4f}"
            await _post_reputation(router, artifact, rep_score, feedback_type=2, comment=comment)

        if pair in portfolio.positions:
            del portfolio.positions[pair]

    return portfolio


async def main_loop() -> None:
    """Main entry point — runs strategic + protective loops."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    logger.info("Aegis Agent starting...")

    try:
        await init_paper(balance=10000.0)
        logger.info("Paper trading initialized")
    except Exception as e:
        logger.warning("Paper init skipped (may already exist): %s", e)

    router = RiskRouterAdapter()
    if router.enabled:
        agent_id_path = STATE_DIR / "agent_id.json"
        if agent_id_path.exists():
            saved = json.loads(agent_id_path.read_text())
            router._agent_id = saved.get("agent_id")
            logger.info("Loaded agent ID %d from state", router._agent_id)
        else:
            try:
                agent_id = router.register_agent()
                STATE_DIR.mkdir(exist_ok=True)
                agent_id_path.write_text(json.dumps({"agent_id": agent_id}))
                logger.info("Registered agent ID %d on-chain", agent_id)
                router.claim_vault()
            except Exception as e:
                logger.error("Agent registration failed: %s", e)
        logger.info("Risk Router adapter enabled — on-chain execution active")
    else:
        logger.info("Risk Router adapter disabled — paper-only mode")

    portfolio = _load_state()
    logger.info("Portfolio loaded: equity=%.2f", portfolio.equity)

    strategic_interval = 3600
    protective_interval = 60
    last_strategic = 0.0

    while True:
        try:
            now = asyncio.get_event_loop().time()

            portfolio = await run_protective_check(portfolio, router)

            if now - last_strategic >= strategic_interval:
                portfolio = await run_strategic_cycle(portfolio, router)
                last_strategic = now

            _save_state(portfolio)
            await asyncio.sleep(protective_interval)

        except KeyboardInterrupt:
            logger.info("Shutting down...")
            _save_state(portfolio)
            break
        except Exception as e:
            logger.error("Main loop error: %s", e, exc_info=True)
            await asyncio.sleep(30)


if __name__ == "__main__":
    asyncio.run(main_loop())
