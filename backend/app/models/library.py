"""Library Report: an organization of the published skill registry.

A report only *describes* the registry: it never edits, merges or deletes
capsules, and its suggestions are not executed. Every entry references
existing skill ids and states the rule (basis) that produced it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.skill import RouteClass

LIBRARY_SCHEMA_VERSION = "1.0"
LibrarianProvider = Literal["offline_librarian"]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True)


class SkillCollection(_Frozen):
    collection_id: str
    title: str
    scene_family: str
    route_class: RouteClass
    skill_ids: list[str]
    robot_ids: list[str]
    basis: str


class DuplicateGroup(_Frozen):
    keep_skill_id: str
    duplicate_skill_ids: list[str]
    robot_id: str
    scene_id: str
    strategy: str
    basis: str


class CoverageGap(_Frozen):
    kind: Literal["robot_missing_family", "skill_not_transferred"]
    robot_id: str
    scene_family: str
    skill_id: str | None = None
    detail: str


class LibrarySuggestion(_Frozen):
    action: Literal["transfer"]
    source_skill_id: str
    target_robot_id: str
    reason: str


class LibraryReport(_Frozen):
    schema_version: str = LIBRARY_SCHEMA_VERSION
    report_id: str
    created_at: datetime
    provider: LibrarianProvider
    model_id: str | None = None
    skill_count: int
    robot_ids: list[str]
    collections: list[SkillCollection]
    duplicates: list[DuplicateGroup]
    gaps: list[CoverageGap]
    suggestions: list[LibrarySuggestion]
    notes: list[str]
