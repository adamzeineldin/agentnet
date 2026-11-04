"""Find the most recent real, recorded A→B chain for presentation-mode replay.

Nothing here creates data: it only selects existing runs and capsules, and only public ones (it is shown to all).
"""

from __future__ import annotations

from pydantic import BaseModel

from app.models.run import RunRecord
from app.models.skill import ExperienceCapsule
from app.services.registry import Registry

SCAN_LIMIT = 200


class StoryStep(BaseModel):
    run: RunRecord
    capsule: ExperienceCapsule | None


class DemoStory(BaseModel):
    source: StoryStep | None
    target: StoryStep | None
    complete: bool
    note: str


def latest_story(registry: Registry) -> DemoStory:
    transfers = [r for r in registry.list_runs(run_type="transfer", limit=SCAN_LIMIT, viewer=None)
                 if r.status == "succeeded"]
    best: tuple[RunRecord, ExperienceCapsule | None] | None = None
    for run in transfers:
        adapted = registry.get_skill_by_run(run.run_id, viewer=None)
        if registry.get_skill(run.results.get("source_skill_id", ""), viewer=None) is None:
            continue
        if adapted is not None:
            best = (run, adapted)
            break
        best = best or (run, None)
    if best is not None:
        target_run, adapted = best
        source_capsule = registry.get_skill(target_run.results["source_skill_id"], viewer=None)
        source_run = registry.get_run(source_capsule.provenance["run_id"], viewer=None)
        if source_run is not None:
            return DemoStory(
                source=StoryStep(run=source_run, capsule=source_capsule),
                target=StoryStep(run=target_run, capsule=adapted),
                complete=adapted is not None,
                note="Recorded runs from this registry" + ("" if adapted else "; adaptation not published"),
            )
    originals = [s for s in registry.list_skills(viewer=None) if s.parent_skill_id is None]
    for capsule in originals:
        run = registry.get_run(capsule.provenance["run_id"], viewer=None)
        if run is not None:
            return DemoStory(source=StoryStep(run=run, capsule=capsule), target=None, complete=False,
                             note="No successful transfer recorded yet")
    return DemoStory(source=None, target=None, complete=False, note="No published skills recorded yet")
