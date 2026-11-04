"""Publishing and lineage for Experience Capsules."""

from __future__ import annotations

from app.models.skill import ExperienceCapsule
from app.services.librarian.check import judge
from app.services.registry import EVERYONE, Registry, Viewer


class PublishError(ValueError):
    """Raised when a run cannot be published as a verified capsule."""


def publish_from_run(registry: Registry, run_id: str) -> ExperienceCapsule:
    run = registry.get_run(run_id)
    if run is None:
        raise KeyError(run_id)
    if run.run_type not in ("discover", "transfer"):
        raise PublishError(f"Run {run_id} is a {run.run_type} run; only discover/transfer runs publish skills")
    if run.status != "succeeded":
        raise PublishError(f"Run {run_id} is '{run.status}'; only succeeded runs can be published")
    if run.results.get("improvement") is not None:
        raise PublishError(f"Run {run_id} was an improvement attempt; its verdict decides whether it is saved")
    saved = publish_draft(registry, run.results.get("capsule_draft"), run_id)
    registry.save_run(run.model_copy(update={"results": {**run.results, "published": True}}))
    return saved


def publish_draft(registry: Registry, draft: dict | None, run_id: str) -> ExperienceCapsule:
    """Save a run's capsule draft as a published skill, if it is a verified success not saved before.

    The skill belongs to whoever owns the run and starts as private as the run is (models/sharing.py).
    """
    if not draft:
        raise PublishError(f"Run {run_id} has no capsule draft")
    run = registry.get_run(run_id)
    owner = run.owner_id if run else None
    capsule = ExperienceCapsule.model_validate(draft).model_copy(
        update={"owner_id": owner, "visibility": run.visibility if run and owner else "public"})
    if not capsule.validation.success or capsule.status != "verified_in_sim":
        raise PublishError("Capsule draft is not a verified success")
    if registry.get_skill(capsule.skill_id) is not None:
        raise PublishError(f"Skill {capsule.skill_id} already published")
    return registry.save_skill(capsule)


def draft_of(changes: dict) -> ExperienceCapsule | None:
    draft = (changes.get("results") or {}).get("capsule_draft")
    return ExperienceCapsule.model_validate(draft) if draft else None


def publish_when_verified(registry: Registry, run_id: str):
    """A RunContext.before_finish hook: a succeeded run's verified skill is saved with the run (no extra step)."""
    def hook(success: bool, changes: dict) -> dict:
        if not success or draft_of(changes) is None:
            return changes
        publish_draft(registry, changes["results"]["capsule_draft"], run_id)
        return {**changes, "results": {**changes["results"], "published": True, "auto_published": True}}
    return hook


def keep_if_better(registry: Registry, run_id: str, existing: ExperienceCapsule):
    """A RunContext.before_finish hook for an improvement attempt: judge it, save it only if it is better."""
    def hook(success: bool, changes: dict) -> dict:
        verdict = judge(existing, draft_of(changes) if success else None)
        results = {**(changes.get("results") or {}), "improving_skill_id": existing.skill_id}
        if verdict.better:
            saved = publish_draft(registry, results["capsule_draft"], run_id)
            verdict = verdict.model_copy(update={"published_skill_id": saved.skill_id})
            results["published"] = True
        return {**changes, "results": {**results, "improvement": verdict.model_dump(mode="json")}}
    return hook


def lineage(registry: Registry, capsule: ExperienceCapsule, viewer: Viewer = EVERYONE) -> list[ExperienceCapsule]:
    """Ancestors oldest-first, as recorded on the capsule; missing ones (or ones viewer may not see) are skipped."""
    return [a for a in (registry.get_skill(sid, viewer=viewer) for sid in capsule.lineage) if a is not None]
