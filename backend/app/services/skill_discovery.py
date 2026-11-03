"""Source skill discovery: search candidate routes, verify in MuJoCo physics, draft a capsule.

The capsule is only drafted here; publishing to the registry is a separate,
explicit step (POST /api/skills) that requires a succeeded discover run.
"""

from __future__ import annotations

from app.models.robot import RobotPassport
from app.models.run import RunRecord
from app.services.candidate_search import (
    evaluate_all,
    execute_and_verify,
    prepare,
    rollout,
    route_brief,
    search_metrics,
)
from app.services.capsules import build_capsule, compact_outcomes
from app.services.jobs import RunContext
from app.services.robot_catalog import get_robot_decl
from app.services.route_planner import generate_candidates
from app.services.task_scene import SCENE_FAMILY, default_placement, generate_task

MAX_PHYSICS_ROLLOUTS = 3
PLANNER_NAME = "route_search_v1"
METHOD = (
    "enumerated route classes x clearances; DLS IK tracking with continuity check; "
    "MuJoCo kinematic screening + clearance; physics rollout of top candidates by cost"
)


def discover_skill(ctx: RunContext, robot_id: str, seed: int, passport: RobotPassport,
                   family: str = SCENE_FAMILY) -> RunRecord:
    decl = get_robot_decl(robot_id)
    task = generate_task(seed, family)
    placement = default_placement(robot_id)
    ctx.event("profiling", f"Building scene {task.scene_id} for {decl.short_name}",
              task=task.model_dump(mode="json"), placement=placement.model_dump(mode="json"))
    setup = prepare(decl, task, placement, seed)
    if setup is None:
        return ctx.finish(False, "Start pose unreachable or in collision", results={"task": task.model_dump(mode="json")})

    candidates = generate_candidates(task)
    ctx.event("proposing", f"Enumerated {len(candidates)} candidate routes",
              candidates=[c.candidate_id for c in candidates], routes=[route_brief(c) for c in candidates])
    planned = evaluate_all(ctx, setup, candidates)
    feasible = sorted((p for p in planned if p.joint_path), key=lambda p: p.summary.cost)
    order = [p.summary.candidate_id for p in feasible]
    summaries, simulated = rollout(ctx, setup, planned, order, MAX_PHYSICS_ROLLOUTS)
    base_results = {
        "task": task.model_dump(mode="json"),
        "placement": placement.model_dump(mode="json"),
        "q_start": [float(v) for v in setup.q_start],
        "candidates": [s.model_dump(mode="json") for s in summaries],
        "search_metrics": search_metrics(summaries, [c.candidate_id for c in candidates], simulated),
    }
    verified = [s for s in summaries if s.outcome == "verified"]
    if not verified:
        return ctx.finish(False, "No candidate verified in physics",
                          candidate_summaries=compact_outcomes(summaries), results=base_results)
    winner = min(verified, key=lambda s: s.cost)
    ctx.event("selecting", f"Selected {winner.candidate_id} (lowest cost among {len(verified)} verified)",
              candidate_id=winner.candidate_id, cost=winner.cost)
    joint_path = next(p.joint_path for p in planned if p.summary.candidate_id == winner.candidate_id)

    def make_capsule(res, phys):
        return build_capsule(
            run_id=ctx.run_id, passport=passport, task=task, placement=placement, winner=winner,
            candidates=summaries, execution=res, endpoint_error_m=phys["endpoint_error_m"],
            timestep=setup.adapter.model.opt.timestep, method=METHOD,
        )

    return execute_and_verify(ctx, setup, winner, joint_path, summaries, base_results, make_capsule,
                              "Verified skill discovered — ready to publish")
