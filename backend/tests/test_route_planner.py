from __future__ import annotations

import numpy as np
import pytest

from app.models.skill import ExperienceCapsule
from app.services.kinematics import make_seeds
from app.services.robot_adapter import RobotAdapter
from app.services.robot_catalog import ROBOTS
from app.services.route_planner import (
    densify,
    evaluate_candidate,
    generate_candidates,
    route_waypoints,
    solve_start,
)
from app.services.scene import build_model
from app.services.task_scene import default_placement, generate_task, world_scene

SEED = 42


@pytest.fixture(scope="module")
def setup():
    task = generate_task(SEED)
    pl = default_placement("panda_01")
    a = RobotAdapter(ROBOTS["panda_01"], build_model(ROBOTS["panda_01"], world_scene(task, pl)))
    q0 = solve_start(a, task, pl, make_seeds(a, 8, np.random.default_rng(SEED)))
    assert q0 is not None
    return task, pl, a, q0


def test_candidate_enumeration(setup):
    task = setup[0]
    cands = generate_candidates(task)
    assert len({c.candidate_id for c in cands}) == len(cands) == 10
    assert {c.route_class for c in cands} == {"direct", "over", "near_side", "far_side"}
    for c in cands:
        assert c.waypoints_task[0] == task.start and c.waypoints_task[-1] == task.target


def test_over_route_clears_wall_top():
    task = generate_task(SEED)
    wps = route_waypoints(task, "over", 0.08)
    assert wps[1][2] == pytest.approx(task.obstacles[0].hi[2] + 0.08)


def test_densify_step_and_endpoints():
    pts = np.array([[0, 0, 0], [0.1, 0, 0], [0.1, 0.05, 0]], dtype=float)
    d = densify(pts, step=0.02)
    assert np.allclose(d[0], pts[0]) and np.allclose(d[-1], pts[-1])
    assert np.max(np.linalg.norm(np.diff(d, axis=0), axis=1)) <= 0.02 + 1e-12


def test_direct_route_is_rejected_for_collision(setup):
    task, pl, a, q0 = setup
    direct = next(c for c in generate_candidates(task) if c.route_class == "direct")
    result = evaluate_candidate(a, direct, pl, q0)
    assert result.summary.outcome == "collision" and result.joint_path is None
    assert any(c["category"] == "obstacle" for c in result.summary.contacts)


def test_some_candidate_is_feasible_with_measured_clearance(setup):
    task, pl, a, q0 = setup
    results = [evaluate_candidate(a, c, pl, q0) for c in generate_candidates(task)]
    feasible = [r for r in results if r.summary.outcome == "feasible"]
    assert feasible, [r.summary.reason for r in results]
    for r in feasible:
        assert r.summary.min_clearance_m >= 0.01 and r.summary.cost > 0
        assert len(r.joint_path[0]) == a.dof
    rejected = [r for r in results if r.summary.outcome != "feasible"]
    assert rejected and all(r.summary.reason for r in rejected)


def test_capsule_schema_has_no_joint_space_fields():
    fields = set(ExperienceCapsule.model_fields)
    assert not {f for f in fields if "joint" in f or f in {"q", "qpos"}}
    assert {"waypoints_task_frame", "parent_skill_id", "lineage", "validation"} <= fields
