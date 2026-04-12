"""Deterministic feature engine using pandas_ta."""

import pandas as pd
import pandas_ta as ta

from src.config import STRATEGY
from src.models import Features, Regime


def compute_features_bulk(df: pd.DataFrame, pair: str) -> pd.DataFrame:
    """Pre-compute all technical features for the full DataFrame at once.

    This is much faster than calling compute_features() per-bar because
    pandas_ta vectorizes the indicator computations across all rows.

    Args:
        df: Full OHLCV DataFrame (must have 200+ rows).
        pair: Trading pair identifier.

    Returns:
        DataFrame with all feature columns added, indexed same as input.
    """
    if len(df) < 200:
        raise ValueError(f"Need 200+ bars, got {len(df)}")

    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]

    feat = pd.DataFrame(index=df.index)
    feat["close"] = close

    feat["ema_9"] = ta.ema(close, length=9)
    feat["ema_21"] = ta.ema(close, length=21)
    feat["ema_34"] = ta.ema(close, length=34)
    feat["ema_55"] = ta.ema(close, length=55)
    feat["ema_80"] = ta.ema(close, length=80)
    feat["ema_100"] = ta.ema(close, length=100)
    feat["ema_200"] = ta.ema(close, length=200)

    feat["rsi_14"] = ta.rsi(close, length=14)
    feat["rsi_2"] = ta.rsi(close, length=2)

    macd_df = ta.macd(close, fast=12, slow=26, signal=9)
    feat["macd"] = macd_df.iloc[:, 0]
    feat["macd_signal"] = macd_df.iloc[:, 1]
    feat["macd_histogram"] = macd_df.iloc[:, 2]

    feat["atr_20"] = ta.atr(high, low, close, length=20)

    adx_df = ta.adx(high, low, close, length=14)
    adx_col = [c for c in adx_df.columns if c.startswith("ADX")][0]
    feat["adx_14"] = adx_df[adx_col]

    bb_df = ta.bbands(close, length=20, std=2)
    bbl_col = [c for c in bb_df.columns if "BBL" in c][0]
    bbm_col = [c for c in bb_df.columns if "BBM" in c][0]
    bbu_col = [c for c in bb_df.columns if "BBU" in c][0]
    feat["bb_lower"] = bb_df[bbl_col]
    feat["bb_middle"] = bb_df[bbm_col]
    feat["bb_upper"] = bb_df[bbu_col]
    bb_range = feat["bb_upper"] - feat["bb_lower"]
    bb_range = bb_range.replace(0, 1e-10)
    feat["bb_position"] = (close - feat["bb_lower"]) / bb_range
    bb_width_pct = bb_range / feat["bb_middle"]
    feat["bb_width"] = bb_width_pct
    feat["bb_width_avg"] = bb_width_pct.rolling(50).mean()

    feat["volume_ratio"] = 0.0

    feat["returns_1bar"] = close.pct_change(1)
    feat["returns_5bar"] = close.pct_change(5)
    feat["returns_20bar"] = close.pct_change(20)

    feat["macd_slope"] = feat["macd_histogram"].diff()

    ema_spread_raw = (feat["ema_9"] - feat["ema_55"]).abs()
    feat["ema_spread"] = (ema_spread_raw / feat["ema_21"]).fillna(0)

    feat["engulfing"] = 0

    feat["regime"] = "transition"
    feat.loc[feat["adx_14"] > STRATEGY.adx_trending_threshold, "regime"] = "trending"
    feat.loc[feat["adx_14"] < STRATEGY.adx_ranging_threshold, "regime"] = "ranging"

    feat["rsi_divergence"] = 0
    feat["macd_divergence"] = 0

    feat["high_50"] = 0.0
    feat["low_50"] = 0.0

    feat["pair"] = pair
    return feat


