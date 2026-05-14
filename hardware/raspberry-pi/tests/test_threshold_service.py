"""
test_threshold_service.py — Unit tests for threshold_service.py

Tests cover:
  - All sensors safe → alarm off
  - Warning level (below danger) → alarm off, status = "warning"
  - Single sensor at danger → alarm on, reason contains sensor name
  - Multiple sensors at danger → all listed in alarm reason
  - Exactly at warn boundary → "warning"
  - Exactly at danger boundary → "danger"
  - Unknown/extra keys in raw dict (e.g. "buzzer") are ignored
  - Missing sensor key → treated as 0 ppm (safe)
  - Zero ppm → safe
"""
import pytest
from threshold_service import ThresholdService, SensorReading, EvaluationResult

# Use the same thresholds as production (from config.py defaults)
THRESHOLDS = {
    "mq2":   {"warn": 300.0,  "danger": 1000.0},
    "mq136": {"warn": 10.0,   "danger": 50.0},
    "mq7":   {"warn": 50.0,   "danger": 200.0},
}


@pytest.fixture
def svc() -> ThresholdService:
    return ThresholdService(thresholds=THRESHOLDS)


# ── All safe ────────────────────────────────────────────────────────────────────

def test_all_safe_no_alarm(svc):
    result = svc.evaluate({"mq2": 100.0, "mq136": 5.0, "mq7": 20.0})

    assert result.alarm_active is False
    assert result.alarm_reason is None
    statuses = {r.sensor_id: r.status for r in result.readings}
    assert statuses == {"mq2": "safe", "mq136": "safe", "mq7": "safe"}


def test_zero_ppm_is_safe(svc):
    result = svc.evaluate({"mq2": 0.0, "mq136": 0.0, "mq7": 0.0})

    assert result.alarm_active is False
    for r in result.readings:
        assert r.status == "safe"


# ── Warning level ───────────────────────────────────────────────────────────────

def test_warning_does_not_trigger_alarm(svc):
    # mq2 at exactly warn threshold → "warning", not "danger"
    result = svc.evaluate({"mq2": 300.0, "mq136": 5.0, "mq7": 20.0})

    assert result.alarm_active is False
    mq2_reading = next(r for r in result.readings if r.sensor_id == "mq2")
    assert mq2_reading.status == "warning"


def test_just_below_danger_is_warning(svc):
    result = svc.evaluate({"mq2": 999.9, "mq136": 5.0, "mq7": 20.0})

    mq2_reading = next(r for r in result.readings if r.sensor_id == "mq2")
    assert mq2_reading.status == "warning"
    assert result.alarm_active is False


# ── Danger level ────────────────────────────────────────────────────────────────

def test_single_danger_triggers_alarm(svc):
    result = svc.evaluate({"mq2": 1000.0, "mq136": 5.0, "mq7": 20.0})

    assert result.alarm_active is True
    assert result.alarm_reason is not None
    assert "MQ2" in result.alarm_reason


def test_mq136_danger_triggers_alarm(svc):
    result = svc.evaluate({"mq2": 100.0, "mq136": 50.0, "mq7": 20.0})

    assert result.alarm_active is True
    assert "MQ136" in result.alarm_reason


def test_mq7_danger_triggers_alarm(svc):
    result = svc.evaluate({"mq2": 100.0, "mq136": 5.0, "mq7": 200.0})

    assert result.alarm_active is True
    assert "MQ7" in result.alarm_reason


def test_multiple_danger_all_listed_in_reason(svc):
    result = svc.evaluate({"mq2": 2000.0, "mq136": 100.0, "mq7": 500.0})

    assert result.alarm_active is True
    assert "MQ2"   in result.alarm_reason
    assert "MQ136" in result.alarm_reason
    assert "MQ7"   in result.alarm_reason


def test_exactly_at_danger_boundary_is_danger(svc):
    result = svc.evaluate({"mq2": 100.0, "mq136": 50.0, "mq7": 20.0})

    mq136 = next(r for r in result.readings if r.sensor_id == "mq136")
    assert mq136.status == "danger"


# ── Edge cases ──────────────────────────────────────────────────────────────────

def test_extra_keys_in_raw_are_ignored(svc):
    """The 'buzzer' key sent by Arduino must not raise any error."""
    result = svc.evaluate({"mq2": 100.0, "mq136": 5.0, "mq7": 20.0, "buzzer": False})

    assert result.alarm_active is False
    # Only the three known sensors appear in readings
    ids = {r.sensor_id for r in result.readings}
    assert ids == {"mq2", "mq136", "mq7"}


def test_missing_sensor_key_treated_as_zero(svc):
    """If a sensor key is absent, ppm defaults to 0 (safe)."""
    result = svc.evaluate({"mq2": 100.0})   # mq136 and mq7 missing

    mq136 = next(r for r in result.readings if r.sensor_id == "mq136")
    assert mq136.ppm == 0.0
    assert mq136.status == "safe"


def test_readings_are_immutable(svc):
    result = svc.evaluate({"mq2": 100.0, "mq136": 5.0, "mq7": 20.0})

    # SensorReading and EvaluationResult are frozen dataclasses
    with pytest.raises((AttributeError, TypeError)):
        result.alarm_active = True   # type: ignore[misc]


def test_ppm_stored_correctly_in_reading(svc):
    result = svc.evaluate({"mq2": 412.3, "mq136": 8.1, "mq7": 55.7})

    ppm_map = {r.sensor_id: r.ppm for r in result.readings}
    assert ppm_map["mq2"]   == pytest.approx(412.3)
    assert ppm_map["mq136"] == pytest.approx(8.1)
    assert ppm_map["mq7"]   == pytest.approx(55.7)


def test_custom_thresholds():
    """ThresholdService uses whatever thresholds it is constructed with."""
    custom = ThresholdService(thresholds={"gas": {"warn": 5.0, "danger": 10.0}})

    safe    = custom.evaluate({"gas": 4.9})
    warning = custom.evaluate({"gas": 7.0})
    danger  = custom.evaluate({"gas": 10.0})

    assert safe.readings[0].status    == "safe"
    assert warning.readings[0].status == "warning"
    assert danger.readings[0].status  == "danger"
    assert danger.alarm_active is True
