"""Deterministic feature engine using pandas_ta."""

import pandas as pd
import pandas_ta as ta

from src.config import STRATEGY
from src.models import Features, Regime


def compute_features(df: pd.DataFrame, pair: str) -> Features:
    """Compute all technical features from OHLCV DataFrame.

    Args:
        df: DataFrame with columns [open, high, low, close, volume] and
            DatetimeIndex. Must have at least 200 rows.
        pair: Trading pair identifier (e.g. "BTCUSD").

    Returns:
        Features object with all computed indicators for the latest bar.
    """
    if len(df) < 200:
        raise ValueError(f"Need 200+ bars, got {len(df)}")

    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]

    ema_9 = ta.ema(close, length=9)
    ema_21 = ta.ema(close, length=21)
    ema_55 = ta.ema(close, length=55)
    ema_200 = ta.ema(close, length=200)

    rsi = ta.rsi(close, length=14)

    macd_df = ta.macd(close, fast=12, slow=26, signal=9)
    macd_col = macd_df.columns[0]
    signal_col = macd_df.columns[1]
    hist_col = macd_df.columns[2]

    atr = ta.atr(high, low, close, length=20)

    adx_df = ta.adx(high, low, close, length=14)
    adx_col = [c for c in adx_df.columns if c.startswith("ADX")][0]

    bb_df = ta.bbands(close, length=20, std=2)
    bbl_col = [c for c in bb_df.columns if "BBL" in c][0]
    bbm_col = [c for c in bb_df.columns if "BBM" in c][0]
    bbu_col = [c for c in bb_df.columns if "BBU" in c][0]

    vol_avg = volume.rolling(20).mean()

    latest = len(df) - 1
    latest_close = float(close.iloc[latest])
    bb_l = float(bb_df[bbl_col].iloc[latest])
    bb_u = float(bb_df[bbu_col].iloc[latest])
    bb_range = bb_u - bb_l if bb_u != bb_l else 1e-10
    bb_pos = (latest_close - bb_l) / bb_range

    adx_val = float(adx_df[adx_col].iloc[latest])
    if adx_val > STRATEGY.adx_trending_threshold:
        regime = Regime.TRENDING
    elif adx_val < STRATEGY.adx_ranging_threshold:
        regime = Regime.RANGING
    else:
        regime = Regime.TRANSITION

    returns_1 = float(close.pct_change(1).iloc[latest])
    returns_5 = float(close.pct_change(5).iloc[latest])
    returns_20 = float(close.pct_change(20).iloc[latest])

    return Features(
        pair=pair,
        timestamp=df.index[latest],
        ema_9=float(ema_9.iloc[latest]),
        ema_21=float(ema_21.iloc[latest]),
        ema_55=float(ema_55.iloc[latest]),
        ema_200=float(ema_200.iloc[latest]),
        rsi_14=float(rsi.iloc[latest]),
        macd=float(macd_df[macd_col].iloc[latest]),
        macd_signal=float(macd_df[signal_col].iloc[latest]),
        macd_histogram=float(macd_df[hist_col].iloc[latest]),
        atr_20=float(atr.iloc[latest]),
        adx_14=adx_val,
        bb_upper=bb_u,
        bb_middle=float(bb_df[bbm_col].iloc[latest]),
        bb_lower=bb_l,
        bb_position=bb_pos,
        volume_ratio=float(volume.iloc[latest] / vol_avg.iloc[latest])
        if vol_avg.iloc[latest] > 0
        else 0.0,
        regime=regime,
        returns_1bar=returns_1,
        returns_5bar=returns_5,
        returns_20bar=returns_20,
    )
