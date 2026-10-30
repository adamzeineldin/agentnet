from __future__ import annotations

from fastapi import APIRouter

from app.services import controller
from app.services.controller.bridge_client import BridgeError
from app.services.controller.execution import CONTROLLER_LABEL

router = APIRouter(prefix="/api/controller", tags=["controller"])


@router.get("/status")
def controller_status() -> dict:
    """Whether a URSim bridge is configured and reachable. Asks the bridge live; nothing is cached."""
    base = {"label": CONTROLLER_LABEL}
    if not controller.URSIM_BRIDGE_URL:
        return {**base, "configured": False, "reachable": False,
                "detail": "AGENTNET_URSIM_BRIDGE_URL is not set; see backend/ur_bridge/README.md"}
    try:
        info = controller.make_client().status()
    except BridgeError as exc:
        return {**base, "configured": True, "reachable": False, "detail": str(exc)}
    ready = info.get("remote_control") is True and info.get("safety_mode") == 1
    return {**base, "configured": True, "reachable": True, "ready": ready, **info,
            "detail": "ready" if ready else "controller reachable but not in remote control with NORMAL safety mode"}
