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
            ]

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
                if router and router.enabled:
                    await _post_validation(router, artifact, score=75)
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


async def run_protective_check(portfolio: Portfolio) -> Portfolio:
    """Run fast protective loop checks (1-min cycle).

    Args:
        portfolio: Current portfolio state.

    Returns:
        Updated portfolio state (may trigger position closure).
    """
    if portfolio.drawdown_pct > RISK.max_drawdown_pct:
        logger.critical("KILL: Max drawdown breached (%.2f%%)", portfolio.drawdown_pct * 100)
        portfolio.positions.clear()

    if portfolio.daily_pnl / portfolio.equity < -RISK.max_daily_loss_pct:
        logger.critical("KILL: Daily loss cap breached")
        portfolio.positions.clear()

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

            portfolio = await run_protective_check(portfolio)

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
