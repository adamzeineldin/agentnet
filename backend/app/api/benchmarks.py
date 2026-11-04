from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import (
    get_job_worker, get_registry, mark, owner_of, require_fleet_robot, require_user, started_by, viewer_id,
)
from app.models.user import User
from app.models.run import BenchmarkRequest, RunRecord
from app.services.benchmark import run_benchmark
from app.services.jobs import SimulationWorker, create_run, run_guarded
from app.services.registry import Registry

router = APIRouter(prefix="/api/benchmarks", tags=["benchmarks"])


@router.get("", response_model=list[RunRecord])
def list_benchmarks(
    limit: int = 20, registry: Registry = Depends(get_registry), viewer: str | None = Depends(viewer_id),
) -> list[RunRecord]:
    runs = registry.list_runs(run_type="benchmark", limit=min(max(limit, 1), 100), viewer=viewer)
    return [mark(r, viewer) for r in runs]


@router.post("", response_model=RunRecord, status_code=202)
def start_benchmark(
    body: BenchmarkRequest,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    user: User | None = Depends(require_user),
) -> RunRecord:
    for rid in (body.source_robot_id, body.target_robot_id):
        require_fleet_robot(registry, rid, owner_of(user))
    if set(body.dev_seeds) & set(body.eval_seeds):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "dev_seeds and eval_seeds must be disjoint")
    if registry.get_passport(body.source_robot_id) is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Source passport not computed yet")
    run = create_run(registry, "benchmark", body.eval_seeds[0], planner="evaluation_v1",
                     source_robot_id=body.source_robot_id, target_robot_id=body.target_robot_id,
                     started_by=started_by(user), owner_id=owner_of(user))
    worker.submit(run_guarded, registry, run.run_id, lambda ctx: run_benchmark(
        ctx, registry, list(body.families), list(body.dev_seeds), list(body.eval_seeds),
        body.source_robot_id, body.target_robot_id))
    return mark(run, owner_of(user))
