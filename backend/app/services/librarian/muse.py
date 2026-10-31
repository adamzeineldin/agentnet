"""Muse librarian: adds a summary, collection notes and suggestion priorities to the offline report.

The offline rules compute every fact (membership, duplicates, gaps, suggestions). The model sees
those facts plus compact skill summaries, may inspect or compare skills through read-only tools,
and returns text and an ordering. Unknown ids are dropped (and noted); text is length-capped.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Sequence
from dataclasses import asdict
from functools import partial

import httpx

from app.models.library import LibraryReport, LibrarySuggestion, ModelUsage
from app.models.skill import ExperienceCapsule
from app.services.librarian.offline import organize as organize_offline
from app.services.librarian.offline import strategy_label
from app.services.reasoning.base import ReasoningCall
from app.services.reasoning.meta_client import (
    Conversation,
    MetaChatClient,
    MetaReasoningError,
    estimated_cost_usd,
    tool_spec,
)

PROVIDER = "meta_muse_spark"
MAX_TOOL_ROUNDS = 1  # every fact is already in the first message; tools are for spot checks only
MAX_SUMMARY_CHARS = 500
MAX_NOTE_CHARS = 200

SYSTEM_PROMPT = (
    "You are the librarian for Nimbotics, a shared registry of simulation-verified robot reach skills. "
    "The backend has already grouped the skills into collections, found duplicates and coverage gaps, and "
    "listed transfer suggestions; those facts are final. Your job: write a short plain-language summary of "
    "the library, an optional one-line note per collection, and order the transfer suggestions from most to "
    "least useful with a one-sentence rationale. Do not state counts or measurements; the backend shows them. "
    "Every skill is a MuJoCo simulation result: never describe skills as shown on hardware, physical or "
    "real-world robots. "
    "Only use collection_ids and suggestion_ids from the message. Use inspect_skill or compare_skills only "
    "if needed, then call submit_organization exactly once."
)
FINAL_INSTRUCTION = (
    "Tools are no longer available. Reply now with only the JSON object with keys summary, "
    "collection_notes, suggestion_order and priority_rationale, and no other text."
)
# Model text implying physical-world results is dropped, not rewritten (CLAUDE.md: simulation-verified only).
PHYSICAL_CLAIM = re.compile(r"\b(hardware|physical(ly)?|real[- ]world|real robots?)\b", re.IGNORECASE)
MODEL_TEXT_NOTE = ("Summary, collection notes and suggestion priorities are model-written; groupings, duplicates, "
                   "gaps and counts come from the offline rules.")


def suggestion_id(s: LibrarySuggestion) -> str:
    return f"{s.action}:{s.source_skill_id}:{s.target_robot_id}"


def skill_brief(c: ExperienceCapsule) -> dict:
    return {"skill_id": c.skill_id, "robot": c.source_robot_id, "scene_id": c.task.scene_id,
            "strategy": strategy_label(c), "parent_skill_id": c.parent_skill_id,
            "endpoint_error_mm": round(c.validation.endpoint_error_m * 1000, 2),
            "published": c.created_at.isoformat()}


def _string(values: Sequence[str]) -> dict:
    # An empty enum is invalid JSON Schema; with nothing to choose, any string is dropped by validation.
    return {"type": "string", "enum": list(values)} if values else {"type": "string"}


def _schema(collection_ids: Sequence[str], suggestion_ids: Sequence[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "collection_notes": {"type": "array", "items": {
                "type": "object", "properties": {"collection_id": _string(collection_ids), "note": {"type": "string"}},
                "required": ["collection_id", "note"], "additionalProperties": False}},
            "suggestion_order": {"type": "array", "items": _string(suggestion_ids)},
            "priority_rationale": {"type": "string"},
        },
        "required": ["summary", "collection_notes", "suggestion_order", "priority_rationale"],
        "additionalProperties": False,
    }


def build_tools(skill_ids: Sequence[str], schema: dict) -> list[dict]:
    sid = _string(skill_ids)
    return [
        tool_spec("inspect_skill", "One published skill: robot, scene, strategy, lineage, validation.",
                  {"skill_id": sid}, ["skill_id"]),
        tool_spec("compare_skills", "Whether two skills share robot, task geometry and strategy.",
                  {"skill_a": sid, "skill_b": sid}, ["skill_a", "skill_b"]),
        tool_spec("submit_organization", "Submit the summary, collection notes and suggestion order.",
                  schema["properties"], schema["required"]),
    ]


def run_tool(name: str, args: dict, by_id: dict[str, ExperienceCapsule]) -> dict:
    """Server-side, read-only tool execution with argument validation."""
    if name == "inspect_skill":
        c = by_id.get(str(args.get("skill_id")))
        if c is None:
            return {"error": f"unknown skill_id; allowed: {sorted(by_id)}"}
        return {**skill_brief(c), "lineage": c.lineage, "description": c.strategy.description,
                "validation": c.validation.model_dump()}
    if name == "compare_skills":
        a, b = by_id.get(str(args.get("skill_a"))), by_id.get(str(args.get("skill_b")))
        if a is None or b is None:
            return {"error": f"unknown skill_id; allowed: {sorted(by_id)}"}
        return {"same_robot": a.source_robot_id == b.source_robot_id, "same_task_geometry": a.task == b.task,
                "same_strategy": strategy_label(a) == strategy_label(b),
                "skill_a": skill_brief(a), "skill_b": skill_brief(b)}
    return {"error": f"unknown tool {name}"}


def model_usage(calls: tuple[ReasoningCall, ...], model_id: str | None) -> ModelUsage:
    def total(field: str) -> int | None:
        values = [getattr(c, field) for c in calls]
        return None if not values or any(v is None for v in values) else sum(values)

    return ModelUsage(model_calls=len(calls), prompt_tokens=total("prompt_tokens"),
                      completion_tokens=total("completion_tokens"),
                      estimated_cost_usd=estimated_cost_usd(calls, model_id),
                      calls=[asdict(c) for c in calls])


class MuseLibrarian:
    name = PROVIDER

    def __init__(self, api_key: str, model_id: str, transport: httpx.BaseTransport | None = None) -> None:
        self._chat = MetaChatClient(api_key, model_id, transport)
        self.model_id = model_id

    def organize(self, skills: Iterable[ExperienceCapsule], robot_ids: Sequence[str]) -> LibraryReport:
        skills = list(skills)
        base = organize_offline(skills, robot_ids)
        by_id = {c.skill_id: c for c in skills}
        collection_ids = [c.collection_id for c in base.collections]
        suggestion_ids = [suggestion_id(s) for s in base.suggestions]
        schema = _schema(collection_ids, suggestion_ids)
        answer, calls = self._chat.converse(Conversation(
            system=SYSTEM_PROMPT, user=json.dumps(_user_message(base, skills, suggestion_ids)),
            tools=build_tools(sorted(by_id), schema), run_tool=partial(_run_tool_for, by_id=by_id),
            submit_tool="submit_organization", final_instruction=FINAL_INSTRUCTION, schema_name="organization",
            schema=schema, kind="organize", max_rounds=MAX_TOOL_ROUNDS,
        ))
        return apply_answer(base, answer, self.model_id, calls)


def _run_tool_for(name: str, args: dict, *, by_id: dict[str, ExperienceCapsule]) -> dict:
    return run_tool(name, args, by_id)


def _user_message(base: LibraryReport, skills: Sequence[ExperienceCapsule], suggestion_ids: list[str]) -> dict:
    return {
        "instruction": "Organize this library: summary, collection notes, suggestion order, rationale.",
        "skills": [skill_brief(c) for c in sorted(skills, key=lambda c: (c.created_at, c.skill_id))],
        "collections": [{"collection_id": c.collection_id, "title": c.title, "skill_ids": c.skill_ids,
                         "robot_ids": c.robot_ids} for c in base.collections],
        "duplicates": [d.basis + f" Duplicates of {d.keep_skill_id}: {d.duplicate_skill_ids}." for d in base.duplicates],
        "gaps": [g.detail for g in base.gaps],
        "suggestion_ids": suggestion_ids,
        "suggestions": [{"suggestion_id": sid, "reason": s.reason} for sid, s in zip(suggestion_ids, base.suggestions)],
    }


def _model_text(value: object, limit: int, label: str, ignored: list[str]) -> str | None:
    text = str(value or "")[:limit]
    if PHYSICAL_CLAIM.search(text):
        ignored.append(f"Model {label} dropped: it implied physical hardware; Nimbotics results are simulation-only.")
        return None
    return text or None


def apply_answer(base: LibraryReport, answer: dict, model_id: str,
                 calls: tuple[ReasoningCall, ...]) -> LibraryReport:
    """Merge model text and ordering into the rule-computed report; never changes the facts."""
    ignored: list[str] = []
    valid_collections = {c.collection_id for c in base.collections}
    notes_by_id: dict[str, str | None] = {}
    for item in answer.get("collection_notes") or []:
        cid = item.get("collection_id") if isinstance(item, dict) else None
        if cid in valid_collections:
            notes_by_id[cid] = _model_text(item.get("note"), MAX_NOTE_CHARS, f"note for {cid}", ignored)
        else:
            ignored.append(f"Model referenced unknown collection {cid!r}; ignored.")
    by_sid = {suggestion_id(s): s for s in base.suggestions}
    order: list[str] = []
    for sid in answer.get("suggestion_order") or []:
        if sid in by_sid and sid not in order:
            order.append(sid)
        elif sid not in by_sid:
            ignored.append(f"Model referenced unknown suggestion {sid!r}; ignored.")
    order += [sid for sid in by_sid if sid not in order]
    return base.model_copy(update={
        "provider": PROVIDER, "provider_requested": PROVIDER, "model_id": model_id,
        "collections": [c.model_copy(update={"model_note": notes_by_id.get(c.collection_id)})
                        for c in base.collections],
        "suggestions": [by_sid[sid] for sid in order],
        "summary": _model_text(answer.get("summary"), MAX_SUMMARY_CHARS, "summary", ignored),
        "priority_rationale": _model_text(answer.get("priority_rationale"), MAX_NOTE_CHARS, "rationale", ignored),
        "usage": model_usage(calls, model_id),
        "notes": [*base.notes, MODEL_TEXT_NOTE, *ignored],
    })


def fallback_report(skills: Iterable[ExperienceCapsule], robot_ids: Sequence[str], model_id: str,
                    error: MetaReasoningError) -> LibraryReport:
    """Offline report after a failed model attempt; the attempt's billed calls stay on record."""
    base = organize_offline(skills, robot_ids)
    return base.model_copy(update={
        "provider_requested": PROVIDER, "fallback_error": str(error),
        "usage": model_usage(error.calls, model_id),
        "notes": [*base.notes, f"Muse librarian failed ({error}); offline report shown."],
    })
