"""Passport lifecycle: compute, render a snapshot, cache in the registry.

Functions here touch MuJoCo and must run on the simulation worker thread.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.config import ARTIFACT_DIR
from app.models.robot import PASSPORT_SCHEMA_VERSION, RobotPassport, RobotSummary
from app.services.jobs import SimulationWorker
from app.services.passports import build_passport, model_dir_hash
from app.services.registry import Registry
from app.services.render import FrameRecorder
from app.services.robot_catalog import ROBOTS, get_robot_decl

log = logging.getLogger(__name__)


def snapshot_path(robot_id: str) -> Path:
    return ARTIFACT_DIR / "snapshots" / f"{robot_id}.png"


def snapshot_url(robot_id: str) -> str:
    return f"/artifacts/snapshots/{robot_id}.png"


def compute_passport(
    worker: SimulationWorker, registry: Registry, robot_id: str, seed: int = 0
) -> RobotPassport:
    decl = get_robot_decl(robot_id)
    adapter = worker.base_adapter(robot_id)
    passport = build_passport(decl, adapter, seed=seed)
    data = adapter.new_data()
    with FrameRecorder(adapter.model) as rec:
        rec.save_png(rec.capture(data), snapshot_path(robot_id))
    log.info("Passport computed for %s in %.2fs", robot_id, passport.compute_seconds)
    return registry.save_passport(passport)


def ensure_passports(worker: SimulationWorker, registry: Registry) -> list[RobotPassport]:
    """Recompute any passport that is missing, stale (model hash) or on an old schema."""
    result = []
    for robot_id, decl in ROBOTS.items():
        cached = registry.get_passport(robot_id)
        fresh = (
            cached is not None
            and cached.schema_version == PASSPORT_SCHEMA_VERSION
            and cached.model_hash == model_dir_hash(decl.model_path)
            and snapshot_path(robot_id).exists()
        )
        result.append(cached if fresh else compute_passport(worker, registry, robot_id))
    return result


def summarize(passport: RobotPassport) -> RobotSummary:
    return RobotSummary(
        robot_id=passport.robot_id,
        display_name=passport.display_name,
        short_name=passport.short_name,
        dof=passport.dof,
        model_source=passport.model_source,
        model_hash=passport.model_hash,
        tool_type=passport.tool_type,
        max_reach_m=passport.workspace.max_reach_m,
        fallback_model=passport.fallback_model,
        snapshot_url=snapshot_url(passport.robot_id),
        created_at=passport.created_at,
    )
