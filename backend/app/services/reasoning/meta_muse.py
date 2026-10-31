"""Meta Muse Spark strategy provider for transfers (request format and limits in meta_client).

The model ranks candidate ids from a fixed vocabulary using bounded,
read-only tools. It cannot run physics: the backend simulates in the
validated ranked order.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from functools import partial

import httpx

from app.services.reasoning.base import (
    ReasoningCall,
    ReasoningContext,
    RolloutFeedback,
    StrategyProposal,
    validate_ranking,
)
from app.services.reasoning.meta_client import (  # noqa: F401 (re-exported for callers and tests)
    BASE_URL,
    Conversation,
    MetaChatClient,
    MetaReasoningError,
    estimated_cost_usd,
    tool_spec,
)

MAX_TOOL_ROUNDS = 2  # live runs used every round on inspection; fewer rounds = fewer paid calls

SYSTEM_PROMPT = (
    "You are the strategy reasoner for Nimbotics, a robot experience-sharing system. A source robot "
    "published a simulation-verified obstacle-avoiding reach skill. A target robot with a different body "
    "must reuse it. You rank candidate route hypotheses (by candidate_id) for the target robot. You do NOT "
    "compute motion: the backend solves inverse kinematics and runs MuJoCo physics on your top-ranked "
    "candidates (budget given). Use the read-only tools if useful, then call submit_ranking exactly once. "
    "Only use candidate_ids from the provided list. Candidates whose kinematic_outcome is not 'feasible' "
    "cannot be simulated, so ranking them first wastes nothing but is uninformative. Each candidate's "
    "kinematic outcome is already in the message, so call submit_ranking as soon as you can."
)
FINAL_INSTRUCTION = (
    "Tools are no longer available. Reply now with only the JSON object "
    '{"ranking": [candidate_ids, best first], "rationale": "<one sentence>"} and no other text.'
)


def _ranking_schema(ids: tuple[str, ...]) -> dict:
    return {
        "type": "object",
        "properties": {
            "ranking": {"type": "array", "items": {"type": "string", "enum": list(ids)}},
            "rationale": {"type": "string"},
        },
        "required": ["ranking", "rationale"],
        "additionalProperties": False,
    }


def build_tools(context: ReasoningContext) -> list[dict]:
    ids = list(context.allowed_ids)
    cid = {"candidate_id": {"type": "string", "enum": ids}}
    return [
        tool_spec("inspect_robot", "Robot Passport summary (DOF, joint limits, sampled reach).",
                  {"robot": {"type": "string", "enum": ["source", "target"]}}, ["robot"]),
        tool_spec("inspect_skill", "Source Experience Capsule summary: strategy, validation, source outcomes.",
                  {}, []),
        tool_spec("check_candidate", "Target-robot kinematic result for one candidate (IK, screening, clearance).",
                  cid, ["candidate_id"]),
        tool_spec("summarize_failure", "Why a candidate failed for the target and for the source.",
                  cid, ["candidate_id"]),
        tool_spec("submit_ranking", "Submit the final ranking of candidate_ids, best first, with a short rationale.",
                  _ranking_schema(context.allowed_ids)["properties"], ["ranking", "rationale"]),
    ]


def run_tool(name: str, args: dict, context: ReasoningContext, feedback: list[RolloutFeedback]) -> dict:
    """Server-side, read-only tool execution with argument validation."""
    if name == "inspect_robot":
        robot = args.get("robot")
        if robot not in ("source", "target"):
            return {"error": "robot must be 'source' or 'target'"}
        return context.source_robot if robot == "source" else context.target_robot
    if name == "inspect_skill":
        return context.capsule
    if name in ("check_candidate", "summarize_failure"):
        view = context.candidate(str(args.get("candidate_id")))
        if view is None:
            return {"error": f"unknown candidate_id; allowed: {list(context.allowed_ids)}"}
        if name == "check_candidate":
            return asdict(view)
        sim = next((asdict(f) for f in feedback if f.candidate_id == view.candidate_id), None)
        return {"target_kinematic": view.reason, "target_physics": sim, "source_outcome": view.source_outcome}
    return {"error": f"unknown tool {name}"}


class MetaMuseProvider:
    name = "meta_muse_spark"
    max_revisions = 1

    def __init__(self, api_key: str, model_id: str, transport: httpx.BaseTransport | None = None) -> None:
        self._chat = MetaChatClient(api_key, model_id, transport)
        self.model_id = model_id

    def propose_strategies(self, context: ReasoningContext) -> StrategyProposal:
        user = {"instruction": f"Rank all candidates; the backend will simulate your top "
                               f"{context.physics_budget} feasible ones in order.",
                "task": context.task, "candidates": [_brief(c) for c in context.candidates],
                "offline_prior_order": list(context.offline_order)}
        return self._converse(context, json.dumps(user), [], "propose")

    def revise_strategy(
        self, context: ReasoningContext, tried: list[RolloutFeedback], current: tuple[str, ...]
    ) -> StrategyProposal:
        user = {"instruction": "Physics rollouts below did not all verify. Re-rank the remaining candidates.",
                "tried": [asdict(t) for t in tried], "current_ranking": list(current)}
        return self._converse(context, json.dumps(user), tried, "revise")

    def _converse(self, context: ReasoningContext, user: str, feedback: list[RolloutFeedback],
                  kind: str) -> StrategyProposal:
        answer, calls = self._chat.converse(Conversation(
            system=SYSTEM_PROMPT, user=user, tools=build_tools(context),
            run_tool=partial(_run_tool_for, context=context, feedback=feedback),
            submit_tool="submit_ranking", final_instruction=FINAL_INSTRUCTION, schema_name="ranking",
            schema=_ranking_schema(context.allowed_ids), kind=kind, max_rounds=MAX_TOOL_ROUNDS,
        ))
        try:
            return self._proposal(answer, context, calls)
        except MetaReasoningError as exc:
            raise MetaReasoningError(str(exc), calls) from exc

    def _proposal(self, answer: dict, context: ReasoningContext,
                  calls: tuple[ReasoningCall, ...]) -> StrategyProposal:
        raw = answer.get("ranking")
        if not isinstance(raw, list) or not raw:
            raise MetaReasoningError("answer has no ranking list")
        ranking, notes = validate_ranking([str(r) for r in raw], context)
        return StrategyProposal(ranking=ranking, rationale=str(answer.get("rationale", ""))[:1000],
                                provider=self.name, model_id=self.model_id, calls=calls, notes=notes)


def _run_tool_for(name: str, args: dict, *, context: ReasoningContext, feedback: list[RolloutFeedback]) -> dict:
    return run_tool(name, args, context, feedback)


def _brief(c) -> dict:
    return {"candidate_id": c.candidate_id, "route_class": c.route_class, "clearance_m": c.clearance_m,
            "kinematic_outcome": c.kinematic_outcome, "source_outcome": c.source_outcome}
