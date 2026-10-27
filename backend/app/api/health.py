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
            # Key presence only; whether a run actually used Meta is recorded per run.
            "mode": "meta_configured" if MODEL_API_KEY else "offline",
            "model_id": META_MODEL_ID if MODEL_API_KEY else None,
            "label": "Meta Muse Spark available" if MODEL_API_KEY
            else "Offline deterministic planner",
            "note": "Per-run provider and model calls are recorded in each transfer run's results.reasoning",
        },
    }
