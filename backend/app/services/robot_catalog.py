"""Declared robot catalog.

Only facts that cannot be read from the MJCF live here (display names, which
Menagerie file to load, where Nimbotics attaches a TCP site when the model has
none). Everything else in a Robot Passport is read from the compiled model or
measured in simulation; see services/passports.py.

Arms uploaded by users (services/uploads.py) are registered here at runtime with
source="upload"; their declared facts come from the upload, never from this file.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Literal

from app.config import MENAGERIE_DIR


@dataclass(frozen=True)
class EndEffectorDecl:
    site_name: str
    # True when the site already exists in the Menagerie model.
    exists_in_model: bool
    parent_body: str | None = None
    offset_m: tuple[float, float, float] = (0.0, 0.0, 0.0)
    note: str = ""


@dataclass(frozen=True)
class ControllerDecl:
    """A real controller stack this robot's joint paths can be sent to (see services/controller)."""

    kind: str
    # Rotation about +z from the Menagerie base body frame to the controller's base frame.
    base_yaw_deg: float
    note: str = ""


@dataclass(frozen=True)
class RobotDecl:
    robot_id: str
    display_name: str
    short_name: str
    model_dir: str
    scene_xml: str
    home_keyframe: str
    end_effector: EndEffectorDecl
    tool_type: str
    # True only if this robot is a stand-in for an unavailable named model.
    fallback_model: bool = False
    controller: ControllerDecl | None = None
    # How far in front of the base the task origin sits (metres, along +x). Chosen per arm so the
    # task lies inside its working envelope; the passport measures the actual reach.
    task_distance_m: float = 0.50
    maker: str = ""
    # In the fleet on a fresh server; other catalog arms are added on request (POST /api/robots/{id}/enable).
    default_fleet: bool = False
    # "upload": a user-supplied model, normalized by services/uploads.py and stored under model_root.
    source: Literal["menagerie", "upload"] = "menagerie"
    model_root: Path | None = None
    uploaded_by: str | None = None
    # Uploads only: the body carrying the arm, as (x, y, z, yaw) in the model's world at its home pose, when that is
    # not the origin facing +x (a humanoid's pelvis, one arm of a two-armed robot). Tasks are placed in front of it.
    mount: tuple[float, float, float, float] | None = None

    @property
    def model_path(self) -> Path:
        return (self.model_root or MENAGERIE_DIR) / self.model_dir

    @property
    def scene_path(self) -> Path:
        return self.model_path / self.scene_xml


