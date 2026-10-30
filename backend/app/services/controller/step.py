"""The optional "also run on URSim" step shared by transfers and real-data replays."""

from __future__ import annotations

from collections.abc import Callable

import numpy as np

from app.config import MAX_JOINT_SPEED_RAD_S
from app.models.controller import ControllerExecution
from app.services import controller
from app.services.controller.execution import CONTROLLER_LABEL, run_on_controller
from app.services.jobs import RunContext
from app.services.robot_adapter import RobotAdapter
from app.services.robot_catalog import RobotDecl


def controller_step(
    ctx: RunContext, adapter: RobotAdapter, decl: RobotDecl, target_world: np.ndarray,
    max_speed: float = MAX_JOINT_SPEED_RAD_S,
) -> Callable[[list], dict]:
    """After MuJoCo verification: stream the same joint path to URSim. Never changes the simulation result."""

    def step(joint_path: list) -> dict:
        ctx.event("executing", f"Streaming the verified {len(joint_path)}-waypoint path to the URSim controller "
                  "(controller software, not a physical arm)")
        try:
            out = run_on_controller(controller.make_client(), adapter, decl, joint_path, target_world,
                                    max_speed=max_speed)
        except Exception as exc:  # noqa: BLE001 - recorded as a failed controller execution
            out = ControllerExecution(label=CONTROLLER_LABEL, status="failed", error=f"{type(exc).__name__}: {exc}",
                                      stream_hz=0.0, path_waypoints=len(joint_path), commanded_samples=0)
        message = (f"URSim execution succeeded: TCP {out.tcp_to_target_mm:.2f} mm from target, "
                   f"{out.tcp_vs_model_mm:.2f} mm from the MuJoCo model" if out.status == "succeeded"
                   else f"URSim execution failed: {out.error}")
        ctx.event("verifying", message, controller_status=out.status)
        return {"controller_execution": out.model_dump(mode="json")}

    return step
