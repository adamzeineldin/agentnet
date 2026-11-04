"""A task type designed from a plain-words description (Muse, or the offline designer).

A design is only a layout: obstacle boxes, a start and a target in the task frame. The backend checks it
against fixed limits before it becomes a task type; whether any robot can do it is decided by discovery
runs in MuJoCo, never by the design. Model-written text is marked in `notes`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.library import ModelUsage
from app.models.skill import BoxSpec, TaskSpec, Vec3

DesignProvider = Literal["offline_designer", "meta_muse_spark"]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True)


class DesignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    goal: str = Field(min_length=3, max_length=300)
    provider: Literal["auto", "offline", "meta"] = "auto"


class TaskLayout(_Frozen):
    start: Vec3
    target: Vec3
    obstacles: list[BoxSpec]


class TaskDesign(_Frozen):
    family: str
    title: str
    summary: str
    goal: str
    layout: TaskLayout
    # What the task cannot show (e.g. "no grasping: the hand only reaches the cup's position"); may be empty.
    limitation: str
    # Every limit the layout was checked against, in words.
    checks: list[str]
    provider: DesignProvider
    provider_requested: DesignProvider
    model_id: str | None = None
    usage: ModelUsage | None = None
    fallback_error: str | None = None
    notes: list[str]
    created_by: str | None = None
    created_at: datetime


class DesignResult(_Frozen):
    design: TaskDesign
    example: TaskSpec
    # True when this goal (or this exact layout) was designed before and the stored task type is returned.
    reused: bool = False
