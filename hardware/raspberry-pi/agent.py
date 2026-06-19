#!/usr/bin/env python3
"""
agent.py — Orchestrator (entry point).

Wires the individual modules together:
  SerialReader → ThresholdService → GPIOController + IngestClient + MqttClient
  ThresholdFetcher (background) → ThresholdService
  MQTT relay commands replace HTTP relay polling.

Hardware wiring
───────────────
  Arduino USB   → Raspberry Pi USB  (auto-detected, or set SERIAL_PORT)
  Relay1 (gate) IN → GPIO 13 (BCM)
  Relay2 (fan)  IN → GPIO 27 (BCM)
  Buzzer +      → GPIO 18 (BCM)
  Relay/Buzzer GND → Pi GND
  Relay/Buzzer VCC → Pi 5 V

All settings are controlled via environment variables; see config.py.
"""

import logging
import sys
import threading
import time

import serial

import config
from db_cleanup import DbCleanup
from gpio_controller import GPIOController
from ingest_client import IngestClient
from mqtt_client import MqttClient
from relay_poller import RelayPoller
from serial_reader import SerialReader
from threshold_fetcher import ThresholdFetcher
from threshold_service import SensorReading, ThresholdService

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

    mqtt = MqttClient(
        host=config.MQTT_HOST,
        port=config.MQTT_PORT,
        username=config.MQTT_USER,
        password=config.MQTT_PASS,
        client_id=config.MQTT_CLIENT_ID,
        topic_readings=config.MQTT_TOPIC_READINGS,
        topic_relay_cmd=config.MQTT_TOPIC_RELAY_CMD,
        topic_relay_state=config.MQTT_TOPIC_RELAY_STATE,
    )
    mqtt.set_relay_callback(set_manual_relay)

    relay_poller = RelayPoller(
        dashboard_url=config.DASHBOARD_URL,
        secret=config.INGEST_SECRET,
        interval_s=config.RELAY_POLL_INTERVAL_S,
        on_relay=set_manual_relay,
    )

    cleanup = DbCleanup(
        dashboard_url=config.DASHBOARD_URL,
        secret=config.INGEST_SECRET,
    )

    gpio.setup()
    mqtt.start()
    fetcher.start()
    relay_poller.start()
    cleanup.start()

    while True:
        try:
            reader.open()
        except (serial.SerialException, OSError, RuntimeError):
            log.warning("Serial port not available — retrying in 10s")
            time.sleep(10)
            continue
        except KeyboardInterrupt:
            log.info("Interrupted — shutting down…")
            break

        try:
            for raw in reader.readings():
                result = classifier.evaluate(raw)
                r1_on = manual_relay1 if manual_relay1 is not None else result.alarm_active
                r2_on = manual_relay2 if manual_relay2 is not None else result.alarm_active
                gpio.set_outputs(relay1=r1_on, relay2=r2_on, buzzer=result.alarm_active)

                readings: list = list(result.readings)
                if "water_level_adc" in raw:
                    readings.append(SensorReading(
                        sensor_id="water_level_adc",
                        value=raw["water_level_adc"],
                        unit="raw",
                        status="safe",
                    ))

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

                # Publish real-time via MQTT
                mqtt.publish_reading({
                    "mq2": raw.get("mq2", 0),
                    "mq136": raw.get("mq136", 0),
                    "mq7": raw.get("mq7", 0),
                    "water_level": raw.get("water_level", 0),
                    "temp_c": raw.get("temp_c", 0),
                    "water_level_adc": raw.get("water_level_adc", 0),
                    "alarm_active": result.alarm_active,
                    "alarm_reason": result.alarm_reason or "",
                })
                mqtt.publish_relay_state(
                    relay1=r1_on,
                    relay2=r2_on,
                    reason=result.alarm_reason,
                )

                # Keep HTTP ingest for DB history storage
                client.post(
                    readings=readings,
                    relay=result.alarm_active,
                    reason=result.alarm_reason,
                )
        except serial.SerialException as exc:
            log.warning("Serial connection lost: %s — reconnecting in 5s", exc)
            reader.close()
            time.sleep(5)
        except KeyboardInterrupt:
            log.info("Interrupted — shutting down…")
            break
        except Exception as exc:
            log.warning("Unexpected error: %s — reconnecting in 10s", exc)
            reader.close()
            time.sleep(10)
            continue
        break  # normal exit (shouldn't happen)

    mqtt.stop()
    cleanup.stop()
    fetcher.stop()
    relay_poller.stop()
    gpio.cleanup()
    reader.close()
    log.info("Agent stopped")


if __name__ == "__main__":
    run()
