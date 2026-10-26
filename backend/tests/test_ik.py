from __future__ import annotations

import mujoco
import numpy as np
import pytest

from app.services.kinematics import make_seeds, solve_ik
from app.services.robot_adapter import RobotAdapter
from app.services.robot_catalog import ROBOTS
from app.services.scene import BoxObstacle, SceneSpec, build_model
from app.services.simulation import execute_path, interpolate_path, screen_path

TARGETS = [(0.40, 0.25, 0.30), (0.45, -0.20, 0.25), (0.35, 0.0, 0.50)]
RIDS = list(ROBOTS)


@pytest.mark.parametrize("rid", RIDS)
def test_fk_matches_mujoco_forward(adapters, rid):
    a = adapters[rid]
    data = a.new_data()
    q = np.clip(a.home_q() + 0.2, a.lower, a.upper)
    pos = a.fk(data, q)
    mujoco.mj_forward(a.model, data)
    assert np.allclose(pos, data.site_xpos[a.ee_site_id])


@pytest.mark.parametrize("rid", RIDS)
def test_jacobian_matches_finite_difference(adapters, rid):
    a = adapters[rid]
    data = a.new_data()
    q = np.clip(a.home_q() + 0.1, a.lower, a.upper)
    a.fk(data, q)
    jac = a.ee_jacobian_pos(data)
    eps = 1e-6
    for i in range(a.dof):
        dq = np.zeros(a.dof)
        dq[i] = eps
        numeric = (a.fk(data, q + dq) - a.fk(data, q - dq)) / (2 * eps)
        assert np.allclose(jac[:, i], numeric, atol=1e-5)


@pytest.mark.parametrize("rid", RIDS)
@pytest.mark.parametrize("target", TARGETS)
def test_ik_converges_within_limits(adapters, rid, target):
    a = adapters[rid]
    ik = solve_ik(a, np.array(target), make_seeds(a, 8, np.random.default_rng(0)))
    assert ik.success and ik.position_error_m < 1e-3
    assert a.within_limits(np.array(ik.q)) and not ik.in_collision
    assert np.linalg.norm(a.fk(a.new_data(), np.array(ik.q)) - target) < 1e-3


@pytest.mark.parametrize("rid", RIDS)
def test_ik_rejects_unreachable_target(adapters, rid):
    a = adapters[rid]
    ik = solve_ik(a, np.array([2.0, 0.0, 0.5]), make_seeds(a, 3, np.random.default_rng(0)))
    assert not ik.success and ik.position_error_m > 0.5 and ik.seeds_tried == 3


def test_interpolation_respects_speed_limit():
    a, b = np.zeros(3), np.array([1.0, -0.5, 0.2])
    path = interpolate_path([a, b], timestep=0.002, max_speed=1.0)
    assert np.max(np.abs(np.diff(path, axis=0))) <= 0.002 + 1e-12
    assert np.allclose(path[-1], b)


@pytest.mark.parametrize("rid", RIDS)
def test_gravity_compensated_hold(adapters, rid):
    a = adapters[rid]
    data = a.new_data()
    start = a.fk(data).copy()
    res = execute_path(a, data, [a.home_q(), a.home_q()], max_settle_seconds=1.0)
    assert np.linalg.norm(np.array(res.final_ee_pos) - start) < 1e-3


@pytest.mark.parametrize("rid", RIDS)
def test_physics_execution_reaches_target(adapters, rid):
    a = adapters[rid]
    target = np.array(TARGETS[0])
    ik = solve_ik(a, target, make_seeds(a, 8, np.random.default_rng(0)))
    res = execute_path(a, a.new_data(), [a.home_q(), np.array(ik.q)])
    assert np.linalg.norm(np.array(res.final_ee_pos) - target) < 0.01
    assert res.collisions == () and res.limit_violations == () and res.settled


def test_source_joint_angles_are_not_valid_for_other_robot(panda, ur5e):
    # Joint vectors are not even the same length: transfer must re-solve IK.
    assert panda.dof != ur5e.dof


@pytest.mark.parametrize("rid", RIDS)
def test_obstacle_collision_is_detected(rid):
    decl = ROBOTS[rid]
    probe = RobotAdapter(decl, build_model(decl))
    ee_home = tuple(float(v) for v in probe.fk(probe.new_data()))
    box = BoxObstacle("block", center=ee_home, half_size=(0.05, 0.05, 0.05))
    a = RobotAdapter(decl, build_model(decl, SceneSpec(obstacles=(box,))))
    contacts = a.check_configuration(a.new_data(), a.home_q())
    assert any(c.category == "obstacle" for c in contacts)
    assert any(c.category == "obstacle" for c in screen_path(a, [a.home_q(), a.home_q()]))
