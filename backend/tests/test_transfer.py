from __future__ import annotations

import json
import time

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models.skill import ExperienceCapsule
from app.services.route_planner import generate_candidates
from app.services.task_scene import generate_task
from app.services.transfer import prior_order


def _wait(client, run_id, timeout=120.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("succeeded", "failed"):
            return run
        time.sleep(0.2)
    raise TimeoutError(run_id)


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def _discover_and_publish(client, seed) -> dict:
    r = client.post("/api/runs/discover", json={"robot_id": "panda_01", "scene_seed": seed})
    run = _wait(client, r.json()["run_id"])
    assert run["status"] == "succeeded"
    return client.post("/api/skills", json={"run_id": run["run_id"]}).json()


@pytest.fixture(scope="module")
def source_42(client):
    return _discover_and_publish(client, 42)


@pytest.fixture(scope="module")
def transfer_42(client, source_42):
    r = client.post("/api/transfers", json={"source_skill_id": source_42["skill_id"], "target_robot_id": "ur5e_01"})
    assert r.status_code == 202
    return _wait(client, r.json()["run_id"])


def test_m3_gate_ur5e_executes_transferred_strategy(client, source_42, transfer_42):
    run = transfer_42
    assert run["status"] == "succeeded", run["events"][-1]
    assert run["source_robot_id"] == "panda_01" and run["target_robot_id"] == "ur5e_01"
    assert run["collision_count"] == 0 and run["endpoint_error_m"] < 0.01
    assert run["results"]["joint_path_dof"] == 6  # UR5e solved its own joints (Panda has 7)
    assert run["results"]["source_skill_id"] == source_42["skill_id"]
    statuses = [e["status"] for e in run["events"]]
    for s in ("retrieving", "profiling", "checking", "proposing", "simulating", "selecting", "executing", "verifying"):
        assert s in statuses
    ranks = [c["prior_rank"] for c in run["candidate_summaries"]]
    assert sorted(ranks) == list(range(1, 11))
    assert client.get(run["artifacts"]["video"]).status_code == 200


def test_adaptation_capsule_lineage(client, source_42, transfer_42):
    r = client.post("/api/skills", json={"run_id": transfer_42["run_id"]})
    assert r.status_code == 201, r.text
    adapted = r.json()
    assert adapted["parent_skill_id"] == source_42["skill_id"]
    assert adapted["lineage"] == [source_42["skill_id"]]
    assert adapted["source_robot_id"] == "ur5e_01"
    assert adapted["provenance"]["transferred_from_robot"] == "panda_01"
    detail = client.get(f"/api/skills/{adapted['skill_id']}").json()
    assert [a["skill_id"] for a in detail["ancestors"]] == [source_42["skill_id"]]
    parent = client.get(f"/api/skills/{source_42['skill_id']}").json()
    assert adapted["skill_id"] in [c["skill_id"] for c in parent["children"]]
    caps = {c["task_type"]: c for c in client.get("/api/robots/ur5e_01").json()["capabilities"]}
    assert caps["obstacle_aware_reach"]["status"] == "verified_in_sim"


def test_transfer_is_reproducible_from_seed(client, source_42, transfer_42):
    r = client.post("/api/transfers", json={"source_skill_id": source_42["skill_id"]})
    again = _wait(client, r.json()["run_id"])
    assert again["results"]["selected"] == transfer_42["results"]["selected"]
    assert again["endpoint_error_m"] == pytest.approx(transfer_42["endpoint_error_m"], abs=1e-9)
    assert again["results"]["q_start"] == transfer_42["results"]["q_start"]


def test_transfer_to_held_out_scene(client, source_42):
    r = client.post("/api/transfers", json={"source_skill_id": source_42["skill_id"], "scene_seed": 3})
    run = _wait(client, r.json()["run_id"])
    assert run["results"]["task"]["scene_id"] == "wall_reach_v1_s3"
    assert run["status"] == "succeeded"
    scene = next(c for c in run["results"]["compatibility"] if c["check"] == "scene")
    assert "new scene" in scene["detail"]


def test_transfer_validation_errors(client, source_42):
    assert client.post("/api/transfers", json={"source_skill_id": "nope"}).status_code == 404
    same = {"source_skill_id": source_42["skill_id"], "target_robot_id": "panda_01"}
    assert client.post("/api/transfers", json=same).status_code == 409
    bogus = {"source_skill_id": source_42["skill_id"], "reasoning_mode": "gpt"}
    assert client.post("/api/transfers", json=bogus).status_code == 422


def _capsule_with(strategy_class: str, clearance: float, outcomes: list[dict]) -> ExperienceCapsule:
    from datetime import UTC, datetime

    from app.models.skill import CapsuleValidation, Placement, StrategySpec

    task = generate_task(1)
    return ExperienceCapsule(
        skill_id="s", status="verified_in_sim", source_robot_id="panda_01", source_model_hash="h",
        goal="g", frame_convention="f", task=task, placement=Placement(translation=(0.5, 0, 0)),
        strategy=StrategySpec(route_class=strategy_class, clearance_m=clearance, description="d"),
        waypoints_task_frame=[task.start, task.target], executed_trace_task_frame=[],
        candidate_outcomes=outcomes, requirements={}, environment={}, provenance={"run_id": "r"},
        validation=CapsuleValidation(success=True, collisions=0, endpoint_error_m=0.001, min_clearance_m=0.02,
                                     simulated_seconds=1, candidates_evaluated=10, candidates_verified=1,
                                     tolerance_m=0.01),
        created_at=datetime.now(UTC),
    )


def test_prior_order_puts_capsule_strategy_first_and_source_failures_last():
    outcomes = [
        {"candidate_id": "far_side@0.12", "outcome": "verified", "cost": 2.0},
        {"candidate_id": "over@0.08", "outcome": "verified", "cost": 2.5},
        {"candidate_id": "direct@0.00", "outcome": "collision", "cost": None},
        {"candidate_id": "over@0.04", "outcome": "insufficient_clearance", "cost": None},
    ]
    ordered = prior_order(generate_candidates(generate_task(1)), _capsule_with("far_side", 0.12, outcomes))
    ids = [c.candidate_id for c, _, _ in ordered]
    assert ids[0] == "far_side@0.12"
    assert ids[1:3] == ["far_side@0.08", "far_side@0.04"]  # same class, nearest clearance first
    assert ids[3] == "over@0.08"  # alternative verified by source
    assert ids.index("over@0.04") < ids.index("direct@0.00")  # clearance failure before collision
    tiers = [t for _, t, _ in ordered]
    assert tiers == sorted(tiers)


def test_capsule_json_never_contains_joint_vectors(source_42):
    text = json.dumps(source_42)
    assert "q_start" not in text and "joint_path" not in text


def test_demo_story_returns_recorded_chain(client, source_42, transfer_42):
    client.post("/api/skills", json={"run_id": transfer_42["run_id"]})  # idempotent enough: 201 or 409
    story = client.get("/api/demo/story").json()
    assert story["complete"] is True
    assert story["target"]["run"]["run_type"] == "transfer" and story["target"]["run"]["status"] == "succeeded"
    assert story["target"]["capsule"]["parent_skill_id"] == story["source"]["capsule"]["skill_id"]
    assert story["source"]["run"]["run_id"] == story["source"]["capsule"]["provenance"]["run_id"]
