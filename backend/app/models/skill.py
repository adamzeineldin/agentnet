"""Task specification (task frame) and Experience Capsule schema.

Task frame convention: origin on the floor in front of the robot, +x points
radially away from the robot base, +y lateral, +z up. Each robot gets its own
placement (task frame -> robot base frame); capsules store geometry only in
the task frame so they never encode a particular robot's joint space.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CAPSULE_SCHEMA_VERSION = "1.0"
Vec3 = tuple[float, float, float]
RouteClass = Literal["direct", "over", "near_side", "far_side"]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True)


class BoxSpec(_Frozen):
    name: str
    center: Vec3
    half_size: Vec3

    @property
    def lo(self) -> Vec3:
        return tuple(c - h for c, h in zip(self.center, self.half_size, strict=True))  # type: ignore[return-value]

    @property
    def hi(self) -> Vec3:
        return tuple(c + h for c, h in zip(self.center, self.half_size, strict=True))  # type: ignore[return-value]


class TaskSpec(_Frozen):
    """An obstacle-aware reach task, entirely in the task frame."""

    scene_id: str
    seed: int
    start: Vec3
    target: Vec3
    obstacles: list[BoxSpec]
    description: str


class Placement(_Frozen):
    """Rigid transform task frame -> robot base frame (yaw about +z, then translate)."""

    translation: Vec3
    yaw_rad: float = 0.0
    rationale: str = ""


class StrategySpec(_Frozen):
    route_class: RouteClass
    clearance_m: float
    description: str


class CandidateSummary(_Frozen):
    candidate_id: str
    route_class: RouteClass
    clearance_m: float
    stage_reached: Literal["ik", "continuity", "screening", "clearance", "physics", "verified"]
    outcome: Literal[
        "unreachable", "discontinuous_ik", "collision", "insufficient_clearance",
        "physics_failure", "feasible", "verified", "not_simulated",
    ]
    reason: str
    waypoints_task: list[Vec3]
    joint_path_length_rad: float | None = None
    ee_path_length_m: float | None = None
    min_clearance_m: float | None = None
    contacts: list[dict] = Field(default_factory=list)
    physics: dict | None = None
    cost: float | None = None


class CapsuleValidation(_Frozen):
    success: bool
    collisions: int
    endpoint_error_m: float
    min_clearance_m: float
    simulated_seconds: float
    candidates_evaluated: int
    candidates_verified: int
    tolerance_m: float


class ExperienceCapsule(_Frozen):
    schema_version: str = CAPSULE_SCHEMA_VERSION
    skill_id: str
    version: int = 1
    parent_skill_id: str | None = None
    lineage: list[str] = Field(default_factory=list, description="Ancestor skill_ids, oldest first")
    status: Literal["verified_in_sim"]
    source_robot_id: str
    source_model_hash: str
    task_type: Literal["obstacle_aware_reach"] = "obstacle_aware_reach"
    goal: str
    reference_frame: str = "task_frame"
    frame_convention: str
    task: TaskSpec
    placement: Placement
    strategy: StrategySpec
    waypoints_task_frame: list[Vec3]
    executed_trace_task_frame: list[Vec3]
    candidate_outcomes: list[dict]
    requirements: dict
    environment: dict
    provenance: dict
    validation: CapsuleValidation
    created_at: datetime
