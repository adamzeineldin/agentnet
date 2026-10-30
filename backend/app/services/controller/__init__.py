"""Optional execution of verified joint paths on a UR controller (URSim) through backend/ur_bridge."""

from __future__ import annotations

from app.config import URSIM_BRIDGE_URL
from app.services.controller.bridge_client import BridgeClient
from app.services.robot_catalog import RobotDecl


def unavailable_reason(decl: RobotDecl) -> str | None:
    """Why this robot's paths cannot be sent to URSim right now, or None if they can."""
    if decl.controller is None or decl.controller.kind != "ursim":
        return f"{decl.short_name} has no URSim controller declaration"
    if not URSIM_BRIDGE_URL:
        return "URSim execution requested but AGENTNET_URSIM_BRIDGE_URL is not configured (see backend/ur_bridge)"
    return None


def make_client() -> BridgeClient:
    if not URSIM_BRIDGE_URL:
        raise RuntimeError("AGENTNET_URSIM_BRIDGE_URL is not configured")
    return BridgeClient(URSIM_BRIDGE_URL)
