"""Offline task designer: keyword-matched layout templates (no model call), labelled as such.

Each template builds a layout in the task frame (+x away from the robot, +y from start to target, +z up).
Words such as "high" or "low" scale the obstacle heights. The result goes through the same checks as a
Muse design (services/task_design.check_layout).
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from app.models.skill import BoxSpec
from app.models.task_design import TaskLayout

WALL_HALF = 0.012  # 2.4 cm thick walls


@dataclass(frozen=True)
class Template:
    key: str
    title: str
    summary: str
    keywords: tuple[str, ...]
    build: Callable[[float], TaskLayout]


def box(name: str, x: float, y: float, width: float, depth: float, bottom: float, height: float) -> BoxSpec:
    """A box from its footprint centre, size and bottom height (the format the designer prompt uses)."""
    return BoxSpec(name=name, center=(x, y, bottom + height / 2), half_size=(width / 2, depth / 2, height / 2))


def open_box(scale: float) -> TaskLayout:
    h = min(0.09 * scale, 0.16)
    cy, half_x, half_y = 0.195, 0.13, 0.14  # wide and shallow: the hand's orientation is not controlled
    walls = [box("near_wall", 0.0, cy - half_y, 2 * (half_x + WALL_HALF), 2 * WALL_HALF, 0.0, h),
             box("far_wall", 0.0, cy + half_y, 2 * (half_x + WALL_HALF), 2 * WALL_HALF, 0.0, h),
             box("left_wall", -half_x, cy, 2 * WALL_HALF, 2 * half_y, 0.0, h),
             box("right_wall", half_x, cy, 2 * WALL_HALF, 2 * half_y, 0.0, h)]
    return TaskLayout(start=(0.0, -0.22, 0.14), target=(0.0, cy, 0.06), obstacles=walls)


def beam(scale: float) -> TaskLayout:
    bottom = min(max(0.20 * scale, 0.15), 0.32)
    return TaskLayout(start=(0.0, -0.24, 0.07), target=(0.0, 0.24, 0.07),
                      obstacles=[box("beam", 0.08, 0.0, 0.44, 0.06, bottom, 0.04)])


def two_walls(scale: float) -> TaskLayout:
    h = min(0.24 * scale, 0.40)
    return TaskLayout(start=(0.0, -0.27, 0.12), target=(0.0, 0.27, 0.10), obstacles=[
        box("first_wall", -0.04, -0.08, 0.20, 2 * WALL_HALF, 0.0, h),
        box("second_wall", 0.04, 0.08, 0.20, 2 * WALL_HALF, 0.0, h)])


def high_shelf(scale: float) -> TaskLayout:
    top = min(0.30 * scale, 0.38)
    return TaskLayout(start=(0.0, -0.22, 0.14), target=(0.0, 0.24, top + 0.06), obstacles=[
        box("wall", 0.0, 0.0, 0.20, 0.05, 0.0, 0.12), box("shelf", 0.0, 0.24, 0.18, 0.14, 0.0, top)])


def step(scale: float) -> TaskLayout:
    h = min(0.16 * scale, 0.30)
    return TaskLayout(start=(0.0, -0.24, 0.08), target=(0.0, 0.22, h + 0.08), obstacles=[
        box("low_step", 0.0, 0.02, 0.24, 0.10, 0.0, h / 2), box("high_step", 0.0, 0.22, 0.24, 0.16, 0.0, h)])


def wall(scale: float) -> TaskLayout:
    h = min(0.26 * scale, 0.60)
    return TaskLayout(start=(0.0, -0.22, 0.14), target=(0.0, 0.22, 0.10),
                      obstacles=[box("wall", 0.0, 0.0, 0.22, 0.05, 0.0, h)])


TEMPLATES = (
    Template("open_box", "Reach into an open box", "The target sits inside a box with four walls: the hand must "
             "come down into it from above.", ("box", "bin", "into", "inside", "container", "bucket", "basket",
                                               "crate", "drawer", "tray", "cup", "bowl"), open_box),
    Template("beam", "Reach under a beam", "A beam hangs across the path: the hand stays low and passes under "
             "it, or goes around an end.", ("under", "beneath", "below", "beam", "table", "bridge", "tunnel",
                                           "bar"), beam),
    Template("two_walls", "Reach past two staggered walls", "Two walls one behind the other, offset sideways, "
             "like a short maze.", ("two walls", "walls", "maze", "zigzag", "corridor", "staggered", "double"),
             two_walls),
    Template("high_shelf", "Reach onto a high shelf", "A low wall, then a shelf higher than the start, with the "
             "target just above it.", ("shelf", "onto", "cupboard", "counter", "on top", "rack", "cabinet"),
             high_shelf),
    Template("step", "Reach up a staircase", "Two steps of rising height; the target is just above the top "
             "step.", ("step", "stair", "climb", "up to", "ledge", "platform"), step),
    Template("wall", "Reach past a wall", "One wall between the start and the target.",
             ("wall", "past", "barrier", "block", "over", "partition"), wall),
)
HIGHER = ("high", "tall", "deep", "big", "large")
LOWER = ("low", "short", "shallow", "small", "tiny")


def _hits(text: str, words: tuple[str, ...]) -> list[str]:
    return [w for w in words if re.search(rf"\b{re.escape(w)}", text)]


def match(goal: str) -> tuple[Template, float, list[str]]:
    """Best template for the goal, the height scale, and the words that decided it."""
    text = goal.lower()
    scored = [(t, _hits(text, t.keywords)) for t in TEMPLATES]
    template, words = max(scored, key=lambda tw: len(tw[1]))
    if not words:
        template = TEMPLATES[-1]
    up, down = _hits(text, HIGHER), _hits(text, LOWER)
    scale = 1.35 if len(up) > len(down) else 0.75 if len(down) > len(up) else 1.0
    return template, scale, words + up + down
