"""Skill scout plan: which task type a described goal is, and which saved skills a robot should learn from.

The plan only *suggests*. Every pick is a published, simulation-verified skill id; whether the learner can
actually learn it is decided by a transfer run in MuJoCo, never by the plan. Model-written text is marked.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.library import ModelUsage

ScoutProvider = Literal["offline_scout", "meta_muse_spark"]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True)


class ScoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    goal: str = Field(min_length=3, max_length=300)
    robot_id: str = Field(max_length=64)
    provider: Literal["auto", "offline", "meta"] = "auto"


class ScoutPick(_Frozen):
    skill_id: str
    source_robot_id: str
    route: str
    why: str


class ScoutPlan(_Frozen):
    goal: str
    robot_id: str
    task_family: str
    task_title: str
    task_why: str
    picks: list[ScoutPick]
    # Who should learn the task first when no saved skill fits (None when picks exist).
    teacher_robot_id: str | None
    teacher_why: str | None
    summary: str | None
    provider: ScoutProvider
    provider_requested: ScoutProvider
    model_id: str | None = None
    usage: ModelUsage | None = None
    fallback_error: str | None = None
    notes: list[str]
    created_at: datetime
