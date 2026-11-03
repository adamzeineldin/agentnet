"""Skill scout: from a goal in plain words to a learning plan for one robot.

Muse reads the goal, the task types, the fleet and every published skill, and answers with one task type,
up to three saved skills the learner should learn from (or which robot should learn it first), and short
reasons. One schema-constrained call, no tools. Every id it returns is checked against the registry; text
that implies physical-world results is dropped. The offline scout (keyword match) is always available and
labelled as such. Nothing here runs physics: the plan's picks are tested by transfer runs.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from collections.abc import Sequence
from datetime import UTC, date, datetime

from app.config import META_MODEL_ID, MODEL_API_KEY, SCOUT_DAILY_MODEL_CALLS
from app.models.robot import RobotSummary
from app.models.scout import ScoutPick, ScoutPlan
from app.models.skill import ExperienceCapsule
from app.services.librarian.muse import PHYSICAL_CLAIM, model_usage
from app.services.reasoning.meta_client import Conversation, MetaChatClient, MetaReasoningError
from app.services.task_families import (
    FENCE_FAMILY,
    POSTS_FAMILY,
    ROOF_FAMILY,
    SCENE_FAMILY,
    SHELF_FAMILY,
    TALL_WALL_FAMILY,
    TASK_TYPES,
    family_of,
)

log = logging.getLogger(__name__)
PROVIDER = "meta_muse_spark"
OFFLINE = "offline_scout"
MAX_PICKS = 3
MAX_WHY_CHARS = 220
MAX_SUMMARY_CHARS = 400
KEYWORDS: dict[str, tuple[str, ...]] = {
    POSTS_FAMILY: ("gap", "between", "post", "through", "narrow", "door", "opening", "slot", "bars"),
    SHELF_FAMILY: ("shelf", "onto", "cupboard", "counter", "on top", "rack", "cabinet", "place", "put"),
    ROOF_FAMILY: ("roof", "under", "ceiling", "overhang", "beneath", "below", "table", "tunnel"),
    TALL_WALL_FAMILY: ("tall", "around", "column", "pillar", "side"),
    FENCE_FAMILY: ("fence", "long", "low", "floor", "ground", "railing"),
    SCENE_FAMILY: ("wall", "past", "barrier", "block", "partition", "divider", "over"),
}
SYSTEM_PROMPT = (
    "You are the skill scout for Nimbotics, a shared library of simulation-verified robot reach skills. "
    "A user describes what they want a robot (the learner) to do. Choose the one task type that best matches "
    "the description, then choose up to three published skills of that task type, from other robots, that the "
    "learner should try to learn from, best first. Prefer skills from robots whose bodies resemble the learner "
    "(similar joint count and reach) and skills with small endpoint error; prefer variety of routes. If no "
    "published skill of that task type exists, choose which fleet robot (not the learner) should learn the task "
    "first and leave picks empty. Write one plain sentence per reason and a two-sentence summary for a "
    "non-expert. Every result is a MuJoCo simulation: never say a skill works on hardware or real robots, and "
    "do not promise success; the simulator tests every pick. Only use ids from the message."
)
FINAL_INSTRUCTION = ("Reply now with only the JSON object with keys task_family, task_why, picks, teacher_robot_id, "
                     "teacher_why and summary, and no other text.")
MODEL_TEXT_NOTE = "The task choice, picks and reasons are model-written; every id was checked against the registry."
OFFLINE_NOTE = "Offline scout: the task type comes from keywords in the goal; picks are ranked by endpoint error."

_lock = threading.Lock()
_cache: dict[tuple, ScoutPlan] = {}
_spent: dict[date, int] = {}


def _verified(skills: Sequence[ExperienceCapsule], family: str, learner: str) -> list[ExperienceCapsule]:
    return [s for s in skills if s.validation.success and s.source_robot_id != learner
            and family_of(s.task.scene_id) == family]


def route_text(s: ExperienceCapsule) -> str:
    return f"{s.strategy.route_class.replace('_', ' ')}, {s.strategy.clearance_m * 100:.0f} cm clear"


def keyword_family(goal: str) -> tuple[str, list[str]]:
    text = goal.lower()
    scores = {f: [k for k in words if re.search(rf"\b{re.escape(k)}", text)] for f, words in KEYWORDS.items()}
    best = max(scores, key=lambda f: len(scores[f]))
    return (best, scores[best]) if scores[best] else (SCENE_FAMILY, [])


def _rank(cands: list[ExperienceCapsule]) -> list[ExperienceCapsule]:
    """Best endpoint error first, one skill per source robot before any second one."""
    ordered = sorted(cands, key=lambda s: (s.validation.endpoint_error_m, s.skill_id))
    first: dict[str, ExperienceCapsule] = {}
    for s in ordered:
        first.setdefault(s.source_robot_id, s)
    leaders = list(first.values())
    return leaders + [s for s in ordered if s not in leaders]


def _teacher(robots: Sequence[RobotSummary], skills: Sequence[ExperienceCapsule], learner: str) -> str | None:
    others = [r.robot_id for r in robots if r.robot_id != learner]
    if not others:
        return None
    count = {rid: sum(1 for s in skills if s.source_robot_id == rid and s.validation.success) for rid in others}
    return max(others, key=lambda rid: (count[rid], rid == "panda_01"))


def offline_plan(goal: str, learner: str, robots: Sequence[RobotSummary], skills: Sequence[ExperienceCapsule],
                 requested: str = OFFLINE, error: MetaReasoningError | None = None, model_id: str | None = None,
                 extra_notes: Sequence[str] = ()) -> ScoutPlan:
    family, matched = keyword_family(goal)
    names = {r.robot_id: r.short_name for r in robots}
    picks = [ScoutPick(skill_id=s.skill_id, source_robot_id=s.source_robot_id, route=route_text(s),
                       why=f"The {names.get(s.source_robot_id, s.source_robot_id)} passed this in simulation, "
                           f"{s.validation.endpoint_error_m * 1000:.1f} mm from the target.")
             for s in _rank(_verified(skills, family, learner))[:MAX_PICKS]]
    teacher = None if picks else _teacher(robots, skills, learner)
    return ScoutPlan(
        goal=goal, robot_id=learner, task_family=family, task_title=TASK_TYPES[family].title,
        task_why=(f"The goal mentions {', '.join(repr(m) for m in matched)}." if matched
                  else "No keyword matched, so the basic wall task is used."),
        picks=picks, teacher_robot_id=teacher,
        teacher_why=(f"No saved skill of this type yet; the {names.get(teacher, teacher)} has the most saved skills."
                     if teacher else None),
        summary=None, provider=OFFLINE, provider_requested=requested, model_id=model_id,
        usage=model_usage(error.calls, model_id) if error else None,
        fallback_error=str(error) if error else None,
        notes=[OFFLINE_NOTE, *extra_notes, *([f"Muse scout failed ({error}); offline plan shown."] if error else [])],
        created_at=datetime.now(UTC),
    )


def _schema(families: Sequence[str], skill_ids: Sequence[str], robot_ids: Sequence[str]) -> dict:
    def enum(values: Sequence[str]) -> dict:
        return {"type": "string", "enum": list(values)} if values else {"type": "string"}
    return {
        "type": "object", "additionalProperties": False,
        "required": ["task_family", "task_why", "picks", "teacher_robot_id", "teacher_why", "summary"],
        "properties": {
            "task_family": enum(families), "task_why": {"type": "string"},
            "picks": {"type": "array", "items": {
                "type": "object", "additionalProperties": False, "required": ["skill_id", "why"],
                "properties": {"skill_id": enum(skill_ids), "why": {"type": "string"}}}},
            "teacher_robot_id": enum(["", *robot_ids]), "teacher_why": {"type": "string"},
            "summary": {"type": "string"},
        },
    }


def _message(goal: str, learner: RobotSummary, robots: Sequence[RobotSummary],
             skills: Sequence[ExperienceCapsule]) -> dict:
    verified = [s for s in skills if s.validation.success]
    return {
        "goal": goal,
        "learner": {"robot_id": learner.robot_id, "name": learner.short_name, "joints": learner.dof,
                    "reach_m": round(learner.max_reach_m, 2)},
        "task_types": [{"task_family": t.family, "title": t.title, "summary": t.summary} for t in TASK_TYPES.values()],
        "robots": [{"robot_id": r.robot_id, "name": r.short_name, "joints": r.dof, "reach_m": round(r.max_reach_m, 2)}
                   for r in robots],
        "skills": [{"skill_id": s.skill_id, "robot_id": s.source_robot_id, "task_family": family_of(s.task.scene_id),
                    "route": route_text(s), "endpoint_error_mm": round(s.validation.endpoint_error_m * 1000, 2),
                    "adapted_from": s.parent_skill_id} for s in verified],
    }


def _text(value: object, limit: int, label: str, dropped: list[str]) -> str:
    text = str(value or "").strip()[:limit]
    if PHYSICAL_CLAIM.search(text):
        dropped.append(f"Model {label} dropped: it implied physical hardware.")
        return ""
    return text


def apply_answer(answer: dict, goal: str, learner: str, robots: Sequence[RobotSummary],
                 skills: Sequence[ExperienceCapsule], model_id: str, calls: tuple) -> ScoutPlan:
    """Keep only valid ids; anything invalid is noted and replaced by the offline rule."""
    notes: list[str] = [MODEL_TEXT_NOTE]
    family = answer.get("task_family")
    if family not in TASK_TYPES:
        family = keyword_family(goal)[0]
        notes.append("Model task type was not a known type; the keyword match was used instead.")
    allowed = {s.skill_id: s for s in _verified(skills, family, learner)}
    picks: list[ScoutPick] = []
    for item in answer.get("picks") or []:
        sid = item.get("skill_id") if isinstance(item, dict) else None
        if sid in allowed and sid not in {p.skill_id for p in picks} and len(picks) < MAX_PICKS:
            s = allowed[sid]
            picks.append(ScoutPick(skill_id=sid, source_robot_id=s.source_robot_id, route=route_text(s),
                                   why=_text(item.get("why"), MAX_WHY_CHARS, "reason", notes)))
        elif sid is not None:
            notes.append(f"Model pick {sid!r} is not a saved skill of this task type from another robot; ignored.")
    if not picks and allowed:
        notes.append("Model picked no valid skill although some exist; the best by endpoint error was added.")
        s = _rank(list(allowed.values()))[0]
        picks.append(ScoutPick(skill_id=s.skill_id, source_robot_id=s.source_robot_id, route=route_text(s),
                               why="Lowest endpoint error among saved skills of this type."))
    fleet = {r.robot_id for r in robots} - {learner}
    teacher = answer.get("teacher_robot_id") if not picks else None
    teacher_why = _text(answer.get("teacher_why"), MAX_WHY_CHARS, "teacher reason", notes) if teacher else None
    if not picks and teacher not in fleet:
        teacher, teacher_why = _teacher(robots, skills, learner), "Chosen by the offline rule (most saved skills)."
    return ScoutPlan(
        goal=goal, robot_id=learner, task_family=family, task_title=TASK_TYPES[family].title,
        task_why=_text(answer.get("task_why"), MAX_WHY_CHARS, "task reason", notes), picks=picks,
        teacher_robot_id=teacher, teacher_why=teacher_why,
        summary=_text(answer.get("summary"), MAX_SUMMARY_CHARS, "summary", notes) or None,
        provider=PROVIDER, provider_requested=PROVIDER, model_id=model_id, usage=model_usage(calls, model_id),
        notes=notes, created_at=datetime.now(UTC),
    )


def _reserve_call() -> bool:
    today = datetime.now(UTC).date()
    with _lock:
        if _spent.get(today, 0) >= SCOUT_DAILY_MODEL_CALLS:
            return False
        _spent[today] = _spent.get(today, 0) + 1
        return True


def scout(goal: str, learner: RobotSummary, robots: Sequence[RobotSummary], skills: Sequence[ExperienceCapsule],
          provider: str = "auto", client: MetaChatClient | None = None) -> ScoutPlan:
    """A plan for `learner`. Same goal and library -> cached plan (no new model call)."""
    goal = " ".join(goal.split())
    use_model = provider == "meta" or (provider == "auto" and (client is not None or MODEL_API_KEY))
    key = (goal.lower(), learner.robot_id, use_model, tuple(sorted(s.skill_id for s in skills)))
    with _lock:
        if key in _cache:
            return _cache[key]
    if not use_model:
        plan = offline_plan(goal, learner.robot_id, robots, skills)
    elif not _reserve_call():
        plan = offline_plan(goal, learner.robot_id, robots, skills, extra_notes=[
            f"Muse scout skipped: today's limit of {SCOUT_DAILY_MODEL_CALLS} model calls is used up."])
    else:
        chat = client or MetaChatClient(MODEL_API_KEY or "", META_MODEL_ID)
        robot_ids = [r.robot_id for r in robots if r.robot_id != learner.robot_id]
        schema = _schema(list(TASK_TYPES), [s.skill_id for s in skills if s.validation.success], robot_ids)
        try:
            answer, calls = chat.converse(_conversation(json.dumps(_message(goal, learner, robots, skills)), schema))
            plan = apply_answer(answer, goal, learner.robot_id, robots, skills, chat.model_id, calls)
            log.info("Muse scout: %r -> %s, %d picks", goal, plan.task_family, len(plan.picks))
        except MetaReasoningError as exc:
            plan = offline_plan(goal, learner.robot_id, robots, skills, requested=PROVIDER, error=exc,
                                model_id=chat.model_id)
    with _lock:
        _cache[key] = plan
    return plan


def _conversation(user: str, schema: dict) -> Conversation:
    return Conversation(system=SYSTEM_PROMPT, user=user, tools=[], run_tool=lambda _n, _a: {}, submit_tool="",
                        final_instruction=FINAL_INSTRUCTION, schema_name="scout_plan", schema=schema,
                        kind="scout", max_rounds=0)
