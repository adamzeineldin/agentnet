"""Library Report: an organization of the published skill registry.

A report only *describes* the registry: it never edits, merges or deletes
capsules, and its suggestions are not executed. Every entry references
existing skill ids and states the rule (basis) that produced it.

Facts (collections' membership, duplicates, gaps, suggestions) always come from
the offline rules. A model librarian may only add text (`summary`, `model_note`,
`priority_rationale`) and reorder suggestions; those fields are model-written.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.skill import RouteClass

LIBRARY_SCHEMA_VERSION = "1.0"
LibrarianProvider = Literal["offline_librarian", "meta_muse_spark"]


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
    model_note: str | None = None


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


class ModelUsage(_Frozen):
    """Every billed model call for this report, including attempts that fell back."""

    model_calls: int
    prompt_tokens: int | None
    completion_tokens: int | None
    estimated_cost_usd: float | None
    calls: list[dict]


class LibraryReport(_Frozen):
    schema_version: str = LIBRARY_SCHEMA_VERSION
    report_id: str
    created_at: datetime
    provider: LibrarianProvider
    provider_requested: LibrarianProvider | None = None
    model_id: str | None = None
    fallback_error: str | None = None
    skill_count: int
    robot_ids: list[str]
    collections: list[SkillCollection]
    duplicates: list[DuplicateGroup]
    gaps: list[CoverageGap]
    suggestions: list[LibrarySuggestion]
    summary: str | None = None
    priority_rationale: str | None = None
    usage: ModelUsage | None = None
    notes: list[str]
