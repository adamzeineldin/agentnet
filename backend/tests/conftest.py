"""Isolate tests from the dev database/artifacts. Must run before `app` is imported."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="nimbotics-test-"))
os.environ["NIMBOTICS_DB_PATH"] = str(_TMP / "test.db")
os.environ["NIMBOTICS_ARTIFACT_DIR"] = str(_TMP / "artifacts")
# Sign-in stays off unless a test turns it on: the repo's .env may hold real Google keys and a session secret,
# and load_dotenv never overrides a variable that is already set (even to "").
for _key in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
             "NIMBOTICS_SESSION_SECRET", "NIMBOTICS_APP_URL"):
    os.environ[_key] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app.services.robot_adapter import RobotAdapter  # noqa: E402
from app.services.robot_catalog import ROBOTS  # noqa: E402
from app.services.scene import build_model  # noqa: E402


@pytest.fixture(scope="session")
def adapters() -> dict[str, RobotAdapter]:
    return {rid: RobotAdapter(d, build_model(d)) for rid, d in ROBOTS.items()}


@pytest.fixture(scope="session")
def panda(adapters) -> RobotAdapter:
    return adapters["panda_01"]


@pytest.fixture(scope="session")
def ur5e(adapters) -> RobotAdapter:
    return adapters["ur5e_01"]
