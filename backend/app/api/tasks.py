"""Task types the robots can learn (task_families), with a sample layout each."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.models.skill import TaskSpec
from app.services.task_families import DEFAULT_SEED, TASK_TYPES

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskTypeInfo(BaseModel):
    family: str
    title: str
    summary: str
    example: TaskSpec


@router.get("", response_model=list[TaskTypeInfo])
def list_task_types() -> list[TaskTypeInfo]:
    return [TaskTypeInfo(family=t.family, title=t.title, summary=t.summary, example=t.generate(DEFAULT_SEED))
            for t in TASK_TYPES.values()]
