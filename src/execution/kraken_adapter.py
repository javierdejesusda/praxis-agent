"""Kraken CLI paper trading adapter via WSL subprocess."""

import asyncio
import json
import logging
from typing import Optional

from src.models import Direction, ExecutionReceipt, TradeIntent

logger = logging.getLogger(__name__)


async def _run_kraken(args: list[str]) -> dict:
    """Run a Kraken CLI command via WSL and parse JSON output.

    Args:
        args: Command arguments (e.g. ["ticker", "BTCUSD"]).

    Returns:
        Parsed JSON dict from stdout.

    Raises:
        RuntimeError: On malformed output or non-zero exit code.
    """
    cmd = ["wsl", "kraken"] + args + ["-o", "json"]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)

    if proc.returncode != 0:
        error_text = stderr.decode().strip()
        try:
            error_json = json.loads(stdout.decode())
            raise RuntimeError(
                f"Kraken CLI error: {error_json.get('error', error_text)}"
            )
        except json.JSONDecodeError:
            raise RuntimeError(f"Kraken CLI failed: {error_text}")

    try:
        return json.loads(stdout.decode())
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Kraken CLI malformed output: {e}")


async def get_ticker(pair: str) -> dict:
    """Get current ticker for a pair."""
    return await _run_kraken(["ticker", pair])


async def get_ohlc(pair: str, interval: int = 60) -> dict:
    """Get OHLC candle data.

    Args:
        pair: Kraken pair symbol.
        interval: Candle interval in minutes (60 = 1h, 240 = 4h).
    """
    return await _run_kraken(["ohlc", pair, "--interval", str(interval)])


async def init_paper(balance: float = 10000.0) -> dict:
    """Initialize paper trading account."""
    return await _run_kraken(
        ["paper", "init", "--balance", str(balance), "--currency", "USD"]
    )


async def paper_balance() -> dict:
    """Get paper trading balance."""
    return await _run_kraken(["paper", "balance"])


async def paper_status() -> dict:
    """Get paper trading portfolio status."""
    return await _run_kraken(["paper", "status"])


async def paper_buy(pair: str, amount: float, price: Optional[float] = None) -> dict:
    """Place a paper buy order."""
    args = ["paper", "buy", pair, str(amount)]
    if price is not None:
        args.extend(["--type", "limit", "--price", str(price)])
    return await _run_kraken(args)


async def paper_sell(pair: str, amount: float, price: Optional[float] = None) -> dict:
    """Place a paper sell order (sells held assets)."""
    args = ["paper", "sell", pair, str(amount)]
    if price is not None:
        args.extend(["--type", "limit", "--price", str(price)])
    return await _run_kraken(args)


async def execute_paper_trade(intent: TradeIntent) -> ExecutionReceipt:
    """Execute a trade intent via Kraken CLI paper mode.

    Args:
        intent: Approved trade intent from risk governor.

    Returns:
        ExecutionReceipt with fill details or error.
    """
    try:
        ticker = await get_ticker(intent.pair)
        pair_key = list(ticker.keys())[0] if ticker else intent.pair
        ask_price = float(ticker[pair_key]["a"][0]) if pair_key in ticker else None
        bid_price = float(ticker[pair_key]["b"][0]) if pair_key in ticker else None

        if intent.side == Direction.LONG:
            price = intent.limit_price or ask_price
            amount = intent.size_usd / price if price else 0
            result = await paper_buy(intent.pair, round(amount, 8), price)
        else:
            price = intent.limit_price or bid_price
            amount = intent.size_usd / price if price else 0
            result = await paper_sell(intent.pair, round(amount, 8), price)

        return ExecutionReceipt(
            intent_id=intent.intent_id,
            adapter="kraken_paper",
            status="filled",
            fill_price=price,
            fees_usd=intent.size_usd * 0.0026,
            raw_output=json.dumps(result)[:500],
        )

    except Exception as e:
        logger.error("Paper trade failed: %s", e)
        return ExecutionReceipt(
            intent_id=intent.intent_id,
            adapter="kraken_paper",
            status="error",
            error=str(e),
        )
