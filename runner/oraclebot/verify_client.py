"""HTTP client for the verification service."""

from __future__ import annotations

from typing import Any, Dict, Optional

import httpx


def post_verify_dns(
    base_url: str,
    domain: str,
    expected_txt: str,
    *,
    operator_id: Optional[str] = None,
    manual_staging_ack: bool = False,
    manual_staging_reason: Optional[str] = None,
    timeout_sec: float = 30.0,
) -> Dict[str, Any]:
    url = base_url.rstrip("/") + "/verify/dns"
    body: Dict[str, Any] = {
        "domain": domain,
        "expected_txt": expected_txt,
        "manual_staging_ack": manual_staging_ack,
    }
    if operator_id:
        body["operator_id"] = operator_id
    if manual_staging_reason:
        body["manual_staging_reason"] = manual_staging_reason
    with httpx.Client(timeout=timeout_sec) as client:
        r = client.post(url, json=body)
        r.raise_for_status()
        return r.json()
