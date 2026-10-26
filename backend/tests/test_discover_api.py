from __future__ import annotations

import json
import time

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def _wait(client, run_id, timeout=120.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("succeeded", "failed"):
            return run
        time.sleep(0.2)
    raise TimeoutError(run_id)


@pytest.fixture(scope="module")
def discovered(client):
    r = client.post("/api/runs/discover", json={"robot_id": "panda_01", "scene_seed": 42})
    assert r.status_code == 202
    return _wait(client, r.json()["run_id"])


def test_m2_gate_panda_discovers_verified_skill(client, discovered):
    run = discovered
    assert run["status"] == "succeeded", run["events"][-1]
    assert run["collision_count"] == 0 and run["endpoint_error_m"] < 0.01
    outcomes = [c["outcome"] for c in run["candidate_summaries"]]
    assert "verified" in outcomes
    assert any(o in ("collision", "insufficient_clearance", "unreachable") for o in outcomes)
    assert run["results"]["checks"]["reproduces_rollout"]
    statuses = [e["status"] for e in run["events"]]
    for s in ("profiling", "proposing", "checking", "simulating", "selecting", "executing", "verifying"):
        assert s in statuses
    assert client.get(run["artifacts"]["video"]).status_code == 200


def test_draft_is_not_published_until_requested(client, discovered):
    assert discovered["results"]["published"] is False
    assert discovered["skill_id"] not in {s["skill_id"] for s in client.get("/api/skills").json()}


def test_publish_and_retrieve_capsule(client, discovered):
    r = client.post("/api/skills", json={"run_id": discovered["run_id"]})
    assert r.status_code == 201, r.text
    capsule = r.json()
    assert capsule["source_robot_id"] == "panda_01" and capsule["parent_skill_id"] is None
    assert capsule["provenance"]["run_id"] == discovered["run_id"]
    assert capsule["provenance"]["simulation_only"] is True
    assert capsule["validation"]["success"] and capsule["validation"]["collisions"] == 0
    # Capsule carries task-frame geometry only, never joint vectors.
    assert '"q_start"' not in json.dumps(capsule)
    detail = client.get(f"/api/skills/{capsule['skill_id']}").json()
    assert detail["capsule"] == capsule and detail["ancestors"] == [] and detail["children"] == []
    assert client.post("/api/skills", json={"run_id": discovered["run_id"]}).status_code == 409
    caps = {c["task_type"]: c for c in client.get("/api/robots/panda_01").json()["capabilities"]}
    assert caps["obstacle_aware_reach"]["status"] == "verified_in_sim"
    ur5e = {c["task_type"]: c for c in client.get("/api/robots/ur5e_01").json()["capabilities"]}
    assert ur5e["obstacle_aware_reach"]["status"] == "unverified"


def test_non_discover_run_cannot_publish(client):
    r = client.post("/api/robots/panda_01/motion-check", json={})
    run = _wait(client, r.json()["run_id"])
    res = client.post("/api/skills", json={"run_id": run["run_id"]})
    assert res.status_code == 409


def test_publish_unknown_run_404_and_unknown_robot(client):
    assert client.post("/api/skills", json={"run_id": "nope"}).status_code == 404
    assert client.post("/api/runs/discover", json={"robot_id": "nope"}).status_code == 404
    assert client.get("/api/skills/nope").status_code == 404