_CATALOG: dict[str, RobotDecl] = {
    "panda_01": RobotDecl(
        robot_id="panda_01",
        display_name="Robot A · Franka Emika Panda",
        short_name="Panda",
        model_dir="franka_emika_panda",
        scene_xml="scene.xml",
        home_keyframe="home",
        end_effector=EndEffectorDecl(
            site_name="nimbotics_tcp",
            exists_in_model=False,
            parent_body="hand",
            # Franka Hand flange-to-TCP distance from Franka's documentation.
            offset_m=(0.0, 0.0, 0.1034),
            note="Menagerie Panda has no TCP site; Nimbotics adds one between the fingertips.",
        ),
        tool_type="parallel_gripper_held_open (not used for reach)",
        maker="Franka Emika",
        default_fleet=True,
    ),
    "ur5e_01": RobotDecl(
        robot_id="ur5e_01",
        display_name="Robot B · Universal Robots UR5e",
        short_name="UR5e",
        model_dir="universal_robots_ur5e",
        scene_xml="scene.xml",
        home_keyframe="home",
        end_effector=EndEffectorDecl(
            site_name="attachment_site",
            exists_in_model=True,
            note="Tool flange site provided by the Menagerie model.",
        ),
        tool_type="none (bare tool flange)",
        controller=ControllerDecl(
            kind="ursim",
            base_yaw_deg=180.0,
            note="UR controller base frame = Menagerie base body rotated 180° about z; joint zeros and order match. "
                 "Measured against URSim 5.26.3 on 2026-10-29: TCP agrees within 1.1 mm at 4 joint configurations.",
        ),
        maker="Universal Robots",
        default_fleet=True,
    ),
    **{d.robot_id: d for d in (
        RobotDecl(
            robot_id="ur10e_01", display_name="Universal Robots UR10e", short_name="UR10e",
            model_dir="universal_robots_ur10e", scene_xml="scene.xml", home_keyframe="home",
            end_effector=EndEffectorDecl(site_name="attachment_site", exists_in_model=True,
                                         note="Tool flange site provided by the Menagerie model."),
            tool_type="none (bare tool flange)", maker="Universal Robots", task_distance_m=0.60,
        ),
        RobotDecl(
            robot_id="iiwa14_01", display_name="KUKA LBR iiwa 14", short_name="iiwa 14",
            model_dir="kuka_iiwa_14", scene_xml="scene.xml", home_keyframe="home",
            end_effector=EndEffectorDecl(site_name="attachment_site", exists_in_model=True,
                                         note="Tool flange site provided by the Menagerie model."),
            tool_type="none (bare tool flange)", maker="KUKA",
        ),
        RobotDecl(
            robot_id="xarm7_01", display_name="UFACTORY xArm 7", short_name="xArm 7",
            model_dir="ufactory_xarm7", scene_xml="scene.xml", home_keyframe="home",
            end_effector=EndEffectorDecl(site_name="link_tcp", exists_in_model=True,
                                         note="TCP site provided by the Menagerie model."),
            tool_type="xarm_gripper (not used for reach)", maker="UFACTORY", task_distance_m=0.40,
        ),
        RobotDecl(
            robot_id="lite6_01", display_name="UFACTORY Lite 6", short_name="Lite 6",
            model_dir="ufactory_lite6", scene_xml="scene.xml", home_keyframe="home",
            end_effector=EndEffectorDecl(site_name="attachment_site", exists_in_model=True,
                                         note="Tool flange site provided by the Menagerie model."),
            tool_type="none (bare tool flange)", maker="UFACTORY", task_distance_m=0.30,
        ),
        RobotDecl(
            robot_id="fr3_01", display_name="Franka Research 3", short_name="FR3",
            model_dir="franka_fr3", scene_xml="scene.xml", home_keyframe="home",
            end_effector=EndEffectorDecl(site_name="attachment_site", exists_in_model=True,
                                         note="Flange site provided by the Menagerie model (no hand in this model)."),
            tool_type="none (bare flange)", maker="Franka Robotics",
        ),
        RobotDecl(
            robot_id="gen3_01", display_name="Kinova Gen3", short_name="Gen3",
            model_dir="kinova_gen3", scene_xml="scene.xml", home_keyframe="home",
            end_effector=EndEffectorDecl(site_name="pinch_site", exists_in_model=True,
                                         note="Pinch site provided by the Menagerie model."),
            tool_type="robotiq_2f85 held open (not used for reach)", maker="Kinova", task_distance_m=0.70,
        ),
        RobotDecl(
            robot_id="sawyer_01", display_name="Rethink Robotics Sawyer", short_name="Sawyer",
            model_dir="rethink_robotics_sawyer", scene_xml="scene.xml", home_keyframe="home",
            end_effector=EndEffectorDecl(site_name="attachment_site", exists_in_model=True,
                                         note="Tool site provided by the Menagerie model."),
            tool_type="none (bare tool flange)", maker="Rethink Robotics", task_distance_m=0.42,
        ),
        RobotDecl(
            robot_id="z1_01", display_name="Unitree Z1", short_name="Z1",
            model_dir="unitree_z1", scene_xml="scene.xml", home_keyframe="home",
            end_effector=EndEffectorDecl(site_name="nimbotics_tcp", exists_in_model=False, parent_body="link06",
                                         note="The Menagerie model has no tool site; Nimbotics adds one at the link06 origin."),
            tool_type="none (bare flange)", maker="Unitree", task_distance_m=0.40,
        ),
    )},
}


BUILT_IN_IDS = frozenset(_CATALOG)
# Read-only view; uploads join it through register().
ROBOTS: MappingProxyType[str, RobotDecl] = MappingProxyType(_CATALOG)


def register(decl: RobotDecl) -> None:
    """Add an uploaded arm to the catalog (startup reload or a new upload)."""
    if decl.source != "upload" or decl.robot_id in BUILT_IN_IDS:
        raise ValueError(f"Only uploads can be registered, under a new id (got {decl.robot_id!r})")
    _CATALOG[decl.robot_id] = decl


def unregister(robot_id: str) -> None:
    if robot_id not in BUILT_IN_IDS:
        _CATALOG.pop(robot_id, None)


def get_robot_decl(robot_id: str) -> RobotDecl:
    try:
        return ROBOTS[robot_id]
    except KeyError as exc:
        raise KeyError(f"Unknown robot_id '{robot_id}'. Known: {sorted(ROBOTS)}") from exc
