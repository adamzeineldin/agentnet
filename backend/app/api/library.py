from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict

from app.api.deps import get_registry, require_user
from app.models.user import User
from app.models.library import LibraryReport
from app.models.scout import ScoutPlan, ScoutRequest
from app.services.librarian import build_report, get_librarian
from app.services.reasoning import meta_available
from app.services.registry import Registry
from app.services.fleet import fleet_ids, summarize
from app.services.librarian.scout import scout

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
    report = build_report(registry.list_skills(), fleet_ids(registry), get_librarian(body.provider))
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
    body: ScoutRequest, registry: Registry = Depends(get_registry), _: User | None = Depends(require_user),
) -> ScoutPlan:
    """Which task type a goal is and which saved skills `robot_id` should learn from (read-only suggestion).

    `auto` uses Muse when MODEL_API_KEY is set (one call, cached per goal and library), else the offline scout.
    """
    if body.provider == "meta" and not meta_available():
        raise HTTPException(status.HTTP_409_CONFLICT, "Muse scout requested but MODEL_API_KEY is not configured")
    robots = [summarize(p) for rid in fleet_ids(registry) if (p := registry.get_passport(rid)) is not None]
    learner = next((r for r in robots if r.robot_id == body.robot_id), None)
    if learner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{body.robot_id} is not in the fleet")
    return scout(body.goal, learner, robots, registry.list_skills(), body.provider)
