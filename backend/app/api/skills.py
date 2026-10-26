from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_registry
from app.models.skill import ExperienceCapsule
from app.services.registry import Registry
from app.services.skill_registry import PublishError, lineage, publish_from_run

router = APIRouter(prefix="/api/skills", tags=["skills"])


class PublishRequest(BaseModel):
    run_id: str


class SkillDetail(BaseModel):
    capsule: ExperienceCapsule
    ancestors: list[ExperienceCapsule]
    children: list[ExperienceCapsule]


@router.get("", response_model=list[ExperienceCapsule])
def list_skills(source_robot_id: str | None = None, registry: Registry = Depends(get_registry)):
    return registry.list_skills(source_robot_id=source_robot_id)


@router.get("/{skill_id}", response_model=SkillDetail)
def get_skill(skill_id: str, registry: Registry = Depends(get_registry)) -> SkillDetail:
    capsule = registry.get_skill(skill_id)
    if capsule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown skill '{skill_id}'")
    return SkillDetail(
        capsule=capsule,
        ancestors=lineage(registry, capsule),
        children=registry.list_skills(parent_skill_id=skill_id),
    )


@router.post("", response_model=ExperienceCapsule, status_code=201)
def publish(body: PublishRequest, registry: Registry = Depends(get_registry)) -> ExperienceCapsule:
    try:
        return publish_from_run(registry, body.run_id)
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown run '{body.run_id}'") from exc
    except PublishError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
