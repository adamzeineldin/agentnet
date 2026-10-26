"""Source skill discovery: search candidate routes, verify in MuJoCo physics, draft a capsule.

The capsule is only drafted here; publishing to the registry is a separate,
explicit step (POST /api/skills) that requires a succeeded discover run.
"""

from __future__ import annotations

import numpy as np

from app.config import ARTIFACT_DIR, REACH_TOLERANCE_M
from app.models.robot import RobotPassport
from app.models.run import RunRecord
from app.models.skill import CandidateSummary, Placement, TaskSpec
from app.services.capsules import build_capsule, compact_outcomes
from app.services.jobs import RunContext
from app.services.kinematics import make_seeds
from app.services.render import CameraView, FrameRecorder
from app.services.robot_adapter import RobotAdapter
from app.services.robot_catalog import get_robot_decl
from app.services.route_planner import (
    PlannedCandidate,
    evaluate_candidate,
    generate_candidates,
    solve_start,
)
from app.services.scene import build_model
from app.services.simulation import ExecutionResult, execute_path
from app.services.task_scene import DEFAULT_PLACEMENTS, generate_task, task_to_base, world_scene

MAX_PHYSICS_ROLLOUTS = 3
START_IK_SEEDS = 8
PLANNER_NAME = "route_search_v1"
METHOD = (
    "enumerated route classes x clearances; DLS IK tracking with continuity check; "
    "MuJoCo kinematic screening + clearance; physics rollout of top candidates"
)


def task_view(placement: Placement) -> CameraView:
    x, y, _ = placement.translation
    return CameraView(lookat=(x - 0.08, y, 0.22), distance=1.55, azimuth=135.0, elevation=-20.0)


def physics_rollout(
    adapter: RobotAdapter, q_start: np.ndarray, joint_path, target_base: np.ndarray, frame_hook=None
) -> tuple[ExecutionResult, dict]:
    data = adapter.new_data()
    adapter.reset_to(data, q_start)
    res = execute_path(adapter, data, [np.array(q) for q in joint_path], frame_hook=frame_hook)
    err = float(np.linalg.norm(np.array(res.final_ee_pos) - target_base))
    checks = {
        "endpoint_within_tolerance": err < REACH_TOLERANCE_M,
        "no_collisions": not res.collisions,
        "no_limit_violations": not res.limit_violations,
        "settled": bool(res.settled),
    }
    summary = {
        "endpoint_error_m": err,
        "collisions": [{"sim_time": e.sim_time, **e.contact.__dict__} for e in res.collisions],
        "limit_violations": list(res.limit_violations),
        "simulated_seconds": res.simulated_seconds,
        "step_count": res.step_count,
        "max_penetration_m": res.max_penetration_m,
        "checks": checks,
    }
    return res, summary


def _rollout_candidates(
    ctx: RunContext, adapter, planned: list[PlannedCandidate], q_start, target_base
) -> list[CandidateSummary]:
    feasible = sorted((p for p in planned if p.joint_path), key=lambda p: p.summary.cost)
    to_sim = {p.summary.candidate_id for p in feasible[:MAX_PHYSICS_ROLLOUTS]}
    ctx.event("simulating", f"Physics rollouts of {len(to_sim)} of {len(feasible)} feasible candidates",
              candidates=sorted(to_sim))
    out: list[CandidateSummary] = []
    for p in planned:
        s = p.summary
        if s.candidate_id not in to_sim:
            out.append(s if s.outcome != "feasible" else s.model_copy(update={"outcome": "not_simulated",
                       "reason": s.reason + "; not simulated (rollout budget)"}))
            continue
        _, phys = physics_rollout(adapter, q_start, p.joint_path, target_base)
        ok = all(phys["checks"].values())
        failed = [k for k, v in phys["checks"].items() if not v]
        updated = s.model_copy(update={
            "physics": phys,
            "stage_reached": "verified" if ok else "physics",
            "outcome": "verified" if ok else "physics_failure",
            "reason": (f"Physics verified: error {phys['endpoint_error_m'] * 1000:.2f} mm, 0 contacts"
                       if ok else f"Physics rollout failed: {', '.join(failed)}"),
        })
        ctx.event("simulating", f"{s.candidate_id}: {updated.outcome}", candidate_id=s.candidate_id,
                  endpoint_error_m=phys["endpoint_error_m"], collisions=len(phys["collisions"]))
        out.append(updated)
    return out