def features_at(bulk: pd.DataFrame, idx: int) -> Features:
    """Extract a Features object from pre-computed bulk DataFrame at index.

    Args:
        bulk: DataFrame from compute_features_bulk().
        idx: Row index position.

    Returns:
        Features object for that bar.
    """
    row = bulk.iloc[idx]
    regime_map = {
        "trending": Regime.TRENDING,
        "ranging": Regime.RANGING,
        "transition": Regime.TRANSITION,
    }
    return Features(
        pair=row["pair"],
        timestamp=bulk.index[idx],
        close=float(row["close"]) if not pd.isna(row.get("close", 0)) else 0.0,
        ema_9=float(row["ema_9"]),
        ema_21=float(row["ema_21"]),
        ema_34=float(row["ema_34"]) if "ema_34" in row.index else 0.0,
        ema_55=float(row["ema_55"]),
        ema_80=float(row["ema_80"]) if "ema_80" in row.index else 0.0,
        ema_100=float(row["ema_100"]),
        ema_200=float(row["ema_200"]),
        rsi_14=float(row["rsi_14"]),
        macd=float(row["macd"]),
        macd_signal=float(row["macd_signal"]),
        macd_histogram=float(row["macd_histogram"]),
        atr_20=float(row["atr_20"]),
        adx_14=float(row["adx_14"]),
        bb_upper=float(row["bb_upper"]),
        bb_middle=float(row["bb_middle"]),
        bb_lower=float(row["bb_lower"]),
        bb_position=float(row["bb_position"]),
        volume_ratio=float(row["volume_ratio"]),
        regime=regime_map.get(row["regime"], Regime.TRANSITION),
        returns_1bar=float(row["returns_1bar"]),
        returns_5bar=float(row["returns_5bar"]),
        returns_20bar=float(row["returns_20bar"]),
        rsi_divergence=int(row["rsi_divergence"]),
        macd_divergence=int(row["macd_divergence"]),
        macd_slope=float(row["macd_slope"]),
        ema_spread=float(row["ema_spread"]),
        engulfing=int(row["engulfing"]),
        rsi_2=float(row["rsi_2"]) if not pd.isna(row.get("rsi_2", 50)) else 50.0,
        high_50=float(row["high_50"]) if not pd.isna(row.get("high_50", 0)) else 0.0,
        low_50=float(row["low_50"]) if not pd.isna(row.get("low_50", 0)) else 0.0,
        bb_width=float(row["bb_width"]) if not pd.isna(row.get("bb_width", 0)) else 0.0,
        bb_width_avg=float(row["bb_width_avg"]) if not pd.isna(row.get("bb_width_avg", 0)) else 0.0,
    )


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
    ema_34 = ta.ema(close, length=34)
    ema_55 = ta.ema(close, length=55)
    ema_80 = ta.ema(close, length=80)
    ema_100 = ta.ema(close, length=100)
    ema_200 = ta.ema(close, length=200)

    rsi = ta.rsi(close, length=14)

    macd_df = ta.macd(close, fast=12, slow=26, signal=9)
    macd_col = macd_df.columns[0]
    signal_col = macd_df.columns[1]
    hist_col = macd_df.columns[2]

    rsi_div = 0
    macd_div = 0

    atr = ta.atr(high, low, close, length=20)

    adx_df = ta.adx(high, low, close, length=14)
    adx_col = [c for c in adx_df.columns if c.startswith("ADX")][0]

    bb_df = ta.bbands(close, length=20, std=2)
    bbl_col = [c for c in bb_df.columns if "BBL" in c][0]
    bbm_col = [c for c in bb_df.columns if "BBM" in c][0]
    bbu_col = [c for c in bb_df.columns if "BBU" in c][0]

    latest = len(df) - 1
    latest_close = float(close.iloc[latest])
    bb_l = float(bb_df[bbl_col].iloc[latest])
    bb_u = float(bb_df[bbu_col].iloc[latest])
    bb_range = bb_u - bb_l if bb_u != bb_l else 1e-10
    bb_pos = (latest_close - bb_l) / bb_range
    bb_m = float(bb_df[bbm_col].iloc[latest])
    bb_width_pct = bb_range / bb_m if bb_m > 0 else 0.0
    bb_width_series = (bb_df[bbu_col] - bb_df[bbl_col]) / bb_df[bbm_col]
    bb_width_avg_val = float(bb_width_series.rolling(50).mean().iloc[latest]) if latest >= 50 else bb_width_pct

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

    hist_now = float(macd_df[hist_col].iloc[latest])
    hist_prev = float(macd_df[hist_col].iloc[latest - 1]) if latest > 0 else hist_now
    macd_slope_val = hist_now - hist_prev

    engulfing_val = 0

    ema9_val = float(ema_9.iloc[latest])
    ema21_val = float(ema_21.iloc[latest])
    ema55_val = float(ema_55.iloc[latest])
    ema_spread_val = abs(ema9_val - ema55_val) / ema21_val if ema21_val > 0 else 0.0

    return Features(
        pair=pair,
        timestamp=df.index[latest],
        close=latest_close,
        ema_9=float(ema_9.iloc[latest]),
        ema_21=float(ema_21.iloc[latest]),
        ema_34=float(ema_34.iloc[latest]),
        ema_55=float(ema_55.iloc[latest]),
        ema_80=float(ema_80.iloc[latest]),
        ema_100=float(ema_100.iloc[latest]),
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
        volume_ratio=0.0,
        regime=regime,
        returns_1bar=returns_1,
        returns_5bar=returns_5,
        returns_20bar=returns_20,
        rsi_divergence=rsi_div,
        macd_divergence=macd_div,
        macd_slope=macd_slope_val,
        ema_spread=ema_spread_val,
        engulfing=engulfing_val,
        high_50=0.0,
        low_50=0.0,
        bb_width=bb_width_pct,
        bb_width_avg=bb_width_avg_val,
    )
