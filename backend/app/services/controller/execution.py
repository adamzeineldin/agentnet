"""Send a MuJoCo-verified joint path to the UR controller (URSim) and measure what the controller did.

The path is re-timed with the same rule MuJoCo executes it with (interpolate_path at MAX_JOINT_SPEED_RAD_S),
streamed by ur_bridge, and compared against the command and against the robot model. URSim runs the real UR
controller software on an idealized arm: no obstacle, payload or real dynamics. Results are labelled as such.
"""

from __future__ import annotations

import math

import mujoco
import numpy as np

from app.config import (
    CONTROLLER_FINAL_TOL_RAD,
    CONTROLLER_MODEL_TOL_M,
    CONTROLLER_STREAM_HZ,
    MAX_JOINT_SPEED_RAD_S,
    REACH_TOLERANCE_M,
)
from app.models.controller import ControllerExecution, ControllerSample
from app.services.controller.bridge_client import BridgeClient, BridgeError
from app.services.robot_adapter import RobotAdapter
from app.services.robot_catalog import RobotDecl
from app.services.simulation import interpolate_path

CONTROLLER_LABEL = "URSim controller, not physical"
MAX_TRACE_SAMPLES = 200
NOTES = (
    "URSim runs the UR controller software on an idealized arm (no payload, no real dynamics): "
    "not physical-world evidence.",
    "The obstacle exists only in the MuJoCo scene; URSim does not check it. The approach move to the path "
    "start is unchecked by Nimbotics.",
)


def controller_samples(
    joint_path, hz: float = CONTROLLER_STREAM_HZ, max_speed: float = MAX_JOINT_SPEED_RAD_S
) -> np.ndarray:
    """The joint path re-timed for streaming, with the same speed rule as the MuJoCo execution."""
    return interpolate_path([np.array(q, dtype=float) for q in joint_path], 1.0 / hz, max_speed)


def to_controller_frame(adapter: RobotAdapter, decl: RobotDecl, p_world: np.ndarray) -> np.ndarray:
    """A MuJoCo world point expressed in the controller's base frame (declared yaw from the base body)."""
    if decl.controller is None:
        raise ValueError(f"{decl.robot_id} has no controller declaration")
    data = adapter.new_data()
    mujoco.mj_kinematics(adapter.model, data)
    body = adapter.base_body_id
    p_body = data.xmat[body].reshape(3, 3).T @ (np.asarray(p_world, dtype=float) - data.xpos[body])
    yaw = math.radians(decl.controller.base_yaw_deg)
    rz = np.array([[math.cos(yaw), -math.sin(yaw), 0.0], [math.sin(yaw), math.cos(yaw), 0.0], [0.0, 0.0, 1.0]])
    return rz @ p_body


def run_on_controller(
    client: BridgeClient, adapter: RobotAdapter, decl: RobotDecl, joint_path, target_world: np.ndarray,
    hz: float = CONTROLLER_STREAM_HZ, max_speed: float = MAX_JOINT_SPEED_RAD_S,
) -> ControllerExecution:
    samples = controller_samples(joint_path, hz, max_speed)
    base = {"label": CONTROLLER_LABEL, "stream_hz": hz, "path_waypoints": len(joint_path),
            "commanded_samples": len(samples), "notes": list(NOTES)}
    try:
        info = client.status()
        resp = client.execute(samples.tolist(), 1.0 / hz)
    except BridgeError as exc:
        return ControllerExecution(status="failed", error=str(exc), **base)
    metrics = _measure(adapter, decl, samples, resp, target_world)
    checks = {
        "bridge_completed": bool(resp.get("ok")),
        "no_protective_stop": not resp.get("protective_stopped", False),
        "safety_normal_after": resp.get("safety_mode_after") == 1,
        "final_joints_reached": metrics["final_joint_error_rad"] <= CONTROLLER_FINAL_TOL_RAD,
        "tcp_matches_model": metrics["tcp_vs_model_mm"] <= CONTROLLER_MODEL_TOL_M * 1000,
        "endpoint_within_tolerance": metrics["tcp_to_target_mm"] <= REACH_TOLERANCE_M * 1000,
    }
    ok = all(checks.values())
    failed = [k for k, v in checks.items() if not v]
    return ControllerExecution(
        status="succeeded" if ok else "failed",
        error=None if ok else (resp.get("error") or f"checks failed: {', '.join(failed)}"),
        controller_version=info.get("controller_version"), robot_model=info.get("robot_model"),
        approach=resp.get("approach"), duration_s=resp.get("duration_s"),
        safety_mode_before=resp.get("safety_mode_before"), safety_mode_after=resp.get("safety_mode_after"),
        protective_stopped=bool(resp.get("protective_stopped", False)), checks=checks,
        trace=_trace(resp.get("samples", [])), **metrics, **base,
    )


def _measure(adapter: RobotAdapter, decl: RobotDecl, samples: np.ndarray, resp: dict, target_world) -> dict:
    final_q = np.array(resp["final_q"], dtype=float)
    final_tcp = np.array(resp["final_tcp"][:3], dtype=float)
    actual = np.array([s["q"] for s in resp.get("samples", [])], dtype=float).reshape(-1, samples.shape[1])
    model_tcp = to_controller_frame(adapter, decl, adapter.fk(adapter.new_data(), final_q))
    target = to_controller_frame(adapter, decl, target_world)
    return {
        "final_joint_error_rad": float(np.max(np.abs(final_q - samples[-1]))),
        "path_deviation_rad": _path_deviation(actual, samples),
        "tcp_vs_model_mm": float(np.linalg.norm(final_tcp - model_tcp) * 1000),
        "tcp_to_target_mm": float(np.linalg.norm(final_tcp - target) * 1000),
    }


def _path_deviation(actual: np.ndarray, commanded: np.ndarray) -> float | None:
    """Largest distance (max joint, rad) from any reported joint state to the nearest commanded sample."""
    if len(actual) == 0:
        return None
    worst = 0.0
    for chunk in np.array_split(actual, max(1, len(actual) // 256)):
        d = np.max(np.abs(chunk[:, None, :] - commanded[None, :, :]), axis=2).min(axis=1)
        worst = max(worst, float(d.max()))
    return worst


def _trace(raw: list[dict]) -> list[ControllerSample]:
    if not raw:
        return []
    idx = np.unique(np.linspace(0, len(raw) - 1, min(len(raw), MAX_TRACE_SAMPLES)).round().astype(int))
    return [ControllerSample(t=float(raw[i]["t"]), q_cmd=raw[i]["q_cmd"], q=raw[i]["q"], tcp=raw[i]["tcp"])
            for i in idx]
