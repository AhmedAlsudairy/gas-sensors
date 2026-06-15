"""
relay_poller.py — Polls dashboard for per-relay manual state.

Polls GET /api/relay every N seconds. The server returns:
  { "relay1": true|false|null, "relay2": true|false|null }

The callback receives two arguments (relay1, relay2), each True, False, or None.
"""

from __future__ import annotations

import logging
import threading

import requests

log = logging.getLogger("gas-agent.relay-poller")


class RelayPoller:
    """Polls dashboard for manual relay override and applies it."""

    def __init__(
        self,
        dashboard_url: str,
        secret: str,
        interval_s: int,
        on_relay: callable,
    ) -> None:
        self._url = f"{dashboard_url}/api/relay"
        self._headers = {"Accept": "application/json"}
        if secret:
            self._headers["x-ingest-secret"] = secret
        self._interval = interval_s
        self._on_relay = on_relay
        self._timer: threading.Timer | None = None
        self._started = False

    def start(self) -> None:
        self._started = True
        log.info("Relay poller started (interval=%ds)", self._interval)
        self._tick()

    def stop(self) -> None:
        self._started = False
        if self._timer:
            self._timer.cancel()
            self._timer = None

    def _tick(self) -> None:
        if not self._started:
            return
        try:
            resp = requests.get(self._url, headers=self._headers, timeout=5)
            if resp.ok:
                data = resp.json()
                relay1 = data.get("relay1")
                relay2 = data.get("relay2")
                self._on_relay(relay1, relay2)

                r1 = {True: "ON", False: "OFF", None: "AUTO"}[relay1]
                r2 = {True: "ON", False: "OFF", None: "AUTO"}[relay2]
                log.info("Relay state → relay1=%s  relay2=%s", r1, r2)
        except requests.RequestException as exc:
            log.warning("Relay poll failed: %s", exc)
        self._timer = threading.Timer(self._interval, self._tick)
        self._timer.daemon = True
        self._timer.start()
