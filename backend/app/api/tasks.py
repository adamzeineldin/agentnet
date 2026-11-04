"""Task types the robots can learn (task_families), with a sample layout each, and designing new ones."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_registry, require_user, started_by
from app.models.skill import TaskSpec
from app.models.task_design import DesignRequest, DesignResult, TaskDesign
from app.models.user import User
from app.services.librarian.designer import design_task
from app.services.reasoning import meta_available
from app.services.registry import Registry
from app.services.task_design import MAX_DESIGNED_TASKS, designed_count, install
from app.services.task_families import TASK_TYPES, family_of

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskTypeInfo(BaseModel):
    family: str
    title: str
    summary: str
    example: TaskSpec
    # Set for task types designed from a description (who designed it, from what, and what it leaves out).
    design: TaskDesign | None = None


@router.get("", response_model=list[TaskTypeInfo])
def list_task_types(registry: Registry = Depends(get_registry)) -> list[TaskTypeInfo]:
    designs = {d.family: d for d in map(TaskDesign.model_validate_json, registry.designed_tasks())}
    return [TaskTypeInfo(family=t.family, title=t.title, summary=t.summary, example=t.generate(t.example_seed),
                         design=designs.get(t.family))
            for t in TASK_TYPES.values()]


def _learned_by(registry: Registry) -> dict[str, list[str]]:
    """Task family -> robots with a saved, simulation-verified skill of it (evidence for the designer)."""
    out: dict[str, set[str]] = {}
    for s in registry.list_skills():
        if s.validation.success:
            out.setdefault(family_of(s.task.scene_id), set()).add(s.source_robot_id)
    return {f: sorted(r) for f, r in out.items()}


def _goal_key(goal: str, provider: str) -> str:
    return f"{provider}:{' '.join(goal.lower().split())}"


@router.post("/design", response_model=DesignResult, status_code=201)
def design(
    body: DesignRequest, registry: Registry = Depends(get_registry), user: User | None = Depends(require_user),
) -> DesignResult:
    """Design a new task type from a description and add it to the task types.

    `auto` uses Muse when MODEL_API_KEY is set (one call, two if its layout breaks a limit), else the offline
    designer. The same description returns the stored task type without a new call.
    """
    if body.provider == "meta" and not meta_available():
        raise HTTPException(status.HTTP_409_CONFLICT, "Muse designer requested but MODEL_API_KEY is not configured")
    wants = "offline" if body.provider == "offline" or not meta_available() else "meta"
    if (stored := registry.designed_task_for(_goal_key(body.goal, wants))) is not None:
        found = TaskDesign.model_validate_json(stored)
        install(found)
        return DesignResult(design=found, example=TASK_TYPES[found.family].generate(0), reused=True)
    if designed_count() >= MAX_DESIGNED_TASKS:
        raise HTTPException(status.HTTP_409_CONFLICT, f"The task library is full ({MAX_DESIGNED_TASKS} designed types)")
    made = design_task(body.goal, body.provider, learned_by=_learned_by(registry)).model_copy(update={"created_by": started_by(user)})
    reused = made.family in TASK_TYPES
    if reused:  # the same layout was designed before (e.g. the same offline template)
        made = next(d for d in map(TaskDesign.model_validate_json, registry.designed_tasks())
                    if d.family == made.family)
    else:
        install(made)
        # Stored under the provider that answered, so a Muse failure is retried next time.
        answered = "meta" if made.provider == "meta_muse_spark" else "offline"
        registry.save_designed_task(made.family, _goal_key(body.goal, answered), made.model_dump_json())
    return DesignResult(design=made, example=TASK_TYPES[made.family].generate(0), reused=reused)
