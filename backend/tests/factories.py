"""Test data builders (no simulation)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models.skill import CapsuleValidation, ExperienceCapsule, Placement, StrategySpec
from app.services.task_scene import SCENE_FAMILY, generate_task

ROBOT_IDS = ("panda_01", "ur5e_01")
T0 = datetime(2026, 10, 29, tzinfo=UTC)


def capsule(skill_id: str, robot: str = "panda_01", seed: int = 7, route: str = "far_side",
            clearance: float = 0.12, family: str = SCENE_FAMILY, parent: str | None = None,
            lineage: tuple[str, ...] = (), minute: int = 0) -> ExperienceCapsule:
    task = generate_task(seed, family)
    return ExperienceCapsule(
        skill_id=skill_id, parent_skill_id=parent, lineage=list(lineage), status="verified_in_sim",
        source_robot_id=robot, source_model_hash="h", goal="g", frame_convention="f", task=task,
        placement=Placement(translation=(0.5, 0, 0)),
        strategy=StrategySpec(route_class=route, clearance_m=clearance, description="d"),
        waypoints_task_frame=[task.start, task.target], executed_trace_task_frame=[],
        candidate_outcomes=[], requirements={}, environment={}, provenance={"run_id": f"run_{skill_id}"},
        validation=CapsuleValidation(success=True, collisions=0, endpoint_error_m=0.0006, min_clearance_m=0.02,
                                     simulated_seconds=1, candidates_evaluated=10, candidates_verified=2,
                                     tolerance_m=0.01),
        created_at=T0 + timedelta(minutes=minute),
    )
