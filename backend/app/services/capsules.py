"""Experience Capsule construction from a verified discovery run."""

from __future__ import annotations

import uuid

import mujoco
import numpy as np

from app.config import MAX_JOINT_SPEED_RAD_S, REACH_TOLERANCE_M
from app.models.robot import RobotPassport
from app.models.skill import (
    CandidateSummary,
    CapsuleValidation,
    ExperienceCapsule,
    Placement,
    StrategySpec,
    TaskSpec,
)
from app.services.registry import utcnow
from app.services.simulation import ExecutionResult
from app.services.task_scene import FRAME_CONVENTION, base_to_task, family_of, to_vec3

MAX_TRACE_POINTS = 120

STRATEGY_TEXT = {
    "direct": "Straight-line reach from start to target.",
    "over": "Rise above the obstacle top by the clearance, traverse, then descend to the target.",
    "near_side": "Pass the obstacle on the side nearer the robot base, offset by the clearance.",
    "far_side": "Pass the obstacle on the side farther from the robot base, offset by the clearance.",
}


def new_skill_id(route_class: str) -> str:
    return f"skill_reach_{route_class}_{uuid.uuid4().hex[:6]}"


def compact_outcomes(candidates: list[CandidateSummary]) -> list[dict]:
    keys = ("candidate_id", "route_class", "clearance_m", "outcome", "reason", "cost",
            "min_clearance_m", "prior_rank", "prior_note")
    return [{k: getattr(c, k) for k in keys} for c in candidates]


def build_capsule(
    *,
    run_id: str,
    passport: RobotPassport,
    task: TaskSpec,
    placement: Placement,
    winner: CandidateSummary,
    candidates: list[CandidateSummary],
    execution: ExecutionResult,
    endpoint_error_m: float,
    timestep: float,
    parent: ExperienceCapsule | None = None,
    method: str,
    reasoning_mode: str = "offline_deterministic",
    extra_provenance: dict | None = None,
) -> ExperienceCapsule:
    trace = [to_vec3(base_to_task(p, placement)) for p in execution.ee_trace]
    stride = max(1, len(trace) // MAX_TRACE_POINTS)
    wps = np.array(winner.waypoints_task)
    verified = [c for c in candidates if c.outcome == "verified"]
    return ExperienceCapsule(
        skill_id=new_skill_id(winner.route_class),
        parent_skill_id=parent.skill_id if parent else None,
        lineage=[*parent.lineage, parent.skill_id] if parent else [],
        status="verified_in_sim",
        source_robot_id=passport.robot_id,
        source_model_hash=passport.model_hash,
        goal="Reach the target while avoiding the obstacle",
        frame_convention=FRAME_CONVENTION,
        task=task,
        placement=placement,
        strategy=StrategySpec(
            route_class=winner.route_class,
            clearance_m=winner.clearance_m,
            description=STRATEGY_TEXT[winner.route_class],
        ),
        waypoints_task_frame=list(winner.waypoints_task),
        executed_trace_task_frame=[*trace[::stride], trace[-1]] if trace else [],
        candidate_outcomes=compact_outcomes(candidates),
        requirements={
            "tool": "end_effector_point (position only; orientation unconstrained)",
            "route_bbox_task_min": to_vec3(wps.min(axis=0)),
            "route_bbox_task_max": to_vec3(wps.max(axis=0)),
            "source_min_link_clearance_m": winner.min_clearance_m,
        },
        environment={
            "scene_id": task.scene_id,
            "scene_family": family_of(task.scene_id),
            "random_seed": task.seed,
            "simulator": f"MuJoCo {mujoco.__version__}",
            "timestep_s": timestep,
            "control": "position servos with gravity feed-forward",
            "max_joint_speed_rad_s": MAX_JOINT_SPEED_RAD_S,
        },
        provenance={
            "method": method,
            "run_id": run_id,
            "source_model_version": passport.model_version,
            "reasoning": reasoning_mode,
            "simulation_only": True,
            **(extra_provenance or {}),
        },
        validation=CapsuleValidation(
            success=True,
            collisions=len(execution.collisions),
            endpoint_error_m=endpoint_error_m,
            min_clearance_m=float(winner.min_clearance_m or 0.0),
            simulated_seconds=execution.simulated_seconds,
            candidates_evaluated=len(candidates),
            candidates_verified=len(verified),
            tolerance_m=REACH_TOLERANCE_M,
        ),
        created_at=utcnow(),
    )
