"""Rate-limited run loop — verification must pass before this is invoked from CLI."""

from __future__ import annotations

import json
import random
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List

from oraclebot.personas.trader import PersonaState, next_action_for, sleep_ms_for
from oraclebot.workers.api_executor import execute_action


def run_population(
    *,
    target_base: str,
    personas: List[PersonaState],
    duration_sec: int,
    rate_rpm: int,
    dry_run: bool,
    run_dir: Path,
    seed: int,
) -> Path:
    run_id = str(uuid.uuid4())
    base = run_dir / run_id
    base.mkdir(parents=True, exist_ok=True)
    events_path = base / "events.jsonl"
    meta_path = base / "meta.json"
    rng = random.Random(seed)

    meta = {
        "run_id": run_id,
        "target_base": target_base,
        "personas": len(personas),
        "duration_sec": duration_sec,
        "rate_rpm": rate_rpm,
        "dry_run": dry_run,
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    interval = 60.0 / max(rate_rpm, 1)
    end = time.time() + duration_sec
    idx = 0
    with events_path.open("a", encoding="utf-8") as sink:
        while time.time() < end and personas:
            p = personas[idx % len(personas)]
            idx += 1
            action = next_action_for(p.archetype, rng)
            # Simulate inter-action think time metadata only
            _ = sleep_ms_for(p.archetype, rng)
            row = execute_action(target_base, action, p.persona_id, dry_run=dry_run, rng=rng)
            sink.write(json.dumps(row, default=str) + "\n")
            sink.flush()
            time.sleep(interval)
    return base
