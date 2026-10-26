"""Multi-candidate obstacle-aware reach planning.

Candidates are task-space route classes (direct / over / near_side / far_side)
at several clearances. Each is densified, solved with IK point-by-point
(seeded by the previous solution for continuity), screened for collisions at
dense joint-space intervals, and measured for minimum link-obstacle distance.
Every rejection is kept with its reason.
"""

from __future__ import annotations

from dataclasses import dataclass

import mujoco
import numpy as np

from app.models.skill import CandidateSummary, Placement, RouteClass, TaskSpec, Vec3
from app.services.kinematics import solve_ik
from app.services.robot_adapter import RobotAdapter
from app.services.scene import OBSTACLE_PREFIX
from app.services.simulation import interpolate_path, screen_path
from app.services.task_scene import base_to_task, task_to_base, to_vec3

DEFAULT_CLEARANCES = (0.04, 0.08, 0.12)
DENSIFY_STEP_M = 0.02
MAX_JOINT_JUMP_RAD = 0.25
MIN_CLEARANCE_M = 0.01
EE_LENGTH_WEIGHT = 1.0  # cost = joint path (rad) + EE_LENGTH_WEIGHT * EE path (m)
CLEARANCE_STRIDE = 25


@dataclass(frozen=True)
class RouteCandidate:
    candidate_id: str
    route_class: RouteClass
    clearance_m: float
    waypoints_task: tuple[Vec3, ...]


@dataclass(frozen=True)
class PlannedCandidate:
    summary: CandidateSummary
    joint_path: tuple[tuple[float, ...], ...] | None


def route_waypoints(task: TaskSpec, route_class: RouteClass, clearance: float) -> tuple[Vec3, ...]:
    s, t = task.start, task.target
    lo = np.min([o.lo for o in task.obstacles], axis=0)
    hi = np.max([o.hi for o in task.obstacles], axis=0)
    if route_class == "direct":
        return (s, t)
    if route_class == "over":
        z = float(hi[2] + clearance)
        return (s, (s[0], s[1], z), (t[0], t[1], z), t)
    x = float(lo[0] - clearance) if route_class == "near_side" else float(hi[0] + clearance)
    return (s, (x, s[1], s[2]), (x, t[1], t[2]), t)


def generate_candidates(
    task: TaskSpec,
    route_classes: tuple[RouteClass, ...] = ("direct", "over", "near_side", "far_side"),
    clearances: tuple[float, ...] = DEFAULT_CLEARANCES,
) -> list[RouteCandidate]:
    out: list[RouteCandidate] = []
    for rc in route_classes:
        for c in (0.0,) if rc == "direct" else clearances:
            out.append(
                RouteCandidate(
                    candidate_id=f"{rc}@{c:.2f}",
                    route_class=rc,
                    clearance_m=c,
                    waypoints_task=route_waypoints(task, rc, c),
                )
            )
    return out


def densify(points: np.ndarray, step: float = DENSIFY_STEP_M) -> np.ndarray:
    dense = [points[0]]
    for a, b in zip(points[:-1], points[1:], strict=True):
        n = max(1, int(np.ceil(np.linalg.norm(b - a) / step)))
        dense.extend(a + (b - a) * (k / n) for k in range(1, n + 1))
    return np.array(dense)


def solve_start(adapter: RobotAdapter, task: TaskSpec, placement: Placement, seeds) -> np.ndarray | None:
    start = task_to_base(task.start, placement)
    ik = solve_ik(adapter, start, seeds)
    return np.array(ik.q) if ik.success else None


def ik_track(
    adapter: RobotAdapter, base_points: np.ndarray, q_start: np.ndarray
) -> tuple[list[np.ndarray] | None, str]:
    """IK each dense point seeded by the previous solution; fail on unreachable or jumps."""
    path = [q_start]
    for i, p in enumerate(base_points[1:], start=1):
        ik = solve_ik(adapter, p, [path[-1]], q_rest=q_start, max_iters=150, reject_collisions=False)
        if not ik.success:
            return None, f"unreachable:{i}:{ik.position_error_m:.4f}"
        q = np.array(ik.q)
        jump = float(np.max(np.abs(q - path[-1])))
        if jump > MAX_JOINT_JUMP_RAD:
            return None, f"discontinuous:{i}:{jump:.3f}"
        path.append(q)
    return path, "ok"


