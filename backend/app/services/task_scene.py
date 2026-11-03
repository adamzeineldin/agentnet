"""Task placement into a robot's base frame. The task families themselves live in task_families."""

from __future__ import annotations

import math

import numpy as np

from app.models.skill import Placement, TaskSpec, Vec3
from app.services.robot_catalog import get_robot_decl
from app.services.scene import BoxObstacle, SceneSpec
from app.services.task_families import (  # noqa: F401  (re-exported)
    DEFAULT_SEED,
    ROOF_FAMILY,
    SCENE_FAMILIES,
    SCENE_FAMILY,
    TASK_TYPES,
    family_of,
    generate_task,
)

FRAME_CONVENTION = (
    "task frame: origin on the floor in front of the robot; +x radially away from the "
    "robot base, +y lateral, +z up; metres"
)


def default_placement(robot_id: str) -> Placement:
    """Task origin task_distance_m in front of the base along +x (robot_catalog)."""
    d = get_robot_decl(robot_id)
    return Placement(translation=(d.task_distance_m, 0.0, 0.0),
                     rationale=f"{d.task_distance_m:.2f} m in front of the {d.short_name} base")


def _rot(yaw: float) -> np.ndarray:
    c, s = math.cos(yaw), math.sin(yaw)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def task_to_base(p: Vec3 | np.ndarray, placement: Placement) -> np.ndarray:
    return _rot(placement.yaw_rad) @ np.asarray(p, dtype=float) + np.asarray(placement.translation)


def base_to_task(p: Vec3 | np.ndarray, placement: Placement) -> np.ndarray:
    return _rot(placement.yaw_rad).T @ (np.asarray(p, dtype=float) - np.asarray(placement.translation))


def to_vec3(p: np.ndarray) -> Vec3:
    return (float(p[0]), float(p[1]), float(p[2]))


def world_scene(
    task: TaskSpec,
    placement: Placement,
    route_markers: tuple[Vec3, ...] = (),
) -> SceneSpec:
    """Convert a task into robot-base-frame scene objects for MjSpec.

    Only yaw-free placements keep axis-aligned boxes exact; a yaw would need a
    rotated box, which BoxObstacle does not model yet.
    """
    if abs(placement.yaw_rad) > 1e-9:
        raise ValueError("Non-zero placement yaw is not supported for box obstacles yet")
    return SceneSpec(
        target=to_vec3(task_to_base(task.target, placement)),
        obstacles=tuple(
            BoxObstacle(
                name=o.name,
                center=to_vec3(task_to_base(o.center, placement)),
                half_size=o.half_size,
            )
            for o in task.obstacles
        ),
        waypoint_markers=tuple(to_vec3(task_to_base(p, placement)) for p in route_markers),
    )
