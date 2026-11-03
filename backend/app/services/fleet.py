"""Passport lifecycle: compute, render a snapshot, cache in the registry.

Functions here touch MuJoCo and must run on the simulation worker thread.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

import numpy as np

from app.config import ARTIFACT_DIR
from app.models.robot import (
    PASSPORT_SCHEMA_VERSION,
    CapabilityEvidence,
    RobotPassport,
    RobotSummary,
)
from app.models.skill import ExperienceCapsule
from app.services.jobs import SimulationWorker
from app.services.passports import build_passport, model_dir_hash
from app.services.registry import Registry
from app.services.render import FrameRecorder
from app.services import uploads
from app.services.robot_adapter import RobotAdapter
from app.services.scene import build_model
from app.services.simulation import execute_path
from app.services.robot_catalog import ROBOTS, RobotDecl, get_robot_decl

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


def fleet_ids(registry: Registry) -> list[str]:
    """Arms in the fleet, in catalog order: the default fleet plus any added since."""
    added = registry.added_robot_ids()
    return [rid for rid, d in ROBOTS.items() if d.default_fleet or rid in added]


def ensure_passports(worker: SimulationWorker, registry: Registry) -> list[RobotPassport]:
    """Recompute any fleet passport that is missing, stale (model hash) or on an old schema."""
    result = []
    for robot_id in fleet_ids(registry):
        decl = ROBOTS[robot_id]
        cached = registry.get_passport(robot_id)
        fresh = (
            cached is not None
            and cached.schema_version == PASSPORT_SCHEMA_VERSION
            and cached.model_hash == model_dir_hash(decl.model_path)
            and snapshot_path(robot_id).exists()
        )
        result.append(cached if fresh else compute_passport(worker, registry, robot_id))
    return result


def add_robot(worker: SimulationWorker, registry: Registry, robot_id: str, added_by: str | None) -> RobotPassport:
    """Compute the arm's passport from its model, then list it in the fleet. Worker thread only."""
    passport = registry.get_passport(robot_id)
    decl = get_robot_decl(robot_id)
    if passport is None or passport.model_hash != model_dir_hash(decl.model_path) \
            or passport.schema_version != PASSPORT_SCHEMA_VERSION:
        passport = compute_passport(worker, registry, robot_id)
    registry.add_to_fleet(robot_id, added_by)
    return passport


def summarize(passport: RobotPassport) -> RobotSummary:
    decl = ROBOTS.get(passport.robot_id)
    return RobotSummary(
        maker=decl.maker if decl else "",
        controller=decl.controller.kind if decl and decl.controller else None,
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


def with_skill_evidence(passport: RobotPassport, skills: list[ExperienceCapsule]) -> RobotPassport:
    """Copy of the passport whose reach capability reflects published, verified skills."""
    own = [s for s in skills if s.source_robot_id == passport.robot_id and s.validation.success]
    if not own:
        return passport
    reach = CapabilityEvidence(
        task_type="obstacle_aware_reach",
        status="verified_in_sim",
        provenance="measured",
        evidence={
            "verified_skills": len(own),
            "skill_ids": ", ".join(s.skill_id for s in own[:5]),
            "best_endpoint_error_m": min(s.validation.endpoint_error_m for s in own),
            "scenes": ", ".join(sorted({s.task.scene_id for s in own})),
        },
        note="Verified in MuJoCo on the listed scenes only; not a general guarantee.",
    )
    caps = [c for c in passport.capabilities if c.task_type != "obstacle_aware_reach"]
    return passport.model_copy(update={"capabilities": [*caps, reach]})


def upload_robot(worker: SimulationWorker, registry: Registry, filename: str, data: bytes, name: str,
                 tool_hint: str | None, uploaded_by: str | None) -> tuple[RobotPassport, list[str]]:
    """Turn an uploaded model into a fleet arm (services/uploads.py). Worker thread only.

    Any failure removes the files and leaves the fleet unchanged; UploadError says what to fix.
    """
    robot_id, folder = uploads.new_upload_folder(data, name)
    try:
        notes = uploads.unpack(filename, data, folder)
        uploads.check_xml(folder)
        model_file = uploads.find_model(folder)
        if model_file.suffix.lower() == ".urdf":
            uploads.flatten_meshes(model_file.parent)
        norm, decl, drift = _normalized_decl(robot_id, name, model_file, tool_hint, uploaded_by, replace_servos=False)
        if drift > uploads.HOLD_DRIFT_LIMIT_M and not any("Added" in n and "servos" in n for n in norm.notes):
            norm, decl, drift = _normalized_decl(robot_id, name, model_file, tool_hint, uploaded_by, replace_servos=True)
        if drift > uploads.HOLD_DRIFT_LIMIT_M:
            raise uploads.UploadError(f"The arm cannot hold its home pose in physics (it moves {drift * 1000:.0f} mm "
                                      "in one second). Check its masses, joint damping and actuators.")
        uploads.register(decl)
        passport = compute_passport(worker, registry, robot_id)
        decl = uploads.with_task_distance(decl, passport.workspace.max_reach_m)
        uploads.register(decl)
        registry.save_uploaded_robot(robot_id, uploads.decl_to_json(decl))
        registry.add_to_fleet(robot_id, uploaded_by)
        log.info("Uploaded robot %s registered (%d joints)", robot_id, passport.dof)
        return passport, [*norm.notes, f"Task placed {decl.task_distance_m:.2f} m in front of the base "
                          f"(half its measured reach of {passport.workspace.max_reach_m:.2f} m).", *notes]
    except Exception:
        uploads.unregister(robot_id)
        worker.forget(robot_id)
        shutil.rmtree(folder, ignore_errors=True)
        raise


def _normalized_decl(robot_id: str, name: str, model_file: Path, tool_hint: str | None, uploaded_by: str | None,
                     replace_servos: bool) -> tuple[uploads.Normalized, RobotDecl, float]:
    norm = uploads.normalize(model_file, model_file.parent, tool_hint, replace_servos=replace_servos)
    decl = uploads.make_decl(robot_id, name, model_file.parent, norm, uploaded_by)
    try:
        adapter = RobotAdapter(decl, build_model(decl))
    except ValueError as exc:
        raise uploads.UploadError(f"Nimbotics could not drive this arm: {exc}") from exc
    return norm, decl, hold_drift(adapter)


def hold_drift(adapter: RobotAdapter, seconds: float = 1.0) -> float:
    """How far the tool moves when the servos hold the home pose (gravity-compensated) for `seconds`."""
    data = adapter.new_data()
    start = adapter.fk(data).copy()
    home = adapter.home_q()
    res = execute_path(adapter, data, [home, home], max_settle_seconds=seconds)
    return float(np.linalg.norm(np.array(res.final_ee_pos) - start))
