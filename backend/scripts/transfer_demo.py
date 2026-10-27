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
from app.services.demo_pipeline import run_chain  # noqa: E402
from app.services.jobs import SimulationWorker  # noqa: E402
from app.services.registry import Registry  # noqa: E402


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
        chain = run_chain(registry, worker, passports, args.seed, args.target_seed, publish=args.publish)
    finally:
        worker.shutdown()
    _print(chain.source_run)
    if chain.target_run is None:
        return 1
    print("published source:", chain.source_capsule.skill_id)
    dst = chain.target_run
    _print(dst)
    for c in dst.results.get("compatibility", []):
        print(f"  [{c['status']}] {c['check']}: {c['detail']}")
    print("adaptation:", dst.results.get("adaptation"))
    if chain.target_capsule:
        print("published adaptation:", chain.target_capsule.skill_id)
    return 0 if chain.ok else 1


if __name__ == "__main__":
    sys.exit(main())
