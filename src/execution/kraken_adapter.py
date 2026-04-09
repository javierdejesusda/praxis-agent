"""Kraken REST API adapter for market data and paper trading simulation.

Paper trading simulates fills against live Kraken bid/ask prices. A local
JSON ledger tracks balance, positions, and trade history independently of
the orchestrator's portfolio state, providing an auditable record.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import httpx

from src.config import STATE_DIR
from src.models import Direction, ExecutionReceipt, TradeIntent

logger = logging.getLogger(__name__)

KRAKEN_BASE = "https://api.kraken.com/0/public"
PAPER_LEDGER_PATH = STATE_DIR / "paper_ledger.json"
KRAKEN_TAKER_FEE = 0.0026

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


def _load_ledger() -> dict:
    """Load the paper trading ledger from disk.

    Returns:
        Ledger dict with balance, positions, and trades. Empty if missing.
    """
    if PAPER_LEDGER_PATH.exists():
        try:
            return json.loads(PAPER_LEDGER_PATH.read_text())
        except Exception as e:
            logger.warning("Failed to load paper ledger: %s", e)
    return {}


def _save_ledger(ledger: dict) -> None:
    """Persist the paper ledger to disk atomically.

    Args:
        ledger: Ledger dict to serialize.
    """
    STATE_DIR.mkdir(exist_ok=True)
    tmp = PAPER_LEDGER_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(ledger, indent=2, sort_keys=True, default=str))
    tmp.replace(PAPER_LEDGER_PATH)


async def init_paper(balance: float = 10000.0) -> dict:
    """Initialize the paper trading ledger.

    Creates a fresh ledger at state/paper_ledger.json if none exists,
    preserving existing state on subsequent calls.

    Args:
        balance: Starting balance in USD.

    Returns:
        Status dict with current balance and initialization state.
    """
    existing = _load_ledger()
    if existing.get("initialized"):
        logger.info(
            "Paper ledger already initialized: balance=$%.2f (since %s)",
            existing.get("balance", 0.0),
            existing.get("initialized_at", "unknown"),
        )
        return {
            "status": "already_initialized",
            "balance": existing.get("balance", 0.0),
        }

    ledger = {
        "initialized": True,
        "initialized_at": datetime.now(timezone.utc).isoformat(),
        "starting_balance": balance,
        "balance": balance,
        "positions": {},
        "trades": [],
        "total_fees_usd": 0.0,
        "total_volume_usd": 0.0,
    }
    _save_ledger(ledger)
    logger.info("Paper ledger initialized with balance $%.2f", balance)
    return {"status": "initialized", "balance": balance}


async def paper_balance() -> dict:
    """Return the current paper trading balance and position summary.

    Returns:
        Dict with balance, position count, trade count, and total fees.
    """
    ledger = _load_ledger()
    if not ledger:
        return {"status": "uninitialized", "balance": 0.0}
    return {
        "status": "ok",
        "balance": ledger.get("balance", 0.0),
        "starting_balance": ledger.get("starting_balance", 0.0),
        "open_positions": len(ledger.get("positions", {})),
        "total_trades": len(ledger.get("trades", [])),
        "total_fees_usd": ledger.get("total_fees_usd", 0.0),
        "total_volume_usd": ledger.get("total_volume_usd", 0.0),
    }


async def paper_status() -> dict:
    """Return full paper trading status including open positions.

    Returns:
        Dict with balance, positions, and recent trade summary.
    """
    ledger = _load_ledger()
    if not ledger:
        return {"status": "uninitialized"}
    trades = ledger.get("trades", [])
    return {
        "status": "ok",
        "balance": ledger.get("balance", 0.0),
        "starting_balance": ledger.get("starting_balance", 0.0),
        "positions": ledger.get("positions", {}),
        "recent_trades": trades[-10:],
        "total_trades": len(trades),
        "total_fees_usd": ledger.get("total_fees_usd", 0.0),
    }


def _extract_bid_ask(ticker_result: dict) -> tuple[float, float] | None:
    """Extract bid and ask from a Kraken ticker result.

    Args:
        ticker_result: Dict returned by get_ticker().

    Returns:
        Tuple of (bid, ask) as floats, or None if unavailable.
    """
    for key, data in ticker_result.items():
        if key == "last":
            continue
        try:
            ask = float(data["a"][0])
            bid = float(data["b"][0])
            if ask > 0 and bid > 0:
                return bid, ask
        except (KeyError, IndexError, ValueError, TypeError):
            continue
    return None


TICKER_TIMEOUT_SECONDS = 5.0
TICKER_MAX_ATTEMPTS = 2


async def _fetch_ticker_with_retry(pair: str) -> dict:
    """Fetch a Kraken ticker with bounded timeout and one retry.

    The shared httpx client defaults to a 30 second timeout which can
    stall the entire strategic or protective loop during a live demo if
    Kraken is slow. Wrap every user-facing ticker fetch in a 5 second
    ceiling and retry once before giving up.

    Args:
        pair: Kraken pair symbol (e.g. "BTCUSD").

    Returns:
        Parsed ticker result dict.

    Raises:
        TimeoutError: If all attempts exceed the timeout budget.
        RuntimeError: If Kraken returns an error payload on every attempt.
    """
    last_exc: Exception | None = None
    for attempt in range(TICKER_MAX_ATTEMPTS):
        try:
            return await asyncio.wait_for(
                get_ticker(pair), timeout=TICKER_TIMEOUT_SECONDS
            )
        except (asyncio.TimeoutError, RuntimeError, httpx.HTTPError) as exc:
            last_exc = exc
            logger.warning(
                "Kraken ticker attempt %d/%d failed for %s: %s",
                attempt + 1,
                TICKER_MAX_ATTEMPTS,
                pair,
                exc,
            )
    raise TimeoutError(
        f"Kraken ticker for {pair} failed after {TICKER_MAX_ATTEMPTS} attempts: {last_exc}"
    )


def _last_known_fill_price(pair: str, side: Direction) -> float | None:
    """Return the most recent fill price for a pair from the paper ledger.

    Used as a last-resort fallback when live ticker fetches fail, so the
    protective loop can still close or size positions rather than
    hanging or erroring out.
    """
    ledger = _load_ledger()
    for trade in reversed(ledger.get("trades", [])):
        if trade.get("pair") == pair and isinstance(trade.get("fill_price"), (int, float)):
            return float(trade["fill_price"])
    return None


async def execute_paper_trade(intent: TradeIntent) -> ExecutionReceipt:
    """Execute a trade intent against live Kraken bid/ask prices.

    Paper trades fill at the current ask (for longs) or bid (for shorts),
    regardless of any limit price on the intent. The local ledger is
    updated atomically with the new position and fees.

    Args:
        intent: Approved trade intent from risk governor.

    Returns:
        ExecutionReceipt with fill details or error.
    """
    try:
        ticker = await _fetch_ticker_with_retry(intent.pair)
    except Exception as e:
        logger.error("Paper trade failed fetching ticker: %s", e)
        return ExecutionReceipt(
            intent_id=intent.intent_id,
            adapter="kraken_paper",
            status="error",
            error=f"ticker_fetch_failed: {e}",
        )

    bid_ask = _extract_bid_ask(ticker)
    if bid_ask is None:
        return ExecutionReceipt(
            intent_id=intent.intent_id,
            adapter="kraken_paper",
            status="error",
            error=f"No bid/ask for {intent.pair}",
        )

    bid, ask = bid_ask
    fill_price = ask if intent.side == Direction.LONG else bid

    if fill_price <= 0 or intent.size_usd <= 0:
        return ExecutionReceipt(
            intent_id=intent.intent_id,
            adapter="kraken_paper",
            status="error",
            error=f"Invalid fill: price={fill_price} size={intent.size_usd}",
        )

    amount = intent.size_usd / fill_price
    fees_usd = intent.size_usd * KRAKEN_TAKER_FEE
    spread_bps = ((ask - bid) / ((ask + bid) / 2)) * 10000

    ledger = _load_ledger()
    if not ledger.get("initialized"):
        logger.warning("Paper ledger not initialized; auto-initializing")
        await init_paper()
        ledger = _load_ledger()

    trade_record = {
        "intent_id": intent.intent_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pair": intent.pair,
        "side": intent.side.value,
        "size_usd": round(intent.size_usd, 2),
        "amount": round(amount, 8),
        "fill_price": round(fill_price, 2),
        "fees_usd": round(fees_usd, 4),
        "spread_bps": round(spread_bps, 2),
        "signal_score": round(intent.signal_score, 1),
        "erc_eligible": intent.erc_eligible,
    }

    ledger["balance"] = ledger.get("balance", 0.0) - fees_usd
    ledger["total_fees_usd"] = ledger.get("total_fees_usd", 0.0) + fees_usd
    ledger["total_volume_usd"] = ledger.get("total_volume_usd", 0.0) + intent.size_usd
    ledger.setdefault("positions", {})[intent.pair] = {
        "intent_id": intent.intent_id,
        "side": intent.side.value,
        "size_usd": round(intent.size_usd, 2),
        "amount": round(amount, 8),
        "entry_price": round(fill_price, 2),
        "entry_time": trade_record["timestamp"],
    }
    ledger.setdefault("trades", []).append(trade_record)
    _save_ledger(ledger)

    logger.info(
        "Paper %s %s: %.8f @ $%.2f (fees=$%.4f, spread=%.2fbps)",
        intent.side.value,
        intent.pair,
        amount,
        fill_price,
        fees_usd,
        spread_bps,
    )

    return ExecutionReceipt(
        intent_id=intent.intent_id,
        adapter="kraken_paper",
        status="filled",
        order_id=f"paper-{intent.intent_id}",
        fill_price=fill_price,
        fees_usd=fees_usd,
    )


async def close_paper_position(
    pair: str,
    exit_price: float,
    reason: str = "close",
) -> dict:
    """Close an open paper position and realize PnL into the ledger balance.

    Args:
        pair: Trading pair with an open position.
        exit_price: Price at which to close the position.
        reason: Close reason for the trade record (e.g. "atr_target").

    Returns:
        Dict with pnl_usd, pnl_pct, and updated balance, or error.
    """
    ledger = _load_ledger()
    positions = ledger.get("positions", {})
    pos = positions.get(pair)
    if pos is None:
        return {"status": "error", "error": f"No open position for {pair}"}

    entry = float(pos["entry_price"])
    size_usd = float(pos["size_usd"])
    side = pos["side"]

    if side == "long":
        pnl_pct = (exit_price - entry) / entry
    else:
        pnl_pct = (entry - exit_price) / entry

    exit_fees = size_usd * KRAKEN_TAKER_FEE
    pnl_usd = size_usd * pnl_pct - exit_fees

    ledger["balance"] = ledger.get("balance", 0.0) + pnl_usd
    ledger["total_fees_usd"] = ledger.get("total_fees_usd", 0.0) + exit_fees

    close_record = {
        "intent_id": pos.get("intent_id", "unknown"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pair": pair,
        "side": f"close_{side}",
        "entry_price": entry,
        "exit_price": round(exit_price, 2),
        "size_usd": round(size_usd, 2),
        "pnl_usd": round(pnl_usd, 2),
        "pnl_pct": round(pnl_pct * 100, 3),
        "fees_usd": round(exit_fees, 4),
        "reason": reason,
    }
    ledger.setdefault("trades", []).append(close_record)
    del positions[pair]
    _save_ledger(ledger)

    logger.info(
        "Paper close %s: pnl=$%.2f (%.2f%%) reason=%s balance=$%.2f",
        pair,
        pnl_usd,
        pnl_pct * 100,
        reason,
        ledger["balance"],
    )

    return {
        "status": "closed",
        "pnl_usd": round(pnl_usd, 2),
        "pnl_pct": round(pnl_pct * 100, 3),
        "fees_usd": round(exit_fees, 4),
        "balance": round(ledger["balance"], 2),
    }
