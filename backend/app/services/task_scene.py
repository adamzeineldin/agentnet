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


QUARTER_TURN = math.pi / 2
ROUNDING_NOTE_RAD = math.radians(5)


def default_placement(robot_id: str) -> Placement:
    """Task origin task_distance_m in front of the base along +x (robot_catalog), or in front of an uploaded arm's
    mount at its height, facing the mount's heading rounded to a quarter turn (boxes stay axis-aligned)."""
    d = get_robot_decl(robot_id)
    if d.mount is None:
        return Placement(translation=(d.task_distance_m, 0.0, 0.0),
                         rationale=f"{d.task_distance_m:.2f} m in front of the {d.short_name} base")
    x, y, z, yaw = d.mount
    turns = round(yaw / QUARTER_TURN) % 4
    facing = turns * QUARTER_TURN
    ahead = _rot(facing) @ np.array([d.task_distance_m, 0.0, 0.0])
    off = math.remainder(yaw - facing, 2 * math.pi)
    rounded = f", its heading {math.degrees(yaw):.0f}° taken as {turns * 90}°" if abs(off) > ROUNDING_NOTE_RAD else ""
    return Placement(translation=(x + float(ahead[0]), y + float(ahead[1]), z), yaw_rad=facing, mount=(x, y, z),
                     rationale=f"{d.task_distance_m:.2f} m in front of the {d.short_name}'s mount, "
                               f"{z:.2f} m up{rounded}")


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

    Boxes stay axis-aligned only under quarter-turn yaws (a quarter turn swaps a box's x and y sizes); any other
    yaw would need a rotated box, which BoxObstacle does not model yet.
    """
    turns = placement.yaw_rad / QUARTER_TURN
    if abs(turns - round(turns)) > 1e-9:
        raise ValueError("Only quarter-turn placement yaws are supported for box obstacles")
    sideways = round(turns) % 2 == 1
    return SceneSpec(
        target=to_vec3(task_to_base(task.target, placement)),
        obstacles=tuple(
            BoxObstacle(
                name=o.name,
                center=to_vec3(task_to_base(o.center, placement)),
                half_size=(o.half_size[1], o.half_size[0], o.half_size[2]) if sideways else o.half_size,
            )
            for o in task.obstacles
        ),
        waypoint_markers=tuple(to_vec3(task_to_base(p, placement)) for p in route_markers),
    )
