"""Task designer: from a description to a new task type (Muse, or the offline templates).

Muse reads the goal, the task-frame limits and one example layout of every existing task type, and answers
with a title, a summary, a start, a target and up to four boxes. One schema-constrained call, no tools. The
layout is checked (services/task_design.check_layout); if it breaks a limit, Muse gets the problems back once
and may fix them (a second call). A design that still fails, a failed call or a used-up daily cap falls back
to the offline templates, labelled as such. Nothing here runs physics: discovery runs decide whether any
robot can do the designed task.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime

from app.config import META_MODEL_ID, MODEL_API_KEY, SCOUT_DAILY_MODEL_CALLS
from app.models.skill import TaskSpec
from app.models.task_design import TaskDesign, TaskLayout
from app.services.librarian import design_templates
from app.services.librarian.design_templates import box
from app.services.librarian.muse import PHYSICAL_CLAIM, model_usage
from app.services.librarian.scout import reserve_model_call
from app.services.reasoning.base import ReasoningCall
from app.services.reasoning.meta_client import Conversation, MetaChatClient, MetaReasoningError
from app.services.task_design import (
    AREA_HI,
    AREA_LO,
    MAX_OBSTACLES,
    MIN_START_TARGET_M,
    POINT_CLEARANCE_M,
    POINT_X,
    POINT_Z,
    START_Y,
    TARGET_Y,
    check_layout,
    family_id,
)
from app.services.task_families import TASK_TYPES

log = logging.getLogger(__name__)
PROVIDER = "meta_muse_spark"
OFFLINE = "offline_designer"
MAX_TITLE_CHARS = 48
MAX_SUMMARY_CHARS = 220
MAX_LIMITATION_CHARS = 220
# A live design call at the shared 1200-token budget spent it all reasoning and returned nothing.
DESIGN_MAX_TOKENS = 4000
NAME = re.compile(r"[^a-z0-9_]+")
# Goals that ask for more than a reach. Nimbotics only moves the tool point; it never grasps or carries.
BEYOND_REACH = re.compile(r"\b(pick|grab|grasp|lift|carry|pour|place|put|hold|open|close|push|pull|turn|stack|"
                          r"throw|insert|screw|press)\w*", re.IGNORECASE)
REACH_ONLY = ("Reach only: the tool point moves to where the object would be; nothing is grasped, carried or "
              "moved, because Nimbotics tests reaches.")
SYSTEM_PROMPT = (
    "You design reach tasks for Nimbotics, where robot arms learn obstacle-avoiding reaches in the MuJoCo "
    "physics simulator. A user describes something a robot should do. Turn it into one reach task: static box "
    "obstacles, a start point and a target point for the robot's tool point. The robot only reaches: it never "
    "grasps, carries, pushes or pours, so model the reach part of the goal and say what is left out in "
    "'limitation' (empty if nothing). Coordinates are in metres in the task frame given in the message; respect "
    "every limit there, because the backend rejects layouts that break one. Make the obstacles capture what "
    "makes the described task hard (heights, gaps, walls around the target) while leaving at least one way "
    "through. The title is a short imperative phrase starting with 'Reach' (at most 6 words); the summary is "
    "one or two plain sentences for a non-expert. Use 'measured_in_this_simulator' and each task type's "
    "'learned_by' to judge how hard a layout is: a task no robot can learn teaches nothing. Never claim a "
    "robot can do the task or mention hardware: the simulator decides."
)
# Facts from discovery runs (2026-11-03), so Muse sizes layouts the arms can fit through.
MEASURED = (
    "Hands and wrists are 10-20 cm across and the planner controls only the tool point's position, not the "
    "hand's angle. The four routes tried are: straight; over the top of all obstacles at 4, 8 or 12 cm "
    "clearance then straight down to the target; around the near or far x end of all obstacles. A target "
    "inside walls was learned (UR5e) when the walls were 13 cm or more from the target and 9 cm high; walls "
    "10 cm from the target and 12 cm high failed for every arm tried (Panda, UR5e, Gen3)."
)
FINAL_INSTRUCTION = ("Reply now with only the JSON object with keys title, summary, limitation, start, target and "
                     "obstacles, and no other text.")
MODEL_TEXT_NOTE = "Title, summary and layout are model-written; the layout passed every check below."
OFFLINE_NOTE = "Offline designer: the layout is a template chosen by keywords in the description."


def _point_schema() -> dict:
    return {"type": "object", "additionalProperties": False, "required": ["x", "y", "z"],
            "properties": {k: {"type": "number"} for k in "xyz"}}


def _schema() -> dict:
    fields = ("name", "x", "y", "width", "depth", "bottom", "height")
    return {
        "type": "object", "additionalProperties": False,
        "required": ["title", "summary", "limitation", "start", "target", "obstacles"],
        "properties": {
            "title": {"type": "string"}, "summary": {"type": "string"}, "limitation": {"type": "string"},
            "start": _point_schema(), "target": _point_schema(),
            "obstacles": {"type": "array", "items": {
                "type": "object", "additionalProperties": False, "required": list(fields),
                "properties": {f: {"type": "string" if f == "name" else "number"} for f in fields}}},
        },
    }


def _box_brief(b) -> dict:
    return {"name": b.name, "x": round(b.center[0], 3), "y": round(b.center[1], 3),
            "width": round(2 * b.half_size[0], 3), "depth": round(2 * b.half_size[1], 3),
            "bottom": round(b.lo[2], 3), "height": round(2 * b.half_size[2], 3)}


def _example(task: TaskSpec) -> dict:
    point = lambda p: {"x": round(p[0], 3), "y": round(p[1], 3), "z": round(p[2], 3)}  # noqa: E731
    return {"start": point(task.start), "target": point(task.target), "obstacles": [_box_brief(b) for b in task.obstacles]}


def _message(goal: str, learned_by: Mapping[str, Sequence[str]]) -> dict:
    return {
        "goal": goal,
        "measured_in_this_simulator": MEASURED,
        "task_frame": ("origin on the floor in front of the robot; +x points away from the robot base, +y runs "
                       "from the start side to the target side, +z is up. The robot base stands at about x = "
                       "-0.25 to -0.70 m, so keep boxes at x >= -0.15."),
        "box_format": ("x, y: centre of the footprint; width along x, depth along y, height along z; bottom: "
                       "height of the box's underside above the floor (0 = standing on the floor; >0 floats, "
                       "e.g. a beam or a roof)."),
        "limits": {
            "start": {"x": POINT_X, "y": START_Y, "z": POINT_Z},
            "target": {"x": POINT_X, "y": TARGET_Y, "z": POINT_Z},
            "obstacles": f"1 to {MAX_OBSTACLES} boxes, each at least 2 cm in every dimension, unique names",
            "work_area_for_boxes": {"x": (AREA_LO[0], AREA_HI[0]), "y": (AREA_LO[1], AREA_HI[1]),
                                    "z": (AREA_LO[2], AREA_HI[2])},
            "clearance": f"start and target at least {POINT_CLEARANCE_M} m from every box",
            "start_to_target": f"at least {MIN_START_TARGET_M} m apart",
        },
        "existing_task_types": [{"title": t.title, "summary": t.summary, "learned_by": list(learned_by.get(t.family, ())),
                                 "example": _example(t.generate(t.example_seed))} for t in TASK_TYPES.values()],
    }


def _text(value: object, limit: int, label: str, notes: list[str]) -> str:
    text = " ".join(str(value or "").split())[:limit]
    if PHYSICAL_CLAIM.search(text):
        notes.append(f"Model {label} dropped: it implied physical hardware.")
        return ""
    return text


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ValueError(f"{value!r} is not a number")
    return float(value)


def _point(raw: object) -> tuple[float, float, float]:
    if not isinstance(raw, dict):
        raise ValueError("a point must be an object with x, y and z")
    return (_number(raw.get("x")), _number(raw.get("y")), _number(raw.get("z")))


def parse_layout(answer: dict) -> TaskLayout:
    """The model's answer as a layout; malformed values raise ValueError (limits are checked separately)."""
    boxes = []
    for i, raw in enumerate(answer.get("obstacles") or []):
        if not isinstance(raw, dict):
            raise ValueError("every obstacle must be an object")
        name = NAME.sub("_", str(raw.get("name") or f"box_{i}").lower()).strip("_")[:24] or f"box_{i}"
        sizes = [_number(raw.get(k)) for k in ("width", "depth", "height")]
        if min(sizes) <= 0:
            raise ValueError(f"obstacle '{name}' has a size of zero or less")
        boxes.append(box(name, _number(raw.get("x")), _number(raw.get("y")), *sizes[:2], _number(raw.get("bottom")),
                         sizes[2]))
    return TaskLayout(start=_point(answer.get("start")), target=_point(answer.get("target")), obstacles=boxes)


