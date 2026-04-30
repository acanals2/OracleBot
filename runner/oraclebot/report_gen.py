"""Markdown readiness report from run logs."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Tuple


def _load_events(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def summarize(events: List[Dict[str, Any]]) -> Tuple[str, Dict[str, Any]]:
    ev = events
    latencies = [e["latency_ms"] for e in ev if "latency_ms" in e]
    fail = [e for e in ev if e.get("status_code", 200) >= 400 or e.get("error")]

    def pct(xs: List[int], p: float) -> float:
        if not xs:
            return 0.0
        ys = sorted(xs)
        k = int(round((len(ys) - 1) * p))
        return float(ys[k])

    stats = {
        "actions": len(ev),
        "p50_ms": pct(latencies, 0.50) if latencies else 0.0,
        "p95_ms": pct(latencies, 0.95) if latencies else 0.0,
        "p99_ms": pct(latencies, 0.99) if latencies else 0.0,
        "mean_ms": mean(latencies) if latencies else 0.0,
        "errors": len(fail),
    }
    by_action: Dict[str, List[int]] = defaultdict(list)
    for e in ev:
        by_action[e.get("action", "unknown")].append(int(e.get("latency_ms", 0)))

    lines: List[str] = [
        "# OracleBot readiness report (V0, operator-generated)",
        "",
        "## Run summary",
        "",
        f"- Total actions logged: **{stats['actions']}**",
        f"- Error responses: **{stats['errors']}**",
        f"- Latency p50 / p95 / p99 (ms): **{stats['p50_ms']:.1f} / {stats['p95_ms']:.1f} / {stats['p99_ms']:.1f}**",
        "",
        "## Latency by action",
        "",
        "| Action | Count | Mean ms |",
        "|--------|-------|---------|",
    ]
    for act, lats in sorted(by_action.items()):
        lines.append(f"| {act} | {len(lats)} | {mean(lats):.1f} |")
    lines.append("")
    lines.append("## Flagged flows")
    lines.append("")
    if fail:
        for e in fail[:50]:
            lines.append(
                f"- `{e.get('persona_id')}` · {e.get('action')} · "
                f"{e.get('method')} {e.get('path')} · **{e.get('status_code')}** "
                f"· {e.get('latency_ms')}ms"
                + (f" · _{e.get('error')}_" if e.get("error") else "")
            )
    else:
        lines.append("_No hard failures in this run log._")
    lines.append("")
    return "\n".join(lines), stats


def write_report(events_file: Path, out_md: Path) -> None:
    events = _load_events(events_file)
    md, _stats = summarize(events)
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text(md, encoding="utf-8")
