"""Nimbotics FastAPI application."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import (
    auth, benchmarks, controller, demo, health, library, real_data, robots, runs, skills, tasks, transfers,
)
from app.canonical_host import WwwRedirect
from app.config import ARTIFACT_DIR, CORS_ORIGIN_REGEX, DB_PATH, PUBLIC_URL, WEB_DIR
from app.services.fleet import ensure_passports
from app.services.uploads import load_uploaded
from app.services.task_design import load_designed
from app.services.jobs import SimulationWorker
from app.services.registry import Registry
from app.web import mount_web

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    app.state.registry = Registry(DB_PATH)
    app.state.worker = SimulationWorker()
    missing = load_uploaded(app.state.registry.uploaded_robots())
    if missing:
        logging.getLogger(__name__).warning("Uploaded robots with missing files skipped: %s", missing)
    skipped = load_designed(app.state.registry.designed_tasks())
    if skipped:
        logging.getLogger(__name__).warning("Designed task types that failed the layout checks: %s", skipped)
    await app.state.worker.call(ensure_passports, app.state.worker, app.state.registry)
    yield
    app.state.worker.shutdown()


def create_app(web_dir: Path | None = WEB_DIR, public_url: str | None = PUBLIC_URL) -> FastAPI:
    app = FastAPI(title="Nimbotics", version="0.1.0", lifespan=lifespan)
    if public_url:
        app.add_middleware(WwwRedirect, public_url=public_url)
    app.add_middleware(
        CORSMiddleware, allow_origin_regex=CORS_ORIGIN_REGEX, allow_methods=["*"], allow_headers=["*"],
        allow_credentials=True,
    )
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(robots.router)
    app.include_router(runs.router)
    app.include_router(skills.router)
    app.include_router(transfers.router)
    app.include_router(demo.router)
    app.include_router(benchmarks.router)
    app.include_router(library.router)
    app.include_router(controller.router)
    app.include_router(real_data.router)
    app.include_router(tasks.router)
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/artifacts", StaticFiles(directory=ARTIFACT_DIR), name="artifacts")
    if web_dir is not None:
        mount_web(app, web_dir)
    return app


app = create_app()
