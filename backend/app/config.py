"""Central configuration. Paths and constants only; no side effects beyond reading .env."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
load_dotenv(REPO_DIR / ".env")

DATA_DIR = BACKEND_DIR / "app" / "data"
MENAGERIE_DIR = Path(os.environ.get("AGENTNET_MENAGERIE_DIR", DATA_DIR / "menagerie"))
# Pinned in scripts/fetch_models.sh; recorded in every passport.
MENAGERIE_COMMIT = "f3b6013629c7b94f8ee93fd977b161fa8350f9bc"
DB_PATH = Path(os.environ.get("AGENTNET_DB_PATH", DATA_DIR / "agentnet.db"))
ARTIFACT_DIR = Path(os.environ.get("AGENTNET_ARTIFACT_DIR", DATA_DIR / "artifacts"))

MODEL_API_KEY = os.environ.get("MODEL_API_KEY") or None
META_MODEL_ID = os.environ.get("META_MODEL_ID", "muse-spark-1.3")

# Optional UR controller bridge (backend/ur_bridge, talks ur_rtde to URSim). Unset = controller step unavailable.
URSIM_BRIDGE_URL = os.environ.get("AGENTNET_URSIM_BRIDGE_URL") or None

# Cloud image: static frontend export served by the API process, and a cap on queued simulation jobs (0 = none).
WEB_DIR = Path(os.environ["AGENTNET_WEB_DIR"]) if os.environ.get("AGENTNET_WEB_DIR") else None
MAX_PENDING_JOBS = int(os.environ.get("AGENTNET_MAX_PENDING_JOBS") or 0)

# Local-only app: allow any localhost / 127.0.0.1 port (Next dev may move off :3000).
CORS_ORIGIN_REGEX = os.environ.get(
    "AGENTNET_CORS_ORIGIN_REGEX", r"http://(localhost|127\.0\.0\.1)(:\d+)?"
)

# Execution / verification constants (see DECISIONS.md).
MAX_JOINT_SPEED_RAD_S = 1.0
MAX_SETTLE_SECONDS = 2.5
SETTLE_Q_TOL_RAD = 5e-4
SETTLE_QVEL_TOL = 1e-2
REACH_TOLERANCE_M = 0.01
RENDER_WIDTH = 960
RENDER_HEIGHT = 540
VIDEO_FPS = 30
CONTROLLER_STREAM_HZ = 125.0
CONTROLLER_FINAL_TOL_RAD = 1e-3
# Controller TCP vs MuJoCo FK at the same joints; nominal UR kinematics vs the Menagerie model differ by ~1 mm.
CONTROLLER_MODEL_TOL_M = 0.005
