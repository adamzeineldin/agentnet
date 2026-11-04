"""Designed task types: a layout from a description becomes a task type next to the built-in families.

The designer (Muse or offline, librarian/designer.py) only proposes boxes, a start and a target. This module
checks them against fixed limits, so a design can never put the start inside a box, a box under the robot
base, or the target out of the work area, and turns an accepted layout into a seeded generator: layout 0 is
the exact design, every other number shifts it slightly (always keeping the checked clearances). Whether a
robot can do the task is still found only by discovery runs in MuJoCo.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from collections.abc import Iterable
from functools import partial

import numpy as np

from app.models.skill import BoxSpec, TaskSpec, Vec3
from app.models.task_design import TaskDesign, TaskLayout
from app.services.task_families import TASK_TYPES, TaskType, register

log = logging.getLogger(__name__)

FAMILY_PREFIX = "custom_"
MAX_DESIGNED_TASKS = 200
MAX_OBSTACLES = 4
MIN_HALF_SIZE_M = 0.01
POINT_X = (-0.12, 0.12)
START_Y = (-0.40, -0.08)
TARGET_Y = (0.08, 0.40)
POINT_Z = (0.04, 0.45)
# Work area for boxes (task frame). x >= -0.15 keeps every box clear of the robot base, which stands at
# x = -task_distance_m (0.25 m or more).
AREA_LO = (-0.15, -0.35, 0.0)
AREA_HI = (0.40, 0.35, 0.75)
POINT_CLEARANCE_M = 0.05
MIN_START_TARGET_M = 0.20
# Per-layout shifts. Worst relative move between a point and a box is about 4.2 cm < POINT_CLEARANCE_M.
OBSTACLE_SHIFT_X = 0.015
POINT_SHIFT = (0.02, 0.02, 0.01)


def _gap(p: Vec3, box: BoxSpec) -> float:
    q = np.asarray(p)
    return float(np.linalg.norm(np.maximum(0.0, np.maximum(np.asarray(box.lo) - q, q - np.asarray(box.hi)))))


def _point_errors(label: str, p: Vec3, y_range: tuple[float, float]) -> list[str]:
    errors = []
    for axis, value, (lo, hi) in (("x", p[0], POINT_X), ("y", p[1], y_range), ("z", p[2], POINT_Z)):
        if not lo <= value <= hi:
            errors.append(f"{label} {axis} = {value:.2f} m is outside {lo:.2f} to {hi:.2f} m.")
    return errors


def _box_errors(box: BoxSpec) -> list[str]:
    errors = []
    if min(box.half_size) < MIN_HALF_SIZE_M:
        errors.append(f"Box '{box.name}' is thinner than {2 * MIN_HALF_SIZE_M * 100:.0f} cm.")
    for axis, lo, hi, a_lo, a_hi in zip("xyz", box.lo, box.hi, AREA_LO, AREA_HI, strict=True):
        if lo < a_lo - 1e-9 or hi > a_hi + 1e-9:
            errors.append(f"Box '{box.name}' spans {axis} {lo:.2f} to {hi:.2f} m, outside the work area "
                          f"({a_lo:.2f} to {a_hi:.2f} m).")
    return errors


def check_layout(layout: TaskLayout) -> tuple[list[str], list[str]]:
    """(errors, checks): errors make the layout unusable; checks say in words what was verified."""
    errors = [*_point_errors("Start", layout.start, START_Y), *_point_errors("Target", layout.target, TARGET_Y)]
    if not 1 <= len(layout.obstacles) <= MAX_OBSTACLES:
        errors.append(f"A task needs 1 to {MAX_OBSTACLES} obstacles, not {len(layout.obstacles)}.")
    if len({b.name for b in layout.obstacles}) != len(layout.obstacles):
        errors.append("Obstacle names must be unique.")
    for box in layout.obstacles:
        errors.extend(_box_errors(box))
    apart = float(np.linalg.norm(np.subtract(layout.target, layout.start)))
    if apart < MIN_START_TARGET_M:
        errors.append(f"Start and target are only {apart:.2f} m apart (at least {MIN_START_TARGET_M:.2f} m).")
    gaps = {label: min((_gap(p, b) for b in layout.obstacles), default=float("inf"))
            for label, p in (("Start", layout.start), ("Target", layout.target))}
    for label, gap in gaps.items():
        if gap < POINT_CLEARANCE_M:
            errors.append(f"{label} is {gap * 100:.1f} cm from an obstacle (at least {POINT_CLEARANCE_M * 100:.0f} cm).")
    checks = [
        f"Start and target are {apart:.2f} m apart (at least {MIN_START_TARGET_M:.2f} m).",
        *(f"{label} is {min(gap, 9.99) * 100:.0f} cm from the nearest obstacle (at least "
          f"{POINT_CLEARANCE_M * 100:.0f} cm)." for label, gap in gaps.items()),
        f"All {len(layout.obstacles)} obstacles are inside the work area, clear of the robot base.",
        "Layout 0 is the exact design; every other layout number shifts the obstacles by up to 1.5 cm and the "
        "start and target by up to 2 cm.",
    ]
    return errors, checks


def _layout_json(layout: TaskLayout) -> str:
    return json.dumps(layout.model_dump(mode="json"), sort_keys=True)


def family_id(title: str, layout: TaskLayout) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")[:24].strip("_") or "task"
    return f"{FAMILY_PREFIX}{slug}_{hashlib.sha256(_layout_json(layout).encode()).hexdigest()[:6]}"


def _shifted(p: Vec3, d: np.ndarray) -> Vec3:
    return (float(p[0] + d[0]), float(p[1] + d[1]), float(p[2] + d[2]))


def designed_task(design: TaskDesign, seed: int) -> TaskSpec:
    layout = design.layout
    start, target, obstacles = layout.start, layout.target, layout.obstacles
    if seed != 0:
        rng = np.random.default_rng(seed + 7_000_003)
        dx = float(rng.uniform(-OBSTACLE_SHIFT_X, OBSTACLE_SHIFT_X))
        obstacles = [b.model_copy(update={"center": (b.center[0] + dx, b.center[1], b.center[2])}) for b in obstacles]
        spread = np.asarray(POINT_SHIFT)
        start = _shifted(start, rng.uniform(-spread, spread))
        target = _shifted(target, rng.uniform(-spread, spread))
    return TaskSpec(scene_id=f"{design.family}_s{seed}", seed=seed, start=start, target=target, obstacles=obstacles,
                    description=f"{design.title}. Designed from the description \"{design.goal}\".")


def as_task_type(design: TaskDesign) -> TaskType:
    return TaskType(design.family, design.title, design.summary, partial(designed_task, design), example_seed=0)


def designed_count() -> int:
    return sum(1 for f in TASK_TYPES if f.startswith(FAMILY_PREFIX))


def install(design: TaskDesign) -> None:
    """Register a checked design as a task type (idempotent)."""
    errors, _ = check_layout(design.layout)
    if errors:
        raise ValueError("; ".join(errors))
    if design.family not in TASK_TYPES:
        register(as_task_type(design))


def load_designed(rows: Iterable[str]) -> list[str]:
    """Register stored designs at startup. Returns the families that failed the checks (skipped)."""
    skipped = []
    for raw in rows:
        design = TaskDesign.model_validate_json(raw)
        try:
            install(design)
        except ValueError as exc:
            log.warning("Designed task %s skipped: %s", design.family, exc)
            skipped.append(design.family)
    return skipped
