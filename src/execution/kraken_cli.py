"""Kraken CLI adapter — executes real trades via the official kraken binary.

Wraps the official krakenfx/kraken-cli Rust binary (v0.3.0+) for both
live and paper order placement. The CLI handles authentication, nonce
management, and HMAC signing internally via KRAKEN_API_KEY / KRAKEN_API_SECRET
environment variables.

Security: All subprocess calls use create_subprocess_exec (not shell=True)
with hardcoded argument lists to prevent command injection.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone

from src.models import Direction, ExecutionReceipt, TradeIntent

logger = logging.getLogger(__name__)

KRAKEN_BIN = os.getenv("KRAKEN_BIN", "kraken")


async def _run_cli(*args: str, timeout: float = 30.0) -> dict:
    """Run a kraken CLI command and return parsed JSON output.

    Uses asyncio.create_subprocess_exec (no shell) to avoid injection.

    Args:
        *args: CLI arguments (e.g. "order", "buy", "BTCUSD", "0.001").
        timeout: Max seconds to wait for the command.

    Returns:
        Parsed JSON dict from CLI stdout.

    Raises:
        RuntimeError: On non-zero exit code or parse failure.
    """
    cmd = [KRAKEN_BIN, *args, "-o", "json"]
    logger.info("Kraken CLI: %s", " ".join(cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"Kraken CLI timed out after {timeout}s: {' '.join(cmd)}")

    stdout_text = stdout.decode().strip()
    stderr_text = stderr.decode().strip()

    if proc.returncode != 0:
        raise RuntimeError(
            f"Kraken CLI exit {proc.returncode}: {stderr_text or stdout_text}"
        )

    if not stdout_text:
        return {}

    try:
        return json.loads(stdout_text)
    except json.JSONDecodeError:
        for line in stdout_text.splitlines():
            line = line.strip()
            if line.startswith("{") or line.startswith("["):
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    continue
        raise RuntimeError(f"Kraken CLI unparseable output: {stdout_text[:500]}")


async def verify_auth() -> dict:
    """Verify that Kraken API credentials are valid.

    Returns:
        Dict with verification status.
    """
    try:
        result = await _run_cli("balance")
        logger.info("Kraken auth verified: balance response received")
        return {"status": "ok", "balance": result}
    except Exception as e:
        logger.error("Kraken auth failed: %s", e)
        return {"status": "error", "error": str(e)}


async def get_balance() -> dict:
    """Get current account balance via Kraken CLI.

    Returns:
        Balance dict from the CLI.
    """
    return await _run_cli("balance")


async def get_open_orders() -> dict:
    """Get current open orders.

    Returns:
        Open orders dict from the CLI.
    """
    return await _run_cli("open-orders")


async def get_trades_history() -> dict:
    """Get trade history for leaderboard tracking.

    Returns:
        Trades history dict from the CLI.
    """
    return await _run_cli("trades-history")


async def execute_trade(intent: TradeIntent) -> ExecutionReceipt:
    """Execute a real trade via Kraken CLI.

    Places a market order through the authenticated Kraken CLI binary.
    The CLI handles HMAC signing, nonce management, and rate limiting.

    Args:
        intent: Approved trade intent from the risk governor.

    Returns:
        ExecutionReceipt with fill details or error.
    """
    try:
        side = "buy" if intent.side == Direction.LONG else "sell"
        pair = intent.pair

        ticker = await _run_cli("ticker", pair)
        price = _extract_price(ticker, pair, intent.side)
        if price is None or price <= 0:
            return ExecutionReceipt(
                intent_id=intent.intent_id,
                adapter="kraken_cli",
                status="error",
                error="Could not determine current price from ticker",
            )

        volume = round(intent.size_usd / price, 8)
        if volume <= 0:
            return ExecutionReceipt(
                intent_id=intent.intent_id,
                adapter="kraken_cli",
                status="error",
                error=f"Calculated volume too small: {volume}",
            )

        result = await _run_cli(
            "order", side, pair, str(volume), "--type", "market"
        )

        order_id = _extract_order_id(result)
        logger.info(
            "Kraken CLI %s %s: volume=%.8f @ ~$%.2f order=%s",
            side, pair, volume, price, order_id,
        )

        fees_usd = intent.size_usd * 0.0040

        return ExecutionReceipt(
            intent_id=intent.intent_id,
            adapter="kraken_cli",
            status="filled",
            order_id=order_id,
            fill_price=price,
            fees_usd=round(fees_usd, 4),
            raw_output=json.dumps(result)[:500],
        )

    except Exception as e:
        logger.error("Kraken CLI trade failed: %s", e)
        return ExecutionReceipt(
            intent_id=intent.intent_id,
            adapter="kraken_cli",
            status="error",
            error=str(e),
        )


async def close_position(pair: str, side: str, size_usd: float) -> dict:
    """Close a position by placing an opposite market order.

    Args:
        pair: Trading pair.
        side: Current position side ("long" or "short").
        size_usd: Position size in USD.

    Returns:
        Dict with close result or error.
    """
    try:
        close_side = "sell" if side == "long" else "buy"

        ticker = await _run_cli("ticker", pair)
        direction = Direction.SHORT if side == "long" else Direction.LONG
        price = _extract_price(ticker, pair, direction)
        if price is None or price <= 0:
            return {"status": "error", "error": "Could not get price"}

        volume = round(size_usd / price, 8)

        result = await _run_cli(
            "order", close_side, pair, str(volume), "--type", "market"
        )

        order_id = _extract_order_id(result)
        logger.info("Kraken CLI close %s %s: volume=%.8f order=%s",
                     close_side, pair, volume, order_id)

        return {"status": "closed", "order_id": order_id, "result": result}

    except Exception as e:
        logger.error("Kraken CLI close failed: %s", e)
        return {"status": "error", "error": str(e)}


def _extract_price(ticker: dict, pair: str, side: Direction) -> float | None:
    """Extract ask or bid price from kraken CLI ticker output.

    Args:
        ticker: Parsed ticker JSON from the CLI.
        pair: Pair name to look up.
        side: Direction to determine ask (long) vs bid (short).

    Returns:
        Price as float, or None if extraction fails.
    """
    try:
        for key, data in ticker.items():
            if isinstance(data, dict) and "a" in data:
                ask = float(data["a"][0]) if isinstance(data["a"], list) else float(data["a"])
                bid = float(data["b"][0]) if isinstance(data["b"], list) else float(data["b"])
                return ask if side == Direction.LONG else bid
        if isinstance(ticker, dict) and "price" in ticker:
            return float(ticker["price"])
    except (KeyError, IndexError, ValueError, TypeError) as e:
        logger.warning("Price extraction failed for %s: %s", pair, e)
    return None


def _extract_order_id(result: dict) -> str:
    """Extract order/transaction ID from CLI order response.

    Args:
        result: Parsed JSON from the order command.

    Returns:
        Order ID string, or "unknown" if not found.
    """
    if isinstance(result, dict):
        txid = result.get("txid")
        if txid:
            if isinstance(txid, list):
                return txid[0]
            return str(txid)
        descr = result.get("descr", {})
        if isinstance(descr, dict) and "order" in descr:
            return descr["order"]
        result_inner = result.get("result", {})
        if isinstance(result_inner, dict):
            txid = result_inner.get("txid")
            if txid:
                return txid[0] if isinstance(txid, list) else str(txid)
    return f"cli-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
