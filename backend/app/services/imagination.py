"""Collective Imagination: preview candidate futures in MuJoCo before committing.

A ReasoningProvider ranks hypotheses; the backend simulates up to `budget`
feasible candidates in that order, each from a fresh reset of the same start
state, records its predicted outcome, EE trace and a rendered final frame, and
lets the provider revise the remaining order after a failed future.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

from app.config import CLIP_HEIGHT, CLIP_WIDTH
from app.models.robot import RobotPassport
from app.models.skill import CandidateSummary, ExperienceCapsule
from app.services.candidate_search import SearchSetup, recorded_try, task_view, try_event, with_physics
from app.services.jobs import RunContext
from app.services.reasoning.base import (
    CandidateView,
    ReasoningCall,
    ReasoningContext,
    ReasoningProvider,
    RolloutFeedback,
    StrategyProposal,
)
from app.services.reasoning.meta_muse import MetaReasoningError, estimated_cost_usd
from app.services.reasoning.offline import OfflinePlanner
from app.services.render import FrameRecorder
from app.services.route_planner import PlannedCandidate



@dataclass(frozen=True)
class ImaginationResult:
    summaries: list[CandidateSummary]
    simulated: list[str]
    final_order: tuple[str, ...]
    trace: dict


def robot_brief(p: RobotPassport | None) -> dict:
    if p is None:
        return {}
    return {
        "robot_id": p.robot_id, "model": p.model_source, "dof": p.dof, "tool": p.tool_type,
        "joint_limits_rad": {j.name: [round(j.lower, 3), round(j.upper, 3)] for j in p.arm_joints},
        "max_sampled_reach_m": round(p.workspace.max_reach_m, 3),
        "end_effector": p.end_effector.site_name,
    }


def build_context(
    setup: SearchSetup, capsule: ExperienceCapsule, source: RobotPassport | None, target: RobotPassport,
    planned: list[PlannedCandidate], offline_order: list[str], budget: int,
) -> ReasoningContext:
    source_outcomes = {o["candidate_id"]: o.get("outcome") for o in capsule.candidate_outcomes}
    views = tuple(
        CandidateView(
            candidate_id=p.summary.candidate_id, route_class=p.summary.route_class,
            clearance_m=p.summary.clearance_m, kinematic_outcome=p.summary.outcome, reason=p.summary.reason,
            min_clearance_m=p.summary.min_clearance_m, cost=p.summary.cost,
            source_outcome=source_outcomes.get(p.summary.candidate_id),
        )
        for p in planned
    )
    return ReasoningContext(
        task={"scene_id": setup.task.scene_id, "description": setup.task.description,
              "start": setup.task.start, "target": setup.task.target,
              "obstacles": [o.model_dump() for o in setup.task.obstacles], "frame": "task frame, metres"},
        capsule={"skill_id": capsule.skill_id, "source_robot": capsule.source_robot_id,
                 "strategy": capsule.strategy.model_dump(), "validation": capsule.validation.model_dump(),
                 "source_candidate_outcomes": capsule.candidate_outcomes},
        source_robot=robot_brief(source), target_robot=robot_brief(target),
        candidates=views, offline_order=tuple(offline_order), physics_budget=budget,
    )


def _proposal_record(p: StrategyProposal, kind: str) -> dict:
    return {"kind": kind, "provider": p.provider, "model_id": p.model_id, "ranking": list(p.ranking),
            "rationale": p.rationale, "notes": list(p.notes), "error": p.error,
            "calls": [asdict(c) for c in p.calls]}


def _failed_record(provider: ReasoningProvider, kind: str, exc: MetaReasoningError, order) -> dict:
    """A model attempt that produced no usable ranking; its calls were still made and billed."""
    return {"kind": kind, "provider": provider.name, "model_id": provider.model_id, "ranking": list(order),
            "error": str(exc), "calls": [asdict(c) for c in exc.calls]}


def _propose(provider: ReasoningProvider, context: ReasoningContext) -> tuple[StrategyProposal, str | None, list]:
    try:
        return provider.propose_strategies(context), None, []
    except MetaReasoningError as exc:
        fallback = OfflinePlanner().propose_strategies(context)
        return fallback, str(exc), [_failed_record(provider, "propose", exc, fallback.ranking)]


def imagine(
    ctx: RunContext, setup: SearchSetup, planned: list[PlannedCandidate], provider: ReasoningProvider,
    context: ReasoningContext, budget: int,
) -> ImaginationResult:
    proposal, error, failed = _propose(provider, context)
    label = "offline planner (fallback)" if error else proposal.provider
    ctx.event("proposing", f"{label} ranked {len(proposal.ranking)} hypotheses; top: "
              f"{', '.join(proposal.ranking[:3])}", ranking=list(proposal.ranking), rationale=proposal.rationale,
              provider=proposal.provider, error=error)
    proposals = [*failed, _proposal_record(proposal, "propose")]
    order = proposal.ranking
    by_id = {p.summary.candidate_id: p for p in planned}
    updated: dict[str, CandidateSummary] = {}
    feedback: list[RolloutFeedback] = []
    revisions = 0
    with FrameRecorder(setup.adapter.model, task_view(setup.placement), CLIP_WIDTH, CLIP_HEIGHT) as rec:
        while len(updated) < budget:
            cid = next((c for c in order if c not in updated and by_id[c].joint_path is not None), None)
            if cid is None:
                break
            _, phys = recorded_try(ctx, setup, rec, cid, by_id[cid].joint_path, len(updated) + 1, budget)
            updated[cid] = with_physics(by_id[cid].summary, phys)
            s = updated[cid]
            feedback.append(RolloutFeedback(cid, s.outcome, s.reason, phys["endpoint_error_m"], len(phys["collisions"])))
            try_event(ctx, f"Imagined future {len(updated)}/{budget}: {cid} → {s.outcome}", cid, s)
            if s.outcome != "verified" and revisions < provider.max_revisions and not error:
                order, revisions = _revise(ctx, provider, context, feedback, order, proposals), revisions + 1
    summaries = _merge(planned, updated)
    simulated = list(updated)
    trace = _trace(provider, proposals, error, context, order, revisions)
    return ImaginationResult(summaries, simulated, tuple(order), trace)


def _revise(ctx, provider, context, feedback, order, proposals) -> tuple[str, ...]:
    try:
        revised = provider.revise_strategy(context, list(feedback), tuple(order))
    except MetaReasoningError as exc:
        proposals.append(_failed_record(provider, "revise", exc, order))
        ctx.event("proposing", f"Revision failed ({exc}); keeping current order")
        return tuple(order)
    proposals.append(_proposal_record(revised, "revise"))
    ctx.event("proposing", f"{revised.provider} revised order after a failed future: {revised.rationale}",
              ranking=list(revised.ranking))
    return revised.ranking


def _merge(planned: list[PlannedCandidate], updated: dict[str, CandidateSummary]) -> list[CandidateSummary]:
    out = []
    for p in planned:
        s = p.summary
        if s.candidate_id in updated:
            out.append(updated[s.candidate_id])
        elif s.outcome == "feasible":
            out.append(s.model_copy(update={"outcome": "not_simulated",
                                            "reason": s.reason + "; not simulated (imagination budget)"}))
        else:
            out.append(s)
    return out


def _trace(provider, proposals, error, context, order, revisions) -> dict:
    # Count every call made to the requested model, including attempts that fell back (they were billed).
    model_calls = [c for p in proposals if provider.model_id and p.get("provider") == provider.name
                   for c in p.get("calls", []) if c["kind"] in ("propose", "revise")]
    cost = (estimated_cost_usd(tuple(ReasoningCall(**c) for c in model_calls), provider.model_id)
            if model_calls else None)
    return {
        "provider_requested": provider.name,
        "model_requested": provider.model_id,
        "provider_used": "offline_deterministic" if error else provider.name,
        "model_id": None if error else provider.model_id,
        "fallback_error": error,
        "proposals": proposals,
        "revisions": revisions,
        "physics_budget": context.physics_budget,
        "final_order": list(order),
        "offline_order": list(context.offline_order),
        "model_calls": len(model_calls),
        "prompt_tokens": sum(c.get("prompt_tokens") or 0 for c in model_calls) or None,
        "completion_tokens": sum(c.get("completion_tokens") or 0 for c in model_calls) or None,
        "estimated_cost_usd": cost,
    }
