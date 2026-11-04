"""Stability check before recording: repeat the demo chain and require identical, successful outcomes.

Runs in a throwaway registry (never the dev or demo DB). Exits non-zero on any failure or drift.
Usage (from backend/): .venv/bin/python scripts/demo_check.py [--repeats 5] [--seeds 7 42]
"""

from __future__ import annotations

import argparse
import logging
import os
import statistics
import sys
import tempfile
import time
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="nimbotics-democheck-"))
os.environ["NIMBOTICS_DB_PATH"] = str(_TMP / "check.db")
os.environ["NIMBOTICS_ARTIFACT_DIR"] = str(_TMP / "artifacts")
os.environ["NIMBOTICS_S3_BUCKET"] = ""  # a throwaway check: never push its files to the cloud Library
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.demo_pipeline import run_chain  # noqa: E402
from app.services.fleet import ensure_passports  # noqa: E402
from app.services.jobs import SimulationWorker  # noqa: E402
from app.services.registry import Registry  # noqa: E402
from app.config import DB_PATH  # noqa: E402


def signature(chain) -> tuple:
    s, t = chain.source_run, chain.target_run
    return (s.status, s.results.get("selected"), round(s.endpoint_error_m or -1, 9),
            t.status if t else None, t.results.get("selected") if t else None,
            round(t.endpoint_error_m or -1, 9) if t else None)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeats", type=int, default=5)
    ap.add_argument("--seeds", type=int, nargs="+", default=[7, 42])
    args = ap.parse_args()
    logging.basicConfig(level=logging.WARNING)
    assert "democheck" in str(DB_PATH), DB_PATH
    registry, worker = Registry(DB_PATH), SimulationWorker()
    ok = True
    try:
        passports = {p.robot_id: p for p in worker.submit(ensure_passports, worker, registry).result()}
        for seed in args.seeds:
            sigs, times = [], []
            for _ in range(args.repeats):
                t0 = time.perf_counter()
                chain = run_chain(registry, worker, passports, seed)
                times.append(time.perf_counter() - t0)
                sigs.append(signature(chain))
                ok &= chain.ok and chain.target_capsule is not None
            stable = len(set(sigs)) == 1
            ok &= stable
            s = sigs[0]
            print(f"seed {seed}: {args.repeats} runs, {'STABLE' if stable else 'DRIFT'}; "
                  f"Panda {s[0]} {s[1]} ({s[2] * 1000:.2f} mm) → UR5e {s[3]} {s[4]} ({(s[5] or 0) * 1000:.2f} mm); "
                  f"chain wall time median {statistics.median(times):.2f}s, max {max(times):.2f}s")
            if not stable:
                for sig in sorted(set(sigs)):
                    print("   variant:", sig)
    finally:
        worker.shutdown()
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