def _limitation(goal: str, given: str) -> str:
    return given or (REACH_ONLY if BEYOND_REACH.search(goal) else "")


def _design(goal: str, title: str, summary: str, limitation: str, layout: TaskLayout, **meta) -> TaskDesign:
    _, checks = check_layout(layout)
    return TaskDesign(family=family_id(title, layout), title=title, summary=summary, goal=goal, layout=layout,
                      limitation=_limitation(goal, limitation), checks=checks, created_at=datetime.now(UTC), **meta)


def offline_design(goal: str, requested: str = OFFLINE, error: MetaReasoningError | None = None,
                   calls: tuple[ReasoningCall, ...] = (), model_id: str | None = None,
                   extra_notes: tuple[str, ...] = ()) -> TaskDesign:
    template, scale, words = design_templates.match(goal)
    why = (f"Chosen because the description mentions {', '.join(repr(w) for w in words)}." if words
           else "No keyword matched, so the basic wall template is used.")
    calls = calls or (error.calls if error else ())
    return _design(goal, template.title, template.summary, "", template.build(scale), provider=OFFLINE,
                   provider_requested=requested, model_id=model_id,
                   usage=model_usage(calls, model_id) if calls else None,
                   fallback_error=str(error) if error else None,
                   notes=[OFFLINE_NOTE, why, *extra_notes,
                          *([f"Muse designer failed ({error}); an offline template is shown."] if error else [])])


