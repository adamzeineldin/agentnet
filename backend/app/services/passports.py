"""Build Robot Passports from the loaded MuJoCo model plus sampled measurements."""

from __future__ import annotations

import hashlib
import time
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path

import mujoco
import numpy as np

from app.config import MAX_JOINT_SPEED_RAD_S, MENAGERIE_COMMIT, REACH_TOLERANCE_M
from app.models.robot import (
    ActuatorInfo,
    CapabilityEvidence,
    EndEffectorInfo,
    JointInfo,
    RobotPassport,
    WorkspaceEstimate,
)
from app.services.kinematics import make_seeds, solve_ik
from app.services.robot_adapter import RobotAdapter
from app.services.robot_catalog import RobotDecl
from app.services.scene import resting_self_contacts

WORKSPACE_SAMPLES = 3000
WORKSPACE_POINTS_KEPT = 400
IK_PROBES = 24
IK_SEEDS_PER_PROBE = 4


@lru_cache(maxsize=8)
def model_dir_hash(model_dir: Path) -> str:
    """sha256 over every file in the model directory (paths + bytes), sorted."""
    digest = hashlib.sha256()
    for path in sorted(p for p in model_dir.rglob("*") if p.is_file() and ".git" not in p.parts):
        digest.update(str(path.relative_to(model_dir)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def sample_workspace(adapter: RobotAdapter, seed: int, n: int = WORKSPACE_SAMPLES) -> tuple[
    WorkspaceEstimate, np.ndarray
]:
    rng = np.random.default_rng(seed)
    data = adapter.new_data()
    shoulder = data.xanchor[adapter.joints[0].joint_id].copy()
    counts = {"self": 0, "env": 0, "below": 0}
    points: list[np.ndarray] = []
    for _ in range(n):
        q = rng.uniform(adapter.lower, adapter.upper)
        contacts = adapter.check_configuration(data, q)
        pos = adapter.fk(data)
        if any(c.category == "self" for c in contacts):
            counts["self"] += 1
        elif contacts:
            counts["env"] += 1
        elif pos[2] < 0.0:
            counts["below"] += 1
        else:
            points.append(pos)
    pts = np.array(points)
    reach = np.linalg.norm(pts - shoulder, axis=1)
    keep = rng.choice(len(pts), size=min(WORKSPACE_POINTS_KEPT, len(pts)), replace=False)
    estimate = WorkspaceEstimate(
        method="uniform joint-space sampling within limits; FK + MuJoCo collision check",
        seed=seed,
        samples_requested=n,
        samples_collision_free=len(pts),
        rejected_self_collision=counts["self"],
        rejected_floor_or_env=counts["env"],
        rejected_below_floor=counts["below"],
        bounds_min=_vec(pts.min(axis=0)),
        bounds_max=_vec(pts.max(axis=0)),
        max_reach_m=float(reach.max()),
        median_reach_m=float(np.median(reach)),
        reach_reference=f"distance from {adapter.joints[0].name} axis anchor {_vec(shoulder)}",
        points=[_vec(p) for p in pts[keep]],
    )
    return estimate, pts


def probe_ik(adapter: RobotAdapter, pts: np.ndarray, seed: int) -> CapabilityEvidence:
    rng = np.random.default_rng(seed + 1)
    targets = pts[rng.choice(len(pts), size=min(IK_PROBES, len(pts)), replace=False)]
    results = [
        solve_ik(adapter, t, make_seeds(adapter, IK_SEEDS_PER_PROBE, rng)) for t in targets
    ]
    successes = [r for r in results if r.success]
    return CapabilityEvidence(
        task_type="position_ik",
        status="measured",
        provenance="measured",
        evidence={
            "probes": len(results),
            "successes": len(successes),
            "success_rate": len(successes) / max(1, len(results)),
            "median_error_m": float(np.median([r.position_error_m for r in results])),
            "median_iterations": float(np.median([r.iterations for r in results])),
            "seeds_per_probe": IK_SEEDS_PER_PROBE,
            "tolerance_m": 1e-3,
        },
        note="Probe targets are FK samples (reachable by construction); this measures "
        "solver reliability with collision rejection, not task success.",
    )


def _limit(r: tuple[float, float]) -> tuple[float, float] | None:
    return r if np.isfinite(r).all() else None


def build_passport(decl: RobotDecl, adapter: RobotAdapter, seed: int = 0) -> RobotPassport:
    t0 = time.perf_counter()
    model = adapter.model
    data = adapter.new_data()
    workspace, pts = sample_workspace(adapter, seed)
    ik_cap = probe_ik(adapter, pts, seed)
    ee = decl.end_effector
    ee_body = model.body(adapter.ee_body_id).name
    return RobotPassport(
        robot_id=decl.robot_id,
        display_name=decl.display_name,
        short_name=decl.short_name,
        model_source=f"mujoco_menagerie/{decl.model_dir}" if decl.source == "menagerie"
        else f"uploaded by {decl.uploaded_by or 'a visitor'}",
        model_version=f"menagerie@{MENAGERIE_COMMIT[:12]}" if decl.source == "menagerie"
        else f"upload@{model_dir_hash(decl.model_path)[:12]}",
        model_file=f"{decl.model_dir}/{decl.scene_xml}" if decl.source == "menagerie" else decl.scene_xml,
        model_hash=model_dir_hash(decl.model_path),
        mujoco_version=mujoco.__version__,
        fallback_model=decl.fallback_model,
        joint_names=[model.joint(j).name for j in range(model.njnt)],
        arm_joints=[JointInfo(**_joint_fields(j)) for j in adapter.joints],
        dof=adapter.dof,
        actuators=[ActuatorInfo(**{**a.__dict__, "ctrl_range": _limit(a.ctrl_range), "force_range": _limit(a.force_range)})
                   for a in adapter.actuators],
        resting_contacts_excluded=[f"{b1}↔{b2}" for b1, b2 in resting_self_contacts(decl)],
        end_effector=EndEffectorInfo(
            site_name=ee.site_name,
            parent_body=ee_body,
            source="model" if ee.exists_in_model else "added_by_nimbotics",
            offset_m=_vec(model.site_pos[adapter.ee_site_id]),
            home_position=_vec(adapter.fk(data)),
            note=ee.note,
        ),
        base_frame={
            "body": model.body(adapter.base_body_id).name,
            "position": list(_vec(adapter.base_position(data))),
            "convention": "world frame == robot base frame; +z up",
        },
        tool_type=decl.tool_type,
        home_qpos=[float(v) for v in adapter.home_q()],
        workspace=workspace,
        capabilities=[
            ik_cap,
            CapabilityEvidence(
                task_type="obstacle_aware_reach",
                status="unverified",
                provenance="declared",
                evidence={},
                note="No verified obstacle-aware reach run yet; set from recorded runs.",
            ),
        ],
        simulation_assumptions=_assumptions(model),
        calibration_status="uncalibrated: simulation model only, no real-robot data",
        field_provenance=_field_provenance(ee.exists_in_model),
        created_at=datetime.now(UTC),
        compute_seconds=time.perf_counter() - t0,
    )


def _joint_fields(j) -> dict:
    return {
        "name": j.name,
        "joint_id": j.joint_id,
        "joint_type": j.joint_type,
        "limited": j.limited,
        "lower": j.lower,
        "upper": j.upper,
    }


def _assumptions(model: mujoco.MjModel) -> list[str]:
    return [
        f"MuJoCo {mujoco.__version__}, timestep {model.opt.timestep}s, "
        f"integrator {mujoco.mjtIntegrator(model.opt.integrator).name}",
        "Arm driven through the model's own position servos; setpoints offset by "
        "MuJoCo qfrc_bias / kp (gravity + Coriolis feed-forward)",
        f"Joint-space interpolation capped at {MAX_JOINT_SPEED_RAD_S} rad/s per joint",
        f"Reach success requires endpoint error < {REACH_TOLERANCE_M} m, zero robot contacts "
        "with obstacles/floor/self, and no joint-limit violations",
        "Collision geometry = the Menagerie model's collision geoms; no payload, friction, "
        "or real-world safety properties are claimed",
    ]


def _field_provenance(ee_in_model: bool) -> dict[str, str]:
    return {
        "display_name": "declared",
        "tool_type": "declared",
        "model_hash": "measured",
        "joint_names": "model",
        "arm_joints": "model",
        "dof": "model",
        "actuators": "model",
        "end_effector": "model" if ee_in_model else "declared",
        "base_frame": "model",
        "home_qpos": "model",
        "workspace": "measured",
        "capabilities": "measured",
    }


def _vec(v) -> tuple[float, float, float]:
    return (float(v[0]), float(v[1]), float(v[2]))
