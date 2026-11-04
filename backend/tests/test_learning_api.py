"""The Lab's flow against real MuJoCo runs: learn directly, adapt, then try an improvement that is judged."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

FAMILY = "tall_wall_v1"


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def _wait(client, run_id, timeout=180.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("succeeded", "failed"):
            return run
        time.sleep(0.2)
    raise TimeoutError(run_id)


def _check(client, robot, **extra):
    r = client.post("/api/library/check", json={"robot_id": robot, "task_family": FAMILY, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def test_learn_adapt_and_improve(client):
    assert _check(client, "panda_01")["case"] == "learn"
    asked = _check(client, "panda_01", from_robot_id="ur5e_01")
    assert asked["case"] == "learn" and "nothing to learn from" in asked["requested_note"]

    # Case 3: learn directly; the verified skill is saved with the run.
    r = client.post("/api/runs/discover", json={"robot_id": "panda_01", "scene_seed": 11, "task_family": FAMILY,
                                                "publish": True})
    learned = _wait(client, r.json()["run_id"])
    assert learned["status"] == "succeeded", learned["events"][-1]
    assert learned["results"]["published"] is True
    skill_id = learned["skill_id"]
    assert client.get(f"/api/skills/{skill_id}").status_code == 200

    # Case 1 for the Panda now: it knows it, nothing to retrain.
    known = _check(client, "panda_01")
    assert known["case"] == "known" and known["existing"]["skill_id"] == skill_id and known["improve_sources"] == []

    # Case 2 for the UR5e: adapt the Panda's skill, saved when verified.
    adapt = _check(client, "ur5e_01")
    assert adapt["case"] == "adapt" and adapt["sources"][0]["skill_id"] == skill_id
    r = client.post("/api/transfers", json={"source_skill_id": skill_id, "target_robot_id": "ur5e_01", "publish": True})
    adapted = _wait(client, r.json()["run_id"])
    assert adapted["status"] == "succeeded", adapted["events"][-1]
    assert adapted["results"]["published"] is True and _check(client, "ur5e_01")["case"] == "known"

    # Improve the Panda's skill with the UR5e's experience: judged, kept only if better.
    panda = _check(client, "panda_01")
    source = panda["improve_sources"][0]["skill_id"]
    before = len(client.get("/api/skills").json())
    r = client.post(f"/api/skills/{skill_id}/improve", json={"source_skill_id": source})
    assert r.status_code == 202, r.text
    tried = _wait(client, r.json()["run_id"])
    verdict = tried["results"]["improvement"]
    assert verdict["existing"]["skill_id"] == skill_id and verdict["reasons"]
    after = len(client.get("/api/skills").json())
    assert after == before + (1 if verdict["better"] else 0)
    assert (verdict["published_skill_id"] is not None) == verdict["better"]
    # An improvement run is never saved by hand, and the same attempt is not repeated.
    assert client.post("/api/skills", json={"run_id": tried["run_id"]}).status_code == 409
    again = client.post(f"/api/skills/{skill_id}/improve", json={"source_skill_id": source})
    assert again.status_code == 409
    assert source in _check(client, "panda_01")["already_tried"]
