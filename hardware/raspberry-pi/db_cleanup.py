"""
db_cleanup.py — Background thread that periodically deletes old records.

Calls GET /api/cleanup every hour to delete sensor_readings and relay_events
older than 23 hours, preventing the DB from growing indefinitely.
"""

from __future__ import annotations

import logging
import threading
import time

import requests

log = logging.getLogger("gas-agent.db-cleanup")

_CLEANUP_INTERVAL_S = 3_600  # 1 hour


class DbCleanup:
    """Calls /api/cleanup once per hour to purge old data."""

    def __init__(
        self,
        dashboard_url: str,
        secret: str,
    ) -> None:
        self._url = f"{dashboard_url}/api/cleanup"
        self._headers = {"Accept": "application/json"}
        if secret:
            self._headers["x-ingest-secret"] = secret
        self._timer: threading.Timer | None = None
        self._started = False

    def start(self) -> None:
        self._started = True
        log.info("DB cleanup started (interval=%dh)", _CLEANUP_INTERVAL_S // 3_600)
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
            resp = requests.get(self._url, headers=self._headers, timeout=10)
            if resp.ok:
                data = resp.json()
                log.info("Cleanup OK — deleted %d sensor rows, %d relay rows",
                         data.get("deleted", {}).get("sensor_readings", 0),
                         data.get("deleted", {}).get("relay_events", 0))
            else:
                log.warning("Cleanup HTTP %d", resp.status_code)
        except requests.RequestException as exc:
            log.warning("Cleanup failed: %s", exc)
        self._timer = threading.Timer(_CLEANUP_INTERVAL_S, self._tick)
        self._timer.daemon = True
        self._timer.start()
