"""Rule-based trader personas (V0) — eight archetypes (marketing-aligned)."""

from __future__ import annotations

import random
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Tuple


class Archetype(str, Enum):
    scalper = "scalper"
    swing = "swing"
    market_maker = "market_maker"
    panic = "panic"
    hodler = "hodler"
    bot_copier = "bot_copier"
    whale = "whale"
    newbie = "newbie"


@dataclass
class PersonaState:
    archetype: Archetype
    persona_id: str
    balance: float = 10_000.0
    open_orders: int = 0
    position: float = 0.0


# Action vocabulary for logging / future API mapping
ACTIONS = [
    "signup",
    "kyc_submit",
    "deposit",
    "place_limit",
    "place_market",
    "cancel_order",
    "subscribe_channel",
    "send_message",
]


def mix_from_weights(weights: Dict[str, float]) -> List[Tuple[Archetype, float]]:
    total = sum(weights.values()) or 1.0
    out: List[Tuple[Archetype, float]] = []
    for k, v in weights.items():
        try:
            out.append((Archetype(k), v / total))
        except ValueError:
            continue
    return out or [(Archetype.scalper, 1.0)]


def sample_archetype(mix: List[Tuple[Archetype, float]], rng: random.Random) -> Archetype:
    r = rng.random()
    acc = 0.0
    for arch, w in mix:
        acc += w
        if r <= acc:
            return arch
    return mix[-1][0]


def next_action_for(archetype: Archetype, rng: random.Random) -> str:
    """Weighted next action — no LLM; stochastic behavior only."""
    wmap: Dict[Archetype, List[int]] = {
        Archetype.scalper: [1, 1, 2, 8, 6, 7, 2, 1],
        Archetype.swing: [1, 2, 4, 5, 3, 2, 4, 2],
        Archetype.market_maker: [1, 1, 3, 9, 5, 8, 3, 1],
        Archetype.panic: [1, 1, 2, 3, 9, 6, 1, 1],
        Archetype.hodler: [1, 2, 6, 4, 2, 1, 3, 1],
        Archetype.bot_copier: [1, 1, 2, 4, 5, 4, 6, 3],
        Archetype.whale: [1, 2, 5, 8, 6, 2, 1, 1],
        Archetype.newbie: [6, 5, 4, 2, 2, 2, 1, 3],
    }
    weights = wmap[archetype]
    return rng.choices(ACTIONS, weights=weights, k=1)[0]


def sleep_ms_for(archetype: Archetype, rng: random.Random) -> int:
    params: Dict[Archetype, Tuple[float, float]] = {
        Archetype.scalper: (3.5, 0.35),
        Archetype.swing: (6.5, 0.5),
        Archetype.market_maker: (4.2, 0.4),
        Archetype.panic: (4.0, 0.6),
        Archetype.hodler: (8.0, 0.55),
        Archetype.bot_copier: (4.8, 0.45),
        Archetype.whale: (7.0, 0.5),
        Archetype.newbie: (5.2, 0.7),
    }
    mu, sigma = params[archetype]
    return int(rng.lognormvariate(mu, sigma))


def instantiate_population(size: int, mix_weights: Dict[str, float], seed: int) -> List[PersonaState]:
    rng = random.Random(seed)
    mix = mix_from_weights(mix_weights)
    personas: List[PersonaState] = []
    for i in range(size):
        arch = sample_archetype(mix, rng)
        personas.append(PersonaState(archetype=arch, persona_id=f"{arch.value}_{i:04d}"))
    return personas


DEFAULT_MIX_EIGHT: Dict[str, float] = {
    "scalper": 0.18,
    "swing": 0.14,
    "market_maker": 0.14,
    "panic": 0.12,
    "hodler": 0.12,
    "bot_copier": 0.10,
    "whale": 0.10,
    "newbie": 0.10,
}
