"""The A→B chain used by the demo scripts: discover → publish → transfer → publish.

Runs through the same services (and run records) as the API; nothing is simulated differently.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.run import RunRecord
from app.models.skill import ExperienceCapsule
from app.services.jobs import SimulationWorker, create_run, run_guarded
from app.services.registry import Registry
from app.services.skill_discovery import PLANNER_NAME as DISCOVER_PLANNER
from app.services.skill_discovery import discover_skill
from app.services.skill_registry import publish_from_run
from app.services.transfer import PLANNER_NAME as TRANSFER_PLANNER
from app.services.transfer import transfer_skill

SOURCE, TARGET = "panda_01", "ur5e_01"


@dataclass(frozen=True)
class Chain:
    source_run: RunRecord
    source_capsule: ExperienceCapsule | None
    target_run: RunRecord | None
    target_capsule: ExperienceCapsule | None

    @property
    def ok(self) -> bool:
        return self.target_run is not None and self.target_run.status == "succeeded"


def run_chain(registry: Registry, worker: SimulationWorker, passports: dict, seed: int,
              target_seed: int | None = None, publish: bool = True) -> Chain:
    run = create_run(registry, "discover", seed, DISCOVER_PLANNER, source_robot_id=SOURCE)
    src = worker.submit(run_guarded, registry, run.run_id,
                        lambda ctx: discover_skill(ctx, SOURCE, seed, passports[SOURCE])).result()
    if src.status != "succeeded":
        return Chain(src, None, None, None)
    capsule = publish_from_run(registry, src.run_id)
    run = create_run(registry, "transfer", target_seed if target_seed is not None else seed,
                     f"{TRANSFER_PLANNER}+offline", source_robot_id=SOURCE, target_robot_id=TARGET,
                     skill_id=capsule.skill_id)
    dst = worker.submit(run_guarded, registry, run.run_id, lambda ctx: transfer_skill(
        ctx, registry, capsule.skill_id, TARGET, target_seed, passports[TARGET])).result()
    adapted = publish_from_run(registry, dst.run_id) if publish and dst.status == "succeeded" else None
    return Chain(src, capsule, dst, adapted)
