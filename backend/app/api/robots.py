from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_job_worker, get_registry
from app.models.robot import RobotPassport, RobotSummary
from app.models.run import MotionCheckRequest, RunRecord
from app.services import fleet
from app.services.jobs import SimulationWorker, create_run, run_guarded
from app.services.motion_check import DEFAULT_TARGET, motion_check
from app.services.registry import Registry
from app.services.robot_catalog import ROBOTS

router = APIRouter(prefix="/api/robots", tags=["robots"])


def _require_robot(robot_id: str) -> str:
    if robot_id not in ROBOTS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown robot '{robot_id}'")
    return robot_id


@router.get("", response_model=list[RobotSummary])
def list_robots(registry: Registry = Depends(get_registry)) -> list[RobotSummary]:
    passports = [registry.get_passport(rid) for rid in ROBOTS]
    return [fleet.summarize(p) for p in passports if p is not None]


@router.get("/{robot_id}", response_model=RobotPassport)
def get_robot(robot_id: str, registry: Registry = Depends(get_registry)) -> RobotPassport:
    passport = registry.get_passport(_require_robot(robot_id))
    if passport is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Passport not computed yet")
    return fleet.with_skill_evidence(passport, registry.list_skills(source_robot_id=robot_id))


@router.post("/{robot_id}/profile", response_model=RobotPassport)
async def profile_robot(
    robot_id: str,
    seed: int = 0,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
) -> RobotPassport:
    return await worker.call(fleet.compute_passport, worker, registry, _require_robot(robot_id), seed)


@router.post("/{robot_id}/motion-check", response_model=RunRecord, status_code=202)
def start_motion_check(
    robot_id: str,
    body: MotionCheckRequest,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
) -> RunRecord:
    _require_robot(robot_id)
    try:
        target = body.validated_target(DEFAULT_TARGET)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    run = create_run(
        registry, "motion_check", body.seed, planner="direct_joint_space_ik",
        source_robot_id=robot_id,
    )
    worker.submit(
        run_guarded, registry, run.run_id,
        lambda ctx: motion_check(ctx, robot_id, target, body.seed),
    )
    return run
