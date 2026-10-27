"""Cross-robot transfer of an Experience Capsule.

What transfers: task-frame geometry, the verified strategy (route class +
clearance) and the source's per-candidate outcomes. What does not: joint
angles (the capsule has none). The target robot re-places the task in its own
base frame, re-solves IK with its own kinematics, and verifies in MuJoCo.

The source experience changes the *order* in which candidates are simulated
(the physics budget is the same as discovery); the first candidate that
verifies in that order is selected.
"""

from __future__ import annotations

import numpy as np

from app.models.robot import RobotPassport
from app.models.run import RunRecord
from app.models.skill import CandidateSummary, ExperienceCapsule, TaskSpec
from app.services.candidate_search import (
    SearchSetup,
    evaluate_all,
    execute_and_verify,
    prepare,
    rollout,
    search_metrics,
)
from app.services.capsules import build_capsule, compact_outcomes
from app.services.jobs import RunContext
from app.services.registry import Registry
from app.services.robot_catalog import get_robot_decl
from app.services.route_planner import RouteCandidate, generate_candidates, route_waypoints
from app.services.task_scene import DEFAULT_PLACEMENTS, generate_task, task_to_base

MAX_PHYSICS_ROLLOUTS = 3
PLANNER_NAME = "transfer_prior_v1"
METHOD = (
    "capsule strategy re-placed in target base frame; candidates ordered by source experience; "
    "target DLS IK tracking, MuJoCo screening + clearance, physics rollouts in prior order"
)


def prior_order(
    candidates: list[RouteCandidate], capsule: ExperienceCapsule
) -> list[tuple[RouteCandidate, int, str]]:
    """Sort candidates by what the source robot learned. Returns (candidate, tier, note)."""
    source = {o["candidate_id"]: o for o in capsule.candidate_outcomes}
    strat = capsule.strategy

    def rank(c: RouteCandidate) -> tuple[int, float, float, str]:
        o = source.get(c.candidate_id, {})
        outcome, cost = o.get("outcome"), o.get("cost")
        if c.route_class == strat.route_class and abs(c.clearance_m - strat.clearance_m) < 1e-9:
            tier, note = 0, "capsule strategy (verified by source)"
        elif c.route_class == strat.route_class:
            tier, note = 1, f"same route class, clearance {strat.clearance_m:.2f}→{c.clearance_m:.2f} m"
        elif outcome == "verified":
            tier, note = 2, "alternative verified by source"
        elif outcome in ("feasible", "not_simulated"):
            tier, note = 3, "kinematically feasible for source"
        elif outcome in ("insufficient_clearance", "physics_failure"):
            tier, note = 4, f"source: {outcome.replace('_', ' ')}"
        else:
            tier, note = 5, f"source: {(outcome or 'not tried').replace('_', ' ')}"
        tie = abs(c.clearance_m - strat.clearance_m) - 1e-3 * c.clearance_m if tier == 1 else (cost or np.inf)
        return tier, tie, c.clearance_m, note

    ranked = sorted(candidates, key=lambda c: rank(c)[:3])
    return [(c, rank(c)[0], rank(c)[3]) for c in ranked]


def compatibility(
    capsule: ExperienceCapsule, source: RobotPassport | None, target: RobotPassport, setup: SearchSetup | None,
    task: TaskSpec,
) -> list[dict]:
    """Checks of the capsule against the target's passport and placement (no simulation)."""
    checks = [
        {"check": "capsule_validated", "status": "pass" if capsule.validation.success else "fail",
         "detail": f"source run {capsule.provenance.get('run_id')}: {capsule.validation.collisions} collisions, "
                   f"{capsule.validation.endpoint_error_m * 1000:.2f} mm"},
        {"check": "kinematic_structure", "status": "info",
         "detail": f"source {source.dof if source else '?'}-DOF vs target {target.dof}-DOF; joint space is not "
                   "transferable — target re-solves IK from task-frame geometry"},
        {"check": "end_effector", "status": "pass",
         "detail": f"capsule needs a point EE; target uses '{target.end_effector.site_name}' "
                   f"({target.end_effector.source})"},
        {"check": "scene", "status": "info",
         "detail": "same scene as source" if task.scene_id == capsule.task.scene_id
         else f"new scene {task.scene_id} (strategy regenerated from its geometry)"},
    ]
    if setup is not None:
        shoulder = setup.adapter.new_data().xanchor[setup.adapter.joints[0].joint_id]
        strat = capsule.strategy
        wps = [task_to_base(p, setup.placement) for p in route_waypoints(task, strat.route_class, strat.clearance_m)]
        worst = max(float(np.linalg.norm(w - shoulder)) for w in wps)
        ratio = worst / target.workspace.max_reach_m
        checks.append({
            "check": "strategy_within_reach", "status": "pass" if ratio <= 0.9 else "warn" if ratio <= 1.0 else "fail",
            "detail": f"farthest strategy waypoint {worst:.3f} m from {target.arm_joints[0].name}; "
                      f"{ratio:.0%} of target's sampled max reach",
        })
    return checks


