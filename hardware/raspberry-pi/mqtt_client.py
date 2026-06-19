"""
mqtt_client.py — MQTT real-time publisher + relay command subscriber.

Publishes sensor readings to sensors/reading topic on every frame.
Subscribes to relay/command to receive manual relay overrides from the dashboard.
Publishes relay state to relay/state for the dashboard to display.
"""

from __future__ import annotations

import json
import logging
import ssl
import threading

import paho.mqtt.client as mqtt

log = logging.getLogger("gas-agent.mqtt")


class MqttClient:
    """Connects to MQTT broker, publishes readings and subscribes relay commands."""

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        client_id: str,
        topic_readings: str,
        topic_relay_cmd: str,
        topic_relay_state: str,
    ) -> None:
        self._topic_readings = topic_readings
        self._topic_relay_cmd = topic_relay_cmd
        self._topic_relay_state = topic_relay_state
        self._on_relay_cmd: callable | None = None
        self._connected = False
        self._lock = threading.Lock()

        self._client = mqtt.Client(
            client_id=client_id,
            protocol=mqtt.MQTTv311,
        )
        self._client.username_pw_set(username, password)
        self._client.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS)
        self._client.tls_insecure_set(False)

        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message

        try:
            self._client.connect(host, port, keepalive=30)
        except Exception as exc:
            log.warning("MQTT connect failed: %s (will retry in background)", exc)

    def set_relay_callback(self, cb: callable) -> None:
        """Callback receives (relay1: bool|None, relay2: bool|None) from MQTT."""
        self._on_relay_cmd = cb

    def start(self) -> None:
        self._client.loop_start()
        log.info("MQTT client started — broker=%s:%d", self._client._host, self._client._port)

    def stop(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()
        log.info("MQTT client stopped")

    def publish_reading(self, data: dict) -> None:
        """Publish a sensor reading frame as JSON."""
        payload = json.dumps(data)
        rc = self._client.publish(self._topic_readings, payload, qos=0, retain=False)
        if rc.rc == mqtt.MQTT_ERR_NO_CONN:
            log.debug("MQTT publish skipped (no connection)")
        else:
            log.debug("MQTT published to %s", self._topic_readings)

    def publish_relay_state(self, relay1: bool, relay2: bool, reason: str | None) -> None:
        """Publish current relay state for dashboard display."""
        payload = json.dumps({
            "relay1": relay1,
            "relay2": relay2,
            "reason": reason,
        })
        self._client.publish(self._topic_relay_state, payload, qos=0, retain=True)

    # ── Callbacks ──────────────────────────────────────────────────────────
    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self._connected = True
            log.info("MQTT connected")
            client.subscribe(self._topic_relay_cmd, qos=1)
            log.info("MQTT subscribed to %s", self._topic_relay_cmd)
        else:
            self._connected = False
            log.warning("MQTT connect failed (rc=%d)", rc)

    def _on_disconnect(self, client, userdata, rc):
        self._connected = False
        if rc != 0:
            log.warning("MQTT disconnected unexpectedly (rc=%d) — auto-reconnect in progress", rc)

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            if msg.topic == self._topic_relay_cmd and self._on_relay_cmd:
                r1 = payload.get("relay1")   # True, False, or None
                r2 = payload.get("relay2")
                self._on_relay_cmd(r1, r2)
                log.info("MQTT relay cmd: r1=%s r2=%s",
                         {True: "ON", False: "OFF", None: "-"}.get(r1, "?"),
                         {True: "ON", False: "OFF", None: "-"}.get(r2, "?"))
        except Exception as exc:
            log.warning("MQTT bad message: %s", exc)
