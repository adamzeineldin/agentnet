from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_registry, get_worker
from app.models.run import RunRecord, TransferRequest
from app.services import controller
from app.services.jobs import SimulationWorker, create_run, run_guarded
from app.services.reasoning import meta_available
from app.services.registry import Registry
from app.services.robot_catalog import ROBOTS
from app.services.transfer import PLANNER_NAME, transfer_skill

router = APIRouter(prefix="/api/transfers", tags=["transfers"])


@router.post("", response_model=RunRecord, status_code=202)
def start_transfer(
    body: TransferRequest,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_worker),
) -> RunRecord:
    if body.target_robot_id not in ROBOTS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown robot '{body.target_robot_id}'")
    capsule = registry.get_skill(body.source_skill_id)
    if capsule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown skill '{body.source_skill_id}'")
    if capsule.source_robot_id == body.target_robot_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Target robot is the capsule's source robot")
    if body.reasoning_mode == "meta" and not meta_available():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Meta reasoning requested but MODEL_API_KEY is not configured; use reasoning_mode='offline'",
        )
    if body.execute_on == "ursim" and (reason := controller.unavailable_reason(ROBOTS[body.target_robot_id])):
        raise HTTPException(status.HTTP_409_CONFLICT, reason)
    passport = registry.get_passport(body.target_robot_id)
    if passport is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Target passport not computed yet")
    run = create_run(
        registry, "transfer", body.scene_seed if body.scene_seed is not None else capsule.task.seed,
        planner=f"{PLANNER_NAME}+{body.reasoning_mode}", source_robot_id=capsule.source_robot_id,
        target_robot_id=body.target_robot_id, skill_id=capsule.skill_id,
    )
    worker.submit(
        run_guarded, registry, run.run_id,
        lambda ctx: transfer_skill(
            ctx, registry, body.source_skill_id, body.target_robot_id, body.scene_seed, passport,
            body.reasoning_mode, body.execute_on,
        ),
    )
    return run
