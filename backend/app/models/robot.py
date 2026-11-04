"""Robot Passport schema.

Every section carries a provenance tag:
  declared  - written in Nimbotics' catalog (cannot be read from the model)
  model     - read directly from the compiled MuJoCo model
  measured  - computed by sampling / simulating the model
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.sharing import Visibility

PASSPORT_SCHEMA_VERSION = "1.1"

Provenance = Literal["declared", "model", "measured"]
Vec3 = tuple[float, float, float]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True)


class JointInfo(_Frozen):
    name: str
    joint_id: int
    joint_type: Literal["hinge", "slide"]
    limited: bool
    lower: float
    upper: float


class ActuatorInfo(_Frozen):
    name: str
    actuator_id: int
    joint_name: str
    control_mode: Literal["position_servo"]
    kp: float
    kv: float
    # None: the model sets no limit.
    ctrl_range: tuple[float, float] | None
    force_range: tuple[float, float] | None


class EndEffectorInfo(_Frozen):
    site_name: str
    parent_body: str
    source: Literal["model", "added_by_nimbotics"]
    offset_m: Vec3
    home_position: Vec3
    note: str


class WorkspaceEstimate(_Frozen):
    method: str
    seed: int
    samples_requested: int
    samples_collision_free: int
    rejected_self_collision: int
    rejected_floor_or_env: int
    rejected_below_floor: int
    bounds_min: Vec3
    bounds_max: Vec3
    max_reach_m: float
    median_reach_m: float
    reach_reference: str
    points: list[Vec3] = Field(description="Subsample of collision-free EE positions")


class CapabilityEvidence(_Frozen):
    task_type: str
    status: Literal["verified_in_sim", "measured", "unverified"]
    provenance: Provenance
    evidence: dict
    note: str


class RobotPassport(_Frozen):
    schema_version: str = PASSPORT_SCHEMA_VERSION
    robot_id: str
    display_name: str
    short_name: str
    model_source: str
    model_version: str
    model_file: str
    model_hash: str
    mujoco_version: str
    fallback_model: bool
    joint_names: list[str]
    arm_joints: list[JointInfo]
    dof: int
    actuators: list[ActuatorInfo]
    end_effector: EndEffectorInfo
    base_frame: dict
    tool_type: str
    home_qpos: list[float]
    workspace: WorkspaceEstimate
    capabilities: list[CapabilityEvidence]
    simulation_assumptions: list[str]
    # Arm body pairs already touching in the model's home pose; excluded from contact (scene.resting_self_contacts).
    resting_contacts_excluded: list[str] = []
    calibration_status: str
    field_provenance: dict[str, Provenance]
    created_at: datetime
    compute_seconds: float


class RobotSummary(_Frozen):
    robot_id: str
    display_name: str
    short_name: str
    dof: int
    model_source: str
    model_hash: str
    tool_type: str
    max_reach_m: float
    fallback_model: bool
    snapshot_url: str
    created_at: datetime
    maker: str = ""
    # Real controller stack this arm's paths can also be sent to (e.g. "ursim"); None = simulation only.
    controller: str | None = None
    # Uploaded arms can be private to their uploader (models/sharing.py); catalog arms are always public.
    visibility: Visibility = "public"
    mine: bool = False
    published_by: str | None = None
    published_at: datetime | None = None


class StoredModel(_Frozen):
    """An uploaded robot kept as a model only: stored and shown in the Library, but it cannot run tasks
    (no usable arm, or the uploader chose not to pick one). Every number is read from the compiled model."""

    robot_id: str
    name: str
    joints: int
    bodies: int
    notes: list[str] = Field(default_factory=list)
    snapshot_url: str
    created_at: datetime
    uploaded_by: str | None = None
    # passports.model_dir_hash of the stored folder: the same model is only made public once.
    model_hash: str | None = None
    visibility: Visibility = "public"
    mine: bool = False
    published_by: str | None = None
    published_at: datetime | None = None


class CatalogEntry(_Frozen):
    """A catalog arm. Declared fields only; reach and joints come from its passport once in the fleet."""

    robot_id: str
    display_name: str
    short_name: str
    maker: str
    model_source: str
    in_fleet: bool
    default_fleet: bool
    added_by: str | None = None
    # Uploaded arms can be private to their uploader (models/sharing.py); catalog arms are always public.
    visibility: Visibility = "public"
    mine: bool = False
    published_by: str | None = None
    published_at: datetime | None = None