def discover_skill(ctx: RunContext, robot_id: str, seed: int, passport: RobotPassport) -> RunRecord:
    decl = get_robot_decl(robot_id)
    task = generate_task(seed)
    placement = DEFAULT_PLACEMENTS[robot_id]
    ctx.event("profiling", f"Building scene {task.scene_id} for {decl.short_name}",
              task=task.model_dump(mode="json"), placement=placement.model_dump(mode="json"))
    adapter = RobotAdapter(decl, build_model(decl, world_scene(task, placement)))
    q_start = solve_start(adapter, task, placement, make_seeds(adapter, START_IK_SEEDS, np.random.default_rng(seed)))
    if q_start is None:
        return ctx.finish(False, "Start pose unreachable or in collision", results={"task": task.model_dump(mode="json")})

    candidates = generate_candidates(task)
    ctx.event("proposing", f"Enumerated {len(candidates)} candidate routes",
              candidates=[c.candidate_id for c in candidates])
    planned: list[PlannedCandidate] = []
    for cand in candidates:
        p = evaluate_candidate(adapter, cand, placement, q_start)
        planned.append(p)
        ctx.event("checking", f"{cand.candidate_id}: {p.summary.outcome} — {p.summary.reason}",
                  candidate_id=cand.candidate_id, outcome=p.summary.outcome)

    target_base = task_to_base(task.target, placement)
    summaries = _rollout_candidates(ctx, adapter, planned, q_start, target_base)
    verified = [s for s in summaries if s.outcome == "verified"]
    base_results = {
        "task": task.model_dump(mode="json"),
        "placement": placement.model_dump(mode="json"),
        "q_start": [float(v) for v in q_start],
        "candidates": [s.model_dump(mode="json") for s in summaries],
    }
    if not verified:
        return ctx.finish(False, "No candidate verified in physics", candidate_summaries=compact_outcomes(summaries),
                          results=base_results)
    winner = min(verified, key=lambda s: s.cost)
    ctx.event("selecting", f"Selected {winner.candidate_id} (lowest cost among {len(verified)} verified)",
              candidate_id=winner.candidate_id, cost=winner.cost)
    joint_path = next(p.joint_path for p in planned if p.summary.candidate_id == winner.candidate_id)
    return _execute_winner(ctx, decl, task, placement, q_start, winner, joint_path, summaries,
                           base_results, passport)


def _execute_winner(ctx, decl, task: TaskSpec, placement: Placement, q_start, winner, joint_path,
                    summaries, base_results, passport) -> RunRecord:
    ctx.event("executing", f"Executing {winner.candidate_id} in a fresh simulation with rendering")
    render_adapter = RobotAdapter(decl, build_model(decl, world_scene(task, placement, tuple(winner.waypoints_task))))
    target_base = task_to_base(task.target, placement)
    out_dir = ARTIFACT_DIR / "runs" / ctx.run_id
    with FrameRecorder(render_adapter.model, task_view(placement)) as rec:
        res, phys = physics_rollout(render_adapter, q_start, joint_path, target_base, frame_hook=rec.capture)
        video = rec.save_mp4(out_dir / "execution.mp4")
        poster = rec.save_png(rec.frames[-1], out_dir / "final.png")

    ctx.event("verifying", "Checking endpoint error, contacts, joint limits; comparing to rollout")
    rollout_err = winner.physics["endpoint_error_m"]
    checks = {**phys["checks"], "reproduces_rollout": abs(phys["endpoint_error_m"] - rollout_err) < 1e-3}
    success = all(checks.values())
    capsule = None
    if success:
        capsule = build_capsule(
            run_id=ctx.run_id, passport=passport, task=task, placement=placement, winner=winner,
            candidates=summaries, execution=res, endpoint_error_m=phys["endpoint_error_m"],
            timestep=render_adapter.model.opt.timestep, method=METHOD,
        )
    failed = [k for k, v in checks.items() if not v]
    return ctx.finish(
        success,
        "Verified skill discovered — ready to publish" if success else f"Execution failed: {', '.join(failed)}",
        skill_id=capsule.skill_id if capsule else None,
        simulated_seconds=res.simulated_seconds,
        collision_count=len(res.collisions),
        endpoint_error_m=phys["endpoint_error_m"],
        candidate_summaries=compact_outcomes(summaries),
        results={**base_results, "selected": winner.candidate_id, "execution": phys, "checks": checks,
                 "ee_trace_base": [list(p) for p in res.ee_trace],
                 "capsule_draft": capsule.model_dump(mode="json") if capsule else None,
                 "published": False},
        artifacts={"video": _url(video), "poster": _url(poster)},
    )


def _url(path) -> str:
    return "/artifacts/" + path.relative_to(ARTIFACT_DIR).as_posix()
