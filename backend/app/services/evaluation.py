"""Held-out evaluation of transfer vs baselines with matched budgets.

Protocol (fixed before running; see docs/EVALUATION.md):
  1. Dev library: the source robot discovers skills on dev seeds of each scene family.
     Capsules stay in memory; nothing is published, and no target trial is in the library.
  2. Held-out: for each eval scene, the target robot retrieves the nearest dev capsule of the
     same family (task-geometry distance) and runs every variant from the same start pose.
  3. Variants evaluate candidates lazily in their own order: kinematic stages, then a physics
     rollout for each feasible candidate, until one verifies or the rollout budget is spent.

Accounting: source discovery cost is excluded from target variants; start-pose IK is shared and
excluded from per-variant wall time. Every row is a real MuJoCo result; failures are kept.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass

import numpy as np

from app.models.robot import RobotPassport
from app.models.skill import ExperienceCapsule, TaskSpec
from app.services.candidate_search import SearchSetup, physics_rollout, prepare, rollout
from app.services.capsules import build_capsule
from app.services.robot_catalog import get_robot_decl
from app.services.route_planner import RouteCandidate, evaluate_candidate, generate_candidates
from app.services.task_scene import DEFAULT_PLACEMENTS, generate_task
from app.services.transfer import prior_order

PHYSICS_BUDGET = 3
VARIANTS = ("baseline_no_sharing", "retarget_only", "nimbotics_offline")
VARIANT_TEXT = {
    "baseline_no_sharing": "No shared experience: fixed enumeration order (direct, over, near_side, far_side × clearances).",
    "retarget_only": "Simple geometric retargeting: only the retrieved capsule's strategy, regenerated on the new scene.",
    "nimbotics_offline": "Nimbotics: candidates ordered by the retrieved capsule (offline deterministic prior).",
}


class _Silent:
    """Stands in for RunContext inside headless dev-library discovery."""

    run_id = "eval-dev"

    def event(self, *args, **kwargs) -> None:
        return None


@dataclass(frozen=True)
class Row:
    variant: str
    family: str
    seed: int
    scene_id: str
    applicable: bool
    success: bool
    selected: str | None
    kinematic_evaluations: int
    physics_rollouts: int
    rollouts_to_first_success: int | None
    endpoint_error_m: float | None
    collisions_in_rollouts: int
    sim_steps: int
    wall_time_s: float
    api_calls: int
    source_skill: str | None
    source_strategy: str | None
    note: str


def discover_headless(robot_id: str, task: TaskSpec, passport: RobotPassport) -> ExperienceCapsule | None:
    """Same discovery pipeline as the API (cost order, top-3 rollouts), without events or rendering."""
    decl = get_robot_decl(robot_id)
    setup = prepare(decl, task, DEFAULT_PLACEMENTS[robot_id], task.seed)
    if setup is None:
        return None
    planned = [evaluate_candidate(setup.adapter, c, setup.placement, setup.q_start) for c in generate_candidates(task)]
    order = [p.summary.candidate_id for p in sorted((p for p in planned if p.joint_path), key=lambda p: p.summary.cost)]
    summaries, _ = rollout(_Silent(), setup, planned, order, PHYSICS_BUDGET, record=False)
    verified = [s for s in summaries if s.outcome == "verified"]
    if not verified:
        return None
    winner = min(verified, key=lambda s: s.cost)
    path = next(p.joint_path for p in planned if p.summary.candidate_id == winner.candidate_id)
    res, phys = physics_rollout(setup.adapter, setup.q_start, path, setup.target_base)
    return build_capsule(
        run_id=f"eval-dev-{task.scene_id}", passport=passport, task=task, placement=setup.placement,
        winner=winner, candidates=summaries, execution=res, endpoint_error_m=phys["endpoint_error_m"],
        timestep=setup.adapter.model.opt.timestep, method="evaluation dev-library discovery (not published)",
    )


def scene_features(task: TaskSpec) -> np.ndarray:
    obstacles = sorted(task.obstacles, key=lambda o: o.name)
    parts = [*task.start, *task.target]
    for o in obstacles[:2]:
        parts += [*o.center, *o.half_size]
    parts += [0.0] * (6 + 6 + 2 * 6 - len(parts))
    return np.array(parts)


def retrieve(task: TaskSpec, library: list[ExperienceCapsule]) -> ExperienceCapsule | None:
    """Nearest capsule of the same scene family by task-geometry distance."""
    family = task.scene_id.rsplit("_s", 1)[0]
    pool = [c for c in library if c.task.scene_id.rsplit("_s", 1)[0] == family]
    if not pool:
        return None
    f = scene_features(task)
    return min(pool, key=lambda c: float(np.linalg.norm(scene_features(c.task) - f)))


def run_variant(setup: SearchSetup, order: list[RouteCandidate], budget: int = PHYSICS_BUDGET) -> dict:
    """Lazy search: kinematic stages in order, physics for feasible ones, stop at first verified."""
    t0 = time.perf_counter()
    evals = rollouts = steps = collisions = 0
    for cand in order:
        evals += 1
        planned = evaluate_candidate(setup.adapter, cand, setup.placement, setup.q_start)
        if planned.joint_path is None:
            continue
        rollouts += 1
        res, phys = physics_rollout(setup.adapter, setup.q_start, planned.joint_path, setup.target_base)
        steps += res.step_count
        collisions += len(res.collisions)
        if all(phys["checks"].values()):
            return {"success": True, "selected": cand.candidate_id, "kinematic_evaluations": evals,
                    "physics_rollouts": rollouts, "rollouts_to_first_success": rollouts,
                    "endpoint_error_m": phys["endpoint_error_m"], "collisions_in_rollouts": collisions,
                    "sim_steps": steps, "wall_time_s": time.perf_counter() - t0}
        if rollouts >= budget:
            break
    return {"success": False, "selected": None, "kinematic_evaluations": evals, "physics_rollouts": rollouts,
            "rollouts_to_first_success": None, "endpoint_error_m": None, "collisions_in_rollouts": collisions,
            "sim_steps": steps, "wall_time_s": time.perf_counter() - t0}


def variant_orders(task: TaskSpec, capsule: ExperienceCapsule | None) -> dict[str, list[RouteCandidate] | None]:
    cands = generate_candidates(task)
    if capsule is None:
        return {"baseline_no_sharing": cands, "retarget_only": None, "nimbotics_offline": None}
    strat = [c for c in cands if c.route_class == capsule.strategy.route_class
             and abs(c.clearance_m - capsule.strategy.clearance_m) < 1e-9]
    return {"baseline_no_sharing": cands, "retarget_only": strat,
            "nimbotics_offline": [c for c, _, _ in prior_order(cands, capsule)]}


def evaluate_scene(task: TaskSpec, target_id: str, library: list[ExperienceCapsule]) -> list[Row]:
    decl = get_robot_decl(target_id)
    setup = prepare(decl, task, DEFAULT_PLACEMENTS[target_id], task.seed)
    capsule = retrieve(task, library)
    family = task.scene_id.rsplit("_s", 1)[0]
    rows = []
    for variant, order in variant_orders(task, capsule).items():
        base = {"variant": variant, "family": family, "seed": task.seed, "scene_id": task.scene_id, "api_calls": 0,
                "source_skill": capsule.skill_id if capsule else None,
                "source_strategy": f"{capsule.strategy.route_class}@{capsule.strategy.clearance_m:.2f}" if capsule else None}
        if setup is None or order is None:
            note = "target start pose unreachable" if setup is None else "no source capsule for this family"
            rows.append(Row(**base, applicable=False, success=False, selected=None, kinematic_evaluations=0,
                            physics_rollouts=0, rollouts_to_first_success=None, endpoint_error_m=None,
                            collisions_in_rollouts=0, sim_steps=0, wall_time_s=0.0, note=note))
            continue
        rows.append(Row(**base, applicable=True, note="", **run_variant(setup, order)))
    return rows


def common_scene_ids(rows: list[Row]) -> set[str]:
    """Scenes where every variant was applicable: the like-for-like comparison set."""
    ids = {r.scene_id for r in rows}
    return {sid for sid in ids if all(r.applicable for r in rows if r.scene_id == sid)}


def summarize(rows: list[Row]) -> dict:
    common = common_scene_ids(rows)
    subsets = {f: (lambda r, f=f: r.family == f) for f in sorted({r.family for r in rows})}
    subsets["all"] = lambda r: True
    subsets["common"] = lambda r: r.scene_id in common
    out: dict = {}
    for variant in VARIANTS:
        out[variant] = {}
        for name, keep in subsets.items():
            family = name
            sel = [r for r in rows if r.variant == variant and keep(r)]
            app = [r for r in sel if r.applicable]
            ok = [r for r in app if r.success]
            med = lambda xs: float(np.median(xs)) if xs else None  # noqa: E731
            out[variant][family] = {
                "scenes": len(sel), "applicable": len(app), "successes": len(ok),
                "success_rate": len(ok) / len(app) if app else None,
                "median_kinematic_evaluations": med([r.kinematic_evaluations for r in app]),
                "median_rollouts_to_first_success": med([r.rollouts_to_first_success for r in ok]),
                "median_endpoint_error_m": med([r.endpoint_error_m for r in ok]),
                "median_wall_time_s": med([r.wall_time_s for r in app]),
                "total_sim_steps": sum(r.sim_steps for r in app),
                "collisions_in_rollouts": sum(r.collisions_in_rollouts for r in app),
                "api_calls": sum(r.api_calls for r in app),
            }
    return out


def rows_json(rows: list[Row]) -> list[dict]:
    return [asdict(r) for r in rows]


def build_tasks(families: list[str], seeds: list[int]) -> list[TaskSpec]:
    return [generate_task(s, f) for f in families for s in seeds]


def paired_vs_baseline(rows: list[Row], variant: str, baseline: str = "baseline_no_sharing") -> dict:
    """Per-scene comparison on scenes where both were applicable (no aggregation hides losses)."""
    by = {(r.scene_id, r.variant): r for r in rows}
    scenes = sorted({r.scene_id for r in rows if (r.scene_id, variant) in by and (r.scene_id, baseline) in by
                     and by[(r.scene_id, variant)].applicable and by[(r.scene_id, baseline)].applicable})
    out = {"scenes": len(scenes), "both_succeeded": 0, "only_variant": 0, "only_baseline": 0, "neither": 0,
           "fewer_kinematic_evals": 0, "same_kinematic_evals": 0, "more_kinematic_evals": 0, "per_scene": []}
    for sid in scenes:
        v, b = by[(sid, variant)], by[(sid, baseline)]
        key = ("both_succeeded" if v.success and b.success else "only_variant" if v.success
               else "only_baseline" if b.success else "neither")
        out[key] += 1
        if v.success and b.success:
            d = v.kinematic_evaluations - b.kinematic_evaluations
            out["fewer_kinematic_evals" if d < 0 else "more_kinematic_evals" if d > 0 else "same_kinematic_evals"] += 1
        out["per_scene"].append({"scene_id": sid, "variant_success": v.success, "baseline_success": b.success,
                                 "kinematic_evals_delta": v.kinematic_evaluations - b.kinematic_evaluations})
    return out
