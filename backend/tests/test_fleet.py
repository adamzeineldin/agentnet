"""Fleet: catalog arms are listed, refused until added, and added with a passport computed from the model."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.robot_catalog import ROBOTS


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def test_catalog_lists_every_arm_and_marks_the_default_fleet(client):
    entries = {e["robot_id"]: e for e in client.get("/api/robots/catalog").json()}
    assert set(entries) == set(ROBOTS)
    assert entries["panda_01"]["in_fleet"] and entries["ur5e_01"]["in_fleet"]
    assert all(e["maker"] and e["model_source"].startswith("MuJoCo Menagerie") for e in entries.values())


def test_arm_outside_the_fleet_cannot_run_until_added(client):
    assert not next(e for e in client.get("/api/robots/catalog").json() if e["robot_id"] == "iiwa14_01")["in_fleet"]
    r = client.post("/api/runs/discover", json={"robot_id": "iiwa14_01", "scene_seed": 1})
    assert r.status_code == 409 and "not in the fleet" in r.json()["detail"]
    assert client.get("/api/robots/iiwa14_01").status_code == 409

    added = client.post("/api/robots/iiwa14_01/enable").json()
    assert added["robot_id"] == "iiwa14_01" and added["dof"] == 7 and added["max_reach_m"] > 0.8
    assert "iiwa14_01" in {r["robot_id"] for r in client.get("/api/robots").json()}
    assert client.get("/api/robots/iiwa14_01").json()["dof"] == 7
    # Adding twice is harmless.
    assert client.post("/api/robots/iiwa14_01/enable").status_code == 200


def test_unknown_arm_cannot_be_added(client):
    assert client.post("/api/robots/nope/enable").status_code == 404
