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


def test_every_physics_try_has_its_own_recorded_clip(client, discovered):
    tried = [c for c in discovered["results"]["candidates"] if c.get("physics")]
    assert tried, "discovery simulated at least one route"
    assert sorted(c["physics"]["future_index"] for c in tried) == list(range(1, len(tried) + 1))
    for c in tried:
        assert client.get(c["physics"]["video"]).status_code == 200
        assert client.get(c["physics"]["thumbnail"]).status_code == 200
        assert c["physics"]["trace_task"], "the simulated hand path is stored in the task frame"


def test_progress_events_carry_route_geometry_and_try_results(client, discovered):
    events = discovered["events"]
    routes = next(e["data"]["routes"] for e in events if "routes" in e["data"])
    assert {r["candidate_id"] for r in routes} == {c["candidate_id"] for c in discovered["results"]["candidates"]}
    assert all(len(r["waypoints_task"]) >= 2 for r in routes)
    checks = [e["data"] for e in events if e["status"] == "checking" and "outcome" in e["data"]]
    assert len(checks) == len(routes) and all(c["reason"] for c in checks)
    tries = [e["data"] for e in events if e["status"] == "simulating" and "future_index" in e["data"]]
    assert [t["candidate_id"] for t in tries] == discovered["results"]["search_metrics"]["simulated_order"]
    assert all(t["video"] and t["outcome"] for t in tries)


def test_live_frame_is_gone_after_the_run_finishes(client, discovered):
    assert client.get(f"/api/runs/{discovered['run_id']}/live").status_code == 204
    assert client.get("/api/runs/run_missing/live").status_code == 404


def test_compact_run_list_drops_bulk_but_keeps_card_fields(client, discovered):
    full = client.get("/api/runs?limit=5").json()
    small = client.get("/api/runs?limit=5&full=false").json()
    assert [r["run_id"] for r in small] == [r["run_id"] for r in full]
    run = next(r for r in small if r["run_id"] == discovered["run_id"])
    assert len(run["events"]) == 1 and "candidates" not in run["results"]
    assert run["artifacts"]["poster"] and run["endpoint_error_m"] == discovered["endpoint_error_m"]
    assert len(json.dumps(small)) < len(json.dumps(full))


def test_run_list_pages_and_filters_by_status(client, discovered):
    first = client.get("/api/runs?limit=1&full=false").json()
    second = client.get("/api/runs?limit=1&offset=1&full=false").json()
    assert first and (not second or first[0]["run_id"] != second[0]["run_id"])
    done = client.get("/api/runs?run_status=succeeded&full=false").json()
    assert done and all(r["status"] == "succeeded" for r in done)
    assert all(r["status"] not in ("succeeded", "failed") for r in client.get("/api/runs?run_status=running").json())


def test_compact_runs_name_their_task_and_filter_by_it(client, discovered):
    small = client.get("/api/runs?full=false").json()
    run = next(r for r in small if r["run_id"] == discovered["run_id"])
    scene = discovered["results"]["task"]["scene_id"]
    assert run["results"]["scene_id"] == scene
    family = scene.rpartition("_s")[0]
    same = client.get(f"/api/runs?full=false&family={family}").json()
    assert discovered["run_id"] in [r["run_id"] for r in same]
    assert all(r["results"].get("scene_id", "").startswith(family) for r in same)
    assert client.get("/api/runs?full=false&scene_id=nope_s1").json() == []
