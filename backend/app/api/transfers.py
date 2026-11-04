from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import (
    get_job_worker, get_registry, mark, owner_of, require_fleet_robot, require_skill, require_user, started_by,
)
from app.models.user import User
from app.models.run import RunRecord, TransferRequest
from app.services import controller
from app.services.jobs import RunContext, SimulationWorker, create_run, run_guarded
from app.services.reasoning import meta_available
from app.services.registry import Registry
from app.services.robot_catalog import ROBOTS
from app.services.skill_registry import publish_when_verified
from app.services.transfer import PLANNER_NAME, transfer_skill

router = APIRouter(prefix="/api/transfers", tags=["transfers"])


@router.post("", response_model=RunRecord, status_code=202)
def start_transfer(
    body: TransferRequest,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    user: User | None = Depends(require_user),
) -> RunRecord:
    viewer = owner_of(user)
    require_fleet_robot(registry, body.target_robot_id, viewer)
    capsule = require_skill(registry, body.source_skill_id, viewer)
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
        target_robot_id=body.target_robot_id, skill_id=capsule.skill_id, started_by=started_by(user),
        owner_id=viewer,
    )

    def body_fn(ctx: RunContext) -> RunRecord:
        if body.publish:
            ctx.before_finish = publish_when_verified(registry, ctx.run_id)
        return transfer_skill(ctx, registry, body.source_skill_id, body.target_robot_id, body.scene_seed, passport,
                              body.reasoning_mode, body.execute_on)

    worker.submit(run_guarded, registry, run.run_id, body_fn)
    return mark(run, viewer)
