from __future__ import annotations

import numpy as np
import pytest

from app.models.skill import Placement
from app.services.task_scene import base_to_task, generate_task, task_to_base, world_scene


def test_generation_is_deterministic_per_seed():
    assert generate_task(42) == generate_task(42)
    assert generate_task(42) != generate_task(43)


@pytest.mark.parametrize("seed", range(10))
def test_wall_separates_start_and_target(seed):
    t = generate_task(seed)
    wall = t.obstacles[0]
    assert wall.lo[2] == pytest.approx(0.0)  # stands on the floor
    assert t.start[1] < wall.lo[1] and t.target[1] > wall.hi[1]
    assert t.start[2] < wall.hi[2] and t.target[2] < wall.hi[2]  # direct line must cross the wall


@pytest.mark.parametrize("yaw", [0.0, 0.7, -2.1])
def test_task_base_roundtrip(yaw):
    pl = Placement(translation=(0.5, -0.1, 0.02), yaw_rad=yaw)
    p = np.array([0.1, -0.2, 0.3])
    assert np.allclose(base_to_task(task_to_base(p, pl), pl), p)


def test_world_scene_translates_objects():
    t = generate_task(42)
    pl = Placement(translation=(0.5, 0.0, 0.0))
    scene = world_scene(t, pl)
    assert np.allclose(scene.target, np.array(t.target) + [0.5, 0, 0])
    assert np.allclose(scene.obstacles[0].center, np.array(t.obstacles[0].center) + [0.5, 0, 0])


def test_world_scene_rejects_yaw_for_boxes():
    with pytest.raises(ValueError):
        world_scene(generate_task(1), Placement(translation=(0.5, 0, 0), yaw_rad=0.3))
