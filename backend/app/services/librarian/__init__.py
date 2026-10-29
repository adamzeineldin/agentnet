"""Skill librarian: organizes the published registry into a Library Report (read-only)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from app.config import META_MODEL_ID, MODEL_API_KEY
from app.models.library import LibraryReport
from app.models.skill import ExperienceCapsule
from app.services.librarian.muse import MuseLibrarian, fallback_report
from app.services.librarian.offline import organize
from app.services.reasoning.meta_client import MetaReasoningError

__all__ = ["MuseLibrarian", "build_report", "get_librarian", "organize"]


def get_librarian(mode: str) -> MuseLibrarian | None:
    """None means the offline rules alone."""
    if mode == "offline":
        return None
    if mode == "meta":
        if not MODEL_API_KEY:
            raise MetaReasoningError("MODEL_API_KEY is not configured")
        return MuseLibrarian(MODEL_API_KEY, META_MODEL_ID)
    raise ValueError(f"unknown librarian mode {mode!r}")


def build_report(skills: Iterable[ExperienceCapsule], robot_ids: Sequence[str],
                 librarian: MuseLibrarian | None) -> LibraryReport:
    skills = list(skills)
    if librarian is None:
        return organize(skills, robot_ids)
    try:
        return librarian.organize(skills, robot_ids)
    except MetaReasoningError as exc:
        return fallback_report(skills, robot_ids, librarian.model_id, exc)
