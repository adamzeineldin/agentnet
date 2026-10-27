"""Headless M3 demo: Panda discovers + publishes a skill, UR5e transfers it.

Usage (from backend/): .venv/bin/python scripts/transfer_demo.py [--seed 42] [--target-seed N] [--publish]
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import DB_PATH  # noqa: E402
from app.services.fleet import ensure_passports  # noqa: E402
from app.services.jobs import SimulationWorker, create_run, run_guarded  # noqa: E402
from app.services.registry import Registry  # noqa: E402
from app.services.skill_discovery import discover_skill  # noqa: E402
from app.services.skill_discovery import PLANNER_NAME as DISCOVER_PLANNER  # noqa: E402
from app.services.skill_registry import publish_from_run  # noqa: E402
from app.services.transfer import PLANNER_NAME, transfer_skill  # noqa: E402


def _print(run) -> None:
    print(f"\n{run.run_type} {run.run_id}: {run.status}  err={run.endpoint_error_m}  collisions={run.collision_count}")
    for c in run.candidate_summaries:
        rank = f"#{c['prior_rank']:<2}" if c.get("prior_rank") else "   "
        print(f"  {rank} {c['candidate_id']:15s} {c['outcome']:22s} {c['reason'][:70]}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--target-seed", type=int, default=None)
    ap.add_argument("--publish", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.WARNING)
    registry, worker = Registry(DB_PATH), SimulationWorker()
    try:
        passports = {p.robot_id: p for p in worker.submit(ensure_passports, worker, registry).result()}
        run = create_run(registry, "discover", args.seed, DISCOVER_PLANNER, source_robot_id="panda_01")
        src = worker.submit(run_guarded, registry, run.run_id,
                            lambda ctx: discover_skill(ctx, "panda_01", args.seed, passports["panda_01"])).result()
        _print(src)
        if src.status != "succeeded":
            return 1
        capsule = publish_from_run(registry, src.run_id)
        print("published source:", capsule.skill_id)
        seed = args.target_seed if args.target_seed is not None else capsule.task.seed
        run = create_run(registry, "transfer", seed, PLANNER_NAME, source_robot_id="panda_01",
                         target_robot_id="ur5e_01", skill_id=capsule.skill_id)
        dst = worker.submit(run_guarded, registry, run.run_id,
                            lambda ctx: transfer_skill(ctx, registry, capsule.skill_id, "ur5e_01",
                                                       args.target_seed, passports["ur5e_01"])).result()
    finally:
        worker.shutdown()
    _print(dst)
    for c in dst.results.get("compatibility", []):
        print(f"  [{c['status']}] {c['check']}: {c['detail']}")
    print("adaptation:", dst.results.get("adaptation"), "\nmetrics:", {k: v for k, v in dst.results.get("search_metrics", {}).items() if "order" not in k})
    if args.publish and dst.status == "succeeded":
        print("published adaptation:", publish_from_run(registry, dst.run_id).skill_id)
    return 0 if dst.status == "succeeded" else 1


if __name__ == "__main__":
    sys.exit(main())
