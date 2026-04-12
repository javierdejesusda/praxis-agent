"""Persistent on-chain attestation log.

Single source of truth for recording validation, reputation, and trade
intent transactions produced by RiskRouterAdapter. The orchestrator
writes through this module so the dashboard and /api/attestations
endpoint see a unified stream.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Optional

from src.config import STATE_DIR

ATTESTATIONS_PATH = STATE_DIR / "attestations.json"
MAX_RETAINED = 500

_write_lock = asyncio.Lock()


def _normalize_tx(tx: str) -> str:
    return tx if tx.startswith("0x") else f"0x{tx}"


def _load() -> list[dict]:
    if not ATTESTATIONS_PATH.exists():
        return []
    try:
        return json.loads(ATTESTATIONS_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def _dump(records: list[dict]) -> None:
    ATTESTATIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    ATTESTATIONS_PATH.write_text(json.dumps(records, indent=2))


def _build_record(
    kind: str,
    tx: str,
    artifact: dict,
    extra: Optional[dict] = None,
) -> dict:
    record = {
        "kind": kind,
        "tx_hash": _normalize_tx(tx),
        "artifact_hash": artifact.get("hash", ""),
        "artifact_type": artifact.get("type", ""),
        "pair": artifact.get("payload", {}).get("pair", ""),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if extra:
        record.update(extra)
    return record


async def record_attestation_async(
    kind: str,
    tx: str,
    artifact: dict,
    extra: Optional[dict] = None,
) -> None:
    """Append an attestation record from an async context."""
    async with _write_lock:
        records = _load()
        records.append(_build_record(kind, tx, artifact, extra))
        if len(records) > MAX_RETAINED:
            records = records[-MAX_RETAINED:]
        _dump(records)


def record_attestation_sync(
    kind: str,
    tx: str,
    artifact: dict,
    extra: Optional[dict] = None,
) -> None:
    """Append an attestation record from a sync context.

    The async lock is bypassed because sync callers (test harnesses)
    are expected to be single-threaded.
    """
    records = _load()
    records.append(_build_record(kind, tx, artifact, extra))
    if len(records) > MAX_RETAINED:
        records = records[-MAX_RETAINED:]
    _dump(records)
