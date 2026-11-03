from __future__ import annotations

import numpy as np
import pytest

from app.models.robot import RobotPassport
from app.services.passports import build_passport, model_dir_hash
from app.services.robot_catalog import ROBOTS


@pytest.fixture(scope="module")
def passports(adapters) -> dict[str, RobotPassport]:
    return {rid: build_passport(ROBOTS[rid], a, seed=0) for rid, a in adapters.items()}


def test_arm_joints_discovered_from_model(panda, ur5e):
    assert [j.name for j in panda.joints] == [f"joint{i}" for i in range(1, 8)]
    assert [j.name for j in ur5e.joints] == [
        "shoulder_pan_joint", "shoulder_lift_joint", "elbow_joint",
        "wrist_1_joint", "wrist_2_joint", "wrist_3_joint",
    ]
    # Gripper finger joints are not on the EE chain and must not be arm joints.
    assert not any("finger" in j.name for j in panda.joints)


@pytest.mark.parametrize("rid", list(ROBOTS))
def test_passport_limits_match_loaded_model(adapters, passports, rid):
    model = adapters[rid].model
    for joint in passports[rid].arm_joints:
        jid = model.joint(joint.name).id
        lo, hi = model.jnt_range[jid] if model.jnt_limited[jid] else (-np.pi, np.pi)  # continuous joints: one turn
        assert joint.limited == bool(model.jnt_limited[jid])
        assert joint.lower == pytest.approx(lo) and joint.upper == pytest.approx(hi)


@pytest.mark.parametrize("rid", list(ROBOTS))
def test_actuators_are_position_servos_on_arm_joints(passports, rid):
    p = passports[rid]
    assert [a.joint_name for a in p.actuators] == [j.name for j in p.arm_joints]
    assert all(a.control_mode == "position_servo" and a.kp > 0 for a in p.actuators)


def test_robots_are_distinct(passports):
    a, b = passports["panda_01"], passports["ur5e_01"]
    assert (a.dof, b.dof) == (7, 6)
    assert a.model_hash != b.model_hash
    assert a.joint_names != b.joint_names


def test_end_effector_provenance(passports):
    assert passports["panda_01"].end_effector.source == "added_by_nimbotics"
    assert passports["panda_01"].field_provenance["end_effector"] == "declared"
    assert passports["ur5e_01"].end_effector.source == "model"


@pytest.mark.parametrize("rid", list(ROBOTS))
def test_workspace_accounting(passports, rid):
    w = passports[rid].workspace
    rejected = w.rejected_self_collision + w.rejected_floor_or_env + w.rejected_below_floor
    assert w.samples_collision_free + rejected == w.samples_requested
    pts = np.array(w.points)
    assert (pts[:, 2] >= 0).all()
    assert np.all(pts >= np.array(w.bounds_min) - 1e-9) and np.all(pts <= np.array(w.bounds_max) + 1e-9)
    assert 0.4 < w.max_reach_m < 1.5


def test_workspace_is_deterministic_for_seed(panda):
    a = build_passport(ROBOTS["panda_01"], panda, seed=3).workspace
    b = build_passport(ROBOTS["panda_01"], panda, seed=3).workspace
    assert a.points == b.points and a.max_reach_m == b.max_reach_m


def test_reach_capability_starts_unverified(passports):
    cap = {c.task_type: c for c in passports["ur5e_01"].capabilities}
    assert cap["obstacle_aware_reach"].status == "unverified"
    assert cap["position_ik"].evidence["probes"] > 0


def test_passport_json_roundtrip(passports):
    p = passports["panda_01"]
    assert RobotPassport.model_validate_json(p.model_dump_json()) == p


def test_model_hash_is_stable():
    d = ROBOTS["ur5e_01"]
    assert model_dir_hash(d.model_path) == model_dir_hash(d.model_path)
