"""Create a clean demo registry for recording: real runs only, nothing fabricated.

Seeds: passports, one motion check per robot, the seed-7 Panda → UR5e chain (published both ways),
and one held-out benchmark. Usage (from repo root): make demo-seed
Paths come from AGENTNET_DB_PATH / AGENTNET_ARTIFACT_DIR (the Makefile points them at app/data/demo/).
"""

from __future__ import annotations

import argparse
import logging
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import ARTIFACT_DIR, DB_PATH  # noqa: E402
from app.services.benchmark import run_benchmark  # noqa: E402
from app.services.demo_pipeline import SOURCE, TARGET, run_chain  # noqa: E402
from app.services.fleet import ensure_passports  # noqa: E402
from app.services.jobs import SimulationWorker, create_run, run_guarded  # noqa: E402
from app.services.motion_check import DEFAULT_TARGET, motion_check  # noqa: E402
from app.services.registry import Registry  # noqa: E402

DEMO_SEED = 7


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="delete the demo DB and artifacts first")
    args = ap.parse_args()
    logging.basicConfig(level=logging.WARNING)
    if "demo" not in DB_PATH.parts:
        print(f"Refusing: DB_PATH {DB_PATH} is not a demo path. Run via `make demo-seed`.")
        return 2
    if args.reset:
        DB_PATH.unlink(missing_ok=True)
        shutil.rmtree(ARTIFACT_DIR, ignore_errors=True)
    registry, worker = Registry(DB_PATH), SimulationWorker()
    try:
        passports = {p.robot_id: p for p in worker.submit(ensure_passports, worker, registry).result()}
        for rid in (SOURCE, TARGET):
            run = create_run(registry, "motion_check", 7, "direct_joint_space_ik", source_robot_id=rid)
            mc = worker.submit(run_guarded, registry, run.run_id,
                               lambda ctx, r=rid: motion_check(ctx, r, DEFAULT_TARGET, 7)).result()
            print(f"motion check {rid}: {mc.status}")
        chain = run_chain(registry, worker, passports, DEMO_SEED)
        print(f"chain seed {DEMO_SEED}: source {chain.source_run.status}, "
              f"target {chain.target_run.status if chain.target_run else 'not run'}, "
              f"published {chain.source_capsule and chain.source_capsule.skill_id} -> "
              f"{chain.target_capsule and chain.target_capsule.skill_id}")
        run = create_run(registry, "benchmark", 100, "evaluation_v1", source_robot_id=SOURCE, target_robot_id=TARGET)
        bench = worker.submit(run_guarded, registry, run.run_id, lambda ctx: run_benchmark(
            ctx, registry, ["wall_reach_v1", "wall_roof_v1"], list(range(10)), list(range(100, 110)),
            SOURCE, TARGET)).result()
        print(f"benchmark: {bench.status}")
    finally:
        worker.shutdown()
    print(f"demo registry: {DB_PATH}")
    return 0 if chain.ok and bench.status == "succeeded" else 1


if __name__ == "__main__":
    sys.exit(main())
