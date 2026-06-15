"""
relay_poller.py — Polls dashboard for manual relay commands.

Polls GET /api/relay every N seconds. When a manual override is
received, it overrides the GPIO controller outputs. The override is
cleared server-side after one read, so continuous polling is needed
to hold the relay on.
"""

from __future__ import annotations

import logging
import threading

import requests

log = logging.getLogger("gas-agent.relay-poller")


class RelayPoller:
    """Polls dashboard for manual relay commands and applies them."""

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
                if data.get("active") is True:
                    self._on_relay(True)
                    log.info("Manual relay ON from dashboard")
                elif data.get("active") is False:
                    self._on_relay(False)
                    log.info("Manual relay OFF from dashboard")
        except requests.RequestException as exc:
            log.warning("Relay poll failed: %s", exc)
        self._timer = threading.Timer(self._interval, self._tick)
        self._timer.daemon = True
        self._timer.start()
