"""API persona executor — lightweight HTTP probes (V0)."""

from __future__ import annotations

import time
from typing import Any, Dict

import httpx
import random


def execute_action(
    target_base: str,
    action: str,
    persona_id: str,
    *,
    dry_run: bool,
    rng: random.Random,
) -> Dict[str, Any]:
    """
    Map logical action to a probe. V0 uses GET /health or / when present.
    dry_run skips network and returns synthetic latency/status.
    """
    path = "/health"
    url = target_base.rstrip("/") + path
    if dry_run:
        latency = int(rng.lognormvariate(4.5, 0.4))
        status = 200 if rng.random() > 0.02 else 500
        return {
            "persona_id": persona_id,
            "action": action,
            "method": "GET",
            "path": path,
            "status_code": status,
            "latency_ms": latency,
            "dry_run": True,
        }

    started = time.perf_counter()
    status_code = None
    err = None
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(url)
            status_code = r.status_code
    except Exception as e:  # noqa: BLE001
        err = str(e)
        status_code = 0
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return {
        "persona_id": persona_id,
        "action": action,
        "method": "GET",
        "path": path,
        "status_code": status_code,
        "latency_ms": elapsed_ms,
        "error": err,
        "dry_run": False,
    }
