from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict

from app.api.deps import get_registry
from app.models.library import LibraryReport
from app.services.librarian import organize
from app.services.registry import Registry
from app.services.robot_catalog import ROBOTS

router = APIRouter(prefix="/api/library", tags=["library"])


class OrganizeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Literal["offline"] = "offline"


@router.post("/reports", response_model=LibraryReport, status_code=201)
def create_report(body: OrganizeRequest, registry: Registry = Depends(get_registry)) -> LibraryReport:
    """Organize the published registry. Read-only over skills; the report itself is stored."""
    return registry.save_library_report(organize(registry.list_skills(), list(ROBOTS)))


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
