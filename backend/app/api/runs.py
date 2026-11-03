from __future__ import annotations

import asyncio
import base64
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from app.api.deps import get_job_worker, get_registry, require_fleet_robot, require_user, started_by
from app.models.user import User
from app.models.run import TERMINAL_STATUSES, DiscoverRequest, RunRecord
from app.services.jobs import SimulationWorker, create_run, run_guarded
from app.services.live import LIVE
from app.services.skill_discovery import PLANNER_NAME, discover_skill
from app.services.registry import Registry

router = APIRouter(prefix="/api/runs", tags=["runs"])
POLL_SECONDS = 0.3
# Proxies (e.g. GitHub Codespaces port forwarding) cut a stream after ~100 s without bytes; a comment line keeps it open.
KEEPALIVE_SECONDS = 15.0
# Small result fields a run list needs (cards, "latest attempt" lookups); the rest comes from GET /api/runs/{id}.
COMPACT_RESULT_KEYS = ("source_skill_id", "selected", "published", "adaptation", "episode_id")


def _require_run(registry: Registry, run_id: str) -> RunRecord:
    run = registry.get_run(run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown run '{run_id}'")
    return run


def compact(run: RunRecord) -> RunRecord:
    """The run without its event log and bulky results (candidate paths, traces, reasoning)."""
    small = {k: run.results[k] for k in COMPACT_RESULT_KEYS if k in run.results}
    return run.model_copy(update={"events": run.events[-1:], "results": small, "candidate_summaries": []})


@router.get("", response_model=list[RunRecord])
def list_runs(
    run_type: str | None = None,
    robot_id: str | None = None,
    run_status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    full: bool = True,
    registry: Registry = Depends(get_registry),
) -> list[RunRecord]:
    """Newest first. run_status: a status, or "running" for every unfinished run. full=false returns compact runs."""
    running = run_status == "running"
    runs = registry.list_runs(
        run_type=run_type, robot_id=robot_id, limit=min(max(limit, 1), 500), offset=max(offset, 0),
        statuses=[run_status] if run_status and not running else None,
        exclude_statuses=TERMINAL_STATUSES if running else None,
    )
    return runs if full else [compact(r) for r in runs]


@router.post("/discover", response_model=RunRecord, status_code=202)
def start_discover(
    body: DiscoverRequest,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    user: User | None = Depends(require_user),
) -> RunRecord:
    require_fleet_robot(registry, body.robot_id)
    passport = registry.get_passport(body.robot_id)
    if passport is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Passport not computed yet")
    run = create_run(
        registry, "discover", body.scene_seed, planner=PLANNER_NAME, source_robot_id=body.robot_id,
        started_by=started_by(user),
    )
    worker.submit(
        run_guarded, registry, run.run_id,
        lambda ctx: discover_skill(ctx, body.robot_id, body.scene_seed, passport),
    )
    return run


@router.get("/{run_id}", response_model=RunRecord)
def get_run(run_id: str, registry: Registry = Depends(get_registry)) -> RunRecord:
    return _require_run(registry, run_id)


@router.get("/{run_id}/live")
def live_frame(run_id: str, after: int = 0, registry: Registry = Depends(get_registry)) -> Response:
    """Newest rendered frame of a running run as {seq, label, image}; 204 when there is none newer than `after`."""
    _require_run(registry, run_id)
    frame = LIVE.get(run_id)
    if frame is None or frame.seq <= after:
        return Response(status_code=status.HTTP_204_NO_CONTENT, headers={"Cache-Control": "no-store"})
    image = "data:image/jpeg;base64," + base64.b64encode(frame.jpeg).decode()
    body = json.dumps({"seq": frame.seq, "label": frame.label, "image": image})
    return Response(body, media_type="application/json", headers={"Cache-Control": "no-store"})


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
        quiet = 0.0
        while True:
            run = registry.get_run(run_id)
            for ev in run.events[sent:]:
                yield f"event: progress\ndata: {ev.model_dump_json()}\n\n"
                quiet = 0.0
            sent = len(run.events)
            if run.status in TERMINAL_STATUSES:
                yield f"event: done\ndata: {json.dumps({'status': run.status})}\n\n"
                return
            if quiet >= KEEPALIVE_SECONDS:
                yield ": keep-alive\n\n"
                quiet = 0.0
            await asyncio.sleep(POLL_SECONDS)
            quiet += POLL_SECONDS

    return StreamingResponse(gen(), media_type="text/event-stream")
