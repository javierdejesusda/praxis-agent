"""Kraken REST API adapter for market data and paper trading simulation."""

import json
import logging
from typing import Optional

import httpx

from src.models import Direction, ExecutionReceipt, TradeIntent

logger = logging.getLogger(__name__)

KRAKEN_BASE = "https://api.kraken.com/0/public"
_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    """Get or create a shared async HTTP client."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


async def _kraken_get(endpoint: str, params: dict) -> dict:
    """Call a Kraken public REST endpoint.

    Args:
        endpoint: API endpoint path (e.g. "Ticker").
        params: Query parameters.

    Returns:
        Parsed result dict from the Kraken response.

    Raises:
        RuntimeError: On API error or network failure.
    """
    client = await _get_client()
    url = f"{KRAKEN_BASE}/{endpoint}"
    resp = await client.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()
    errors = data.get("error", [])
    if errors:
        raise RuntimeError(f"Kraken API error: {errors}")
    return data.get("result", {})


async def get_ticker(pair: str) -> dict:
    """Get current ticker for a pair.

    Args:
        pair: Kraken pair symbol (e.g. "BTCUSD").

    Returns:
        Ticker dict keyed by Kraken's pair name.
    """
    return await _kraken_get("Ticker", {"pair": pair})


async def get_ohlc(pair: str, interval: int = 60) -> dict:
    """Get OHLC candle data from Kraken.

    Args:
        pair: Kraken pair symbol.
        interval: Candle interval in minutes (1, 5, 15, 30, 60, 240, 1440).

    Returns:
        Dict with pair key mapping to list of OHLCV rows, plus "last" timestamp.
    """
    return await _kraken_get("OHLC", {"pair": pair, "interval": interval})


async def get_ohlc_extended(pair: str, interval: int = 60, bars: int = 2000) -> dict:
    """Fetch extended OHLC data by paginating backwards in time.

    Kraken returns ~720 bars per request. This function makes multiple
    requests with the 'since' parameter to collect more history.

    Args:
        pair: Kraken pair symbol.
        interval: Candle interval in minutes.
        bars: Target number of bars to collect.

    Returns:
        Dict with pair key mapping to deduplicated, sorted OHLCV rows.
    """
    import time

    all_rows = []
    seen_timestamps = set()
    max_pages = (bars // 700) + 2
    since = int(time.time()) - (bars * interval * 60)
    pair_key = pair
    last_since = None

    for page in range(max_pages):
        try:
            params = {"pair": pair, "interval": interval, "since": since}
            result = await _kraken_get("OHLC", params)

            pk = next((k for k in result if k != "last"), None)
            if pk is None:
                break
            pair_key = pk

            rows = result[pk]
            if not rows:
                break

            new_count = 0
            for row in rows:
                ts = int(row[0])
                if ts not in seen_timestamps:
                    seen_timestamps.add(ts)
                    all_rows.append(row)
                    new_count += 1

            new_since = int(result.get("last", 0))
            if new_since == last_since or new_count == 0:
                break
            last_since = new_since
            since = new_since

            logger.info("OHLC page %d: %d new bars, %d total", page, new_count, len(all_rows))

            if len(all_rows) >= bars:
                break

        except Exception as e:
            logger.warning("OHLC page %d failed for %s: %s", page, pair, e)
            break

    all_rows.sort(key=lambda r: int(r[0]))
    return {pair_key: all_rows, "last": since}


async def init_paper(balance: float = 10000.0) -> dict:
    """Initialize paper trading (no-op, state managed locally)."""
    logger.info("Paper trading initialized with balance $%.2f", balance)
    return {"status": "initialized", "balance": balance}


async def paper_balance() -> dict:
    """Get paper trading balance (reads local state)."""
    return {"status": "ok"}


async def paper_status() -> dict:
    """Get paper trading status (reads local state)."""
    return {"status": "ok"}


async def execute_paper_trade(intent: TradeIntent) -> ExecutionReceipt:
    """Execute a trade intent via paper mode simulation.

    Fetches live ticker for fill price, simulates execution locally.

    Args:
        intent: Approved trade intent from risk governor.

    Returns:
        ExecutionReceipt with fill details or error.
    """
    try:
        ticker = await get_ticker(intent.pair)

        pair_key = None
        for key in ticker:
            if key != "last":
                pair_key = key
                break

        if pair_key is None or pair_key not in ticker:
            return ExecutionReceipt(
                intent_id=intent.intent_id,
                adapter="kraken_paper",
                status="error",
                error=f"No ticker data for {intent.pair}",
            )

        ticker_data = ticker[pair_key]
        ask_price = float(ticker_data["a"][0])
        bid_price = float(ticker_data["b"][0])

        if intent.side == Direction.LONG:
            fill_price = intent.limit_price or ask_price
        else:
            fill_price = intent.limit_price or bid_price

        if fill_price <= 0:
            return ExecutionReceipt(
                intent_id=intent.intent_id,
                adapter="kraken_paper",
                status="error",
                error="Invalid fill price",
            )

        amount = intent.size_usd / fill_price
        fees_usd = intent.size_usd * 0.0026

        logger.info(
            "Paper %s %s: %.8f @ $%.2f (fees: $%.2f)",
            intent.side.value,
            intent.pair,
            amount,
            fill_price,
            fees_usd,
        )

        return ExecutionReceipt(
            intent_id=intent.intent_id,
            adapter="kraken_paper",
            status="filled",
            fill_price=fill_price,
            fees_usd=fees_usd,
        )

    except Exception as e:
        logger.error("Paper trade failed: %s", e)
        return ExecutionReceipt(
            intent_id=intent.intent_id,
            adapter="kraken_paper",
            status="error",
            error=str(e),
        )
