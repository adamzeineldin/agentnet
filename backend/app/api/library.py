from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict

from app.api.deps import get_registry, owner_of, require_user, viewer_id
from app.models.user import User
from app.models.learning import CheckRequest, LearningCheck
from app.models.library import LibraryReport
from app.models.scout import ScoutPlan, ScoutRequest
from app.services.librarian import build_report, get_librarian
from app.services.reasoning import meta_available
from app.services.registry import Registry
from app.services.fleet import fleet_ids, summarize
from app.services.librarian.check import check
from app.services.librarian.scout import scout
from app.services.task_families import TASK_TYPES

# Enough transfer runs onto one robot to see every earlier improvement attempt.
TRIED_RUNS = 500

router = APIRouter(prefix="/api/library", tags=["library"])


class OrganizeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Literal["offline", "meta"] = "offline"


@router.post("/reports", response_model=LibraryReport, status_code=201)
def create_report(
    body: OrganizeRequest, registry: Registry = Depends(get_registry), _: User | None = Depends(require_user),
) -> LibraryReport:
    """Organize the published registry. Read-only over skills; the report itself is stored.

    `meta` adds Muse-written text and priorities (one bounded call, usually two); if the model
    fails, the offline report is stored with the error and the billed calls.
    """
    if body.provider == "meta" and not meta_available():
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Muse librarian requested but MODEL_API_KEY is not configured; use provider='offline'")
    # Reports are stored and shown to everyone, so they are built from public skills and robots only.
    report = build_report(registry.list_skills(viewer=None), fleet_ids(registry, None), get_librarian(body.provider))
    return registry.save_library_report(report)


@router.get("/reports/latest", response_model=LibraryReport)
def latest_report(registry: Registry = Depends(get_registry)) -> LibraryReport:
    report = registry.latest_library_report()
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No library report yet; POST /api/library/reports")
    return report


@router.get("/reports/{report_id}", response_model=LibraryReport)
def get_report(report_id: str, registry: Registry = Depends(get_registry)) -> LibraryReport:
    report = registry.get_library_report(report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown library report '{report_id}'")
    return report


@router.post("/scout", response_model=ScoutPlan)
def scout_plan(
    body: ScoutRequest, registry: Registry = Depends(get_registry), user: User | None = Depends(require_user),
) -> ScoutPlan:
    """Which task type a goal is and which saved skills `robot_id` should learn from (read-only suggestion).

    `auto` uses Muse when MODEL_API_KEY is set (one call, cached per goal and library), else the offline scout.
    """
    if body.provider == "meta" and not meta_available():
        raise HTTPException(status.HTTP_409_CONFLICT, "Muse scout requested but MODEL_API_KEY is not configured")
    viewer = owner_of(user)
    robots = _visible_robots(registry, viewer)
    learner = next((r for r in robots if r.robot_id == body.robot_id), None)
    if learner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{body.robot_id} is not in the fleet")
    return scout(body.goal, learner, robots, registry.list_skills(viewer=viewer), body.provider)


@router.post("/check", response_model=LearningCheck)
def learning_check(
    body: CheckRequest, registry: Registry = Depends(get_registry), viewer: str | None = Depends(viewer_id),
) -> LearningCheck:
    """Before anything learns: does `robot_id` know this task, does another robot, or nobody? (read-only, no model)

    `from_robot_id` is the robot the user asked to learn from; it is used only if it has a verified skill.
    """
    if body.task_family not in TASK_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown task type {body.task_family!r}")
    robots = _visible_robots(registry, viewer)
    robot = next((r for r in robots if r.robot_id == body.robot_id), None)
    if robot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{body.robot_id} is not in the fleet")
    runs = registry.list_runs(run_type="transfer", robot_id=body.robot_id, limit=TRIED_RUNS, viewer=viewer)
    return check(robot, body.task_family, robots, registry.list_skills(viewer=viewer), runs, body.from_robot_id)


def _visible_robots(registry: Registry, viewer: str | None) -> list:
    """Fleet cards of the robots viewer may use (catalog arms, public uploads, their own private uploads)."""
    access = registry.robot_access()
    return [summarize(p, access, viewer) for rid in fleet_ids(registry, viewer)
            if (p := registry.get_passport(rid)) is not None]
