"""FastAPI dependency accessors for app-scoped services."""

from __future__ import annotations

from typing import TypeVar

from fastapi import Depends, HTTPException, Request, status

from app.config import MAX_PENDING_JOBS, SESSION_SECRET
from app.models.run import RunRecord
from app.models.skill import ExperienceCapsule
from app.models.user import User
from app.services.auth import providers
from app.services.auth.sessions import verify
from app.services.fleet import fleet_ids, robot_visible
from app.services.jobs import SimulationWorker
from app.services.registry import Registry
from app.services.robot_catalog import ROBOTS

SESSION_COOKIE = "nimbotics_session"
Owned = TypeVar("Owned", RunRecord, ExperienceCapsule)


def get_registry(request: Request) -> Registry:
    return request.app.state.registry


def get_worker(request: Request) -> SimulationWorker:
    return request.app.state.worker


def check_capacity(worker: SimulationWorker) -> None:
    """Refuse new simulation jobs while MAX_PENDING_JOBS are queued (public cloud copy). 0 = no limit."""
    if MAX_PENDING_JOBS and worker.pending >= MAX_PENDING_JOBS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"The simulator is busy with {worker.pending} queued runs; try again in a minute.")


def get_job_worker(request: Request) -> SimulationWorker:
    """The worker, for endpoints that queue a simulation job."""
    worker = get_worker(request)
    check_capacity(worker)
    return worker


def password_enabled() -> bool:
    """Email + password accounts need nothing but a key to sign session cookies."""
    return bool(SESSION_SECRET)


def auth_required() -> bool:
    return bool(providers.configured()) or password_enabled()


def current_user(request: Request, registry: Registry = Depends(get_registry)) -> User | None:
    return user_from_cookie(request.cookies.get(SESSION_COOKIE), registry)


def user_from_cookie(cookie: str | None, registry: Registry) -> User | None:
    if not SESSION_SECRET:
        return None
    payload = verify(cookie, SESSION_SECRET)
    return registry.get_user(payload["uid"]) if payload and isinstance(payload.get("uid"), str) else None


def require_user(user: User | None = Depends(current_user)) -> User | None:
    """Gate for anything that starts work or changes shared state.

    With no sign-in provider configured (local dev, tests) everyone may act and this returns None.
    """
    if user is None and auth_required():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to start runs or change shared data.")
    return user


def started_by(user: User | None) -> str | None:
    return f"{user.name} ({user.provider})" if user else None


def owner_of(user: User | None) -> str | None:
    """Owner id for new work: the signed-in user's id, or None (public) with sign-in off."""
    return user.user_id if user else None


def viewer_id(user: User | None = Depends(current_user)) -> str | None:
    """Who reads: a user id, or None for a signed-out visitor (who sees public work only)."""
    return user.user_id if user else None


def mark(item: Owned, viewer: str | None) -> Owned:
    """The run or skill as this viewer gets it: `mine` says whether they own it (the owner id is never sent)."""
    return item.model_copy(update={"mine": item.owner_id is not None and item.owner_id == viewer})


def require_fleet_robot(registry: Registry, robot_id: str, viewer: str | None) -> str:
    """The robot id if viewer may use it; a private robot of someone else is "unknown" (404), like a missing one."""
    if robot_id not in ROBOTS or not robot_visible(registry.robot_access(), robot_id, viewer):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown robot '{robot_id}'")
    if robot_id not in fleet_ids(registry):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"{ROBOTS[robot_id].short_name} is not in the fleet yet; add it on the Robots page.")
    return robot_id


def require_run(registry: Registry, run_id: str, viewer: str | None) -> RunRecord:
    run = registry.get_run(run_id, viewer=viewer)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown run '{run_id}'")
    return mark(run, viewer)


def require_skill(registry: Registry, skill_id: str, viewer: str | None) -> ExperienceCapsule:
    capsule = registry.get_skill(skill_id, viewer=viewer)
    if capsule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown skill '{skill_id}'")
    return mark(capsule, viewer)
