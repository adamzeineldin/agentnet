from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_job_worker, get_registry
from app.models.run import BenchmarkRequest, RunRecord
from app.services.benchmark import run_benchmark
from app.services.jobs import SimulationWorker, create_run, run_guarded
from app.services.registry import Registry
from app.services.robot_catalog import ROBOTS

router = APIRouter(prefix="/api/benchmarks", tags=["benchmarks"])


@router.get("", response_model=list[RunRecord])
def list_benchmarks(limit: int = 20, registry: Registry = Depends(get_registry)) -> list[RunRecord]:
    return registry.list_runs(run_type="benchmark", limit=min(max(limit, 1), 100))


@router.post("", response_model=RunRecord, status_code=202)
def start_benchmark(
    body: BenchmarkRequest,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
) -> RunRecord:
    for rid in (body.source_robot_id, body.target_robot_id):
        if rid not in ROBOTS:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown robot '{rid}'")
    if set(body.dev_seeds) & set(body.eval_seeds):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "dev_seeds and eval_seeds must be disjoint")
    if registry.get_passport(body.source_robot_id) is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Source passport not computed yet")
    run = create_run(registry, "benchmark", body.eval_seeds[0], planner="evaluation_v1",
                     source_robot_id=body.source_robot_id, target_robot_id=body.target_robot_id)
    worker.submit(run_guarded, registry, run.run_id, lambda ctx: run_benchmark(
        ctx, registry, list(body.families), list(body.dev_seeds), list(body.eval_seeds),
        body.source_robot_id, body.target_robot_id))
    return run
