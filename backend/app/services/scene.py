"""Build compiled MuJoCo scenes from Menagerie models plus task objects.

Scenes are assembled with MjSpec so obstacles and target markers are real
model elements (obstacles participate in collision detection; the target
marker is a visual-only site).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import mujoco

from app.services.robot_catalog import RobotDecl

OBSTACLE_PREFIX = "obstacle_"
TARGET_SITE = "agentnet_target"
WAYPOINT_SITE_PREFIX = "agentnet_wp_"
FLOOR_GEOM = "floor"


@dataclass(frozen=True)
class BoxObstacle:
    name: str
    center: tuple[float, float, float]
    half_size: tuple[float, float, float]


@dataclass(frozen=True)
class SceneSpec:
    """Task objects expressed in the robot base (world) frame."""

    target: tuple[float, float, float] | None = None
    obstacles: tuple[BoxObstacle, ...] = ()
    waypoint_markers: tuple[tuple[float, float, float], ...] = field(default_factory=tuple)


def build_model(decl: RobotDecl, scene: SceneSpec | None = None) -> mujoco.MjModel:
    if not decl.scene_path.exists():
        raise FileNotFoundError(
            f"Model file missing: {decl.scene_path}. Run scripts/fetch_models.sh first."
        )
    spec = mujoco.MjSpec.from_file(str(decl.scene_path))
    _ensure_end_effector_site(spec, decl)
    if scene is not None:
        _add_scene_objects(spec, scene)
    return spec.compile()


def _ensure_end_effector_site(spec: mujoco.MjSpec, decl: RobotDecl) -> None:
    ee = decl.end_effector
    if ee.exists_in_model:
        return
    body = spec.body(ee.parent_body)
    if body is None:
        raise ValueError(f"Body '{ee.parent_body}' not found in {decl.scene_path}")
    body.add_site(
        name=ee.site_name,
        pos=list(ee.offset_m),
        size=[0.008, 0, 0],
        rgba=[0.1, 0.9, 1.0, 0.9],
        group=2,
    )


def _add_scene_objects(spec: mujoco.MjSpec, scene: SceneSpec) -> None:
    world = spec.worldbody
    for obs in scene.obstacles:
        world.add_geom(
            name=f"{OBSTACLE_PREFIX}{obs.name}",
            type=mujoco.mjtGeom.mjGEOM_BOX,
            pos=list(obs.center),
            size=list(obs.half_size),
            rgba=[0.95, 0.35, 0.25, 0.75],
            contype=1,
            conaffinity=1,
        )
    if scene.target is not None:
        world.add_site(
            name=TARGET_SITE,
            pos=list(scene.target),
            size=[0.022, 0, 0],
            rgba=[0.2, 1.0, 0.45, 0.85],
            group=0,
        )
    for i, wp in enumerate(scene.waypoint_markers):
        world.add_site(
            name=f"{WAYPOINT_SITE_PREFIX}{i}",
            pos=list(wp),
            size=[0.009, 0, 0],
            rgba=[0.3, 0.75, 1.0, 0.7],
            group=0,
        )
