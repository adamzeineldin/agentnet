"""FastAPI dependency accessors for app-scoped services."""

from __future__ import annotations

from fastapi import HTTPException, Request, status

from app.config import MAX_PENDING_JOBS
from app.services.jobs import SimulationWorker
from app.services.registry import Registry


def get_registry(request: Request) -> Registry:
    return request.app.state.registry


def get_worker(request: Request) -> SimulationWorker:
    return request.app.state.worker


def check_capacity(worker: SimulationWorker) -> None:
    """Refuse new simulation jobs while MAX_PENDING_JOBS are queued (public cloud copy). 0 = no limit."""
    if MAX_PENDING_JOBS and worker.pending >= MAX_PENDING_JOBS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"The simulator is busy with {worker.pending} queued runs; try again in a minute.")


def get_job_worker(request: Request) -> SimulationWorker:
    """The worker, for endpoints that queue a simulation job."""
    worker = get_worker(request)
    check_capacity(worker)
    return worker
