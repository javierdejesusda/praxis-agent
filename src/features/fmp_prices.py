"""Financial Modeling Prep price client.

Fetches intraday OHLC candles for crypto and equities so the dashboard has
a reliable real-time price feed independent of the Kraken adapter.
"""

import logging
from typing import Optional

import httpx

from src.config import FMP_API_KEY

logger = logging.getLogger(__name__)

BASE_URL = "https://financialmodelingprep.com/stable"
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=BASE_URL, timeout=10.0)
    return _client


_CRYPTO_INTERVAL_PATHS = {
    1: "historical-chart/1min",
    5: "historical-chart/5min",
    60: "historical-chart/1hour",
}

_CRYPTO_SYMBOL_SUFFIX = "USD"


def _normalize_crypto_symbol(pair: str) -> str:
    """Normalize a pair symbol ("BTCUSD") to FMP's ticker format.

    FMP uses plain ``BTCUSD``, ``ETHUSD`` for crypto intraday charts, which
    matches the Praxis convention — so the symbol passes through unchanged.
    """
    return pair.upper()


async def get_crypto_quote(pair: str) -> Optional[dict]:
    """Fetch the latest live quote for a crypto pair.

    Args:
        pair: Symbol like ``BTCUSD`` or ``ETHUSD``.

    Returns:
        Dict with ``{symbol, price, change, volume}`` or None on failure.

    Raises:
        RuntimeError: If no API key is configured.
    """
    if not FMP_API_KEY:
        raise RuntimeError(
            "FMP_API_KEY not set — add it to .env to enable live quotes."
        )

    symbol = _normalize_crypto_symbol(pair)
    try:
        resp = await _get_client().get(
            "/quote-short", params={"symbol": symbol, "apikey": FMP_API_KEY}
        )
        resp.raise_for_status()
        raw = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("FMP quote fetch failed for %s: %s", symbol, exc)
        return None

    if not isinstance(raw, list) or not raw:
        return None
    row = raw[0]
    try:
        return {
            "symbol": str(row.get("symbol", symbol)),
            "price": float(row["price"]),
            "change": float(row.get("change", 0) or 0),
            "volume": float(row.get("volume", 0) or 0),
        }
    except (KeyError, TypeError, ValueError):
        return None


async def get_crypto_daily_closes(pair: str) -> list[float]:
    """Fetch recent daily close prices for a crypto pair from FMP EOD.

    Returns the most recent ~5 years of daily closes, oldest-first.
    Used by the multi-timeframe filter in the live orchestrator because
    Kraken's public OHLC endpoint only returns ~720 bars (30 days of
    hourly data), which is too shallow for a 200-day EMA.

    Args:
        pair: Symbol like ``BTCUSD`` or ``ETHUSD``.

    Returns:
        List of floats, oldest-first. Empty list on failure.

    Raises:
        RuntimeError: If no API key is configured.
    """
    if not FMP_API_KEY:
        raise RuntimeError("FMP_API_KEY not set")
    symbol = _normalize_crypto_symbol(pair)
    try:
        resp = await _get_client().get(
            "/historical-price-eod/light",
            params={"symbol": symbol, "apikey": FMP_API_KEY},
        )
        resp.raise_for_status()
        raw = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("FMP daily EOD fetch failed for %s: %s", symbol, exc)
        return []
    if not isinstance(raw, list):
        return []
    # FMP returns newest-first — reverse to oldest-first
    closes: list[float] = []
    for row in reversed(raw):
        if not isinstance(row, dict):
            continue
        try:
            closes.append(float(row["price"]))
        except (KeyError, TypeError, ValueError):
            try:
                closes.append(float(row["close"]))
            except (KeyError, TypeError, ValueError):
                continue
    return closes


async def get_crypto_intraday(
    pair: str, interval: int = 60, limit: int = 120
) -> list[dict]:
    """Fetch recent intraday OHLC bars for a crypto pair.

    Args:
        pair: Symbol like ``BTCUSD`` or ``ETHUSD``.
        interval: Candle interval in minutes. Supported: 1, 5, 60.
        limit: Maximum number of most-recent bars to return.

    Returns:
        List of ``{t, o, h, l, c, v}`` dicts oldest-first, where ``t`` is
        unix seconds. Empty list on any error.

    Raises:
        RuntimeError: If no API key is configured.
    """
    if not FMP_API_KEY:
        raise RuntimeError(
            "FMP_API_KEY not set — add it to .env to enable price charts."
        )

    path = _CRYPTO_INTERVAL_PATHS.get(interval)
    if path is None:
        raise ValueError(
            f"Unsupported interval {interval}; use one of {sorted(_CRYPTO_INTERVAL_PATHS)}."
        )

    symbol = _normalize_crypto_symbol(pair)
    url = f"/{path}"

    try:
        resp = await _get_client().get(
            url, params={"symbol": symbol, "apikey": FMP_API_KEY}
        )
        resp.raise_for_status()
        raw = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("FMP intraday fetch failed for %s: %s", symbol, exc)
        return []

    if not isinstance(raw, list):
        logger.warning("FMP intraday returned unexpected payload for %s", symbol)
        return []

    candles: list[dict] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        try:
            t_iso = str(row["date"]).replace(" ", "T") + "Z"
            candles.append(
                {
                    "t_iso": t_iso,
                    "o": float(row["open"]),
                    "h": float(row["high"]),
                    "l": float(row["low"]),
                    "c": float(row["close"]),
                    "v": float(row.get("volume", 0) or 0),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue

    candles.sort(key=lambda r: r["t_iso"])

    if limit > 0 and len(candles) > limit:
        candles = candles[-limit:]

    out: list[dict] = []
    for row in candles:
        try:
            from datetime import datetime, timezone

            ts = int(
                datetime.fromisoformat(row["t_iso"].replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .timestamp()
            )
        except ValueError:
            continue
        out.append(
            {
                "t": ts,
                "o": row["o"],
                "h": row["h"],
                "l": row["l"],
                "c": row["c"],
                "v": row["v"],
            }
        )
    return out
