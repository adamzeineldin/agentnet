"""Replay a recorded real-robot end-effector path in MuJoCo, on the recording robot or another embodiment.

What carries over: the recorded end-effector positions (task geometry), never joint angles (DROID positions are
Cartesian anyway). The chosen robot stands where the recording robot stood, re-solves its own IK along the path,
is screened for contacts, executes through its own servos in MuJoCo, and is measured against the recorded path.
"""

from __future__ import annotations

import numpy as np

from app.config import ARTIFACT_DIR, MAX_JOINT_SPEED_RAD_S
from app.models.real_data import RealDataset, RealEpisode
from app.models.run import RunRecord
from app.services.candidate_search import artifact_url, physics_rollout
from app.services.controller.step import controller_step
from app.services.jobs import RunContext
from app.services.kinematics import make_seeds, solve_ik
from app.services.render import CameraView, FrameRecorder
from app.services.robot_adapter import RobotAdapter
from app.services.robot_catalog import get_robot_decl
from app.services.route_planner import DENSIFY_STEP_M, ik_track
from app.services.scene import SceneSpec, build_model
from app.services.simulation import screen_path

PLANNER_NAME = "real_replay_v1"
START_SEEDS = 8
PATH_TOL_M = 0.01  # simulated end effector must stay within this of every recorded point
MAX_PLOT_POINTS = 200
MAX_MARKERS = 24
MIN_REPLAY_SPEED_RAD_S = 0.1
TRACE_EVERY_STEPS = 2


def replay_speed(q_path, recorded_duration_s: float) -> float:
    """Joint speed limit that spreads the joint motion over the recorded duration (capped at the normal limit)."""
    joint_len = float(np.sum(np.max(np.abs(np.diff(np.array(q_path), axis=0)), axis=1)))
    return float(np.clip(joint_len / max(recorded_duration_s, 1e-6), MIN_REPLAY_SPEED_RAD_S, MAX_JOINT_SPEED_RAD_S))


def resample_path(xyz: np.ndarray, step: float = DENSIFY_STEP_M) -> np.ndarray:
    """Arc-length resampling every `step` m: keeps the recorded shape, drops pauses."""
    seg = np.linalg.norm(np.diff(xyz, axis=0), axis=1)
    dist = np.concatenate([[0.0], np.cumsum(seg)])
    n = max(2, int(np.ceil(dist[-1] / step)) + 1)
    s = np.linspace(0.0, dist[-1], n)
    return np.stack([np.interp(s, dist, xyz[:, k]) for k in range(3)], axis=1)


def path_deviation(trace: np.ndarray, recorded: np.ndarray) -> tuple[float, float]:
    """(max, mean) distance from each recorded point to the nearest simulated end-effector sample."""
    d = np.linalg.norm(recorded[:, None, :] - trace[None, :, :], axis=2).min(axis=1)
    return float(d.max()), float(d.mean())


def thin(points: np.ndarray, limit: int) -> list[list[float]]:
    idx = np.unique(np.linspace(0, len(points) - 1, min(len(points), limit)).round().astype(int))
    return [[round(float(v), 5) for v in points[i]] for i in idx]


