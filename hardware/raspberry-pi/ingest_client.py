"""
ingest_client.py — HTTP delivery of sensor readings to the Next.js backend.

Single Responsibility: serialise and POST one batch of readings to
/api/ingest, with exponential back-off retries on transient failures.

Usage:
    client = IngestClient(
        dashboard_url="http://192.168.1.42:3000",
        secret="...",
        retries=5,
        timeout=5.0,
    )
    client.post(readings=result.readings, relay=result.alarm_active, reason=result.alarm_reason)
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import requests

from threshold_service import SensorReading

log = logging.getLogger("gas-agent.ingest")


@dataclass
class IngestClient:
    """Posts sensor readings to the Next.js /api/ingest endpoint."""

    dashboard_url: str
    secret:        str
    retries:       int   = 5
    timeout:       float = 5.0

    def post(
        self,
        readings: list[SensorReading],
        relay:    bool,
        reason:   str | None,
    ) -> None:
        """
        Deliver one batch. Retries up to `self.retries` times with
        exponential back-off (1 s, 2 s, 4 s …). Logs a warning if
        all attempts fail but never raises — the agent loop continues.
        """
        url     = f"{self.dashboard_url}/api/ingest"
        headers = {"Content-Type": "application/json"}
        if self.secret:
            headers["x-ingest-secret"] = self.secret

        payload = {
            "readings": [
                {"sensor_id": r.sensor_id, "ppm": r.ppm, "status": r.status}
                for r in readings
            ],
            "relay":  relay,
            "reason": reason,
        }

        for attempt in range(self.retries):
            try:
                resp = requests.post(url, json=payload, headers=headers, timeout=self.timeout)
                if resp.ok:
                    log.debug("Ingest OK (%d)", resp.status_code)
                    return
                log.warning("Ingest HTTP %d: %s", resp.status_code, resp.text[:200])
            except requests.RequestException as exc:
                log.warning("Ingest attempt %d/%d failed: %s", attempt + 1, self.retries, exc)

            time.sleep(2 ** attempt)   # 1, 2, 4, 8, 16 s

        log.error("Ingest failed after %d attempts — readings dropped", self.retries)
