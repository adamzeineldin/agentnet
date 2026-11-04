"""Shared candidate search used by discovery (source) and transfer (target).

Stages, all on the robot's own model:
  prepare      build the scene in the robot's base frame and solve a start pose
  evaluate     kinematic stages for every candidate (IK, continuity, screening, clearance)
  rollout      physics rollouts of feasible candidates in a caller-given priority order
  execute      re-run the selected candidate with rendering and verify it reproduces
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import nullcontext
from dataclasses import dataclass

import numpy as np

from app.config import ARTIFACT_DIR, CLIP_HEIGHT, CLIP_WIDTH, REACH_TOLERANCE_M
from app.models.run import RunRecord
from app.models.skill import CandidateSummary, ExperienceCapsule, Placement, TaskSpec
from app.services.capsules import compact_outcomes
from app.services.jobs import RunContext
from app.services.kinematics import make_seeds
from app.services.render import CameraView, FrameRecorder
from app.services.robot_adapter import RobotAdapter
from app.services.robot_catalog import RobotDecl
from app.services.route_planner import PlannedCandidate, RouteCandidate, evaluate_candidate, solve_start
from app.services.scene import build_model
from app.services.simulation import ExecutionResult, execute_path
from app.services.task_scene import base_to_task, task_to_base, to_vec3, world_scene

START_IK_SEEDS = 8
MAX_TRACE_POINTS = 60
CapsuleFactory = Callable[[ExecutionResult, dict], ExperienceCapsule]
# Runs only after a verified execution; returns extra results (e.g. the controller execution).
AfterVerify = Callable[[list], dict]


@dataclass(frozen=True)
class SearchSetup:
    decl: RobotDecl
    task: TaskSpec
    placement: Placement
    adapter: RobotAdapter
    q_start: np.ndarray
    target_base: np.ndarray


def task_view(placement: Placement) -> CameraView:
    x, y, z = placement.translation
    return CameraView(lookat=(x - 0.08, y, z + 0.22), distance=1.55, azimuth=135.0, elevation=-20.0)


def prepare(decl: RobotDecl, task: TaskSpec, placement: Placement, seed: int) -> SearchSetup | None:
    adapter = RobotAdapter(decl, build_model(decl, world_scene(task, placement)))
    seeds = make_seeds(adapter, START_IK_SEEDS, np.random.default_rng(seed))
    q_start = solve_start(adapter, task, placement, seeds)
    if q_start is None:
        return None
    return SearchSetup(decl, task, placement, adapter, q_start, task_to_base(task.target, placement))


def route_brief(cand: RouteCandidate, **extra) -> dict:
    """A candidate's geometry for progress events, so the live view can draw it before it is checked."""
    return {"candidate_id": cand.candidate_id, "route_class": cand.route_class, "clearance_m": cand.clearance_m,
            "waypoints_task": [list(w) for w in cand.waypoints_task], **extra}


def evaluate_all(
    ctx: RunContext, setup: SearchSetup, candidates: list[RouteCandidate]
) -> list[PlannedCandidate]:
    planned = []
    for cand in candidates:
        p = evaluate_candidate(setup.adapter, cand, setup.placement, setup.q_start)
        planned.append(p)
        ctx.event("checking", f"{cand.candidate_id}: {p.summary.outcome} — {p.summary.reason}",
                  candidate_id=cand.candidate_id, outcome=p.summary.outcome, reason=p.summary.reason,
                  min_clearance_m=p.summary.min_clearance_m)
    return planned


