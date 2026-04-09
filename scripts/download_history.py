"""Download maximum historical OHLC data and save to CSV.

Uses the Binance public API (no key needed) for deep historical data.
BTC/ETH prices across major exchanges are within 0.1% — accurate for backtesting.
Saves to data/<PAIR>_<interval>m.csv in the same format the backtester expects.

Usage:
    python scripts/download_history.py                    # Default: BTC+ETH, 1h, from 2017
    python scripts/download_history.py BTCUSD 60 2019     # Custom pair, interval, start year
    python scripts/download_history.py BTCUSD,ETHUSD 60 2017
"""

import asyncio
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

BINANCE_BASE = "https://api.binance.com/api/v3"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
REQUEST_DELAY = 0.5
BARS_PER_REQUEST = 1000

PAIR_MAP = {
    "BTCUSD": "BTCUSDT",
    "ETHUSD": "ETHUSDT",
    "BTCUSDT": "BTCUSDT",
    "ETHUSDT": "ETHUSDT",
}

INTERVAL_MAP = {
    1: "1m",
    5: "5m",
    15: "15m",
    30: "30m",
    60: "1h",
    240: "4h",
    1440: "1d",
}


async def download_ohlc(
    pair: str,
    interval: int = 60,
    start_year: int = 2017,
) -> pd.DataFrame:
    """Download OHLC data from Binance going back to start_year.

    Args:
        pair: Trading pair (e.g. "BTCUSD" or "BTCUSDT").
        interval: Candle interval in minutes.
        start_year: Year to start downloading from.

    Returns:
        DataFrame with OHLCV columns and UTC DatetimeIndex.
    """
    binance_symbol = PAIR_MAP.get(pair, pair)
    binance_interval = INTERVAL_MAP.get(interval)
    if binance_interval is None:
        raise ValueError(f"Unsupported interval: {interval}. Use: {list(INTERVAL_MAP.keys())}")

    start_ms = int(datetime(start_year, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    now_ms = int(time.time() * 1000)

    all_rows = []
    page = 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        current_ms = start_ms
        while current_ms < now_ms:
            page += 1
            try:
                resp = await client.get(
                    f"{BINANCE_BASE}/klines",
                    params={
                        "symbol": binance_symbol,
                        "interval": binance_interval,
                        "startTime": current_ms,
                        "limit": BARS_PER_REQUEST,
                    },
                )
                resp.raise_for_status()
                rows = resp.json()

                if not rows:
                    logger.info("No more data at page %d", page)
                    break

                all_rows.extend(rows)
                last_open_time = int(rows[-1][0])
                current_ms = last_open_time + (interval * 60 * 1000)

                total = len(all_rows)
                first_dt = datetime.fromtimestamp(int(all_rows[0][0]) / 1000, tz=timezone.utc)
                last_dt = datetime.fromtimestamp(last_open_time / 1000, tz=timezone.utc)

                if page % 10 == 0 or len(rows) < BARS_PER_REQUEST:
                    logger.info(
                        "Page %d: %d total bars | %s to %s",
                        page, total,
                        first_dt.strftime("%Y-%m-%d"),
                        last_dt.strftime("%Y-%m-%d %H:%M"),
                    )

                if len(rows) < BARS_PER_REQUEST:
                    break

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    logger.warning("Rate limited, waiting 30s...")
                    await asyncio.sleep(30)
                    continue
                logger.error("HTTP error on page %d: %s", page, e)
                break
            except Exception as e:
                logger.error("Error on page %d: %s", page, e)
                break

            await asyncio.sleep(REQUEST_DELAY)

    if not all_rows:
        raise RuntimeError(f"No OHLC data downloaded for {pair}")

    df = pd.DataFrame(
        all_rows,
        columns=[
            "timestamp", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades", "taker_buy_base",
            "taker_buy_quote", "ignore",
        ],
    )
    df["timestamp"] = pd.to_datetime(df["timestamp"].astype(float), unit="ms", utc=True)
    df = df.set_index("timestamp")
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)
    df = df.sort_index()
    df = df[~df.index.duplicated(keep="first")]
    df = df[["open", "high", "low", "close", "volume"]]

    return df


def save_csv(df: pd.DataFrame, pair: str, interval: int) -> Path:
    """Save DataFrame to CSV in the data directory.

    Args:
        df: OHLCV DataFrame.
        pair: Trading pair name (uses original name, e.g. "BTCUSD").
        interval: Candle interval in minutes.

    Returns:
        Path to the saved CSV file.
    """
    DATA_DIR.mkdir(exist_ok=True)
    path = DATA_DIR / f"{pair}_{interval}m.csv"
    df.to_csv(path)
    return path


async def main():
    pairs = ["BTCUSD", "ETHUSD"]
    interval = 60
    start_year = 2017

    if len(sys.argv) > 1:
        pairs = sys.argv[1].split(",")
    if len(sys.argv) > 2:
        interval = int(sys.argv[2])
    if len(sys.argv) > 3:
        start_year = int(sys.argv[3])

    print(f"\n{'='*60}")
    print(f"  HISTORICAL DATA DOWNLOADER (Binance)")
    print(f"  Pairs: {', '.join(pairs)}")
    print(f"  Interval: {interval}min")
    print(f"  Start year: {start_year}")
    print(f"{'='*60}\n")

    for pair in pairs:
        print(f"Downloading {pair}...")
        df = await download_ohlc(pair, interval=interval, start_year=start_year)

        path = save_csv(df, pair, interval)
        days = (df.index[-1] - df.index[0]).days
        years = days / 365.25
        print(f"  Saved {len(df):,} bars ({years:.1f} years) to {path}")
        print(f"  Range: {df.index[0]} to {df.index[-1]}")
        print()

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
