"""FastAPI backend serving trading data to the dashboard frontend."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.artifacts.hasher import canonical_json
from src.config import ARTIFACTS_DIR, STATE_DIR
from src.execution.kraken_adapter import get_ohlc
from src.features.fmp_prices import get_crypto_intraday, get_crypto_quote
from src.features.prism import get_signals as prism_signals, get_risk_metrics as prism_risk

logger = logging.getLogger(__name__)

app = FastAPI(title="Aegis Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_portfolio() -> dict:
    path = STATE_DIR / "portfolio.json"
    if path.exists():
        return json.loads(path.read_text())
    return {
        "equity": 10000.0,
        "cash": 10000.0,
        "positions": {},
        "daily_pnl": 0.0,
        "total_pnl": 0.0,
        "peak_equity": 10000.0,
        "drawdown_pct": 0.0,
        "consecutive_losses": 0,
        "trade_count": 0,
        "daily_trade_count": 0,
    }


def _load_artifacts(limit: int = 50) -> list[dict]:
    if not ARTIFACTS_DIR.exists():
        return []
    files = ARTIFACTS_DIR.glob("*.json")
    artifacts = []
    for f in files:
        try:
            artifacts.append(json.loads(f.read_text()))
        except (json.JSONDecodeError, OSError):
            pass
    artifacts.sort(key=lambda a: a.get("timestamp", ""), reverse=True)
    return artifacts[:limit]


@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/portfolio")
async def portfolio():
    return _load_portfolio()


@app.get("/api/artifacts")
async def artifacts(limit: int = 50):
    return _load_artifacts(limit)


@app.get("/api/trades")
async def trades():
    all_artifacts = _load_artifacts(200)
    return [a for a in all_artifacts if a.get("type") in ("trade-execution", "position-close")]


@app.get("/api/rejections")
async def rejections():
    all_artifacts = _load_artifacts(200)
    return [a for a in all_artifacts if a.get("type") == "no-trade"]


@app.get("/api/signals/latest")
async def latest_signals():
    all_artifacts = _load_artifacts(10)
    for a in all_artifacts:
        payload = a.get("payload", {})
        if "signals" in payload:
            return {
                "timestamp": a.get("timestamp"),
                "type": a.get("type"),
                "signals": payload["signals"],
                "analyst": payload.get("analyst"),
                "risk_decision": payload.get("risk_decision"),
            }
    return {"signals": [], "analyst": None, "risk_decision": None}


@app.get("/api/kill-criteria")
async def kill_criteria():
    portfolio = _load_portfolio()
    daily_pnl = float(portfolio.get("daily_pnl", 0))
    equity = float(portfolio.get("equity", 10000))
    drawdown = float(portfolio.get("drawdown_pct", 0))
    return {
        "stale_data": False,
        "malformed_output": False,
        "ledger_mismatch": False,
        "spread_too_wide": False,
        "daily_loss_breached": daily_pnl < -(equity * 0.03),
        "max_drawdown_breached": drawdown > 0.08,
        "kill_switch": False,
    }


@app.get("/api/regime")
async def regime():
    """Current market regime from the latest signal cycle."""
    all_artifacts = _load_artifacts(10)
    for a in all_artifacts:
        payload = a.get("payload", {})
        signals = payload.get("signals", [])
        for sig in signals:
            evidence = sig.get("evidence", {})
            if "regime" in evidence:
                return {
                    "regime": evidence["regime"],
                    "adx": evidence.get("adx", 0),
                    "pair": sig.get("pair", ""),
                    "timestamp": a.get("timestamp"),
                }
    return {"regime": "unknown", "adx": 0, "pair": "", "timestamp": None}


def _load_attestations() -> list[dict]:
    path = STATE_DIR / "attestations.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []


@app.get("/api/onchain/status")
async def onchain_status():
    """On-chain execution status summary across trades and attestations."""
    all_artifacts = _load_artifacts(500)
    onchain_trades = []
    for a in all_artifacts:
        payload = a.get("payload", {})
        receipt = payload.get("receipt", {})
        if receipt.get("adapter") == "risk_router":
            onchain_trades.append({
                "intent_id": receipt.get("intent_id"),
                "status": receipt.get("status"),
                "tx_hash": receipt.get("order_id"),
                "timestamp": a.get("timestamp"),
            })

    attestations = _load_attestations()
    totals = {"validation": 0, "reputation": 0, "trade_intent": 0}
    for rec in attestations:
        kind = rec.get("kind")
        if kind in totals:
            totals[kind] += 1

    return {
        "enabled": True,
        "total_onchain_trades": len(onchain_trades),
        "trades": onchain_trades[:20],
        "attestation_totals": totals,
        "total_attestations": sum(totals.values()),
        "recent_attestations": list(reversed(attestations))[:20],
    }


@app.get("/api/attestations")
async def attestations():
    """Full persisted attestation log (most recent first)."""
    records = _load_attestations()
    return {
        "total": len(records),
        "records": list(reversed(records)),
    }


@app.get("/api/backtest")
async def backtest_report():
    """Return the most recent saved backtest report."""
    path = STATE_DIR / "backtest_report.json"
    if not path.exists():
        return {"available": False}
    try:
        data = json.loads(path.read_text())
        data["available"] = True
        return data
    except (json.JSONDecodeError, OSError) as exc:
        return {"available": False, "error": str(exc)}


async def _kraken_candles(pair: str, interval: int, limit: int) -> list[dict]:
    """Fallback: fetch candles from Kraken OHLC when FMP is unavailable."""
    result = await get_ohlc(pair, interval=interval)
    rows: list[list] = []
    for key, value in result.items():
        if key == "last":
            continue
        if isinstance(value, list):
            rows = value
            break
    if limit > 0 and len(rows) > limit:
        rows = rows[-limit:]
    candles: list[dict] = []
    for row in rows:
        if len(row) < 7:
            continue
        try:
            candles.append(
                {
                    "t": int(row[0]),
                    "o": float(row[1]),
                    "h": float(row[2]),
                    "l": float(row[3]),
                    "c": float(row[4]),
                    "v": float(row[6]),
                }
            )
        except (TypeError, ValueError):
            continue
    return candles


@app.get("/api/prices/{pair}")
async def prices(pair: str, interval: int = 60, limit: int = 120):
    """OHLC candle series for a trading pair.

    Prefers Financial Modeling Prep (FMP) for reliable, geo-agnostic data.
    Falls back to Kraken OHLC if FMP is unconfigured or fails.

    Args:
        pair: Trading pair (e.g. "BTCUSD", "ETHUSD").
        interval: Candle interval in minutes (1, 5, 60 for FMP).
        limit: Maximum number of most-recent candles to return.

    Returns:
        Dict with pair, interval, source, and a list of candle dicts
        ``{t, o, h, l, c, v}`` where ``t`` is unix seconds.
    """
    pair_up = pair.upper()

    try:
        candles = await get_crypto_intraday(pair_up, interval=interval, limit=limit)
        if candles:
            return {
                "pair": pair_up,
                "interval": interval,
                "source": "fmp",
                "candles": candles,
            }
    except RuntimeError as exc:
        logger.info("FMP unavailable, falling back to Kraken: %s", exc)
    except Exception as exc:  # noqa: BLE001 — fall through to Kraken
        logger.warning("FMP error for %s, falling back to Kraken: %s", pair_up, exc)

    try:
        candles = await _kraken_candles(pair_up, interval=interval, limit=limit)
    except Exception as exc:  # noqa: BLE001 — surface as empty
        return {
            "pair": pair_up,
            "interval": interval,
            "source": "error",
            "candles": [],
            "error": str(exc),
        }

    return {
        "pair": pair_up,
        "interval": interval,
        "source": "kraken",
        "candles": candles,
    }


@app.get("/api/quote/{pair}")
async def quote(pair: str):
    """Live quote for a crypto pair via FMP.

    Intended for a fast (~3s) polling loop from the dashboard's real-time
    ticker. Returns ``{pair, price, change, volume, ts}`` or an
    ``error`` field when the upstream is unavailable.
    """
    pair_up = pair.upper()
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        data = await get_crypto_quote(pair_up)
    except RuntimeError as exc:
        return {"pair": pair_up, "ts": now_iso, "error": str(exc)}
    except Exception as exc:  # noqa: BLE001
        logger.warning("FMP quote error for %s: %s", pair_up, exc)
        return {"pair": pair_up, "ts": now_iso, "error": str(exc)}

    if not data:
        return {"pair": pair_up, "ts": now_iso, "error": "no quote"}

    return {
        "pair": pair_up,
        "ts": now_iso,
        "price": data["price"],
        "change": data["change"],
        "volume": data["volume"],
    }


@app.get("/api/prism/{symbol}")
async def prism_data(symbol: str):
    """Live PRISM market intelligence for a symbol."""
    signals = await prism_signals(symbol.upper())
    risk = await prism_risk(symbol.upper())
    return {
        "symbol": symbol.upper(),
        "signals": signals,
        "risk": risk,
    }


@app.get("/api/stats")
async def stats():
    portfolio = _load_portfolio()
    all_artifacts = _load_artifacts(500)
    trade_artifacts = [a for a in all_artifacts if a.get("type") == "trade-execution"]
    no_trade_artifacts = [a for a in all_artifacts if a.get("type") == "no-trade"]

    return {
        "equity": portfolio.get("equity", 10000),
        "total_pnl": portfolio.get("total_pnl", 0),
        "drawdown_pct": portfolio.get("drawdown_pct", 0),
        "trade_count": len(trade_artifacts),
        "rejection_count": len(no_trade_artifacts),
        "total_decisions": len(trade_artifacts) + len(no_trade_artifacts),
        "validation_rate": (
            len(trade_artifacts) / max(1, len(trade_artifacts) + len(no_trade_artifacts))
        )
        * 100,
        "positions": portfolio.get("positions", {}),
    }
