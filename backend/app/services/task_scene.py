"""Seeded obstacle-aware reach tasks in the task frame, and placement into a robot's base frame.

Scene family `wall_reach_v1`: a wall standing on the floor separates the start
point (-y side) from the target (+y side), so the straight-line reach collides
and the robot must go over, in front of (near side) or behind (far side) it.
"""

from __future__ import annotations

import math

import numpy as np

from app.models.skill import BoxSpec, Placement, TaskSpec, Vec3
from app.services.robot_catalog import ROBOTS
from app.services.scene import BoxObstacle, SceneSpec

SCENE_FAMILY = "wall_reach_v1"
ROOF_FAMILY = "wall_roof_v1"
SCENE_FAMILIES = (SCENE_FAMILY, ROOF_FAMILY)
DEFAULT_SEED = 42
FRAME_CONVENTION = (
    "task frame: origin on the floor in front of the robot; +x radially away from the "
    "robot base, +y lateral, +z up; metres"
)

# Default placement per robot: task origin task_distance_m in front of the base along +x (robot_catalog).
DEFAULT_PLACEMENTS: dict[str, Placement] = {
    rid: Placement(translation=(d.task_distance_m, 0.0, 0.0),
                   rationale=f"{d.task_distance_m:.2f} m in front of the {d.short_name} base")
    for rid, d in ROBOTS.items()
}


def generate_task(seed: int = DEFAULT_SEED, family: str = SCENE_FAMILY) -> TaskSpec:
    if family == ROOF_FAMILY:
        return _generate_roof_task(seed)
    if family != SCENE_FAMILY:
        raise ValueError(f"Unknown scene family {family!r}; known: {SCENE_FAMILIES}")
    rng = np.random.default_rng(seed)
    half_x = float(rng.uniform(0.08, 0.13))
    half_y = float(rng.uniform(0.02, 0.03))
    height = float(rng.uniform(0.22, 0.30))
    wall = BoxSpec(
        name="wall",
        center=(float(rng.uniform(-0.02, 0.02)), 0.0, height / 2),
        half_size=(half_x, half_y, height / 2),
    )
    start = (
        float(rng.uniform(-0.04, 0.04)),
        -(half_y + float(rng.uniform(0.16, 0.22))),
        float(rng.uniform(0.12, 0.18)),
    )
    target = (
        float(rng.uniform(-0.04, 0.04)),
        half_y + float(rng.uniform(0.16, 0.22)),
        float(rng.uniform(0.08, 0.14)),
    )
    return TaskSpec(
        scene_id=f"{SCENE_FAMILY}_s{seed}",
        seed=seed,
        start=start,
        target=target,
        obstacles=[wall],
        description=(
            f"Reach from start to target past a {height:.2f} m wall "
            f"({2 * half_x:.2f} m long, {2 * half_y:.2f} m thick) standing on the floor."
        ),
    )


def _generate_roof_task(seed: int) -> TaskSpec:
    """A shorter wall with a roof slab above it: the gap under the roof is tight for a wrist."""
    rng = np.random.default_rng(seed + 1_000_003)  # independent stream from wall_reach_v1
    half_x = float(rng.uniform(0.05, 0.09))
    half_y = float(rng.uniform(0.02, 0.03))
    height = float(rng.uniform(0.20, 0.26))
    gap = float(rng.uniform(0.16, 0.30))
    cx = float(rng.uniform(-0.02, 0.02))
    wall = BoxSpec(name="wall", center=(cx, 0.0, height / 2), half_size=(half_x, half_y, height / 2))
    roof = BoxSpec(
        name="roof",
        center=(cx, 0.0, height + gap + 0.015),
        half_size=(half_x + 0.05, float(rng.uniform(0.10, 0.14)), 0.015),
    )
    start = (float(rng.uniform(-0.04, 0.04)), -(half_y + float(rng.uniform(0.16, 0.22))),
             float(rng.uniform(0.12, 0.18)))
    target = (float(rng.uniform(-0.04, 0.04)), half_y + float(rng.uniform(0.16, 0.22)),
              float(rng.uniform(0.08, 0.14)))
    return TaskSpec(
        scene_id=f"{ROOF_FAMILY}_s{seed}",
        seed=seed,
        start=start,
        target=target,
        obstacles=[wall, roof],
        description=(
            f"Reach past a {height:.2f} m wall ({2 * half_x:.2f} m long) with a roof slab "
            f"{gap:.2f} m above its top."
        ),
    )


def family_of(scene_id: str) -> str:
    return next((f for f in SCENE_FAMILIES if scene_id.startswith(f)), SCENE_FAMILY)


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
