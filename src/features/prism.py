"""PRISM API client for market intelligence enrichment."""

import logging
from typing import Optional

import httpx

from src.config import PRISM_API_KEY

logger = logging.getLogger(__name__)

BASE_URL = "https://api.prismapi.ai/v1"
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        headers = {}
        if PRISM_API_KEY:
            headers["Authorization"] = f"Bearer {PRISM_API_KEY}"
        _client = httpx.AsyncClient(
            base_url=BASE_URL,
            headers=headers,
            timeout=10.0,
        )
    return _client


async def resolve_asset(symbol: str) -> Optional[dict]:
    """Resolve a symbol to its canonical PRISM identity.

    Args:
        symbol: Asset symbol (e.g. "BTC", "ETH").

    Returns:
        Resolved asset dict or None.
    """
    try:
        resp = await _get_client().get(f"/resolve/{symbol}")
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("PRISM resolve failed for %s: %s", symbol, e)
        return None


async def get_signals(symbol: str) -> Optional[dict]:
    """Get AI-generated trading signals for a symbol.

    Args:
        symbol: Asset symbol (e.g. "BTC").

    Returns:
        Signals dict with momentum, breakout, divergence data, or None.
    """
    try:
        resp = await _get_client().get(f"/signals/{symbol}")
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("PRISM signals failed for %s: %s", symbol, e)
        return None


async def get_risk_metrics(symbol: str) -> Optional[dict]:
    """Get risk metrics (VaR, volatility, drawdown) for a symbol.

    Args:
        symbol: Asset symbol (e.g. "BTC").

    Returns:
        Risk metrics dict or None.
    """
    try:
        resp = await _get_client().get(f"/risk/{symbol}")
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("PRISM risk failed for %s: %s", symbol, e)
        return None


async def get_price(symbol: str) -> Optional[dict]:
    """Get current price data for a symbol.

    Args:
        symbol: Asset symbol (e.g. "BTC").

    Returns:
        Price dict or None.
    """
    try:
        resp = await _get_client().get(f"/price/{symbol}")
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("PRISM price failed for %s: %s", symbol, e)
        return None


async def enrich_features(pair: str) -> dict:
    """Fetch all available PRISM data for a trading pair.

    Args:
        pair: Trading pair (e.g. "BTCUSD"). Extracts base symbol.

    Returns:
        Dict with signals, risk, and price data. Empty values on failure.
    """
    symbol = pair.replace("USD", "").replace("usd", "")

    signals, risk, price = None, None, None
    try:
        signals = await get_signals(symbol)
    except Exception:
        pass
    try:
        risk = await get_risk_metrics(symbol)
    except Exception:
        pass
    try:
        price = await get_price(symbol)
    except Exception:
        pass

    return {
        "source": "prism",
        "symbol": symbol,
        "signals": signals,
        "risk": risk,
        "price": price,
    }
