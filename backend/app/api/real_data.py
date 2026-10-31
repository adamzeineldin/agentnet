from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_job_worker, get_registry, require_fleet_robot, require_user, started_by
from app.models.user import User
from app.models.real_data import RealReplayRequest
from app.models.run import RunRecord
from app.services import controller
from app.services.jobs import SimulationWorker, create_run, run_guarded
from app.services.real_data import get_episode, load_datasets
from app.services.real_data.replay import PLANNER_NAME, replay_episode
from app.services.registry import Registry
from app.services.robot_catalog import ROBOTS

router = APIRouter(prefix="/api/real-data", tags=["real-data"])


@router.get("")
def list_datasets() -> list[dict]:
    """Imported real-robot datasets with episode summaries (paths omitted)."""
    return [
        {"source": ds.source.model_dump(), "selection": ds.selection, "imported_at": ds.imported_at,
         "episodes": [e.model_dump(exclude={"ee_xyz", "gripper"}) for e in ds.episodes]}
        for ds in load_datasets().values()
    ]


@router.get("/{dataset_id}/{episode_index}")
def episode(dataset_id: str, episode_index: int) -> dict:
    found = get_episode(dataset_id, episode_index)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No episode {episode_index} in '{dataset_id}'")
    ds, ep = found
    return {"source": ds.source.model_dump(), **ep.model_dump()}


@router.post("/replays", response_model=RunRecord, status_code=202)
def start_replay(
    body: RealReplayRequest,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    user: User | None = Depends(require_user),
) -> RunRecord:
    found = get_episode(body.dataset_id, body.episode_index)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No episode {body.episode_index} in '{body.dataset_id}'")
    require_fleet_robot(registry, body.robot_id)
    if body.execute_on == "ursim" and (reason := controller.unavailable_reason(ROBOTS[body.robot_id])):
        raise HTTPException(status.HTTP_409_CONFLICT, reason)
    ds, ep = found
    run = create_run(registry, "real_replay", ep.episode_index, PLANNER_NAME, target_robot_id=body.robot_id,
                     started_by=started_by(user))
    worker.submit(run_guarded, registry, run.run_id,
                  lambda ctx: replay_episode(ctx, ds, ep, body.robot_id, body.execute_on))
    return run
