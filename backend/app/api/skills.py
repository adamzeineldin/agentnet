from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import (
    get_job_worker, get_registry, mark, owner_of, require_fleet_robot, require_run, require_skill, require_user,
    started_by, viewer_id,
)
from app.models.learning import ImproveRequest
from app.models.run import RunRecord
from app.models.user import User
from app.models.skill import ExperienceCapsule
from app.services.jobs import RunContext, SimulationWorker, create_run, run_guarded
from app.services.librarian.check import tried_on
from app.services.registry import Registry
from app.services.skill_registry import PublishError, keep_if_better, lineage, publish_from_run
from app.services.task_scene import family_of
from app.services.transfer import PLANNER_NAME, transfer_skill

TRIED_RUNS = 500

router = APIRouter(prefix="/api/skills", tags=["skills"])


class PublishRequest(BaseModel):
    run_id: str


class SkillDetail(BaseModel):
    capsule: ExperienceCapsule
    ancestors: list[ExperienceCapsule]
    children: list[ExperienceCapsule]


@router.get("", response_model=list[ExperienceCapsule])
def list_skills(
    source_robot_id: str | None = None, mine: bool = False, registry: Registry = Depends(get_registry),
    viewer: str | None = Depends(viewer_id),
):
    """Skills the viewer may see (public, plus their own private ones); mine=true: only their own."""
    if mine and viewer is None:
        return []
    skills = registry.list_skills(source_robot_id=source_robot_id, viewer=viewer, owner_id=viewer if mine else None)
    return [mark(s, viewer) for s in skills]


@router.get("/{skill_id}", response_model=SkillDetail)
def get_skill(
    skill_id: str, registry: Registry = Depends(get_registry), viewer: str | None = Depends(viewer_id),
) -> SkillDetail:
    capsule = require_skill(registry, skill_id, viewer)
    return SkillDetail(
        capsule=capsule,
        ancestors=[mark(a, viewer) for a in lineage(registry, capsule, viewer)],
        children=[mark(c, viewer) for c in registry.list_skills(parent_skill_id=skill_id, viewer=viewer)],
    )


@router.post("", response_model=ExperienceCapsule, status_code=201)
def publish(
    body: PublishRequest, registry: Registry = Depends(get_registry), user: User | None = Depends(require_user),
) -> ExperienceCapsule:
    """Save a run's verified skill. Only the run's owner may (anyone, for runs made with sign-in off)."""
    run = require_run(registry, body.run_id, owner_of(user))
    if run.owner_id is not None and not run.mine:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the person who started this run can save its skill")
    try:
        return mark(publish_from_run(registry, body.run_id), owner_of(user))
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown run '{body.run_id}'") from exc
    except PublishError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc


@router.post("/{skill_id}/improve", response_model=RunRecord, status_code=202)
def improve(
    skill_id: str, body: ImproveRequest, registry: Registry = Depends(get_registry),
    worker: SimulationWorker = Depends(get_job_worker), user: User | None = Depends(require_user),
) -> RunRecord:
    """Try another robot's skill on the layout of this robot's skill. It replaces it only if it is verified and
    measurably better (results.improvement holds the verdict); otherwise the existing skill stays."""
    viewer = owner_of(user)
    existing = require_skill(registry, skill_id, viewer)
    source = require_skill(registry, body.source_skill_id, viewer)
    robot_id = existing.source_robot_id
    require_fleet_robot(registry, robot_id, viewer)
    if source.source_robot_id == robot_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "The source skill is this robot's own; pick another robot's skill")
    if family_of(source.task.scene_id) != family_of(existing.task.scene_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "The source skill is a different task type")
    runs = registry.list_runs(run_type="transfer", robot_id=robot_id, limit=TRIED_RUNS, viewer=viewer)
    if source.skill_id in tried_on(runs, robot_id, existing.task.scene_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "This skill was already tried on this layout; its run is stored")
    passport = registry.get_passport(robot_id)
    if passport is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Passport not computed yet")
    seed = existing.task.seed
    run = create_run(registry, "transfer", seed, planner=f"{PLANNER_NAME}+offline", source_robot_id=source.source_robot_id,
                     target_robot_id=robot_id, skill_id=source.skill_id, started_by=started_by(user),
                     owner_id=viewer)

    def body_fn(ctx: RunContext) -> RunRecord:
        ctx.before_finish = keep_if_better(registry, ctx.run_id, existing)
        return transfer_skill(ctx, registry, source.skill_id, robot_id, seed, passport)

    worker.submit(run_guarded, registry, run.run_id, body_fn)
    return mark(run, viewer)
