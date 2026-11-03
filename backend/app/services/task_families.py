"""Seeded task families: every reach task Nimbotics can build, in the task frame.

Each family places obstacles between a start point (-y side) and a target (+y side). The same
(family, seed) always builds the same layout, so any run can be repeated exactly. Route classes in
route_planner (direct / over / near_side / far_side) work on every family; which one wins depends
on the layout and the robot's body, and is found in simulation, never assumed.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from app.models.skill import BoxSpec, TaskSpec, Vec3

SCENE_FAMILY = "wall_reach_v1"
ROOF_FAMILY = "wall_roof_v1"
TALL_WALL_FAMILY = "tall_wall_v1"
FENCE_FAMILY = "fence_v1"
SHELF_FAMILY = "shelf_v1"
POSTS_FAMILY = "posts_v1"
DEFAULT_SEED = 42


@dataclass(frozen=True)
class TaskType:
    family: str
    title: str
    summary: str
    generate: Callable[[int], TaskSpec]


def _ends(rng: np.random.Generator, half_y: float, start_z: tuple[float, float] = (0.12, 0.18),
          target_z: tuple[float, float] = (0.08, 0.14), x_jitter: float = 0.04) -> tuple[Vec3, Vec3]:
    start = (float(rng.uniform(-x_jitter, x_jitter)), -(half_y + float(rng.uniform(0.16, 0.22))),
             float(rng.uniform(*start_z)))
    target = (float(rng.uniform(-x_jitter, x_jitter)), half_y + float(rng.uniform(0.16, 0.22)),
              float(rng.uniform(*target_z)))
    return start, target


def wall_task(seed: int) -> TaskSpec:
    rng = np.random.default_rng(seed)
    half_x = float(rng.uniform(0.08, 0.13))
    half_y = float(rng.uniform(0.02, 0.03))
    height = float(rng.uniform(0.22, 0.30))
    wall = BoxSpec(name="wall", center=(float(rng.uniform(-0.02, 0.02)), 0.0, height / 2),
                   half_size=(half_x, half_y, height / 2))
    start, target = _ends(rng, half_y)
    return TaskSpec(
        scene_id=f"{SCENE_FAMILY}_s{seed}", seed=seed, start=start, target=target, obstacles=[wall],
        description=(f"Reach from start to target past a {height:.2f} m wall "
                     f"({2 * half_x:.2f} m long, {2 * half_y:.2f} m thick) standing on the floor."),
    )


def roof_task(seed: int) -> TaskSpec:
    """A shorter wall with a roof slab above it: the gap under the roof is tight for a wrist."""
    rng = np.random.default_rng(seed + 1_000_003)  # independent stream from wall_reach_v1
    half_x = float(rng.uniform(0.05, 0.09))
    half_y = float(rng.uniform(0.02, 0.03))
    height = float(rng.uniform(0.20, 0.26))
    gap = float(rng.uniform(0.16, 0.30))
    cx = float(rng.uniform(-0.02, 0.02))
    wall = BoxSpec(name="wall", center=(cx, 0.0, height / 2), half_size=(half_x, half_y, height / 2))
    roof = BoxSpec(name="roof", center=(cx, 0.0, height + gap + 0.015),
                   half_size=(half_x + 0.05, float(rng.uniform(0.10, 0.14)), 0.015))
    start, target = _ends(rng, half_y)
    return TaskSpec(
        scene_id=f"{ROOF_FAMILY}_s{seed}", seed=seed, start=start, target=target, obstacles=[wall, roof],
        description=(f"Reach past a {height:.2f} m wall ({2 * half_x:.2f} m long) with a roof slab "
                     f"{gap:.2f} m above its top."),
    )


def tall_wall_task(seed: int) -> TaskSpec:
    """A narrow wall too tall to clear comfortably: going around a side is usually shorter."""
    rng = np.random.default_rng(seed + 2_000_003)
    half_x = float(rng.uniform(0.05, 0.08))
    half_y = float(rng.uniform(0.02, 0.03))
    height = float(rng.uniform(0.55, 0.70))
    wall = BoxSpec(name="tall_wall", center=(float(rng.uniform(-0.02, 0.02)), 0.0, height / 2),
                   half_size=(half_x, half_y, height / 2))
    start, target = _ends(rng, half_y)
    return TaskSpec(
        scene_id=f"{TALL_WALL_FAMILY}_s{seed}", seed=seed, start=start, target=target, obstacles=[wall],
        description=f"Reach around a {height:.2f} m tall wall, {2 * half_x:.2f} m long.",
    )


def fence_task(seed: int) -> TaskSpec:
    """A long, low fence: going around either end is far, so the hand usually goes over it."""
    rng = np.random.default_rng(seed + 3_000_017)
    half_x = float(rng.uniform(0.30, 0.36))
    half_y = float(rng.uniform(0.015, 0.025))
    height = float(rng.uniform(0.14, 0.20))
    fence = BoxSpec(name="fence", center=(float(rng.uniform(-0.02, 0.02)), 0.0, height / 2),
                    half_size=(half_x, half_y, height / 2))
    start, target = _ends(rng, half_y, start_z=(0.06, 0.10), target_z=(0.05, 0.09))
    return TaskSpec(
        scene_id=f"{FENCE_FAMILY}_s{seed}", seed=seed, start=start, target=target, obstacles=[fence],
        description=f"Reach over a {height:.2f} m high fence, {2 * half_x:.2f} m long.",
    )


def shelf_task(seed: int) -> TaskSpec:
    """A target resting just above a shelf block, behind a low wall."""
    rng = np.random.default_rng(seed + 4_000_037)
    wall_half_y = float(rng.uniform(0.02, 0.03))
    wall_h = float(rng.uniform(0.10, 0.16))
    wall = BoxSpec(name="wall", center=(float(rng.uniform(-0.02, 0.02)), 0.0, wall_h / 2),
                   half_size=(float(rng.uniform(0.08, 0.12)), wall_half_y, wall_h / 2))
    shelf_y = wall_half_y + float(rng.uniform(0.18, 0.22))
    shelf_top = float(rng.uniform(0.22, 0.30))
    shelf = BoxSpec(name="shelf", center=(float(rng.uniform(-0.02, 0.02)), shelf_y, shelf_top / 2),
                    half_size=(float(rng.uniform(0.08, 0.10)), float(rng.uniform(0.06, 0.08)), shelf_top / 2))
    start, _ = _ends(rng, wall_half_y)
    target = (float(shelf.center[0] + rng.uniform(-0.02, 0.02)), shelf_y, shelf_top + float(rng.uniform(0.04, 0.06)))
    return TaskSpec(
        scene_id=f"{SHELF_FAMILY}_s{seed}", seed=seed, start=start, target=target, obstacles=[wall, shelf],
        description=f"Reach onto a {shelf_top:.2f} m high shelf behind a {wall_h:.2f} m wall.",
    )


def posts_task(seed: int) -> TaskSpec:
    """Two posts with a gap between them, lined up with the start and target."""
    rng = np.random.default_rng(seed + 5_000_011)
    half_x = float(rng.uniform(0.03, 0.04))
    half_y = float(rng.uniform(0.03, 0.04))
    height = float(rng.uniform(0.24, 0.32))
    gap = float(rng.uniform(0.18, 0.26))
    cx = float(rng.uniform(-0.01, 0.01))
    posts = [BoxSpec(name=f"post_{side}", center=(cx + sign * (gap / 2 + half_x), 0.0, height / 2),
                     half_size=(half_x, half_y, height / 2))
             for side, sign in (("near", -1.0), ("far", 1.0))]
    start, target = _ends(rng, half_y, x_jitter=0.01)
    return TaskSpec(
        scene_id=f"{POSTS_FAMILY}_s{seed}", seed=seed, start=start, target=target, obstacles=posts,
        description=f"Reach through a {gap:.2f} m gap between two {height:.2f} m posts.",
    )


TASK_TYPES: dict[str, TaskType] = {t.family: t for t in (
    TaskType(SCENE_FAMILY, "Reach past a wall",
             "A wall stands between the start and the target. Over it, or around either side.", wall_task),
    TaskType(ROOF_FAMILY, "Reach under a roof",
             "A wall with a roof above it, so going over means squeezing through the gap.", roof_task),
    TaskType(TALL_WALL_FAMILY, "Reach around a tall wall",
             "A narrow wall too tall to go over comfortably. Around a side is usually shorter.", tall_wall_task),
    TaskType(FENCE_FAMILY, "Reach over a long fence",
             "A low fence too long to walk around, with the start and target close to the floor.", fence_task),
    TaskType(SHELF_FAMILY, "Reach onto a shelf",
             "The target sits on a shelf behind a low wall, higher than where the hand starts.", shelf_task),
    TaskType(POSTS_FAMILY, "Reach between two posts",
             "Two posts with a gap between them. Straight through works only if the whole arm fits.", posts_task),
)}
SCENE_FAMILIES = tuple(TASK_TYPES)


def generate_task(seed: int = DEFAULT_SEED, family: str = SCENE_FAMILY) -> TaskSpec:
    if family not in TASK_TYPES:
        raise ValueError(f"Unknown scene family {family!r}; known: {SCENE_FAMILIES}")
    return TASK_TYPES[family].generate(seed)


def family_of(scene_id: str) -> str:
    return next((f for f in SCENE_FAMILIES if scene_id.startswith(f"{f}_s")), SCENE_FAMILY)
