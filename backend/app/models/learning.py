"""The librarian check: before any robot learns, what the library already holds for it.

Three cases, decided from published, simulation-verified skills only (no model call):
  known  the robot already has a verified skill of this task type: replay it, never retrain it.
  adapt  it has none, another robot does: adapt that skill to this robot's own kinematics (a transfer run).
  learn  no robot has one: this robot learns it directly (a discover run).

An improvement attempt adapts another robot's skill onto the layout of the robot's existing skill and keeps the
new motion only if it is verified and measurably better (ImprovementVerdict). Every number is read from a stored
capsule or run.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LearningCase = Literal["known", "adapt", "learn"]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True)


class CheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    robot_id: str = Field(max_length=64)
    task_family: str = Field(max_length=64)
    # The robot the user asked to learn from; the check still decides whether that is possible.
    from_robot_id: str | None = Field(default=None, max_length=64)


class SkillMetrics(_Frozen):
    """One verified motion, measured from its capsule."""

    skill_id: str
    robot_id: str
    run_id: str | None
    scene_id: str
    route: str
    # Simulated time of the verified execution (s).
    execution_s: float
    # Length of the recorded hand path in the task frame (m).
    path_length_m: float
    endpoint_error_m: float
    min_clearance_m: float
    collisions: int
    # Robot whose skill this one was adapted from; None when the robot worked it out itself.
    learned_from: str | None = None


class LearningCheck(_Frozen):
    robot_id: str
    task_family: str
    task_title: str
    case: LearningCase
    # Plain-words explanation of the case, for the UI.
    reason: str
    # known: the robot's own verified skill of this type (shortest execution first).
    existing: SkillMetrics | None = None
    # adapt: other robots' skills, one per robot, best match first; the first is used unless the user picks another.
    sources: list[SkillMetrics] = Field(default_factory=list)
    # known: other robots' skills that have not been tried on the existing skill's layout yet.
    improve_sources: list[SkillMetrics] = Field(default_factory=list)
    # Skills already tried as improvements on this layout (never re-run automatically).
    already_tried: list[str] = Field(default_factory=list)
    requested_robot_id: str | None = None
    # Why the requested source was or was not used (None when no source was requested).
    requested_note: str | None = None
    provider: Literal["librarian_rules"] = "librarian_rules"


class ImproveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_skill_id: str = Field(max_length=80)


class ImprovementVerdict(_Frozen):
    existing: SkillMetrics
    candidate: SkillMetrics | None
    better: bool
    reasons: list[str]
    kept_skill_id: str
    published_skill_id: str | None = None
    basis: str
