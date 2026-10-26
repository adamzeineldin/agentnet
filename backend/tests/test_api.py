from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def _wait(client, run_id, timeout=60.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("succeeded", "failed"):
            return run
        time.sleep(0.2)
    raise TimeoutError(run_id)


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["versions"]["mujoco"]
    assert body["reasoning"]["mode"] in ("offline", "meta_configured")


def test_robots_list_and_passport(client):
    robots = client.get("/api/robots").json()
    assert {r["robot_id"] for r in robots} == {"panda_01", "ur5e_01"}
    snap = client.get(robots[0]["snapshot_url"])
    assert snap.status_code == 200 and snap.headers["content-type"] == "image/png"
    passport = client.get("/api/robots/ur5e_01").json()
    assert passport["dof"] == 6 and passport["workspace"]["samples_collision_free"] > 0


def test_unknown_robot_404(client):
    assert client.get("/api/robots/nope").status_code == 404
    assert client.post("/api/robots/nope/motion-check", json={}).status_code == 404


def test_invalid_target_422(client):
    r = client.post("/api/robots/panda_01/motion-check", json={"target": [5, 0, 0.3]})
    assert r.status_code == 422


@pytest.mark.parametrize("rid", ["panda_01", "ur5e_01"])
def test_motion_check_run_succeeds_with_artifacts(client, rid):
    started = client.post(f"/api/robots/{rid}/motion-check", json={"seed": 7})
    assert started.status_code == 202
    run = _wait(client, started.json()["run_id"])
    assert run["status"] == "succeeded", run.get("error") or run["events"][-1]
    assert run["endpoint_error_m"] < 0.01 and run["collision_count"] == 0
    statuses = [e["status"] for e in run["events"]]
    assert statuses[0] == "queued" and "executing" in statuses and statuses[-1] == "succeeded"
    video = client.get(run["artifacts"]["video"])
    assert video.status_code == 200 and len(video.content) > 1000
    sse = client.get(f"/api/runs/{run['run_id']}/events")
    assert "event: done" in sse.text


def test_unreachable_target_fails_honestly(client):
    started = client.post("/api/robots/panda_01/motion-check", json={"target": [1.15, 0, 0.3]})
    run = _wait(client, started.json()["run_id"])
    assert run["status"] == "failed" and "IK" in run["events"][-1]["message"]
