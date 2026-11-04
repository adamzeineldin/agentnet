from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.api.deps import (
    get_job_worker, get_registry, mark, owner_of, require_fleet_robot, require_user, started_by, viewer_id,
)
from app.models.robot import CatalogEntry, RobotPassport, RobotSummary, StoredModel
from app.models.run import MotionCheckRequest, RunRecord
from app.models.user import User
from app.services import fleet
from app.services.jobs import SimulationWorker, create_run, run_guarded
from app.services.motion_check import default_target, motion_check
from app.services.registry import Registry
from app.services.robot_catalog import ROBOTS
from app.services.storage import StoreError
from app.services.uploads import MAX_UPLOAD_BYTES, ArmChoiceNeeded, UploadError

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/robots", tags=["robots"])


@router.get("", response_model=list[RobotSummary])
def list_robots(
    mine: bool = False, registry: Registry = Depends(get_registry), viewer: str | None = Depends(viewer_id),
) -> list[RobotSummary]:
    """The fleet the viewer may use: catalog arms, public uploads and their own private uploads.
    mine=true: only robots the viewer uploaded."""
    access = registry.robot_access()
    passports = [registry.get_passport(rid) for rid in fleet.fleet_ids(registry, viewer)]
    robots = [fleet.summarize(p, access, viewer) for p in passports if p is not None]
    return [r for r in robots if r.mine] if mine else robots


@router.get("/catalog", response_model=list[CatalogEntry])
def catalog(registry: Registry = Depends(get_registry), viewer: str | None = Depends(viewer_id)) -> list[CatalogEntry]:
    """Every arm Nimbotics ships a model for, and every upload the viewer may see, with whether it is in the fleet."""
    in_fleet = set(fleet.fleet_ids(registry))
    access = registry.robot_access()
    entries = []
    for rid, d in ROBOTS.items():
        if not fleet.robot_visible(access, rid, viewer):
            continue
        owner, visibility = access.get(rid, (None, "public"))
        entries.append(CatalogEntry(
            robot_id=rid, display_name=d.display_name, short_name=d.short_name, maker=d.maker,
            model_source=f"MuJoCo Menagerie · {d.model_dir}" if d.source == "menagerie"
            else f"Uploaded by {d.uploaded_by or 'a visitor'}", in_fleet=rid in in_fleet,
            default_fleet=d.default_fleet, visibility=visibility, mine=owner is not None and owner == viewer))
    return entries


@router.get("/models", response_model=list[StoredModel])
def list_stored_models(
    mine: bool = False, registry: Registry = Depends(get_registry), viewer: str | None = Depends(viewer_id),
) -> list[StoredModel]:
    """Uploads kept as a model only (they cannot run tasks), newest first; mine=true: only the viewer's."""
    models = fleet.stored_models(registry, viewer)
    return [m for m in models if m.mine] if mine else models


class UploadResult(BaseModel):
    """An arm joins the fleet (`robot`); a model-only upload is stored (`model`)."""

    robot: RobotSummary | None = None
    model: StoredModel | None = None
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
    mode: Literal["arm", "model_only"] = "arm",
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    user: User | None = Depends(require_user),
) -> UploadResult:
    """Add your own robot: the request body is the .xml, .urdf or .zip file (see services/uploads.py).

    mode=arm runs tasks with one arm of it; when several limbs could be the arm, the answer is 409 with
    `detail.options` and the upload is repeated with `tool` set to one. mode=model_only stores it without an arm.
    """
    data = await _read_body(request)
    try:
        if mode == "model_only":
            stored = await worker.call(fleet.store_model, worker, registry, filename, data, name.strip(),
                                       started_by(user), owner_of(user))
            return UploadResult(model=stored, notes=stored.notes)
        passport, notes = await worker.call(fleet.upload_robot, worker, registry, filename, data, name.strip(),
                                            tool or None, started_by(user), owner_of(user))
    except ArmChoiceNeeded as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, {
            "message": str(exc), "options": [{"tool": o.tool, "joints": o.joints} for o in exc.options]}) from exc
    except UploadError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except StoreError as exc:
        log.error("Upload %s not stored: %s", filename, exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "The robot could not be saved to cloud storage. Nothing was added; try again shortly.") from exc
    return UploadResult(robot=fleet.summarize(passport, registry.robot_access(), owner_of(user)), notes=notes)


@router.post("/{robot_id}/enable", response_model=RobotSummary)
async def enable_robot(
    robot_id: str,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    user: User | None = Depends(require_user),
) -> RobotSummary:
    """Add a catalog arm to the fleet: its passport is computed from the model first."""
    if robot_id not in ROBOTS or not fleet.robot_visible(registry.robot_access(), robot_id, owner_of(user)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown robot '{robot_id}'")
    try:
        passport = await worker.call(fleet.add_robot, worker, registry, robot_id, started_by(user))
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Could not load {robot_id}: {exc}") from exc
    return fleet.summarize(passport, registry.robot_access(), owner_of(user))


@router.get("/{robot_id}", response_model=RobotPassport)
def get_robot(
    robot_id: str, registry: Registry = Depends(get_registry), viewer: str | None = Depends(viewer_id),
) -> RobotPassport:
    passport = registry.get_passport(require_fleet_robot(registry, robot_id, viewer))
    if passport is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Passport not computed yet")
    return fleet.with_skill_evidence(passport, registry.list_skills(source_robot_id=robot_id, viewer=viewer))


@router.post("/{robot_id}/profile", response_model=RobotPassport)
async def profile_robot(
    robot_id: str,
    seed: int = 0,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    user: User | None = Depends(require_user),
) -> RobotPassport:
    robot_id = require_fleet_robot(registry, robot_id, owner_of(user))
    return await worker.call(fleet.compute_passport, worker, registry, robot_id, seed)


@router.post("/{robot_id}/motion-check", response_model=RunRecord, status_code=202)
def start_motion_check(
    robot_id: str,
    body: MotionCheckRequest,
    registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker),
    user: User | None = Depends(require_user),
) -> RunRecord:
    require_fleet_robot(registry, robot_id, owner_of(user))
    try:
        target = body.validated_target(default_target(robot_id))
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    run = create_run(
        registry, "motion_check", body.seed, planner="direct_joint_space_ik",
        source_robot_id=robot_id, started_by=started_by(user), owner_id=owner_of(user),
    )
    worker.submit(
        run_guarded, registry, run.run_id,
        lambda ctx: motion_check(ctx, robot_id, target, body.seed),
    )
    return mark(run, owner_of(user))
