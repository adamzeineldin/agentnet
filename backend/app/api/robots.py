from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.api.deps import get_job_worker, get_registry, require_fleet_robot, require_user, started_by
from app.models.robot import CatalogEntry, RobotPassport, RobotSummary
from app.models.run import MotionCheckRequest, RunRecord
from app.models.user import User
from app.services import fleet
from app.services.jobs import SimulationWorker, create_run, run_guarded
from app.services.motion_check import DEFAULT_TARGET, motion_check
from app.services.registry import Registry
from app.services.robot_catalog import ROBOTS
from app.services.uploads import MAX_UPLOAD_BYTES, UploadError

router = APIRouter(prefix="/api/robots", tags=["robots"])


@router.get("", response_model=list[RobotSummary])
def list_robots(registry: Registry = Depends(get_registry)) -> list[RobotSummary]:
    """The fleet: arms that can run tasks."""
    passports = [registry.get_passport(rid) for rid in fleet.fleet_ids(registry)]
    return [fleet.summarize(p) for p in passports if p is not None]


@router.get("/catalog", response_model=list[CatalogEntry])
def catalog(registry: Registry = Depends(get_registry)) -> list[CatalogEntry]:
    """Every arm Nimbotics ships a model for, and whether it is in the fleet."""
    in_fleet = set(fleet.fleet_ids(registry))
    return [
        CatalogEntry(robot_id=rid, display_name=d.display_name, short_name=d.short_name, maker=d.maker,
                     model_source=f"MuJoCo Menagerie · {d.model_dir}" if d.source == "menagerie"
                     else f"Uploaded by {d.uploaded_by or 'a visitor'}", in_fleet=rid in in_fleet,
                     default_fleet=d.default_fleet)
        for rid, d in ROBOTS.items()
    ]


class UploadResult(BaseModel):
    robot: RobotSummary
    notes: list[str]


async def _read_body(request: Request) -> bytes:
    if int(request.headers.get("content-length") or 0) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Uploads are limited to {MAX_UPLOAD_BYTES // 2**20} MB")
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Uploads are limited to {MAX_UPLOAD_BYTES // 2**20} MB")
        chunks.append(chunk)
    if not size:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The upload is empty")
    return b"".join(chunks)


@router.post("/upload", response_model=UploadResult, status_code=201)
async def upload_robot(
    request: Request,
    name: str = Query(min_length=1, max_length=40, pattern=r"^[\w .()+-]+$"),
    filename: str = Query(min_length=1, max_length=120),
    tool: str | None = Query(default=None, max_length=64, pattern=r"^[\w./-]+$"),
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    user: User | None = Depends(require_user),
) -> UploadResult:
    """Add your own arm: the request body is the .xml, .urdf or .zip file (see services/uploads.py)."""
    data = await _read_body(request)
    try:
        passport, notes = await worker.call(fleet.upload_robot, worker, registry, filename, data, name.strip(),
                                            tool or None, started_by(user))
    except UploadError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return UploadResult(robot=fleet.summarize(passport), notes=notes)


@router.post("/{robot_id}/enable", response_model=RobotSummary)
async def enable_robot(
    robot_id: str,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    user: User | None = Depends(require_user),
) -> RobotSummary:
    """Add a catalog arm to the fleet: its passport is computed from the model first."""
    if robot_id not in ROBOTS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown robot '{robot_id}'")
    try:
        passport = await worker.call(fleet.add_robot, worker, registry, robot_id, started_by(user))
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Could not load {robot_id}: {exc}") from exc
    return fleet.summarize(passport)


@router.get("/{robot_id}", response_model=RobotPassport)
def get_robot(robot_id: str, registry: Registry = Depends(get_registry)) -> RobotPassport:
    passport = registry.get_passport(require_fleet_robot(registry, robot_id))
    if passport is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Passport not computed yet")
    return fleet.with_skill_evidence(passport, registry.list_skills(source_robot_id=robot_id))


@router.post("/{robot_id}/profile", response_model=RobotPassport)
async def profile_robot(
    robot_id: str,
    seed: int = 0,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    _: User | None = Depends(require_user),
) -> RobotPassport:
    return await worker.call(fleet.compute_passport, worker, registry, require_fleet_robot(registry, robot_id), seed)


@router.post("/{robot_id}/motion-check", response_model=RunRecord, status_code=202)
def start_motion_check(
    robot_id: str,
    body: MotionCheckRequest,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    user: User | None = Depends(require_user),
) -> RunRecord:
    require_fleet_robot(registry, robot_id)
    try:
        target = body.validated_target(DEFAULT_TARGET)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    run = create_run(
        registry, "motion_check", body.seed, planner="direct_joint_space_ik",
        source_robot_id=robot_id, started_by=started_by(user),
    )
    worker.submit(
        run_guarded, registry, run.run_id,
        lambda ctx: motion_check(ctx, robot_id, target, body.seed),
    )
    return run
