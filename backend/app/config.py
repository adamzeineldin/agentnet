"""Central configuration. Paths and constants only; no side effects beyond reading .env."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
load_dotenv(REPO_DIR / ".env")

DATA_DIR = BACKEND_DIR / "app" / "data"
MENAGERIE_DIR = Path(os.environ.get("NIMBOTICS_MENAGERIE_DIR", DATA_DIR / "menagerie"))
# Pinned in scripts/fetch_models.sh; recorded in every passport.
MENAGERIE_COMMIT = "f3b6013629c7b94f8ee93fd977b161fa8350f9bc"
DB_PATH = Path(os.environ.get("NIMBOTICS_DB_PATH", DATA_DIR / "nimbotics.db"))
ARTIFACT_DIR = Path(os.environ.get("NIMBOTICS_ARTIFACT_DIR", DATA_DIR / "artifacts"))
# Uploaded robot models; next to the artifacts so the cloud volume keeps them.
UPLOAD_DIR = Path(os.environ.get("NIMBOTICS_UPLOAD_DIR", ARTIFACT_DIR.parent / "uploads"))

# Cloud Library (both optional). DATABASE_URL (Postgres, e.g. Neon) replaces the SQLite file at DB_PATH.
# The S3 settings (Cloudflare R2 or any S3-compatible store) keep run files and robot models off the machine's
# disk: ARTIFACT_DIR and UPLOAD_DIR become local caches, and /artifacts falls back to the store.
DATABASE_URL = os.environ.get("DATABASE_URL") or None
DATABASE: str | Path = DATABASE_URL or DB_PATH
S3_ENDPOINT = os.environ.get("NIMBOTICS_S3_ENDPOINT") or None
S3_BUCKET = os.environ.get("NIMBOTICS_S3_BUCKET") or None
S3_ACCESS_KEY_ID = os.environ.get("NIMBOTICS_S3_ACCESS_KEY_ID") or None
S3_SECRET_ACCESS_KEY = os.environ.get("NIMBOTICS_S3_SECRET_ACCESS_KEY") or None
# Public base URL of the bucket (an R2 custom domain or r2.dev address). Unset = short-lived signed links.
S3_PUBLIC_URL = (os.environ.get("NIMBOTICS_S3_PUBLIC_URL") or "").rstrip("/") or None

MODEL_API_KEY = os.environ.get("MODEL_API_KEY") or None
META_MODEL_ID = os.environ.get("META_MODEL_ID", "muse-spark-1.3")
# Spend cap for the public skill scout: model calls per UTC day; beyond it the offline scout answers.
SCOUT_DAILY_MODEL_CALLS = int(os.environ.get("NIMBOTICS_SCOUT_DAILY_MODEL_CALLS", "200"))

# Optional UR controller bridge (backend/ur_bridge, talks ur_rtde to URSim). Unset = controller step unavailable.
URSIM_BRIDGE_URL = os.environ.get("NIMBOTICS_URSIM_BRIDGE_URL") or None

# Cloud image: static frontend export served by the API process, and a cap on queued simulation jobs (0 = none).
WEB_DIR = Path(os.environ["NIMBOTICS_WEB_DIR"]) if os.environ.get("NIMBOTICS_WEB_DIR") else None
MAX_PENDING_JOBS = int(os.environ.get("NIMBOTICS_MAX_PENDING_JOBS") or 0)

# Sign-in (OAuth). A provider is offered only when both its id and secret are set. With no provider
# configured (local dev, tests) runs stay open; with one or more, starting runs needs a signed-in user.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID") or None
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET") or None
GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID") or None
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET") or None
# Signs session cookies. Required whenever a provider is configured; never committed.
SESSION_SECRET = os.environ.get("NIMBOTICS_SESSION_SECRET") or None
SESSION_DAYS = 14
# Blog: posts a writer may publish per UTC day (keeps the shared site from being flooded).
BLOG_DAILY_POSTS = int(os.environ.get("NIMBOTICS_BLOG_DAILY_POSTS") or 20)
# Public origin used to build OAuth redirect URIs behind a proxy (e.g. the Codespaces URL). Unset = request origin.
PUBLIC_URL = (os.environ.get("NIMBOTICS_PUBLIC_URL") or "").rstrip("/") or None
# Where people land after signing in, when the pages are served from another origin than the API
# (local dev: http://localhost:3000). Unset = the API's own public origin (the cloud image serves both).
APP_URL = (os.environ.get("NIMBOTICS_APP_URL") or "").rstrip("/") or None

# Local-only app: allow any localhost / 127.0.0.1 port (Next dev may move off :3000).
CORS_ORIGIN_REGEX = os.environ.get(
    "NIMBOTICS_CORS_ORIGIN_REGEX", r"http://(localhost|127\.0\.0\.1)(:\d+)?"
)

# Execution / verification constants (see DECISIONS.md).
MAX_JOINT_SPEED_RAD_S = 1.0
MAX_SETTLE_SECONDS = 2.5
SETTLE_Q_TOL_RAD = 5e-4
SETTLE_QVEL_TOL = 1e-2
REACH_TOLERANCE_M = 0.01
# Video settings only change the clip, never the physics. The cloud copy renders smaller and sparser because
# software (OSMesa) rendering dominated replay time there (~139 s of a 16 s replay at 960x540, 30 fps).
RENDER_WIDTH = int(os.environ.get("NIMBOTICS_RENDER_WIDTH") or 960)
RENDER_HEIGHT = int(os.environ.get("NIMBOTICS_RENDER_HEIGHT") or 540)
VIDEO_FPS = int(os.environ.get("NIMBOTICS_VIDEO_FPS") or 30)
# Shadows and reflections cost ~80% of an OSMesa frame (240 ms -> 48 ms at 640x360); the cloud copy turns them off.
RENDER_EFFECTS = os.environ.get("NIMBOTICS_RENDER_EFFECTS", "1") != "0"
# Clips of each physics try during the route search (the chosen route's clip uses RENDER_WIDTH/HEIGHT).
CLIP_WIDTH, CLIP_HEIGHT = 448, 252  # 16:9, both multiples of 4 so the encoder never resizes
# The live view keeps at most one JPEG per running run, refreshed at most this often (wall-clock seconds).
LIVE_FRAME_INTERVAL_S = 1 / 15  # live view at the clips' 15 fps
CONTROLLER_STREAM_HZ = 125.0
CONTROLLER_FINAL_TOL_RAD = 1e-3
# Controller TCP vs MuJoCo FK at the same joints; nominal UR kinematics vs the Menagerie model differ by ~1 mm.
CONTROLLER_MODEL_TOL_M = 0.005
