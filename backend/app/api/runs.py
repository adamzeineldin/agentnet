from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.api.deps import get_registry
from app.models.run import TERMINAL_STATUSES, RunRecord
from app.services.registry import Registry

router = APIRouter(prefix="/api/runs", tags=["runs"])
POLL_SECONDS = 0.3


def _require_run(registry: Registry, run_id: str) -> RunRecord:
    run = registry.get_run(run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown run '{run_id}'")
    return run


@router.get("", response_model=list[RunRecord])
def list_runs(
    run_type: str | None = None,
    robot_id: str | None = None,
    limit: int = 50,
    registry: Registry = Depends(get_registry),
) -> list[RunRecord]:
    return registry.list_runs(run_type=run_type, robot_id=robot_id, limit=min(max(limit, 1), 500))


@router.get("/{run_id}", response_model=RunRecord)
def get_run(run_id: str, registry: Registry = Depends(get_registry)) -> RunRecord:
    return _require_run(registry, run_id)


@router.get("/{run_id}/artifacts")
def get_artifacts(run_id: str, registry: Registry = Depends(get_registry)) -> dict:
    run = _require_run(registry, run_id)
    return {"run_id": run.run_id, "status": run.status, "artifacts": run.artifacts}


@router.get("/{run_id}/events")
async def stream_events(run_id: str, registry: Registry = Depends(get_registry)) -> StreamingResponse:
    """Server-sent events: one `event` per RunEvent, then `done` with the final record."""
    _require_run(registry, run_id)

    async def gen() -> AsyncIterator[str]:
        sent = 0
        while True:
            run = registry.get_run(run_id)
            for ev in run.events[sent:]:
                yield f"event: progress\ndata: {ev.model_dump_json()}\n\n"
            sent = len(run.events)
            if run.status in TERMINAL_STATUSES:
                yield f"event: done\ndata: {json.dumps({'status': run.status})}\n\n"
                return
            await asyncio.sleep(POLL_SECONDS)

    return StreamingResponse(gen(), media_type="text/event-stream")
