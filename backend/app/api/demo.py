from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_registry
from app.services.demo_story import DemoStory, latest_story
from app.services.registry import Registry

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("/story", response_model=DemoStory)
def story(registry: Registry = Depends(get_registry)) -> DemoStory:
    """Latest recorded discover → publish → transfer → publish chain, for replay."""
    return latest_story(registry)
