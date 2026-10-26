"""FastAPI dependency accessors for app-scoped services."""

from __future__ import annotations

from fastapi import Request

from app.services.jobs import SimulationWorker
from app.services.registry import Registry


def get_registry(request: Request) -> Registry:
    return request.app.state.registry


def get_worker(request: Request) -> SimulationWorker:
    return request.app.state.worker
