"""ReasoningProvider contract.

A provider only ranks *hypotheses* (candidate ids from a fixed vocabulary).
IK, collision screening and physics stay deterministic in the backend; every
proposal is validated against the allowed ids before anything is simulated.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class CandidateView:
    candidate_id: str
    route_class: str
    clearance_m: float
    kinematic_outcome: str
    reason: str
    min_clearance_m: float | None
    cost: float | None
    source_outcome: str | None


@dataclass(frozen=True)
class ReasoningContext:
    task: dict
    capsule: dict
    source_robot: dict
    target_robot: dict
    candidates: tuple[CandidateView, ...]
    offline_order: tuple[str, ...]
    physics_budget: int

    @property
    def allowed_ids(self) -> tuple[str, ...]:
        return tuple(c.candidate_id for c in self.candidates)

    def candidate(self, candidate_id: str) -> CandidateView | None:
        return next((c for c in self.candidates if c.candidate_id == candidate_id), None)


@dataclass(frozen=True)
class RolloutFeedback:
    candidate_id: str
    outcome: str
    reason: str
    endpoint_error_m: float | None
    collisions: int


@dataclass(frozen=True)
class ReasoningCall:
    kind: str  # "propose" | "revise" | "tool"
    summary: str
    latency_s: float = 0.0
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


@dataclass(frozen=True)
class StrategyProposal:
    ranking: tuple[str, ...]
    rationale: str
    provider: str
    model_id: str | None
    calls: tuple[ReasoningCall, ...] = ()
    notes: tuple[str, ...] = field(default_factory=tuple)
    error: str | None = None


class ReasoningProvider(Protocol):
    name: str
    model_id: str | None
    max_revisions: int

    def propose_strategies(self, context: ReasoningContext) -> StrategyProposal: ...

    def revise_strategy(
        self, context: ReasoningContext, tried: list[RolloutFeedback], current: tuple[str, ...]
    ) -> StrategyProposal: ...


def validate_ranking(
    proposed: list[str] | tuple[str, ...], context: ReasoningContext
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Keep known ids once, in order; append omitted ids in offline order. Returns (ranking, notes)."""
    allowed = set(context.allowed_ids)
    seen: list[str] = []
    dropped: list[str] = []
    for cid in proposed:
        if cid in allowed and cid not in seen:
            seen.append(cid)
        elif cid not in allowed:
            dropped.append(str(cid))
    appended = [cid for cid in context.offline_order if cid not in seen]
    notes = []
    if dropped:
        notes.append(f"dropped unknown ids: {', '.join(dropped[:5])}")
    if appended:
        notes.append(f"appended {len(appended)} unranked ids in offline order")
    return tuple(seen + appended), tuple(notes)
