"""Publishing and lineage for Experience Capsules."""

from __future__ import annotations

from app.models.skill import ExperienceCapsule
from app.services.registry import Registry


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
    draft = run.results.get("capsule_draft")
    if not draft:
        raise PublishError(f"Run {run_id} has no capsule draft")
    capsule = ExperienceCapsule.model_validate(draft)
    if not capsule.validation.success or capsule.status != "verified_in_sim":
        raise PublishError("Capsule draft is not a verified success")
    if registry.get_skill(capsule.skill_id) is not None:
        raise PublishError(f"Skill {capsule.skill_id} already published")
    saved = registry.save_skill(capsule)
    registry.save_run(run.model_copy(update={"results": {**run.results, "published": True}}))
    return saved


def lineage(registry: Registry, capsule: ExperienceCapsule) -> list[ExperienceCapsule]:
    """Ancestors oldest-first, as recorded on the capsule; missing ancestors are skipped."""
    return [a for a in (registry.get_skill(sid) for sid in capsule.lineage) if a is not None]