def trace_in_task(res: ExecutionResult, placement: Placement) -> list:
    """The simulated end-effector path in the task frame, thinned to MAX_TRACE_POINTS."""
    trace = [to_vec3(base_to_task(p, placement)) for p in res.ee_trace]
    stride = max(1, -(-len(trace) // MAX_TRACE_POINTS))
    return [*trace[::stride], trace[-1]] if trace else []


def recorded_try(
    ctx: RunContext, setup: SearchSetup, rec: FrameRecorder, cid: str, joint_path, index: int, budget: int,
) -> tuple[ExecutionResult, dict]:
    """One physics try, rendered into its own clip and shown live while it runs."""
    rec.new_clip()
    rec.on_frame = ctx.live(f"Physics try {index} of {budget}: {cid}")
    res, phys = physics_rollout(setup.adapter, setup.q_start, joint_path, setup.target_base, frame_hook=rec.capture)
    stem = ARTIFACT_DIR / "runs" / ctx.run_id / f"try_{cid.replace('@', '_')}"
    video = rec.save_mp4(stem.with_suffix(".mp4"))
    thumb = rec.save_png(rec.frames[-1], stem.with_suffix(".png"))
    return res, {**phys, "trace_task": trace_in_task(res, setup.placement), "future_index": index,
                 "video": artifact_url(video), "thumbnail": artifact_url(thumb)}


def try_event(ctx: RunContext, message: str, cid: str, s: CandidateSummary) -> None:
    phys = s.physics or {}
    ctx.event("simulating", message, candidate_id=cid, outcome=s.outcome, reason=s.reason,
              endpoint_error_m=phys.get("endpoint_error_m"), collisions=len(phys.get("collisions", [])),
              future_index=phys.get("future_index"), video=phys.get("video"), thumbnail=phys.get("thumbnail"),
              trace_task=phys.get("trace_task"))


def physics_rollout(
    adapter: RobotAdapter, q_start: np.ndarray, joint_path, target_base: np.ndarray, frame_hook=None,
    on_finish=None, **execute_kwargs,
) -> tuple[ExecutionResult, dict]:
    """Fresh MjData reset to q_start, then the path through the servos. on_finish(data) sees the final state."""
    data = adapter.new_data()
    adapter.reset_to(data, q_start)
    res = execute_path(adapter, data, [np.array(q) for q in joint_path], frame_hook=frame_hook, **execute_kwargs)
    if on_finish is not None:
        on_finish(data)
    err = float(np.linalg.norm(np.array(res.final_ee_pos) - target_base))
    checks = {
        "endpoint_within_tolerance": err < REACH_TOLERANCE_M,
        "no_collisions": not res.collisions,
        "no_limit_violations": not res.limit_violations,
        "settled": bool(res.settled),
    }
    return res, {
        "endpoint_error_m": err,
        "collisions": [{"sim_time": e.sim_time, **e.contact.__dict__} for e in res.collisions],
        "limit_violations": list(res.limit_violations),
        "simulated_seconds": res.simulated_seconds,
        "step_count": res.step_count,
        "max_penetration_m": res.max_penetration_m,
        "checks": checks,
    }


def with_physics(s: CandidateSummary, phys: dict) -> CandidateSummary:
    ok = all(phys["checks"].values())
    failed = [k for k, v in phys["checks"].items() if not v]
    return s.model_copy(update={
        "physics": phys,
        "stage_reached": "verified" if ok else "physics",
        "outcome": "verified" if ok else "physics_failure",
        "reason": (f"Physics verified: error {phys['endpoint_error_m'] * 1000:.2f} mm, 0 contacts"
                   if ok else f"Physics rollout failed: {', '.join(failed)}"),
    })


def rollout(
    ctx: RunContext, setup: SearchSetup, planned: list[PlannedCandidate], order: list[str], budget: int,
    record: bool = True,
) -> tuple[list[CandidateSummary], list[str]]:
    """Simulate up to `budget` feasible candidates in `order`. Returns (summaries, simulated ids in order).

    record=False skips the clips and live frames (headless evaluation); the physics is identical.
    """
    by_id = {p.summary.candidate_id: p for p in planned}
    simulated = [cid for cid in order if by_id[cid].joint_path is not None][:budget]
    feasible_n = sum(1 for p in planned if p.joint_path is not None)
    ctx.event("simulating", f"Physics rollouts of {len(simulated)} of {feasible_n} feasible candidates",
              candidates=simulated)
    updated: dict[str, CandidateSummary] = {}
    recorder = FrameRecorder(setup.adapter.model, task_view(setup.placement), CLIP_WIDTH, CLIP_HEIGHT) if record else None
    with recorder or nullcontext():
        for i, cid in enumerate(simulated, start=1):
            path = by_id[cid].joint_path
            _, phys = (recorded_try(ctx, setup, recorder, cid, path, i, len(simulated)) if recorder
                       else physics_rollout(setup.adapter, setup.q_start, path, setup.target_base))
            updated[cid] = with_physics(by_id[cid].summary, phys)
            try_event(ctx, f"{cid}: {updated[cid].outcome}", cid, updated[cid])
    out = []
    for p in planned:
        s = p.summary
        if s.candidate_id in updated:
            out.append(updated[s.candidate_id])
        elif s.outcome == "feasible":
            out.append(s.model_copy(update={"outcome": "not_simulated",
                                            "reason": s.reason + "; not simulated (rollout budget)"}))
        else:
            out.append(s)
    return out, simulated


FEASIBLE_OUTCOMES = frozenset({"feasible", "not_simulated", "verified", "physics_failure"})


def search_metrics(summaries: list[CandidateSummary], full_order: list[str], simulated: list[str]) -> dict:
    """Search effort measured against the order in which candidates were considered."""
    by_id = {s.candidate_id: s for s in summaries}
    first_feasible = next(
        (i + 1 for i, c in enumerate(full_order) if by_id[c].outcome in FEASIBLE_OUTCOMES), None
    )
    first_success = next(
        (i + 1 for i, c in enumerate(simulated) if by_id[c].outcome == "verified"), None
    )
    return {
        "candidates_total": len(summaries),
        "kinematic_evaluations": len(summaries),
        "feasible": sum(1 for s in summaries if s.outcome in FEASIBLE_OUTCOMES),
        "physics_rollouts": len(simulated),
        "verified": sum(1 for s in summaries if s.outcome == "verified"),
        "order_rank_of_first_feasible": first_feasible,
        "rollouts_to_first_success": first_success,
        "considered_order": full_order,
        "simulated_order": simulated,
    }


def execute_and_verify(
    ctx: RunContext,
    setup: SearchSetup,
    winner: CandidateSummary,
    joint_path,
    summaries: list[CandidateSummary],
    base_results: dict,
    make_capsule: CapsuleFactory,
    success_message: str,
    after_verify: AfterVerify | None = None,
) -> RunRecord:
    ctx.event("executing", f"Executing {winner.candidate_id} in a fresh simulation with rendering")
    render_adapter = RobotAdapter(
        setup.decl, build_model(setup.decl, world_scene(setup.task, setup.placement, tuple(winner.waypoints_task)))
    )
    out_dir = ARTIFACT_DIR / "runs" / ctx.run_id
    live = ctx.live(f"Recording the chosen route: {winner.candidate_id}")
    with FrameRecorder(render_adapter.model, task_view(setup.placement), on_frame=live) as rec:
        res, phys = physics_rollout(render_adapter, setup.q_start, joint_path, setup.target_base,
                                    frame_hook=rec.capture)
        video = rec.save_mp4(out_dir / "execution.mp4")
        poster = rec.save_png(rec.frames[-1], out_dir / "final.png")

    ctx.event("verifying", "Checking endpoint error, contacts, joint limits; comparing to rollout")
    rollout_err = winner.physics["endpoint_error_m"]
    checks = {**phys["checks"], "reproduces_rollout": abs(phys["endpoint_error_m"] - rollout_err) < 1e-3}
    success = all(checks.values())
    capsule = make_capsule(res, phys) if success else None
    failed = [k for k, v in checks.items() if not v]
    extra = after_verify(list(joint_path)) if success and after_verify is not None else {}
    return ctx.finish(
        success,
        success_message if success else f"Execution failed: {', '.join(failed)}",
        skill_id=capsule.skill_id if capsule else None,
        simulated_seconds=res.simulated_seconds,
        collision_count=len(res.collisions),
        endpoint_error_m=phys["endpoint_error_m"],
        candidate_summaries=compact_outcomes(summaries),
        results={**base_results, "selected": winner.candidate_id, "execution": phys, "checks": checks,
                 "joint_path_dof": len(joint_path[0]),
                 "ee_trace_base": [list(p) for p in res.ee_trace],
                 "capsule_draft": capsule.model_dump(mode="json") if capsule else None,
                 "published": False, **extra},
        artifacts={"video": artifact_url(video), "poster": artifact_url(poster)},
    )


def artifact_url(path) -> str:
    return "/artifacts/" + path.relative_to(ARTIFACT_DIR).as_posix()
