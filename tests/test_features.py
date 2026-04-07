"""Tests for the deterministic feature engine."""

import numpy as np
import pandas as pd
import pytest

from src.features.engine import compute_features
from src.models import Regime


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
