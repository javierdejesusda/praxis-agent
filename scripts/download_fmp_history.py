"""Download maximum 1h crypto history from Financial Modeling Prep.

FMP's /stable/historical-chart/1hour endpoint returns up to ~2160 bars per
request (90-day windows). We paginate backward from today until the API
returns no rows, giving us the full available history — empirically this
reaches back to late 2013 for BTC and early 2016 for ETH.

Usage:
    python scripts/download_fmp_history.py                # BTC+ETH, 1h
    python scripts/download_fmp_history.py BTCUSD         # one pair
    python scripts/download_fmp_history.py BTCUSD,ETHUSD 2013
"""

import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pandas as pd
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger("fmp_download")

FMP_KEY = os.getenv("FMP_API_KEY")
BASE = "https://financialmodelingprep.com/stable/historical-chart/1hour"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
WINDOW_DAYS = 85
REQUEST_DELAY = 0.12


def _fetch_window(client: httpx.Client, symbol: str, frm: str, to: str) -> list[dict]:
    """Fetch a single FMP window (returns raw rows, newest-first)."""
    r = client.get(
        BASE,
        params={"symbol": symbol, "from": frm, "to": to, "apikey": FMP_KEY},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        return []
    return data


def download_pair(symbol: str, start_year: int = 2013) -> pd.DataFrame:
    """Paginate backward in 85-day windows until no data returned.

    Args:
        symbol: FMP crypto symbol like ``BTCUSD``.
        start_year: Hard floor year for the backward walk.

    Returns:
        DataFrame with OHLCV columns, UTC DatetimeIndex, sorted ascending,
        deduplicated.
    """
    all_rows: list[dict] = []
    end = datetime.now(timezone.utc).replace(tzinfo=None)
    floor = datetime(start_year, 1, 1)
    empty_streak = 0

    with httpx.Client() as client:
        while end > floor:
            start = end - timedelta(days=WINDOW_DAYS)
            if start < floor:
                start = floor
            rows = _fetch_window(
                client, symbol, start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
            )
            if not rows:
                empty_streak += 1
                logger.info(
                    "%s %s -> %s: EMPTY (streak=%d)",
                    symbol,
                    start.date(),
                    end.date(),
                    empty_streak,
                )
                if empty_streak >= 3:
                    break
                end = start
                time.sleep(REQUEST_DELAY)
                continue
            empty_streak = 0
            all_rows.extend(rows)
            oldest = rows[-1]["date"]
            newest = rows[0]["date"]
            logger.info(
                "%s %s -> %s: %d rows (oldest %s)",
                symbol,
                start.date(),
                end.date(),
                len(rows),
                oldest,
            )
            end = start
            time.sleep(REQUEST_DELAY)

    if not all_rows:
        raise RuntimeError(f"No data fetched for {symbol}")

    df = pd.DataFrame(all_rows)
    df["timestamp"] = pd.to_datetime(df["date"], utc=True)
    df = df.drop(columns=["date"])
    df = df.set_index("timestamp").sort_index()
    df = df[~df.index.duplicated(keep="first")]
    df = df[["open", "high", "low", "close", "volume"]].astype(float)
    return df


def save_csv(df: pd.DataFrame, pair: str, interval: int = 60) -> Path:
    DATA_DIR.mkdir(exist_ok=True)
    path = DATA_DIR / f"{pair}_{interval}m_fmp.csv"
    df.to_csv(path)
    return path


def main() -> None:
    if not FMP_KEY:
        raise SystemExit("FMP_API_KEY missing from .env")
    pairs = ["BTCUSD", "ETHUSD"]
    start_year = 2013
    if len(sys.argv) > 1:
        pairs = [p.strip().upper() for p in sys.argv[1].split(",")]
    if len(sys.argv) > 2:
        start_year = int(sys.argv[2])

    for pair in pairs:
        logger.info("Downloading %s from %d...", pair, start_year)
        df = download_pair(pair, start_year=start_year)
        path = save_csv(df, pair)
        span = (df.index[-1] - df.index[0]).days
        logger.info(
            "Saved %s: %d bars (%.1f years) -> %s  [%s to %s]",
            pair,
            len(df),
            span / 365.25,
            path,
            df.index[0],
            df.index[-1],
        )


if __name__ == "__main__":
    main()