def _collision_geoms(adapter: RobotAdapter) -> tuple[list[int], list[int]]:
    m = adapter.model
    robot, obstacles = [], []
    for g in range(m.ngeom):
        if not (m.geom_contype[g] or m.geom_conaffinity[g]):
            continue
        if int(m.geom_bodyid[g]) in adapter.robot_body_ids:
            robot.append(g)
        elif m.geom(g).name.startswith(OBSTACLE_PREFIX):
            obstacles.append(g)
    return robot, obstacles


def min_clearance(adapter: RobotAdapter, q_path: list[np.ndarray]) -> float:
    """Smallest signed distance between any robot collision geom and any obstacle."""
    robot, obstacles = _collision_geoms(adapter)
    if not obstacles:
        return float("inf")
    data = adapter.new_data()
    dense = interpolate_path(q_path, adapter.model.opt.timestep)
    best = float("inf")
    for q in [*dense[::CLEARANCE_STRIDE], dense[-1]]:
        adapter.set_arm_q(data, q)
        mujoco.mj_kinematics(adapter.model, data)
        for g in robot:
            for o in obstacles:
                best = min(best, mujoco.mj_geomDistance(adapter.model, data, g, o, 0.3, None))
    return float(best)


def path_lengths(adapter: RobotAdapter, q_path: list[np.ndarray]) -> tuple[float, float]:
    qs = np.array(q_path)
    joint_len = float(np.sum(np.max(np.abs(np.diff(qs, axis=0)), axis=1)))
    data = adapter.new_data()
    ee = np.array([adapter.fk(data, q) for q in q_path])
    return joint_len, float(np.sum(np.linalg.norm(np.diff(ee, axis=0), axis=1)))


def evaluate_candidate(
    adapter: RobotAdapter,
    cand: RouteCandidate,
    placement: Placement,
    q_start: np.ndarray,
) -> PlannedCandidate:
    """Kinematic stages only (IK, continuity, screening, clearance); physics happens later."""
    base = densify(np.array([task_to_base(p, placement) for p in cand.waypoints_task]))
    common = {
        "candidate_id": cand.candidate_id,
        "route_class": cand.route_class,
        "clearance_m": cand.clearance_m,
        "waypoints_task": list(cand.waypoints_task),
    }
    q_path, status = ik_track(adapter, base, q_start)
    if q_path is None:
        kind, idx, val = status.split(":")
        if kind == "unreachable":
            reason = f"IK failed at dense point {idx}/{len(base) - 1} (residual {float(val) * 1000:.1f} mm)"
            return PlannedCandidate(CandidateSummary(**common, stage_reached="ik", outcome="unreachable", reason=reason), None)
        reason = f"IK branch jump of {val} rad at dense point {idx} (limit {MAX_JOINT_JUMP_RAD})"
        return PlannedCandidate(CandidateSummary(**common, stage_reached="continuity", outcome="discontinuous_ik", reason=reason), None)

    joint_len, ee_len = path_lengths(adapter, q_path)
    metrics = {"joint_path_length_rad": joint_len, "ee_path_length_m": ee_len}
    contacts = screen_path(adapter, q_path, check_every=3)
    if contacts:
        pairs = sorted({f"{c.body1}↔{c.body2} ({c.category})" for c in contacts})
        return PlannedCandidate(
            CandidateSummary(
                **common, **metrics, stage_reached="screening", outcome="collision",
                reason="Kinematic screening found contact: " + "; ".join(pairs[:3]),
                contacts=[c.__dict__ for c in contacts[:8]],
            ),
            None,
        )
    clearance = min_clearance(adapter, q_path)
    if clearance < MIN_CLEARANCE_M:
        return PlannedCandidate(
            CandidateSummary(
                **common, **metrics, min_clearance_m=clearance, stage_reached="clearance",
                outcome="insufficient_clearance",
                reason=f"Min link-obstacle distance {clearance * 1000:.1f} mm < {MIN_CLEARANCE_M * 1000:.0f} mm",
            ),
            None,
        )
    cost = joint_len + EE_LENGTH_WEIGHT * ee_len
    return PlannedCandidate(
        CandidateSummary(
            **common, **metrics, min_clearance_m=clearance, cost=cost,
            stage_reached="clearance", outcome="feasible",
            reason=f"Passed IK, continuity, screening; clearance {clearance * 1000:.1f} mm",
        ),
        tuple(tuple(float(v) for v in q) for q in q_path),
    )


def base_waypoints_to_task(points: list[np.ndarray], placement: Placement) -> list[Vec3]:
    return [to_vec3(base_to_task(p, placement)) for p in points]
