"""Declared robot catalog.

Only facts that cannot be read from the MJCF live here (display names, which
Menagerie file to load, where Nimbotics attaches a TCP site when the model has
none). Everything else in a Robot Passport is read from the compiled model or
measured in simulation; see services/passports.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

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

    @property
    def scene_path(self) -> Path:
        return MENAGERIE_DIR / self.model_dir / self.scene_xml

    @property
    def model_path(self) -> Path:
        return MENAGERIE_DIR / self.model_dir


ROBOTS: dict[str, RobotDecl] = {
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
    )},
}


def get_robot_decl(robot_id: str) -> RobotDecl:
    try:
        return ROBOTS[robot_id]
    except KeyError as exc:
        raise KeyError(f"Unknown robot_id '{robot_id}'. Known: {sorted(ROBOTS)}") from exc