def _ask(chat: MetaChatClient, user: dict) -> tuple[dict, tuple[ReasoningCall, ...]]:
    return chat.converse(Conversation(
        system=SYSTEM_PROMPT, user=json.dumps(user), tools=[], run_tool=lambda _n, _a: {}, submit_tool="",
        final_instruction=FINAL_INSTRUCTION, schema_name="task_design", schema=_schema(), kind="design",
        max_rounds=0, max_tokens=DESIGN_MAX_TOKENS))


def _attempt(answer: dict) -> tuple[TaskLayout | None, list[str]]:
    try:
        layout = parse_layout(answer)
    except ValueError as exc:
        return None, [f"The answer could not be read: {exc}."]
    errors, _ = check_layout(layout)
    return (layout if not errors else None), errors


def muse_design(goal: str, chat: MetaChatClient, learned_by: Mapping[str, Sequence[str]]) -> TaskDesign:
    """Ask Muse; one repair round if the layout breaks a limit. Falls back to the offline templates."""
    message = _message(goal, learned_by)
    calls: tuple[ReasoningCall, ...] = ()
    try:
        answer, calls = _ask(chat, message)
        layout, errors = _attempt(answer)
        if layout is None and reserve_model_call():
            log.info("Muse design for %r broke limits, asking for a fix: %s", goal, errors)
            answer, more = _ask(chat, {**message, "your_previous_layout": answer, "problems": errors,
                                       "instruction": "Fix every problem and answer again with the whole design."})
            calls += more
            layout, errors = _attempt(answer)
    except MetaReasoningError as exc:
        return offline_design(goal, PROVIDER, MetaReasoningError(str(exc), calls + exc.calls), model_id=chat.model_id)
    if layout is None:
        return offline_design(goal, PROVIDER, MetaReasoningError("layout broke the limits: " + " ".join(errors[:3]),
                                                                 calls), model_id=chat.model_id)
    notes = [MODEL_TEXT_NOTE, *([f"Muse fixed its first layout ({len(calls)} calls)."] if len(calls) > 1 else [])]
    title = _text(answer.get("title"), MAX_TITLE_CHARS, "title", notes).rstrip(".") or "Reach a designed target"
    return _design(goal, title, _text(answer.get("summary"), MAX_SUMMARY_CHARS, "summary", notes),
                   _text(answer.get("limitation"), MAX_LIMITATION_CHARS, "limitation", notes), layout,
                   provider=PROVIDER, provider_requested=PROVIDER, model_id=chat.model_id,
                   usage=model_usage(calls, chat.model_id), notes=notes)


def design_task(goal: str, provider: str = "auto", client: MetaChatClient | None = None,
                learned_by: Mapping[str, Sequence[str]] | None = None) -> TaskDesign:
    """`learned_by`: task family -> names of robots with a saved, simulation-verified skill of it."""
    goal = " ".join(goal.split())
    use_model = provider == "meta" or (provider == "auto" and (client is not None or MODEL_API_KEY))
    if not use_model:
        return offline_design(goal)
    if not reserve_model_call():
        return offline_design(goal, PROVIDER, extra_notes=(
            f"Muse designer skipped: today's limit of {SCOUT_DAILY_MODEL_CALLS} model calls is used up.",))
    design = muse_design(goal, client or MetaChatClient(MODEL_API_KEY or "", META_MODEL_ID), learned_by or {})
    log.info("Task design: %r -> %s (%s)", goal, design.family, design.provider)
    return design
