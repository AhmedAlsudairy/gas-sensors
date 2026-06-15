"""
threshold_service.py — Sensor classification and alert logic.

Single Responsibility: given raw ppm values, produce labelled readings
and decide whether the alarm (relay + buzzer) should activate.

Usage:
    svc = ThresholdService(thresholds=THRESHOLDS)
    result = svc.evaluate({"mq2": 450.0, "mq136": 6.0, "mq7": 30.0})
    print(result.readings)      # list of SensorReading
    print(result.alarm_active)  # True / False
    print(result.alarm_reason)  # "Danger: MQ2" / None
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SensorReading:
    sensor_id: str
    value:     float
    unit:      str          # "ppm", "%", "°C"
    status:    str          # "safe" | "warning" | "danger"


@dataclass(frozen=True)
class EvaluationResult:
    readings:     list[SensorReading]
    alarm_active: bool
    alarm_reason: str | None


class ThresholdService:
    """Classifies sensor ppm values and decides alarm state."""

    def __init__(self, thresholds: dict[str, dict[str, float]]) -> None:
        self._thresholds = thresholds

    def update_thresholds(self, thresholds: dict[str, dict[str, float]]) -> None:
        """Replace thresholds at runtime (e.g. fetched from dashboard)."""
        self._thresholds = thresholds

    def evaluate(self, raw: dict) -> EvaluationResult:
        """
        Parameters
        ----------
        raw : dict
            Keys: sensor ids ("mq2", "mq136", "mq7", "water_level", "temp_c").
            The "buzzer" key (from Arduino) is intentionally ignored here —
            the Pi makes its own independent alarm decision.

        Returns
        -------
        EvaluationResult
        """
        unit_map: dict[str, str] = {
            "mq2": "raw",
            "mq136": "raw",
            "mq7": "raw",
            "water_level": "%",
            "temp_c": "°C",
        }

        readings: list[SensorReading] = [
            SensorReading(
                sensor_id=sid,
                value=float(raw.get(sid, 0.0)),
                unit=unit_map.get(sid, "ppm"),
                status=self._classify(sid, float(raw.get(sid, 0.0))),
            )
            for sid in self._thresholds
        ]

        danger_ids = [r.sensor_id.upper() for r in readings if r.status == "danger"]
        alarm_active = bool(danger_ids)
        alarm_reason = ("Danger: " + ", ".join(danger_ids)) if danger_ids else None

        return EvaluationResult(
            readings=readings,
            alarm_active=alarm_active,
            alarm_reason=alarm_reason,
        )

    # ── Internal ───────────────────────────────────────────────────────────────
    def _classify(self, sensor_id: str, ppm: float) -> str:
        t = self._thresholds.get(sensor_id, {"warn": float("inf"), "danger": float("inf")})
        if ppm >= t["danger"]:
            return "danger"
        if ppm >= t["warn"]:
            return "warning"
        return "safe"
