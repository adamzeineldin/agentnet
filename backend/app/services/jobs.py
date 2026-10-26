"""Single simulation worker thread + run bookkeeping.

MuJoCo models, data and OpenGL contexts are only touched on the worker
thread, so concurrent HTTP requests never share simulator state.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, TypeVar

import mujoco

from app.models.run import RunEvent, RunRecord, RunStatus, RunType
from app.services.registry import Registry, utcnow
from app.services.robot_adapter import RobotAdapter
from app.services.robot_catalog import get_robot_decl
from app.services.scene import build_model

log = logging.getLogger(__name__)
T = TypeVar("T")


class SimulationWorker:
    def __init__(self) -> None:
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="agentnet-sim")
        self._adapters: dict[str, RobotAdapter] = {}

    def submit(self, fn: Callable[..., T], *args: Any) -> Future[T]:
        return self._pool.submit(fn, *args)

    async def call(self, fn: Callable[..., T], *args: Any) -> T:
        return await asyncio.wrap_future(self.submit(fn, *args))

    def base_adapter(self, robot_id: str) -> RobotAdapter:
        """Robot-only adapter, cached. Call only on the worker thread."""
        if robot_id not in self._adapters:
            decl = get_robot_decl(robot_id)
            self._adapters[robot_id] = RobotAdapter(decl, build_model(decl))
        return self._adapters[robot_id]

    def shutdown(self) -> None:
        self._pool.shutdown(wait=True, cancel_futures=True)


class RunContext:
    """Writes typed progress events for one run to the registry."""

    def __init__(self, registry: Registry, run_id: str) -> None:
        self.registry = registry
        self.run_id = run_id
        self._t0 = time.perf_counter()

    def event(self, status: RunStatus, message: str, **data: Any) -> RunRecord:
        log.info("[%s] %s: %s", self.run_id, status, message)
        return self.registry.append_event(
            self.run_id, RunEvent(at=utcnow(), status=status, message=message, data=data)
        )

    def finish(self, success: bool, message: str, **changes: Any) -> RunRecord:
        status: RunStatus = "succeeded" if success else "failed"
        return self.registry.append_event(
            self.run_id,
            RunEvent(at=utcnow(), status=status, message=message),
            finished_at=utcnow(),
            wall_clock_seconds=time.perf_counter() - self._t0,
            **changes,
        )


def new_run_id() -> str:
    return f"run_{utcnow():%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:6]}"


def create_run(
    registry: Registry,
    run_type: RunType,
    task_seed: int,
    planner: str,
    source_robot_id: str | None = None,
    target_robot_id: str | None = None,
    skill_id: str | None = None,
) -> RunRecord:
    now = utcnow()
    return registry.save_run(
        RunRecord(
            run_id=new_run_id(),
            run_type=run_type,
            status="queued",
            source_robot_id=source_robot_id,
            target_robot_id=target_robot_id,
            skill_id=skill_id,
            task_seed=task_seed,
            planner=planner,
            simulator=f"MuJoCo {mujoco.__version__}",
            created_at=now,
            events=[RunEvent(at=now, status="queued", message="Run queued")],
        )
    )


def run_guarded(
    registry: Registry, run_id: str, body: Callable[[RunContext], RunRecord]
) -> RunRecord:
    """Execute a run body on the worker; any exception becomes an honest failed run."""
    ctx = RunContext(registry, run_id)
    registry.save_run(registry.get_run(run_id).model_copy(update={"started_at": utcnow()}))
    try:
        return body(ctx)
    except Exception as exc:  # noqa: BLE001 - recorded on the run, then surfaced via API
        log.exception("Run %s crashed", run_id)
        return ctx.finish(False, f"Run crashed: {type(exc).__name__}", error=str(exc))
