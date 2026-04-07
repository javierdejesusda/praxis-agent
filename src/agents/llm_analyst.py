"""OpenAI-powered LLM analyst with deterministic fallback."""

import json
import logging

from openai import AsyncOpenAI

from src.config import OPENAI_API_KEY, OPENAI_MODEL
from src.models import (
    AnalystReport,
    Direction,
    Features,
    Regime,
    SignalReport,
)

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

SYSTEM_PROMPT = """You are a quantitative trading analyst. Analyze the market data and signals provided.
Output ONLY valid JSON matching this schema:
{
  "pair": "string",
  "direction": "long" | "short" | "hold",
  "conviction": 0-100,
  "rationale": "1-2 sentences",
  "key_risks": ["risk1", "risk2"],
  "regime_assessment": "trending" | "ranging" | "transition"
}

Rules:
- Base your analysis ONLY on the numeric data provided.
- Never recommend overriding risk limits.
- If signals conflict, recommend "hold".
- Be conservative — conviction above 80 requires strong multi-signal agreement."""


def _build_user_prompt(features: Features, signals: list[SignalReport]) -> str:
    """Build the user prompt from features and signals, numerics only."""
    signal_summaries = []
    for s in signals:
        signal_summaries.append({
            "agent": s.agent_name,
            "direction": s.direction.value,
            "confidence": round(s.confidence, 1),
        })

    data = {
        "pair": features.pair,
        "close": round(features.ema_9, 2),
        "ema_9": round(features.ema_9, 2),
        "ema_21": round(features.ema_21, 2),
        "ema_55": round(features.ema_55, 2),
        "ema_200": round(features.ema_200, 2),
        "rsi_14": round(features.rsi_14, 1),
        "macd_histogram": round(features.macd_histogram, 4),
        "adx_14": round(features.adx_14, 1),
        "atr_20_pct": round((features.atr_20 / features.ema_21) * 100, 2)
        if features.ema_21 > 0
        else 0,
        "bb_position": round(features.bb_position, 3),
        "volume_ratio": round(features.volume_ratio, 2),
        "regime": features.regime.value,
        "returns_5bar": round(features.returns_5bar * 100, 2),
        "signals": signal_summaries,
    }
    return json.dumps(data, indent=2)


async def llm_analyze(
    features: Features,
    signals: list[SignalReport],
    timeout: float = 15.0,
) -> AnalystReport:
    """Call OpenAI for market analysis.

    Args:
        features: Current computed features.
        signals: Deterministic signal reports.
        timeout: API call timeout in seconds.

    Returns:
        Typed AnalystReport.

    Raises:
        Exception: On API failure (caller should use deterministic_fallback).
    """
    if _client is None:
        raise RuntimeError("OpenAI client not configured")

    response = await _client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(features, signals)},
        ],
        temperature=0.1,
        max_tokens=300,
        timeout=timeout,
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    parsed = json.loads(raw)

    conviction = min(95.0, max(0.0, float(parsed.get("conviction", 0))))

    return AnalystReport(
        pair=features.pair,
        direction=Direction(parsed["direction"]),
        conviction=conviction,
        rationale=parsed.get("rationale", ""),
        key_risks=parsed.get("key_risks", []),
        regime_assessment=Regime(parsed.get("regime_assessment", features.regime.value)),
    )


def deterministic_fallback(
    signals: list[SignalReport],
    features: Features,
) -> AnalystReport:
    """Fallback when OpenAI API is unavailable. Uses signal majority only.

    Args:
        signals: Deterministic signal reports.
        features: Current features.

    Returns:
        AnalystReport based purely on deterministic signals.
    """
    long_conf = sum(
        s.confidence for s in signals if s.direction == Direction.LONG
    )
    short_conf = sum(
        s.confidence for s in signals if s.direction == Direction.SHORT
    )

    if long_conf > short_conf and long_conf > 100:
        direction = Direction.LONG
        conviction = min(70.0, long_conf / len(signals))
    elif short_conf > long_conf and short_conf > 100:
        direction = Direction.SHORT
        conviction = min(70.0, short_conf / len(signals))
    else:
        direction = Direction.HOLD
        conviction = 0.0

    return AnalystReport(
        pair=features.pair,
        direction=direction,
        conviction=conviction,
        rationale="Deterministic fallback — LLM unavailable",
        key_risks=["No LLM validation available"],
        regime_assessment=features.regime,
    )
