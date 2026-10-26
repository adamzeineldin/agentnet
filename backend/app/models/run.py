"""Run records: every simulated job, its typed progress events, and its results."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RunStatus = Literal[
    "queued",
    "profiling",
    "retrieving",
    "checking",
    "proposing",
    "planning",
    "simulating",
    "selecting",
    "executing",
    "verifying",
    "publishing",
    "succeeded",
    "failed",
]
TERMINAL_STATUSES: frozenset[str] = frozenset({"succeeded", "failed"})

RunType = Literal["motion_check", "discover", "transfer", "benchmark"]


class RunEvent(BaseModel):
    model_config = ConfigDict(frozen=True)
    at: datetime
    status: RunStatus
    message: str
    data: dict = Field(default_factory=dict)


class RunRecord(BaseModel):
    model_config = ConfigDict(frozen=True)
    run_id: str
    run_type: RunType
    status: RunStatus
    source_robot_id: str | None = None
    target_robot_id: str | None = None
    skill_id: str | None = None
    task_seed: int
    planner: str
    model_used: str | None = None
    simulator: str
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    wall_clock_seconds: float | None = None
    simulated_seconds: float | None = None
    collision_count: int | None = None
    endpoint_error_m: float | None = None
    candidate_summaries: list[dict] = Field(default_factory=list)
    results: dict = Field(default_factory=dict)
    artifacts: dict[str, str] = Field(default_factory=dict)
    events: list[RunEvent] = Field(default_factory=list)
    error: str | None = None


class MotionCheckRequest(BaseModel):
    model_config = ConfigDict(frozen=True)
    target: tuple[float, float, float] | None = Field(
        default=None, description="EE target in the robot base frame (m)"
    )
    seed: int = Field(default=7, ge=0, le=2**31 - 1)

    def validated_target(self, default: tuple[float, float, float]) -> tuple[float, float, float]:
        target = self.target or default
        x, y, z = target
        if not (-1.2 <= x <= 1.2 and -1.2 <= y <= 1.2 and 0.02 <= z <= 1.4):
            raise ValueError("target must lie within |x|,|y| <= 1.2 m and 0.02 <= z <= 1.4 m")
        return target