def replay_episode(
    ctx: RunContext, dataset: RealDataset, episode: RealEpisode, robot_id: str, execute_on: str = "none"
) -> RunRecord:
    decl = get_robot_decl(robot_id)
    src = dataset.source
    same_robot = robot_id == src.recorded_robot_id
    recorded = np.array(episode.ee_xyz, dtype=float)
    path = resample_path(recorded)
    base = {
        "real_data": {"dataset_id": src.dataset_id, "title": src.title, "url": src.url, "revision": src.revision,
                      "license": src.license, "recorded_robot": src.recorded_robot, "episode_index":
                      episode.episode_index, "task": episode.task, "recorded_frames": episode.frames,
                      "recorded_duration_s": episode.duration_s, "fps": src.fps},
        "embodiment": "same robot as recorded" if same_robot else f"retargeted from {src.recorded_robot}",
        "recorded_path": thin(recorded, MAX_PLOT_POINTS),
        "path_points": len(path),
    }
    ctx.event("retrieving", f"Loaded real episode {episode.episode_index} of {src.title}: “{episode.task}” "
              f"({episode.frames} frames, {episode.duration_s:.1f} s, recorded on {src.recorded_robot})")
    adapter = RobotAdapter(decl, build_model(decl))
    ctx.event("profiling", f"{decl.short_name} stands where the recording robot stood; resampled the recorded "
              f"end-effector path to {len(path)} points every {DENSIFY_STEP_M * 100:.0f} cm")

    seeds = make_seeds(adapter, START_SEEDS, np.random.default_rng(episode.episode_index))
    start = solve_ik(adapter, path[0], seeds)
    if not start.success:
        return ctx.finish(False, f"{decl.short_name} has no collision-free IK for the recorded start "
                          f"(residual {start.position_error_m * 1000:.1f} mm)", results=base)
    ctx.event("checking", f"Tracking the recorded path with {decl.short_name} IK (position-only)")
    q_path, status = ik_track(adapter, path, np.array(start.q))
    if q_path is None:
        kind, idx, val = status.split(":")
        why = (f"IK could not reach recorded point {idx}/{len(path) - 1} (residual {float(val) * 1000:.1f} mm)"
               if kind == "unreachable" else f"IK branch jump of {val} rad at recorded point {idx}")
        return ctx.finish(False, f"{decl.short_name} cannot follow the recorded path: {why}", results=base)
    contacts = screen_path(adapter, q_path, check_every=3)
    if contacts:
        pairs = sorted({f"{c.body1}↔{c.body2}" for c in contacts})
        return ctx.finish(False, "Kinematic screening found contact: " + "; ".join(pairs[:3]),
                          results={**base, "contacts": [c.__dict__ for c in contacts[:8]]})
    speed = replay_speed(q_path, episode.duration_s)
    return _execute(ctx, adapter, decl, path, q_path, {**base, "replay_joint_speed_rad_s": speed}, execute_on, speed)


def _execute(
    ctx, adapter: RobotAdapter, decl, path: np.ndarray, q_path, base: dict, execute_on: str, speed: float
) -> RunRecord:
    ctx.event("executing", f"Executing {len(q_path)} joint waypoints through {decl.short_name}'s servos in MuJoCo "
              f"at up to {speed:.2f} rad/s (paced to the recorded duration)")
    markers = tuple(tuple(float(v) for v in p) for p in thin(path, MAX_MARKERS))
    render_adapter = RobotAdapter(decl, build_model(decl, SceneSpec(target=markers[-1], waypoint_markers=markers)))
    center = path.mean(axis=0)
    view = CameraView(lookat=(float(center[0]), float(center[1]), float(center[2])), distance=1.7)
    out_dir = ARTIFACT_DIR / "runs" / ctx.run_id
    with FrameRecorder(render_adapter.model, view) as rec:
        res, phys = physics_rollout(render_adapter, np.array(q_path[0]), q_path, path[-1], frame_hook=rec.capture,
                                    max_speed=speed, trace_every=TRACE_EVERY_STEPS)
        video = rec.save_mp4(out_dir / "execution.mp4")
        poster = rec.save_png(rec.frames[-1], out_dir / "final.png")

    ctx.event("verifying", "Comparing the simulated end-effector path with the recorded real path")
    trace = np.array(res.ee_trace)
    max_dev, mean_dev = path_deviation(trace, path)
    checks = {**phys["checks"], "follows_recorded_path": max_dev <= PATH_TOL_M}
    success = all(checks.values())
    extra = (controller_step(ctx, adapter, decl, path[-1], speed)([tuple(q) for q in q_path])
             if success and execute_on == "ursim" else {})
    failed = [k for k, v in checks.items() if not v]
    return ctx.finish(
        success,
        (f"Real path reproduced in simulation: max deviation {max_dev * 1000:.1f} mm, 0 contacts" if success
         else f"Replay failed: {', '.join(failed)}"),
        simulated_seconds=res.simulated_seconds, collision_count=len(res.collisions),
        endpoint_error_m=phys["endpoint_error_m"],
        results={**base, **extra, "execution": phys, "checks": checks, "joint_path_dof": adapter.dof,
                 "path_deviation": {"max_m": max_dev, "mean_m": mean_dev, "tolerance_m": PATH_TOL_M},
                 "simulated_path": thin(trace, MAX_PLOT_POINTS)},
        artifacts={"video": artifact_url(video), "poster": artifact_url(poster)},
    )
