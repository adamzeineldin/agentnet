"""FastAPI dependency accessors for app-scoped services."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from app.config import MAX_PENDING_JOBS, SESSION_SECRET
from app.models.user import User
from app.services.auth import providers
from app.services.auth.sessions import verify
from app.services.fleet import fleet_ids
from app.services.jobs import SimulationWorker
from app.services.registry import Registry
from app.services.robot_catalog import ROBOTS

SESSION_COOKIE = "nimbotics_session"


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
    if not SESSION_SECRET:
        return None
    payload = verify(request.cookies.get(SESSION_COOKIE), SESSION_SECRET)
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


def require_fleet_robot(registry: Registry, robot_id: str) -> str:
    if robot_id not in ROBOTS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown robot '{robot_id}'")
    if robot_id not in fleet_ids(registry):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"{ROBOTS[robot_id].short_name} is not in the fleet yet; add it on the Robots page.")
    return robot_id
