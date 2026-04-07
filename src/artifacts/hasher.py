"""Canonical JSON hashing for ERC-8004 validation artifacts (RFC 8785)."""

import hashlib
import json
from datetime import datetime, timezone
from typing import Any


def _default_serializer(obj: Any) -> str:
    """Convert non-serializable types to fixed-precision strings."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, float):
        return f"{obj:.8f}"
    return str(obj)


def _normalize(obj: Any) -> Any:
    """Recursively normalize floats to fixed-precision strings."""
    if isinstance(obj, dict):
        return {k: _normalize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_normalize(v) for v in obj]
    if isinstance(obj, float):
        return f"{obj:.8f}"
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


def canonical_json(obj: dict) -> str:
    """Produce deterministic JSON per RFC 8785.

    Args:
        obj: Dictionary to serialize.

    Returns:
        Canonical JSON string with sorted keys and no whitespace.
    """
    normalized = _normalize(obj)
    return json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        default=_default_serializer,
    )


def artifact_hash(obj: dict) -> str:
    """Compute SHA-256 hash of canonical JSON.

    Args:
        obj: Dictionary to hash.

    Returns:
        Hex-encoded SHA-256 hash string.
    """
    return hashlib.sha256(canonical_json(obj).encode()).hexdigest()


def build_artifact(
    artifact_type: str,
    data: dict,
    agent_id: str = "",
) -> dict:
    """Build a complete artifact with hash.

    Args:
        artifact_type: Type tag (e.g. "trade-intent", "risk-check", "no-trade").
        data: Artifact payload data.
        agent_id: Agent identifier.

    Returns:
        Artifact dict with type, timestamp, payload, and hash.
    """
    artifact = {
        "type": artifact_type,
        "agent_id": agent_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": data,
    }
    artifact["hash"] = artifact_hash(artifact)
    return artifact
