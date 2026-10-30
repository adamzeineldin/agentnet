"""AgentNet FastAPI application."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import benchmarks, controller, demo, health, library, real_data, robots, runs, skills, transfers
from app.config import ARTIFACT_DIR, CORS_ORIGIN_REGEX, DB_PATH, WEB_DIR
from app.services.fleet import ensure_passports
from app.services.jobs import SimulationWorker
from app.services.registry import Registry
from app.web import mount_web

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    app.state.registry = Registry(DB_PATH)
    app.state.worker = SimulationWorker()
    await app.state.worker.call(ensure_passports, app.state.worker, app.state.registry)
    yield
    app.state.worker.shutdown()


def create_app(web_dir: Path | None = WEB_DIR) -> FastAPI:
    app = FastAPI(title="AgentNet", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origin_regex=CORS_ORIGIN_REGEX, allow_methods=["*"], allow_headers=["*"]
    )
    app.include_router(health.router)
    app.include_router(robots.router)
    app.include_router(runs.router)
    app.include_router(skills.router)
    app.include_router(transfers.router)
    app.include_router(demo.router)
    app.include_router(benchmarks.router)
    app.include_router(library.router)
    app.include_router(controller.router)
    app.include_router(real_data.router)
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/artifacts", StaticFiles(directory=ARTIFACT_DIR), name="artifacts")
    if web_dir is not None:
        mount_web(app, web_dir)
    return app


app = create_app()
