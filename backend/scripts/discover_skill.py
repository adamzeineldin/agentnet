"""Headless M2 demo: discover (and optionally publish) a source skill.

Usage (from backend/): .venv/bin/python scripts/discover_skill.py [--robot panda_01] [--seed 42] [--publish]
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import DATABASE  # noqa: E402
from app.services.fleet import ensure_passports  # noqa: E402
from app.services.jobs import SimulationWorker, create_run, run_guarded  # noqa: E402
from app.services.registry import Registry  # noqa: E402
from app.services.skill_discovery import PLANNER_NAME, discover_skill  # noqa: E402
from app.services.skill_registry import publish_from_run  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--robot", default="panda_01")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    registry, worker = Registry(DATABASE), SimulationWorker()
    try:
        passports = {p.robot_id: p for p in worker.submit(ensure_passports, worker, registry).result()}
        run = create_run(registry, "discover", args.seed, PLANNER_NAME, source_robot_id=args.robot)
        final = worker.submit(
            run_guarded, registry, run.run_id,
            lambda ctx: discover_skill(ctx, args.robot, args.seed, passports[args.robot]),
        ).result()
    finally:
        worker.shutdown()
    print(f"\n{final.run_id}: {final.status}  endpoint_error={final.endpoint_error_m}  collisions={final.collision_count}")
    for c in final.candidate_summaries:
        print(f"  {c['candidate_id']:15s} {c['outcome']:22s} {c['reason'][:80]}")
    print("artifacts:", final.artifacts)
    if args.publish and final.status == "succeeded":
        capsule = publish_from_run(registry, final.run_id)
        print("published:", capsule.skill_id)
    return 0 if final.status == "succeeded" else 1


if __name__ == "__main__":
    sys.exit(main())
