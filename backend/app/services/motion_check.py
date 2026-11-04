"""M1 motion check: jog one joint, solve IK to a target, execute in MuJoCo, verify.

This is a capability check for a single robot, not a skill: the path is a
direct joint-space move with no obstacle.
"""

from __future__ import annotations

import numpy as np

from app.config import ARTIFACT_DIR, REACH_TOLERANCE_M
from app.models.run import RunRecord
from app.services.jobs import RunContext
from app.services.kinematics import make_seeds, solve_ik
from app.services.render import FrameRecorder
from app.services.robot_adapter import RobotAdapter
from app.services.robot_catalog import get_robot_decl
from app.services.scene import SceneSpec, build_model
from app.services.simulation import execute_path, screen_path

DEFAULT_TARGET = (0.40, 0.25, 0.30)


def default_target(robot_id: str) -> tuple[float, float, float]:
    """DEFAULT_TARGET from the arm's base, or from an uploaded arm's mount (task_scene.default_placement)."""
    decl = get_robot_decl(robot_id)
    if decl.mount is None:
        return DEFAULT_TARGET
    x, y, z, yaw = decl.mount
    facing = round(yaw / (np.pi / 2)) % 4 * (np.pi / 2)
    c, s = np.cos(facing), np.sin(facing)
    tx, ty, tz = DEFAULT_TARGET
    return (float(x + c * tx - s * ty), float(y + s * tx + c * ty), float(z + tz))
JOG_RAD = 0.35
JOG_TOLERANCE_RAD = 2e-3
IK_SEEDS = 8


def motion_check(
    ctx: RunContext, robot_id: str, target: tuple[float, float, float], seed: int
) -> RunRecord:
    decl = get_robot_decl(robot_id)
    ctx.event("profiling", f"Loading {decl.short_name} with target marker", target=list(target))
    adapter = RobotAdapter(decl, build_model(decl, SceneSpec(target=target)))
    home = adapter.home_q()
    jog = home.copy()
    jog[0] = float(np.clip(home[0] + JOG_RAD, adapter.lower[0], adapter.upper[0]))

    ctx.event("planning", "Solving position IK (damped least squares, multi-seed)")
    ik = solve_ik(adapter, np.array(target), make_seeds(adapter, IK_SEEDS, np.random.default_rng(seed)))
    ik_summary = {k: v for k, v in ik.__dict__.items() if k != "q"} | {"q": list(ik.q)}
    if not ik.success:
        return ctx.finish(False, "IK found no collision-free solution", results={"ik": ik_summary})
    ctx.event("checking", "Kinematic collision screening of joint path", ik=ik_summary)
    path = [home, jog, home, np.array(ik.q)]
    screened = screen_path(adapter, path)
    if screened:
        return ctx.finish(
            False,
            "Path rejected by collision screening",
            results={"ik": ik_summary, "screening_contacts": [c.__dict__ for c in screened]},
        )
    return _execute_and_verify(ctx, adapter, path, target, ik_summary)


def _execute_and_verify(
    ctx: RunContext,
    adapter: RobotAdapter,
    path: list[np.ndarray],
    target: tuple[float, float, float],
    ik_summary: dict,
) -> RunRecord:
    home, jog = path[0], path[1]
    out_dir = ARTIFACT_DIR / "runs" / ctx.run_id
    data = adapter.new_data()
    ctx.event("executing", f"Jogging {adapter.joints[0].name} by {jog[0] - home[0]:+.3f} rad")
    with FrameRecorder(adapter.model, on_frame=ctx.live("Jog, return home, then reach")) as rec:
        jog_res = execute_path(adapter, data, [home, jog], frame_hook=rec.capture)
        achieved = jog_res.final_q[0] - float(home[0])
        ctx.event("executing", "Returning home, then executing IK reach")
        reach = execute_path(adapter, data, [jog, home, path[3]], frame_hook=rec.capture)
        video = rec.save_mp4(out_dir / "motion.mp4")
        poster = rec.save_png(rec.frames[-1], out_dir / "final.png")

    ctx.event("verifying", "Checking endpoint error, contacts and joint limits")
    err = float(np.linalg.norm(np.array(reach.final_ee_pos) - np.array(target)))
    collisions = [*jog_res.collisions, *reach.collisions]
    jog_ok = abs(achieved - (jog[0] - home[0])) < JOG_TOLERANCE_RAD
    checks = {
        "jog_tracked": jog_ok,
        "endpoint_within_tolerance": err < REACH_TOLERANCE_M,
        "no_collisions": not collisions,
        "no_limit_violations": not (jog_res.limit_violations or reach.limit_violations),
        "settled": reach.settled,
    }
    checks = {k: bool(v) for k, v in checks.items()}
    success = all(checks.values())
    failed = [k for k, v in checks.items() if not v]
    return ctx.finish(
        success,
        "Motion check passed" if success else f"Motion check failed: {', '.join(failed)}",
        simulated_seconds=jog_res.simulated_seconds + reach.simulated_seconds,
        collision_count=len(collisions),
        endpoint_error_m=err,
        results={
            "target": list(target),
            "final_ee_pos": list(reach.final_ee_pos),
            "ik": ik_summary,
            "jog": {
                "joint": adapter.joints[0].name,
                "commanded_rad": float(jog[0] - home[0]),
                "achieved_rad": achieved,
            },
            "checks": checks,
            "collisions": [
                {"sim_time": e.sim_time, **e.contact.__dict__} for e in collisions
            ],
            "limit_violations": sorted({*jog_res.limit_violations, *reach.limit_violations}),
            "step_count": jog_res.step_count + reach.step_count,
            "settle_seconds": reach.settle_seconds,
            "ee_trace": [list(p) for p in reach.ee_trace],
            "tolerance_m": REACH_TOLERANCE_M,
        },
        artifacts={
            "video": _artifact_url(video),
            "poster": _artifact_url(poster),
        },
    )


def _artifact_url(path) -> str:
    return "/artifacts/" + path.relative_to(ARTIFACT_DIR).as_posix()
