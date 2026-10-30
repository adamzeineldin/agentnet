"""Recorded real-robot data (DROID): import file, path helpers, replay runs and API."""

from __future__ import annotations

import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services import controller
from app.services.real_data import get_episode, load_datasets
from app.services.real_data.replay import path_deviation, replay_speed, resample_path


def _wait(client, run_id, timeout=180.0):
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


def test_imported_droid_file_carries_provenance_and_real_positions():
    ds = load_datasets()["droid_100"]
    src = ds.source
    assert src.url == "https://huggingface.co/datasets/lerobot/droid_100" and src.license == "MIT"
    assert len(src.revision) == 40 and src.recorded_robot_id == "panda_01" and src.fps == 15.0
    assert len(ds.episodes) == 8 and "first 8" in ds.selection
    for ep in ds.episodes:
        xyz = np.array(ep.ee_xyz)
        assert xyz.shape == (ep.frames, 3) and len(ep.gripper) == ep.frames
        assert xyz[:, 2].min() >= 0.05 and ep.task  # selection rule holds on the stored data
        assert ep.duration_s == pytest.approx(ep.frames / src.fps, abs=1e-3)


def test_resample_keeps_endpoints_and_drops_pauses():
    xyz = np.array([[0, 0, 0], [0, 0, 0], [0.1, 0, 0], [0.1, 0, 0], [0.1, 0.1, 0]], dtype=float)
    out = resample_path(xyz, step=0.02)
    assert np.allclose(out[0], xyz[0]) and np.allclose(out[-1], xyz[-1])
    steps = np.linalg.norm(np.diff(out, axis=0), axis=1)
    assert steps.min() > 0.015 and steps.max() <= 0.02 + 1e-9


def test_path_deviation_and_replay_speed():
    a = np.array([[0, 0, 0], [1, 0, 0]], dtype=float)
    assert path_deviation(a, a) == (0.0, 0.0)
    assert path_deviation(a + [0, 0.01, 0], a)[0] == pytest.approx(0.01)
    q = [np.zeros(6), np.full(6, 0.5), np.full(6, 1.0)]
    assert replay_speed(q, 10.0) == pytest.approx(0.1)  # 1 rad over 10 s, floored at the minimum
    assert replay_speed(q, 0.1) == 1.0  # capped at the normal joint speed limit


def test_api_lists_datasets_without_paths_and_serves_one_episode(client):
    body = client.get("/api/real-data").json()
    assert body[0]["source"]["dataset_id"] == "droid_100"
    assert "ee_xyz" not in body[0]["episodes"][0]
    ep = client.get("/api/real-data/droid_100/21").json()
    assert ep["task"] == "Put the orange rubber duck into the pot" and len(ep["ee_xyz"]) == ep["frames"]
    assert client.get("/api/real-data/droid_100/9999").status_code == 404


@pytest.mark.parametrize("payload, code", [
    ({"dataset_id": "nope", "episode_index": 0}, 404),
    ({"dataset_id": "droid_100", "episode_index": 9999}, 404),
    ({"dataset_id": "droid_100", "episode_index": 21, "robot_id": "nope"}, 404),
    ({"dataset_id": "droid_100", "episode_index": 21, "execute_on": "hardware"}, 422),
])
def test_replay_rejects_bad_requests(client, payload, code):
    assert client.post("/api/real-data/replays", json=payload).status_code == code


def test_replay_on_ursim_without_a_bridge_is_refused(client, monkeypatch):
    monkeypatch.setattr(controller, "URSIM_BRIDGE_URL", None)
    r = client.post("/api/real-data/replays", json={"dataset_id": "droid_100", "episode_index": 21,
                                                   "execute_on": "ursim"})
    assert r.status_code == 409


def test_recording_robot_reproduces_the_real_path_in_simulation(client):
    r = client.post("/api/real-data/replays", json={"dataset_id": "droid_100", "episode_index": 21,
                                                   "robot_id": "panda_01"})
    assert r.status_code == 202 and r.json()["run_type"] == "real_replay"
    run = _wait(client, r.json()["run_id"])
    assert run["status"] == "succeeded", run["events"][-1]
    res = run["results"]
    assert res["real_data"]["revision"] == load_datasets()["droid_100"].source.revision
    assert res["embodiment"] == "same robot as recorded"
    assert res["checks"]["follows_recorded_path"] and res["path_deviation"]["max_m"] <= 0.01
    assert run["collision_count"] == 0 and run["artifacts"]["video"].endswith("execution.mp4")
    assert 2 <= len(res["recorded_path"]) <= 200 and 2 <= len(res["simulated_path"]) <= 200


def test_other_embodiment_records_an_honest_outcome(client):
    run = _wait(client, client.post("/api/real-data/replays", json={
        "dataset_id": "droid_100", "episode_index": 21, "robot_id": "ur5e_01"}).json()["run_id"])
    res = run["results"]
    assert res["embodiment"].startswith("retargeted from Franka Emika Panda")
    assert res["joint_path_dof"] == 6
    ok = res["path_deviation"]["max_m"] <= res["path_deviation"]["tolerance_m"]
    assert (run["status"] == "succeeded") == (ok and run["collision_count"] == 0)
    if run["status"] == "failed":
        assert "follows_recorded_path" in run["events"][-1]["message"]


def test_get_episode_helper():
    assert get_episode("droid_100", 21)[1].frames > 0
    assert get_episode("droid_100", 9999) is None and get_episode("nope", 0) is None


def test_real_replay_can_also_run_on_a_mocked_ursim(client, monkeypatch, adapters):
    from tests.test_controller import FakeUR, mock_client

    robot = FakeUR(adapters["ur5e_01"], adapters["ur5e_01"].home_q())
    monkeypatch.setattr(controller, "URSIM_BRIDGE_URL", "http://ur-bridge.test")
    monkeypatch.setattr(controller, "make_client", lambda: mock_client(robot))
    run = _wait(client, client.post("/api/real-data/replays", json={
        "dataset_id": "droid_100", "episode_index": 22, "robot_id": "ur5e_01", "execute_on": "ursim"}).json()["run_id"])
    assert run["status"] == "succeeded", run["events"][-1]
    ce = run["results"]["controller_execution"]
    assert ce["status"] == "succeeded" and ce["label"] == "URSim controller, not physical"
    # streamed at the replay's paced speed (≈ the recorded duration), not the normal 1 rad/s limit
    streamed_s = ce["commanded_samples"] / ce["stream_hz"]
    assert streamed_s == pytest.approx(run["results"]["real_data"]["recorded_duration_s"], rel=0.05)
