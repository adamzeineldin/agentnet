"""Declared robot catalog.

Only facts that cannot be read from the MJCF live here (display names, which
Menagerie file to load, where AgentNet attaches a TCP site when the model has
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
            site_name="agentnet_tcp",
            exists_in_model=False,
            parent_body="hand",
            # Franka Hand flange-to-TCP distance from Franka's documentation.
            offset_m=(0.0, 0.0, 0.1034),
            note="Menagerie Panda has no TCP site; AgentNet adds one between the fingertips.",
        ),
        tool_type="parallel_gripper_held_open (not used for reach)",
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
    ),
}


def get_robot_decl(robot_id: str) -> RobotDecl:
    try:
        return ROBOTS[robot_id]
    except KeyError as exc:
        raise KeyError(f"Unknown robot_id '{robot_id}'. Known: {sorted(ROBOTS)}") from exc
