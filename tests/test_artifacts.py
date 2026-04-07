"""Tests for artifact hashing and canonical JSON."""

from src.artifacts.hasher import artifact_hash, build_artifact, canonical_json


def test_canonical_json_is_deterministic():
    obj = {"b": 2, "a": 1, "c": 3.14159}
    result1 = canonical_json(obj)
    result2 = canonical_json(obj)
    assert result1 == result2
    assert '"a":1' in result1
    assert result1.index('"a"') < result1.index('"b"')


def test_canonical_json_fixed_precision_floats():
    obj = {"price": 68210.15}
    result = canonical_json(obj)
    assert "68210.15000000" in result


def test_artifact_hash_is_deterministic():
    obj = {"signal": "long", "confidence": 85.5}
    h1 = artifact_hash(obj)
    h2 = artifact_hash(obj)
    assert h1 == h2
    assert len(h1) == 64


def test_artifact_hash_changes_on_mutation():
    obj1 = {"signal": "long"}
    obj2 = {"signal": "short"}
    assert artifact_hash(obj1) != artifact_hash(obj2)


def test_build_artifact_includes_hash():
    artifact = build_artifact("trade-intent", {"pair": "BTCUSD"})
    assert "hash" in artifact
    assert artifact["type"] == "trade-intent"
    assert "timestamp" in artifact
    assert artifact["payload"]["pair"] == "BTCUSD"
