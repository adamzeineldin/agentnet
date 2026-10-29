"""Meta Muse Spark provider (Meta Model API, OpenAI-compatible Chat Completions).

Verified against https://dev.meta.ai/docs (tool-calling, structured-output,
pricing pages) on 2026-10-26:
  POST https://api.meta.ai/v1/chat/completions, Bearer MODEL_API_KEY
  tools[].type="function"; tool_choice only "auto"; parallel_tool_calls=false
  tool results: {"role": "tool", "tool_call_id", "content": str}
  response_format: {"type": "json_schema", "json_schema": {"name", "schema"}}

The model ranks candidate ids from a fixed vocabulary using bounded,
read-only tools. It cannot run physics: the backend simulates in the
validated ranked order. Secrets are never logged.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict

import httpx

from app.services.reasoning.base import (
    ReasoningCall,
    ReasoningContext,
    RolloutFeedback,
    StrategyProposal,
    validate_ranking,
)

log = logging.getLogger(__name__)

BASE_URL = "https://api.meta.ai/v1"
MAX_TOOL_ROUNDS = 4
MAX_TOKENS = 1200
TIMEOUT_S = 60.0
# USD per 1M tokens (input, output), dev.meta.ai/docs/pricing-rate-limits, checked 2026-10-29.
# Contributor variants are cheaper because Meta may use the traffic for training.
PRICES_PER_M: dict[str, tuple[float, float]] = {
    "muse-spark-1.3": (1.25, 4.25),
    "muse-spark-1.3-contributor": (0.10, 0.20),
    "muse-spark-1.2": (1.25, 4.25),
    "muse-spark-1.2-contributor": (0.10, 0.20),
    "muse-spark-1.1": (1.25, 4.25),
    "muse-wonder-1.0": (4.00, 20.00),
}

SYSTEM_PROMPT = (
    "You are the strategy reasoner for AgentNet, a robot experience-sharing system. A source robot "
    "published a simulation-verified obstacle-avoiding reach skill. A target robot with a different body "
    "must reuse it. You rank candidate route hypotheses (by candidate_id) for the target robot. You do NOT "
    "compute motion: the backend solves inverse kinematics and runs MuJoCo physics on your top-ranked "
    "candidates (budget given). Use the read-only tools if useful, then call submit_ranking exactly once. "
    "Only use candidate_ids from the provided list. Candidates whose kinematic_outcome is not 'feasible' "
    "cannot be simulated, so ranking them first wastes nothing but is uninformative."
)


class MetaReasoningError(RuntimeError):
    """The Meta call failed or returned an unusable answer."""


def _tool(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required,
                           "additionalProperties": False},
        },
    }


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
        _tool("inspect_robot", "Robot Passport summary (DOF, joint limits, sampled reach).",
              {"robot": {"type": "string", "enum": ["source", "target"]}}, ["robot"]),
        _tool("inspect_skill", "Source Experience Capsule summary: strategy, validation, source outcomes.", {}, []),
        _tool("check_candidate", "Target-robot kinematic result for one candidate (IK, screening, clearance).",
              cid, ["candidate_id"]),
        _tool("summarize_failure", "Why a candidate failed for the target and for the source.", cid, ["candidate_id"]),
        _tool("submit_ranking", "Submit the final ranking of candidate_ids, best first, with a short rationale.",
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
        if not api_key:
            raise MetaReasoningError("MODEL_API_KEY is not configured")
        self.model_id = model_id
        self._client = httpx.Client(
            base_url=BASE_URL, timeout=TIMEOUT_S, transport=transport,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )

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

    # ------------------------------------------------------------------ internals
    def _post(self, body: dict) -> tuple[dict, ReasoningCall]:
        t0 = time.perf_counter()
        try:
            res = self._client.post("/chat/completions", json=body)
        except httpx.HTTPError as exc:
            raise MetaReasoningError(f"network error: {type(exc).__name__}") from exc
        if res.status_code != 200:
            raise MetaReasoningError(f"HTTP {res.status_code}: {res.text[:200]}")
        try:
            data = res.json()
            message = data["choices"][0]["message"]
        except (ValueError, KeyError, IndexError) as exc:
            raise MetaReasoningError("malformed response") from exc
        usage = data.get("usage") or {}
        call = ReasoningCall(
            kind="model", summary=f"{len(body['messages'])} messages",
            latency_s=time.perf_counter() - t0,
            prompt_tokens=usage.get("prompt_tokens"), completion_tokens=usage.get("completion_tokens"),
        )
        return message, call

    def _converse(self, context: ReasoningContext, user: str, feedback: list[RolloutFeedback],
                  kind: str) -> StrategyProposal:
        messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]
        tools = build_tools(context)
        calls: list[ReasoningCall] = []
        for round_idx in range(MAX_TOOL_ROUNDS + 1):
            final_round = round_idx == MAX_TOOL_ROUNDS
            body = {"model": self.model_id, "messages": messages, "max_tokens": MAX_TOKENS}
            if final_round:
                body["response_format"] = {"type": "json_schema", "json_schema": {
                    "name": "ranking", "schema": _ranking_schema(context.allowed_ids)}}
            else:
                body |= {"tools": tools, "tool_choice": "auto", "parallel_tool_calls": False}
            message, call = self._post(body)
            tool_calls = message.get("tool_calls") or []
            log.info("meta %s round %d: model=%s tools=%s", kind, round_idx, self.model_id,
                     [tc.get("function", {}).get("name") for tc in tool_calls])
            calls.append(ReasoningCall(**{**asdict(call), "kind": kind,
                                          "summary": f"round {round_idx}: " + (", ".join(
                                              tc["function"]["name"] for tc in tool_calls) or "answer")}))
            submitted = next((tc for tc in tool_calls if tc["function"]["name"] == "submit_ranking"), None)
            if submitted is not None:
                return self._proposal(_parse_args(submitted), context, calls)
            if not tool_calls:
                return self._proposal(_parse_json(message.get("content")), context, calls)
            messages.append(message)
            for tc in tool_calls:
                result = run_tool(tc["function"]["name"], _parse_args(tc), context, feedback)
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": json.dumps(result)})
        raise MetaReasoningError("no ranking after maximum tool rounds")

    def _proposal(self, answer: dict, context: ReasoningContext, calls: list[ReasoningCall]) -> StrategyProposal:
        raw = answer.get("ranking")
        if not isinstance(raw, list) or not raw:
            raise MetaReasoningError("answer has no ranking list")
        ranking, notes = validate_ranking([str(r) for r in raw], context)
        return StrategyProposal(ranking=ranking, rationale=str(answer.get("rationale", ""))[:1000],
                                provider=self.name, model_id=self.model_id, calls=tuple(calls), notes=notes)


def estimated_cost_usd(calls: tuple[ReasoningCall, ...], model_id: str | None) -> float | None:
    """None when usage is missing or the model has no known price (never guessed)."""
    price = PRICES_PER_M.get(model_id or "")
    if price is None or not calls or any(
        c.prompt_tokens is None or c.completion_tokens is None for c in calls if c.kind != "tool"
    ):
        return None
    tin = sum(c.prompt_tokens or 0 for c in calls)
    tout = sum(c.completion_tokens or 0 for c in calls)
    return tin / 1e6 * price[0] + tout / 1e6 * price[1]


def _brief(c) -> dict:
    return {"candidate_id": c.candidate_id, "route_class": c.route_class, "clearance_m": c.clearance_m,
            "kinematic_outcome": c.kinematic_outcome, "source_outcome": c.source_outcome}


def _parse_args(tool_call: dict) -> dict:
    try:
        args = json.loads(tool_call["function"].get("arguments") or "{}")
    except (TypeError, ValueError) as exc:
        raise MetaReasoningError("tool arguments are not valid JSON") from exc
    if not isinstance(args, dict):
        raise MetaReasoningError("tool arguments must be an object")
    return args


def _parse_json(content: object) -> dict:
    if not isinstance(content, str):
        raise MetaReasoningError("empty answer")
    try:
        parsed = json.loads(content)
    except ValueError as exc:
        raise MetaReasoningError("answer is not JSON") from exc
    if not isinstance(parsed, dict):
        raise MetaReasoningError("answer must be a JSON object")
    return parsed
