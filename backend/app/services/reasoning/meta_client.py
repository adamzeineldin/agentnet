"""Shared Meta Model API client: one bounded, read-only tool loop for every Muse feature.

Verified against https://dev.meta.ai/docs (tool-calling, structured-output, reasoning,
pricing pages) on 2026-10-26 and 2026-10-29:
  POST https://api.meta.ai/v1/chat/completions, Bearer MODEL_API_KEY
  tools[].type="function"; tool_choice only "auto"; parallel_tool_calls=false
  tool results: {"role": "tool", "tool_call_id", "content": str}
  response_format: {"type": "json_schema", "json_schema": {"name", "strict", "schema"}}
  reasoning_effort: top-level; reasoning tokens bill as output and count toward max_tokens

Tools only read backend data; the model never runs physics or writes to the registry.
Secrets are never logged.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass

import httpx

from app.services.reasoning.base import ReasoningCall

log = logging.getLogger(__name__)

BASE_URL = "https://api.meta.ai/v1"
MAX_TOKENS = 1200
# At the default level live runs spent the whole budget reasoning and returned an empty answer (D57).
REASONING_EFFORT = "low"
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

ToolRunner = Callable[[str, dict], dict]


class MetaReasoningError(RuntimeError):
    """The Meta call failed or returned an unusable answer.

    `calls` holds the model calls already made (and billed) before the failure.
    """

    def __init__(self, message: str, calls: tuple[ReasoningCall, ...] = ()) -> None:
        super().__init__(message)
        self.calls = calls


@dataclass(frozen=True)
class Conversation:
    """One bounded exchange: tool rounds, then a forced schema-constrained answer."""

    system: str
    user: str
    tools: list[dict]
    run_tool: ToolRunner
    submit_tool: str
    final_instruction: str
    schema_name: str
    schema: dict
    kind: str
    max_rounds: int
    # Output budget per call, reasoning included. Layout design reasons about geometry and needs more.
    max_tokens: int = MAX_TOKENS


def tool_spec(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required,
                           "additionalProperties": False},
        },
    }


class MetaChatClient:
    def __init__(self, api_key: str, model_id: str, transport: httpx.BaseTransport | None = None) -> None:
        if not api_key:
            raise MetaReasoningError("MODEL_API_KEY is not configured")
        self.model_id = model_id
        self._client = httpx.Client(
            base_url=BASE_URL, timeout=TIMEOUT_S, transport=transport,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )

    def converse(self, conv: Conversation) -> tuple[dict, tuple[ReasoningCall, ...]]:
        """Return the model's final answer object and every billed call; errors keep the calls."""
        calls: list[ReasoningCall] = []
        try:
            return self._tool_loop(conv, calls), tuple(calls)
        except MetaReasoningError as exc:
            raise MetaReasoningError(str(exc), tuple(calls)) from exc

    def _tool_loop(self, conv: Conversation, calls: list[ReasoningCall]) -> dict:
        messages: list[dict] = [{"role": "system", "content": conv.system}, {"role": "user", "content": conv.user}]
        for round_idx in range(conv.max_rounds + 1):
            final_round = round_idx == conv.max_rounds
            body = {"model": self.model_id, "messages": messages, "max_tokens": conv.max_tokens,
                    "reasoning_effort": REASONING_EFFORT}
            if final_round:
                body["messages"] = [*messages, {"role": "user", "content": conv.final_instruction}]
                body["response_format"] = {"type": "json_schema", "json_schema": {
                    "name": conv.schema_name, "strict": True, "schema": conv.schema}}
            else:
                body |= {"tools": conv.tools, "tool_choice": "auto", "parallel_tool_calls": False}
            message, call = self._post(body)
            tool_calls = message.get("tool_calls") or []
            names = [tc.get("function", {}).get("name") for tc in tool_calls]
            log.info("meta %s round %d: model=%s tools=%s", conv.kind, round_idx, self.model_id, names)
            calls.append(ReasoningCall(**{**asdict(call), "kind": conv.kind,
                                          "summary": f"round {round_idx}: " + (", ".join(names) or "answer")}))
            submitted = next((tc for tc in tool_calls if tc["function"]["name"] == conv.submit_tool), None)
            if submitted is not None:
                return parse_args(submitted)
            if not tool_calls:
                return parse_json(message.get("content"))
            messages.append(message)
            for tc in tool_calls:
                result = conv.run_tool(tc["function"]["name"], parse_args(tc))
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": json.dumps(result)})
        raise MetaReasoningError("no answer after maximum tool rounds")

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


def parse_args(tool_call: dict) -> dict:
    try:
        args = json.loads(tool_call["function"].get("arguments") or "{}")
    except (TypeError, ValueError) as exc:
        raise MetaReasoningError("tool arguments are not valid JSON") from exc
    if not isinstance(args, dict):
        raise MetaReasoningError("tool arguments must be an object")
    return args


def parse_json(content: object) -> dict:
    if not isinstance(content, str):
        raise MetaReasoningError("empty answer")
    try:
        parsed = json.loads(content)
    except ValueError:
        # Live answers sometimes wrap the object in prose or code fences; take the outermost {...}.
        start, end = content.find("{"), content.rfind("}")
        try:
            parsed = json.loads(content[start:end + 1]) if 0 <= start < end else None
        except ValueError:
            parsed = None
        if parsed is None:
            raise MetaReasoningError("answer is not JSON") from None
    if not isinstance(parsed, dict):
        raise MetaReasoningError("answer must be a JSON object")
    return parsed
