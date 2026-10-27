"""Deterministic offline planner: the source-experience prior, no model calls."""

from __future__ import annotations

from app.services.reasoning.base import (
    ReasoningCall,
    ReasoningContext,
    RolloutFeedback,
    StrategyProposal,
    validate_ranking,
)


class OfflinePlanner:
    name = "offline_deterministic"
    model_id = None
    max_revisions = 2

    def propose_strategies(self, context: ReasoningContext) -> StrategyProposal:
        ranking, notes = validate_ranking(context.offline_order, context)
        return StrategyProposal(
            ranking=ranking,
            rationale="Source-experience prior: capsule strategy, same route class, source-verified "
            "alternatives, then source failures.",
            provider=self.name,
            model_id=None,
            calls=(ReasoningCall(kind="propose", summary="offline prior order (no model call)"),),
            notes=notes,
        )

    def revise_strategy(
        self, context: ReasoningContext, tried: list[RolloutFeedback], current: tuple[str, ...]
    ) -> StrategyProposal:
        """After a physics failure, push untried candidates of the failed route classes to the end."""
        failed_classes = {
            context.candidate(t.candidate_id).route_class
            for t in tried
            if t.outcome != "verified" and context.candidate(t.candidate_id)
        }
        tried_ids = {t.candidate_id for t in tried}
        rest = [c for c in current if c not in tried_ids]
        keep = [c for c in rest if context.candidate(c).route_class not in failed_classes]
        demoted = [c for c in rest if context.candidate(c).route_class in failed_classes]
        ranking, notes = validate_ranking([*[t.candidate_id for t in tried], *keep, *demoted], context)
        return StrategyProposal(
            ranking=ranking,
            rationale=f"Demoted route classes that failed in physics: {sorted(failed_classes)}",
            provider=self.name,
            model_id=None,
            calls=(ReasoningCall(kind="revise", summary=f"demoted {len(demoted)} candidates"),),
            notes=notes,
        )
