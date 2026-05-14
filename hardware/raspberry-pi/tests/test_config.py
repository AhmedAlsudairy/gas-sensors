"""
test_config.py — Unit tests for config.py

Tests cover:
  - Default values when no environment variables are set
  - Env var overrides for every configurable value
  - RELAY_ACTIVE_HIGH / BUZZER_ACTIVE_HIGH boolean parsing
    ("1" → True, "0" → False)
  - Threshold dict shape (all three sensors present, warn < danger)
"""
import os
import importlib
import sys
import pytest


def _reload_config(env_overrides: dict[str, str] = {}):
    """Reload config module with a clean environment + specified overrides."""
    clean_env = {
        k: v for k, v in os.environ.items()
        if k not in (
            "DASHBOARD_URL", "INGEST_SECRET", "SERIAL_PORT", "BAUD_RATE",
            "RELAY_PIN", "BUZZER_PIN", "RELAY_ACTIVE_HIGH", "BUZZER_ACTIVE_HIGH",
        )
    }
    clean_env.update(env_overrides)

    original_env = os.environ.copy()
    os.environ.clear()
    os.environ.update(clean_env)

    try:
        import config
        importlib.reload(config)
        # Snapshot the values before restoring env
        snapshot = {
            "DASHBOARD_URL":       config.DASHBOARD_URL,
            "INGEST_SECRET":       config.INGEST_SECRET,
            "SERIAL_PORT":         config.SERIAL_PORT,
            "BAUD_RATE":           config.BAUD_RATE,
            "RELAY_PIN":           config.RELAY_PIN,
            "BUZZER_PIN":          config.BUZZER_PIN,
            "RELAY_ACTIVE_HIGH":   config.RELAY_ACTIVE_HIGH,
            "BUZZER_ACTIVE_HIGH":  config.BUZZER_ACTIVE_HIGH,
            "THRESHOLDS":          config.THRESHOLDS,
            "INGEST_RETRIES":      config.INGEST_RETRIES,
            "INGEST_TIMEOUT_S":    config.INGEST_TIMEOUT_S,
        }
    finally:
        os.environ.clear()
        os.environ.update(original_env)

    return snapshot


# ── Default values ──────────────────────────────────────────────────────────────

class TestDefaults:
    def setup_method(self):
        self.cfg = _reload_config()

    def test_default_dashboard_url(self):
        assert self.cfg["DASHBOARD_URL"] == "http://localhost:3000"

    def test_default_ingest_secret_empty(self):
        assert self.cfg["INGEST_SECRET"] == ""

    def test_default_serial_port_empty(self):
        assert self.cfg["SERIAL_PORT"] == ""

    def test_default_baud_rate(self):
        assert self.cfg["BAUD_RATE"] == 115200

    def test_default_relay_pin(self):
        assert self.cfg["RELAY_PIN"] == 17

    def test_default_buzzer_pin(self):
        assert self.cfg["BUZZER_PIN"] == 18

    def test_default_relay_active_high(self):
        assert self.cfg["RELAY_ACTIVE_HIGH"] is True

    def test_default_buzzer_active_high(self):
        assert self.cfg["BUZZER_ACTIVE_HIGH"] is True

    def test_default_ingest_retries(self):
        assert self.cfg["INGEST_RETRIES"] == 5

    def test_default_ingest_timeout(self):
        assert self.cfg["INGEST_TIMEOUT_S"] == pytest.approx(5.0)


# ── Env var overrides ───────────────────────────────────────────────────────────

class TestEnvOverrides:
    def test_dashboard_url_overridden(self):
        cfg = _reload_config({"DASHBOARD_URL": "https://gas-sensors.vercel.app"})
        assert cfg["DASHBOARD_URL"] == "https://gas-sensors.vercel.app"

    def test_ingest_secret_overridden(self):
        cfg = _reload_config({"INGEST_SECRET": "supersecret99"})
        assert cfg["INGEST_SECRET"] == "supersecret99"

    def test_serial_port_overridden(self):
        cfg = _reload_config({"SERIAL_PORT": "/dev/ttyUSB1"})
        assert cfg["SERIAL_PORT"] == "/dev/ttyUSB1"

    def test_baud_rate_overridden(self):
        cfg = _reload_config({"BAUD_RATE": "9600"})
        assert cfg["BAUD_RATE"] == 9600

    def test_relay_pin_overridden(self):
        cfg = _reload_config({"RELAY_PIN": "22"})
        assert cfg["RELAY_PIN"] == 22

    def test_buzzer_pin_overridden(self):
        cfg = _reload_config({"BUZZER_PIN": "23"})
        assert cfg["BUZZER_PIN"] == 23


# ── Boolean env var parsing ─────────────────────────────────────────────────────

class TestBooleanParsing:
    def test_relay_active_high_true_when_one(self):
        cfg = _reload_config({"RELAY_ACTIVE_HIGH": "1"})
        assert cfg["RELAY_ACTIVE_HIGH"] is True

    def test_relay_active_high_false_when_zero(self):
        cfg = _reload_config({"RELAY_ACTIVE_HIGH": "0"})
        assert cfg["RELAY_ACTIVE_HIGH"] is False

    def test_buzzer_active_high_true_when_one(self):
        cfg = _reload_config({"BUZZER_ACTIVE_HIGH": "1"})
        assert cfg["BUZZER_ACTIVE_HIGH"] is True

    def test_buzzer_active_high_false_when_zero(self):
        cfg = _reload_config({"BUZZER_ACTIVE_HIGH": "0"})
        assert cfg["BUZZER_ACTIVE_HIGH"] is False


# ── Thresholds dict ──────────────────────────────────────────────────────────────

class TestThresholds:
    def setup_method(self):
        self.cfg = _reload_config()

    def test_all_three_sensors_present(self):
        assert set(self.cfg["THRESHOLDS"].keys()) == {"mq2", "mq136", "mq7"}

    def test_each_sensor_has_warn_and_danger(self):
        for sensor, levels in self.cfg["THRESHOLDS"].items():
            assert "warn"   in levels, f"{sensor} missing 'warn'"
            assert "danger" in levels, f"{sensor} missing 'danger'"

    def test_warn_less_than_danger_for_all_sensors(self):
        for sensor, levels in self.cfg["THRESHOLDS"].items():
            assert levels["warn"] < levels["danger"], (
                f"{sensor}: warn ({levels['warn']}) must be < danger ({levels['danger']})"
            )

    def test_mq2_thresholds(self):
        t = self.cfg["THRESHOLDS"]["mq2"]
        assert t["warn"]   == pytest.approx(300.0)
        assert t["danger"] == pytest.approx(1000.0)

    def test_mq136_thresholds(self):
        t = self.cfg["THRESHOLDS"]["mq136"]
        assert t["warn"]   == pytest.approx(10.0)
        assert t["danger"] == pytest.approx(50.0)

    def test_mq7_thresholds(self):
        t = self.cfg["THRESHOLDS"]["mq7"]
        assert t["warn"]   == pytest.approx(50.0)
        assert t["danger"] == pytest.approx(200.0)
