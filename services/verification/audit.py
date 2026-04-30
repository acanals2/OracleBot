"""Append-only JSONL audit log for verification and refusal events."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def audit_log_path() -> Path:
    raw = os.environ.get("ORACLEBOT_AUDIT_LOG", "data/audit.jsonl")
    return Path(raw)


def append_audit(event: str, payload: dict[str, Any]) -> str:
    """Write one audit record; returns audit_id."""
    audit_id = str(uuid.uuid4())
    path = audit_log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "audit_id": audit_id,
        "at": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **payload,
    }
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, default=str) + "\n")
    return audit_id
