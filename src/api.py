"""FastAPI backend serving trading data to the dashboard frontend."""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.artifacts.hasher import canonical_json
from src.config import ARTIFACTS_DIR, STATE_DIR

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
    files = sorted(ARTIFACTS_DIR.glob("*.json"), reverse=True)[:limit]
    artifacts = []
    for f in files:
        try:
            artifacts.append(json.loads(f.read_text()))
        except Exception:
            pass
    return artifacts


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
    return [a for a in all_artifacts if a.get("type") == "trade-execution"]


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
    return {
        "stale_data": False,
        "malformed_output": False,
        "ledger_mismatch": False,
        "spread_too_wide": False,
        "daily_loss_breached": portfolio.get("daily_pnl", 0) < -(
            portfolio.get("equity", 10000) * 0.03
        ),
        "max_drawdown_breached": portfolio.get("drawdown_pct", 0) > 0.08,
        "kill_switch": False,
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
