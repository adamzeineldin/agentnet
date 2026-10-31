"""Physics execution of joint-space paths through the robot's own actuators.

Paths are interpolated under a joint-speed limit and streamed to the position
servos as ctrl targets; MuJoCo integrates the dynamics with mj_step. Every
contact, joint-limit violation and end-effector sample comes from the
simulated state, never from the commanded path.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import mujoco
import numpy as np

from app.config import (
    MAX_JOINT_SPEED_RAD_S,
    MAX_SETTLE_SECONDS,
    SETTLE_Q_TOL_RAD,
    SETTLE_QVEL_TOL,
    VIDEO_FPS,
)
from app.services.robot_adapter import Contact, RobotAdapter

FrameHook = Callable[[mujoco.MjData], None]


@dataclass(frozen=True)
class CollisionEvent:
    sim_time: float
    contact: Contact


@dataclass(frozen=True)
class ExecutionResult:
    final_q: tuple[float, ...]
    final_ee_pos: tuple[float, float, float]
    ee_trace: tuple[tuple[float, float, float], ...]
    collisions: tuple[CollisionEvent, ...]
    max_penetration_m: float
    limit_violations: tuple[str, ...]
    simulated_seconds: float
    step_count: int
    settle_seconds: float
    settled: bool


def interpolate_path(
    waypoints: list[np.ndarray], timestep: float, max_speed: float = MAX_JOINT_SPEED_RAD_S
) -> np.ndarray:
    """Linear joint interpolation; each segment's duration set by its largest joint move."""
    if len(waypoints) < 2:
        return np.array(waypoints)
    samples: list[np.ndarray] = [waypoints[0]]
    for a, b in zip(waypoints[:-1], waypoints[1:], strict=True):
        duration = float(np.max(np.abs(b - a))) / max_speed
        steps = max(1, int(np.ceil(duration / timestep)))
        for k in range(1, steps + 1):
            samples.append(a + (b - a) * (k / steps))
    return np.array(samples)


class _StepRecorder:
    """Accumulates per-step observations from the simulated state."""

    def __init__(self, adapter: RobotAdapter, trace_every: int) -> None:
        self.adapter = adapter
        self.trace_every = trace_every
        self.seen: dict[tuple[str, str], CollisionEvent] = {}
        self.max_pen = 0.0
        self.violations: set[str] = set()
        self.trace: list[tuple[float, float, float]] = []

    def observe(self, data: mujoco.MjData, step: int) -> None:
        for c in self.adapter.contacts(data):
            key = tuple(sorted((c.geom1, c.geom2)))
            self.max_pen = max(self.max_pen, -c.distance)
            self.seen.setdefault(key, CollisionEvent(sim_time=float(data.time), contact=c))
        self.violations.update(self.adapter.limit_violations(self.adapter.arm_q(data)))
        if step % self.trace_every == 0:
            self.trace.append(tuple(float(v) for v in self.adapter.fk(data)))


def _settled(adapter: RobotAdapter, data: mujoco.MjData, q_goal: np.ndarray) -> bool:
    q_err = np.max(np.abs(adapter.arm_q(data) - q_goal))
    qvel = np.max(np.abs(data.qvel[adapter.dof_idx]))
    return bool(q_err < SETTLE_Q_TOL_RAD and qvel < SETTLE_QVEL_TOL)


def execute_path(
    adapter: RobotAdapter,
    data: mujoco.MjData,
    waypoints: list[np.ndarray],
    frame_hook: FrameHook | None = None,
    frame_every: int | None = None,
    trace_every: int = 10,
    max_settle_seconds: float = MAX_SETTLE_SECONDS,
    gravity_comp: bool = True,
    max_speed: float = MAX_JOINT_SPEED_RAD_S,
) -> ExecutionResult:
    """Execute waypoints from the current state of `data` and record what happened.

    After the last interpolated setpoint the servos keep tracking the final
    waypoint until joints settle (or max_settle_seconds elapses).
    """
    model = adapter.model
    dt = model.opt.timestep
    # One frame per video frame interval (17 steps at 2 ms and 30 fps).
    frame_every = frame_every or max(1, round(1.0 / (VIDEO_FPS * dt)))
    path = interpolate_path(waypoints, dt, max_speed)
    max_steps = len(path) + int(max_settle_seconds / dt)
    recorder = _StepRecorder(adapter, trace_every)
    step = 0
    while step < max_steps:
        q_cmd = path[min(step, len(path) - 1)]
        data.ctrl[adapter.actuator_idx] = adapter.servo_command(data, q_cmd, gravity_comp)
        mujoco.mj_step(model, data)
        recorder.observe(data, step)
        if frame_hook is not None and step % frame_every == 0:
            frame_hook(data)
        step += 1
        if step >= len(path) and _settled(adapter, data, path[-1]):
            break
    if frame_hook is not None:
        frame_hook(data)
    final_pos = adapter.fk(data)
    return ExecutionResult(
        final_q=tuple(float(v) for v in adapter.arm_q(data)),
        final_ee_pos=(float(final_pos[0]), float(final_pos[1]), float(final_pos[2])),
        ee_trace=tuple(recorder.trace),
        collisions=tuple(recorder.seen.values()),
        max_penetration_m=recorder.max_pen,
        limit_violations=tuple(sorted(recorder.violations)),
        simulated_seconds=step * dt,
        step_count=step,
        settle_seconds=max(0, step - len(path)) * dt,
        settled=_settled(adapter, data, path[-1]),
    )


def screen_path(
    adapter: RobotAdapter, waypoints: list[np.ndarray], check_every: int = 5
) -> list[Contact]:
    """Kinematic (no dynamics) collision screening along a densely interpolated path."""
    data = adapter.new_data()
    path = interpolate_path(waypoints, adapter.model.opt.timestep)
    found: dict[tuple[str, str], Contact] = {}
    for i in range(0, len(path), check_every):
        for c in adapter.check_configuration(data, path[i]):
            found.setdefault(tuple(sorted((c.geom1, c.geom2))), c)
    for c in adapter.check_configuration(data, path[-1]):
        found.setdefault(tuple(sorted((c.geom1, c.geom2))), c)
    return list(found.values())
