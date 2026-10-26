from __future__ import annotations

import platform

import mujoco
import numpy as np
from fastapi import APIRouter

from app.config import MENAGERIE_COMMIT, META_MODEL_ID, MODEL_API_KEY

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "versions": {
            "python": platform.python_version(),
            "mujoco": mujoco.__version__,
            "numpy": np.__version__,
            "menagerie_commit": MENAGERIE_COMMIT,
        },
        "reasoning": {
            # Key presence only; the provider is not exercised until Milestone 4.
            "mode": "meta_configured" if MODEL_API_KEY else "offline",
            "model_id": META_MODEL_ID if MODEL_API_KEY else None,
            "label": "Meta Muse Spark (configured)" if MODEL_API_KEY
            else "Offline deterministic planner",
        },
    }
