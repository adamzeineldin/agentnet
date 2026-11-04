from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_registry, require_user
from app.models.sharing import VisibilityPlan, VisibilityRequest
from app.models.user import User
from app.services import sharing
from app.services.registry import Registry

router = APIRouter(prefix="/api/visibility", tags=["sharing"])


@router.post("", response_model=VisibilityPlan)
def change_visibility(
    body: VisibilityRequest, registry: Registry = Depends(get_registry), user: User | None = Depends(require_user),
) -> VisibilityPlan:
    """Make your run, skill or uploaded robot public or private (services/sharing.py).

    When other items must change with it, the answer is 409 with the plan (`detail.also`) until the request is
    repeated with confirm=true.
    """
    if user is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Sign-in is off, so everything is public.")
    try:
        change = sharing.plan(registry, body.kind, body.id, body.visibility, user.user_id)
    except sharing.SharingError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    if change.also and not body.confirm:
        raise HTTPException(status.HTTP_409_CONFLICT, change.model_dump(mode="json"))
    return sharing.apply(registry, change, user.name)
