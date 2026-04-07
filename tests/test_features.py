"""Tests for the deterministic feature engine."""

import numpy as np
import pandas as pd
import pytest

from src.features.engine import compute_features
from src.models import Features, Regime


def _make_ohlcv(n: int = 250, base_price: float = 68000.0) -> pd.DataFrame:
    """Generate synthetic OHLCV data for testing."""
    np.random.seed(42)
    dates = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    returns = np.random.normal(0, 0.002, n)
    close = base_price * np.cumprod(1 + returns)
    high = close * (1 + np.random.uniform(0, 0.005, n))
    low = close * (1 - np.random.uniform(0, 0.005, n))
    open_ = np.roll(close, 1)
    open_[0] = base_price
    volume = np.random.uniform(100, 1000, n)

    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=dates,
    )


def test_compute_features_produces_valid_output():
    df = _make_ohlcv()
    features = compute_features(df, "BTCUSD")
    assert features.pair == "BTCUSD"
    assert 0 <= features.rsi_14 <= 100
    assert features.atr_20 > 0
    assert features.adx_14 >= 0
    assert features.regime in (Regime.TRENDING, Regime.RANGING, Regime.TRANSITION)


def test_compute_features_rejects_short_data():
    df = _make_ohlcv(n=50)
    with pytest.raises(ValueError, match="Need 200"):
        compute_features(df, "BTCUSD")


def test_ema_ordering():
    df = _make_ohlcv()
    features = compute_features(df, "BTCUSD")
    assert features.ema_9 != 0
    assert features.ema_200 != 0


def test_features_divergence_fields():
    """Features model should accept divergence fields with defaults."""
    features = Features(
        pair="BTCUSD",
        timestamp=pd.Timestamp.now(tz="UTC"),
        ema_9=68000.0, ema_21=67500.0, ema_55=67000.0, ema_200=65000.0,
        rsi_14=55.0, macd=100.0, macd_signal=80.0, macd_histogram=20.0,
        atr_20=500.0, adx_14=30.0,
        bb_upper=69000.0, bb_middle=68000.0, bb_lower=67000.0, bb_position=0.5,
        volume_ratio=1.2, regime=Regime.TRENDING,
    )
    assert features.rsi_divergence == 0
    assert features.macd_divergence == 0

    bullish = Features(
        pair="BTCUSD",
        timestamp=pd.Timestamp.now(tz="UTC"),
        ema_9=68000.0, ema_21=67500.0, ema_55=67000.0, ema_200=65000.0,
        rsi_14=55.0, macd=100.0, macd_signal=80.0, macd_histogram=20.0,
        atr_20=500.0, adx_14=30.0,
        bb_upper=69000.0, bb_middle=68000.0, bb_lower=67000.0, bb_position=0.5,
        volume_ratio=1.2, regime=Regime.TRENDING,
        rsi_divergence=1, macd_divergence=1,
    )
    assert bullish.rsi_divergence == 1
    assert bullish.macd_divergence == 1