def transfer_skill(
    ctx: RunContext,
    registry: Registry,
    source_skill_id: str,
    target_robot_id: str,
    scene_seed: int | None,
    target_passport: RobotPassport,
) -> RunRecord:
    ctx.event("retrieving", f"Fetching capsule {source_skill_id} from the registry")
    capsule = registry.get_skill(source_skill_id)
    if capsule is None:
        return ctx.finish(False, f"Capsule {source_skill_id} not found in registry")
    source_passport = registry.get_passport(capsule.source_robot_id)
    task = capsule.task if scene_seed is None or scene_seed == capsule.task.seed else generate_task(scene_seed)
    decl = get_robot_decl(target_robot_id)
    placement = DEFAULT_PLACEMENTS[target_robot_id]

    ctx.event("profiling", f"Placing {task.scene_id} in the {decl.short_name} base frame",
              task=task.model_dump(mode="json"), placement=placement.model_dump(mode="json"))
    setup = prepare(decl, task, placement, task.seed)
    checks = compatibility(capsule, source_passport, target_passport, setup, task)
    ctx.event("checking", "Compatibility: " + ", ".join(f"{c['check']}={c['status']}" for c in checks),
              compatibility=checks)
    base = {"source_skill_id": capsule.skill_id, "source_robot_id": capsule.source_robot_id,
            "compatibility": checks, "task": task.model_dump(mode="json"),
            "placement": placement.model_dump(mode="json")}
    if any(c["status"] == "fail" and c["check"] == "capsule_validated" for c in checks):
        return ctx.finish(False, "Capsule is not a validated success", results=base)
    if setup is None:
        return ctx.finish(False, f"{decl.short_name} cannot reach the start pose without collision", results=base)
    return _search_and_execute(ctx, setup, capsule, target_passport, base)


def _search_and_execute(ctx, setup: SearchSetup, capsule: ExperienceCapsule, passport, base) -> RunRecord:
    ordered = prior_order(generate_candidates(setup.task), capsule)
    ctx.event("proposing", f"Ordered {len(ordered)} candidates by source experience; "
              f"first: {ordered[0][0].candidate_id} ({ordered[0][2]})",
              order=[{"candidate_id": c.candidate_id, "tier": t, "note": n} for c, t, n in ordered])
    planned = evaluate_all(ctx, setup, [c for c, _, _ in ordered])
    notes = {c.candidate_id: (i + 1, n) for i, (c, _, n) in enumerate(ordered)}
    order = [c.candidate_id for c, _, _ in ordered]
    summaries, simulated = rollout(ctx, setup, planned, order, MAX_PHYSICS_ROLLOUTS)
    summaries = [s.model_copy(update={"prior_rank": notes[s.candidate_id][0], "prior_note": notes[s.candidate_id][1]})
                 for s in summaries]
    by_id = {s.candidate_id: s for s in summaries}
    results = {**base, "q_start": [float(v) for v in setup.q_start],
               "candidates": [s.model_dump(mode="json") for s in summaries],
               "search_metrics": search_metrics(summaries, order, simulated)}
    winner = next((by_id[c] for c in simulated if by_id[c].outcome == "verified"), None)
    if winner is None:
        return ctx.finish(False, "No transferred candidate verified in physics on the target",
                          candidate_summaries=compact_outcomes(summaries), results=results)
    preserved = winner.route_class == capsule.strategy.route_class and winner.clearance_m == capsule.strategy.clearance_m
    ctx.event("selecting", f"Selected {winner.candidate_id} (prior rank {winner.prior_rank}; "
              f"{'strategy preserved' if preserved else 'strategy adapted'})", candidate_id=winner.candidate_id)
    joint_path = next(p.joint_path for p in planned if p.summary.candidate_id == winner.candidate_id)
    adaptation = {
        "transferred_from_robot": capsule.source_robot_id,
        "source_strategy": f"{capsule.strategy.route_class}@{capsule.strategy.clearance_m:.2f}",
        "strategy_preserved": preserved,
        "prior_rank_of_selected": winner.prior_rank,
        "target_dof": setup.adapter.dof,
    }

    def make_capsule(res, phys) -> ExperienceCapsule:
        return build_capsule(
            run_id=ctx.run_id, passport=passport, task=setup.task, placement=setup.placement, winner=winner,
            candidates=summaries, execution=res, endpoint_error_m=phys["endpoint_error_m"],
            timestep=setup.adapter.model.opt.timestep, parent=capsule, method=METHOD,
            extra_provenance=adaptation,
        )

    return execute_and_verify(ctx, setup, winner, joint_path, summaries, {**results, "adaptation": adaptation},
                              make_capsule, "Adaptation verified on target — ready to publish")
