"""Build compiled MuJoCo scenes from Menagerie models plus task objects.

Scenes are assembled with MjSpec so obstacles and target markers are real
model elements (obstacles participate in collision detection; the target
marker is a visual-only site).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

import mujoco

from app.services.robot_catalog import RobotDecl

OBSTACLE_PREFIX = "obstacle_"
TARGET_SITE = "nimbotics_target"
WAYPOINT_SITE_PREFIX = "nimbotics_wp_"
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
    _apply_visual_theme(spec)
    _ensure_end_effector_site(spec, decl)
    for body1, body2 in resting_self_contacts(decl):
        spec.add_exclude(bodyname1=body1, bodyname2=body2)
    if scene is not None:
        _add_scene_objects(spec, scene)
    return spec.compile()


@lru_cache(maxsize=64)
def resting_self_contacts(decl: RobotDecl) -> tuple[tuple[str, str], ...]:
    """Body pairs of the arm that already touch in the model's own home pose (e.g. closed gripper fingers).

    They are part of the model's design, not a collision the arm runs into, so they are excluded from contact;
    passports list them. Every other self-contact still fails a route.
    """
    spec = mujoco.MjSpec.from_file(str(decl.scene_path))
    _ensure_end_effector_site(spec, decl)
    model = spec.compile()
    data = mujoco.MjData(model)
    key = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_KEY, decl.home_keyframe)
    if key >= 0:
        mujoco.mj_resetDataKeyframe(model, data, key)
    mujoco.mj_forward(model, data)
    ee_body = int(model.site_bodyid[mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, decl.end_effector.site_name)])
    root = int(model.body_rootid[ee_body])
    pairs: set[tuple[str, str]] = set()
    for i in range(data.ncon):
        b1, b2 = (int(model.geom_bodyid[g]) for g in data.contact[i].geom)
        if b1 != b2 and int(model.body_rootid[b1]) == root == int(model.body_rootid[b2]):
            n1, n2 = model.body(b1).name, model.body(b2).name
            pairs.add((n1, n2) if n1 < n2 else (n2, n1))
    return tuple(sorted(pairs))


# Visual-only restyle (textures/materials) to match the dark Control Center; no effect on dynamics.
SKY_TOP = [0.16, 0.18, 0.21]
SKY_BOTTOM = [0.03, 0.035, 0.045]
FLOOR_A = [0.17, 0.19, 0.22]
FLOOR_B = [0.13, 0.145, 0.17]
FLOOR_MARK = [0.28, 0.33, 0.39]
OFFSCREEN_W, OFFSCREEN_H = 1280, 720


def _apply_visual_theme(spec: mujoco.MjSpec) -> None:
    for tex in spec.textures:
        if tex.type == mujoco.mjtTexture.mjTEXTURE_SKYBOX:
            tex.rgb1, tex.rgb2 = SKY_TOP, SKY_BOTTOM
        elif tex.name == "groundplane":
            tex.rgb1, tex.rgb2, tex.markrgb = FLOOR_A, FLOOR_B, FLOOR_MARK
    for mat in spec.materials:
        if mat.name == "groundplane":
            mat.reflectance = 0.08
    spec.visual.global_.offwidth = max(spec.visual.global_.offwidth, OFFSCREEN_W)
    spec.visual.global_.offheight = max(spec.visual.global_.offheight, OFFSCREEN_H)


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
