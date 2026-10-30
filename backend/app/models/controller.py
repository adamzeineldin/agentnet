"""Controller execution: a verified joint path sent to a UR controller (URSim) and what it reported back."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ControllerStatus = Literal["succeeded", "failed"]


class ControllerSample(BaseModel):
    model_config = ConfigDict(frozen=True)
    t: float
    q_cmd: list[float]
    q: list[float]
    tcp: list[float]


class ControllerExecution(BaseModel):
    model_config = ConfigDict(frozen=True)
    kind: Literal["ursim"] = "ursim"
    label: str
    status: ControllerStatus
    error: str | None = None
    controller_version: str | None = None
    robot_model: str | None = None
    stream_hz: float
    path_waypoints: int
    commanded_samples: int
    approach: dict | None = None
    duration_s: float | None = None
    final_joint_error_rad: float | None = None
    path_deviation_rad: float | None = None
    tcp_vs_model_mm: float | None = None
    tcp_to_target_mm: float | None = None
    safety_mode_before: int | None = None
    safety_mode_after: int | None = None
    protective_stopped: bool = False
    checks: dict[str, bool] = Field(default_factory=dict)
    trace: list[ControllerSample] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
