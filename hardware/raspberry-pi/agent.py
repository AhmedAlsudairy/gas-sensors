#!/usr/bin/env python3
"""
agent.py — Orchestrator (entry point).

Wires the individual modules together:
  SerialReader → ThresholdService → GPIOController + IngestClient
  ThresholdFetcher (background) → ThresholdService

Hardware wiring
───────────────
  Arduino USB   → Raspberry Pi USB  (auto-detected, or set SERIAL_PORT)
  Relay1 IN     → GPIO 17 (BCM)
  Relay2 IN     → GPIO 27 (BCM)
  Buzzer +      → GPIO 18 (BCM)
  Relay/Buzzer GND → Pi GND
  Relay/Buzzer VCC → Pi 5 V

All settings are controlled via environment variables; see config.py.
"""

import logging
import sys
import threading

import config
from gpio_controller import GPIOController
from ingest_client import IngestClient
from relay_poller import RelayPoller
from serial_reader import SerialReader
from threshold_fetcher import ThresholdFetcher
from threshold_service import ThresholdService

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("gas-agent")


def run() -> None:
    gpio = GPIOController(
        relay_pin=config.RELAY_PIN,
        relay2_pin=config.RELAY2_PIN,
        buzzer_pin=config.BUZZER_PIN,
        relay_active_high=config.RELAY_ACTIVE_HIGH,
        relay2_active_high=config.RELAY2_ACTIVE_HIGH,
        buzzer_active_high=config.BUZZER_ACTIVE_HIGH,
    )
    reader = SerialReader(port=config.SERIAL_PORT, baud=config.BAUD_RATE)
    classifier = ThresholdService(thresholds=config.THRESHOLDS)
    client = IngestClient(
        dashboard_url=config.DASHBOARD_URL,
        secret=config.INGEST_SECRET,
        retries=config.INGEST_RETRIES,
        timeout=config.INGEST_TIMEOUT_S,
    )
    fetcher = ThresholdFetcher(
        dashboard_url=config.DASHBOARD_URL,
        secret=config.INGEST_SECRET,
        interval_s=config.THRESHOLD_REFRESH_INTERVAL_S,
        on_update=classifier.update_thresholds,
    )

    manual_relay1: bool | None = None
    manual_relay2: bool | None = None

    def set_manual_relay(r1: bool | None, r2: bool | None) -> None:
        nonlocal manual_relay1, manual_relay2
        manual_relay1 = r1
        manual_relay2 = r2

    relay_poller = RelayPoller(
        dashboard_url=config.DASHBOARD_URL,
        secret=config.INGEST_SECRET,
        interval_s=config.RELAY_POLL_INTERVAL_S,
        on_relay=set_manual_relay,
    )

    gpio.setup()
    reader.open()
    fetcher.start()
    relay_poller.start()

    try:
        for raw in reader.readings():
            result = classifier.evaluate(raw)
            r1_on = manual_relay1 if manual_relay1 is not None else result.alarm_active
            r2_on = manual_relay2 if manual_relay2 is not None else result.alarm_active
            gpio.set_outputs(relay1=r1_on, relay2=r2_on, buzzer=result.alarm_active)

            r1_label = {True: "ON", False: "OFF", None: "AUTO"}[manual_relay1]
            r2_label = {True: "ON", False: "OFF", None: "AUTO"}[manual_relay2]
            log.info(
                "MQ-2=%.1f  MQ-136=%.1f  MQ-7=%.1f  water=%.1f%%  temp=%.1f°C  alarm=%s  r1=%s  r2=%s  reason=%s",
                raw.get("mq2",   0.0),
                raw.get("mq136", 0.0),
                raw.get("mq7",   0.0),
                raw.get("water_level", 0.0),
                raw.get("temp_c", 0.0),
                "ON" if result.alarm_active else "OFF",
                r1_label,
                r2_label,
                result.alarm_reason or "—",
            )

            client.post(
                readings=result.readings,
                relay=result.alarm_active,
                reason=result.alarm_reason,
            )

    except KeyboardInterrupt:
        log.info("Interrupted — shutting down…")
    finally:
        fetcher.stop()
        relay_poller.stop()
        gpio.cleanup()
        reader.close()
        log.info("Agent stopped")


if __name__ == "__main__":
    run()

