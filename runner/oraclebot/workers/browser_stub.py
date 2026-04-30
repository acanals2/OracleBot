"""Browser executor stub — premium tier placeholder (V0)."""

from __future__ import annotations

from typing import Any, Dict


def describe_browser_tier() -> Dict[str, Any]:
    return {
        "implemented": False,
        "message": "Browser personas are not executed in V0 CLI. Use Standard+ concierge "
        "engagements with Playwright + hosted browser farm (see docs/04-runner-architecture.md).",
    }
