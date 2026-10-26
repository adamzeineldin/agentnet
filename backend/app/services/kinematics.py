"""Position inverse kinematics: damped least squares + joint-limit clamping.

Redundant DOF are biased toward a rest posture through the Jacobian null
space. Multiple seeds are tried; unsolved targets are reported as failures,
never silently accepted.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.services.robot_adapter import RobotAdapter


@dataclass(frozen=True)
class IKResult:
    success: bool
    q: tuple[float, ...]
    position_error_m: float
    iterations: int
    seed_index: int
    seeds_tried: int
    in_collision: bool


def make_seeds(adapter: RobotAdapter, count: int, rng: np.random.Generator) -> list[np.ndarray]:
    """Home pose first, then uniform random configurations within limits."""
    seeds = [adapter.home_q()]
    for _ in range(max(0, count - 1)):
        seeds.append(rng.uniform(adapter.lower, adapter.upper))
    return seeds


def _solve_from_seed(
    adapter: RobotAdapter,
    data,
    target: np.ndarray,
    seed: np.ndarray,
    q_rest: np.ndarray,
    tol: float,
    max_iters: int,
    damping: float,
    max_step: float,
    nullspace_gain: float,
) -> tuple[np.ndarray, float, int]:
    q = np.clip(seed.copy(), adapter.lower, adapter.upper)
    err_norm = np.inf
    for it in range(1, max_iters + 1):
        pos = adapter.fk(data, q)
        err = target - pos
        err_norm = float(np.linalg.norm(err))
        if err_norm < tol:
            return q, err_norm, it
        jac = adapter.ee_jacobian_pos(data)
        jjt = jac @ jac.T + (damping**2) * np.eye(3)
        dq = jac.T @ np.linalg.solve(jjt, err)
        jac_pinv = jac.T @ np.linalg.inv(jac @ jac.T + 1e-6 * np.eye(3))
        null_proj = np.eye(adapter.dof) - jac_pinv @ jac
        dq = dq + null_proj @ (nullspace_gain * (q_rest - q))
        step = float(np.max(np.abs(dq)))
        if step > max_step:
            dq = dq * (max_step / step)
        q = np.clip(q + dq, adapter.lower, adapter.upper)
    pos = adapter.fk(data, q)
    return q, float(np.linalg.norm(target - pos)), max_iters


def solve_ik(
    adapter: RobotAdapter,
    target: np.ndarray,
    seeds: list[np.ndarray],
    q_rest: np.ndarray | None = None,
    tol: float = 1e-3,
    max_iters: int = 300,
    damping: float = 0.05,
    max_step: float = 0.15,
    nullspace_gain: float = 0.05,
    reject_collisions: bool = True,
) -> IKResult:
    """Try each seed until a collision-free solution within tol is found."""
    data = adapter.new_data()
    target = np.asarray(target, dtype=float)
    rest = adapter.home_q() if q_rest is None else np.asarray(q_rest, dtype=float)
    best: IKResult | None = None
    for i, seed in enumerate(seeds):
        q, err, iters = _solve_from_seed(
            adapter, data, target, seed, rest, tol, max_iters, damping, max_step, nullspace_gain
        )
        collides = bool(adapter.check_configuration(data, q)) if reject_collisions else False
        result = IKResult(
            success=err < tol and not collides and adapter.within_limits(q),
            q=tuple(float(v) for v in q),
            position_error_m=err,
            iterations=iters,
            seed_index=i,
            seeds_tried=i + 1,
            in_collision=collides,
        )
        if result.success:
            return result
        if best is None or result.position_error_m < best.position_error_m:
            best = result
    assert best is not None, "solve_ik requires at least one seed"
    return IKResult(**{**best.__dict__, "seeds_tried": len(seeds)})
