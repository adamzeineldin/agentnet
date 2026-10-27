"""Benchmark run: build the dev library, evaluate held-out scenes, store raw rows + summary."""

from __future__ import annotations

from app.models.run import RunRecord
from app.services.evaluation import (
    PHYSICS_BUDGET, VARIANT_TEXT, VARIANTS, build_tasks, common_scene_ids, discover_headless,
    evaluate_scene, paired_vs_baseline, rows_json, summarize,
)
from app.services.jobs import RunContext
from app.services.registry import Registry


def protocol(families, dev_seeds, eval_seeds, source_id, target_id) -> dict:
    return {
        "families": families, "dev_seeds": dev_seeds, "eval_seeds": eval_seeds,
        "source_robot_id": source_id, "target_robot_id": target_id,
        "variants": {v: VARIANT_TEXT[v] for v in VARIANTS},
        "physics_budget_per_scene": PHYSICS_BUDGET,
        "kinematic_budget_per_scene": "all 10 candidates (evaluated lazily in each variant's order)",
        "retrieval": "nearest dev capsule of the same scene family by task-geometry distance",
        "accounting": "source discovery cost excluded from target variants; target start-pose IK shared "
                      "and excluded from per-variant wall time; same start pose for every variant",
        "leakage": "dev library built only from source-robot runs on dev seeds; eval seeds disjoint; "
                   "no target-robot result enters the library; capsules not published",
        "success": "first candidate whose physics rollout has endpoint error < 1 cm, zero robot contacts, "
                   "no joint-limit violations and settles",
        "meta": "agentnet_meta not run (no MODEL_API_KEY)",
    }


def run_benchmark(ctx: RunContext, registry: Registry, families: list[str], dev_seeds: list[int],
                  eval_seeds: list[int], source_id: str, target_id: str) -> RunRecord:
    proto = protocol(families, dev_seeds, eval_seeds, source_id, target_id)
    if set(dev_seeds) & set(eval_seeds):
        return ctx.finish(False, "Dev and eval seeds overlap", results={"protocol": proto})
    passport = registry.get_passport(source_id)
    ctx.event("profiling", f"Protocol fixed: {len(families)} families, {len(dev_seeds)} dev + "
              f"{len(eval_seeds)} held-out seeds each", protocol=proto)
    library, dev = [], []
    for task in build_tasks(families, dev_seeds):
        capsule = discover_headless(source_id, task, passport)
        dev.append({"scene_id": task.scene_id, "success": capsule is not None,
                    "strategy": f"{capsule.strategy.route_class}@{capsule.strategy.clearance_m:.2f}" if capsule else None,
                    "skill": capsule.skill_id if capsule else None})
        if capsule:
            library.append(capsule)
    ctx.event("retrieving", f"Dev library: {len(library)}/{len(dev)} source scenes verified", library=dev)
    rows = []
    eval_tasks = build_tasks(families, eval_seeds)
    for i, task in enumerate(eval_tasks, 1):
        scene_rows = evaluate_scene(task, target_id, library)
        rows += scene_rows
        ctx.event("simulating", f"[{i}/{len(eval_tasks)}] {task.scene_id}: " + ", ".join(
            f"{r.variant}={'✓' if r.success else ('n/a' if not r.applicable else '✕')}" for r in scene_rows))
    summary = summarize(rows)
    ctx.event("verifying", f"{len(rows)} rows; {len(common_scene_ids(rows))} scenes comparable across all variants")
    return ctx.finish(True, "Benchmark complete (all results recorded, including failures)",
                      results={"protocol": proto, "dev_library": dev, "rows": rows_json(rows), "summary": summary,
                               "paired": {v: paired_vs_baseline(rows, v) for v in VARIANTS[1:]}})
