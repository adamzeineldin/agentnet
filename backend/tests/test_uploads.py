"""Robot uploads: the example arm joins the fleet and can learn; unsafe or unusable uploads are refused."""

from __future__ import annotations

import io
import time
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services import uploads
from app.services.robot_catalog import ROBOTS, unregister

EXAMPLE = Path(__file__).resolve().parents[2] / "frontend" / "public" / "examples" / "nimbotics-capsule-arm.xml"
URDF = """<robot name="three_link">
  <link name="base"><collision><geometry><cylinder radius="0.06" length="0.05"/></geometry></collision>
    <inertial><mass value="1"/><inertia ixx="0.01" iyy="0.01" izz="0.01" ixy="0" ixz="0" iyz="0"/></inertial></link>
  <link name="l1"><collision><origin xyz="0 0 0.15"/><geometry><cylinder radius="0.035" length="0.3"/></geometry></collision>
    <inertial><origin xyz="0 0 0.15"/><mass value="1"/><inertia ixx="0.01" iyy="0.01" izz="0.01" ixy="0" ixz="0" iyz="0"/></inertial></link>
  <link name="l2"><collision><origin xyz="0 0 0.15"/><geometry><cylinder radius="0.03" length="0.3"/></geometry></collision>
    <inertial><origin xyz="0 0 0.15"/><mass value="0.8"/><inertia ixx="0.01" iyy="0.01" izz="0.01" ixy="0" ixz="0" iyz="0"/></inertial></link>
  <link name="l3"><collision><origin xyz="0 0 0.1"/><geometry><cylinder radius="0.025" length="0.2"/></geometry></collision>
    <inertial><origin xyz="0 0 0.1"/><mass value="0.5"/><inertia ixx="0.005" iyy="0.005" izz="0.005" ixy="0" ixz="0" iyz="0"/></inertial></link>
  <joint name="j1" type="revolute"><parent link="base"/><child link="l1"/><origin xyz="0 0 0.05"/><axis xyz="0 0 1"/>
    <limit lower="-3" upper="3" effort="50" velocity="2"/></joint>
  <joint name="j2" type="revolute"><parent link="l1"/><child link="l2"/><origin xyz="0 0 0.3"/><axis xyz="0 1 0"/>
    <limit lower="-2" upper="2" effort="50" velocity="2"/></joint>
  <joint name="j3" type="revolute"><parent link="l2"/><child link="l3"/><origin xyz="0 0 0.3"/><axis xyz="0 1 0"/>
    <limit lower="-2.5" upper="2.5" effort="50" velocity="2"/></joint>
</robot>
"""


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c
    for rid in [r for r, d in ROBOTS.items() if d.source == "upload"]:
        unregister(rid)


def _upload(client, name: str, filename: str, data: bytes, **params):
    return client.post("/api/robots/upload", params={"name": name, "filename": filename, **params}, content=data)


def _zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def _wait(client, run_id, timeout=120.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("succeeded", "failed"):
            return run
        time.sleep(0.2)
    raise TimeoutError(run_id)


def test_example_arm_joins_the_fleet_and_learns_a_task(client):
    r = _upload(client, "Capsule arm", EXAMPLE.name, EXAMPLE.read_bytes())
    assert r.status_code == 201, r.text
    body = r.json()
    rid = body["robot"]["robot_id"]
    assert body["robot"]["dof"] == 6 and body["robot"]["model_source"].startswith("uploaded by")
    assert any("position servos" in n for n in body["notes"]) and any("Home pose" in n for n in body["notes"])
    assert rid in [x["robot_id"] for x in client.get("/api/robots").json()]
    passport = client.get(f"/api/robots/{rid}").json()
    assert passport["end_effector"]["parent_body"] == "flange"

    run = client.post("/api/runs/discover", json={"robot_id": rid, "scene_seed": 42, "task_family": "fence_v1"}).json()
    done = _wait(client, run["run_id"])
    assert done["status"] in ("succeeded", "failed")  # whatever physics says; a failure is a real result
    assert done["results"]["task"]["scene_id"] == "fence_v1_s42"


def test_same_model_twice_is_refused(client):
    r = _upload(client, "Capsule arm", EXAMPLE.name, EXAMPLE.read_bytes())
    assert r.status_code == 422 and "already stored" in r.json()["detail"]


def test_urdf_upload_gets_servos_and_a_floor(client):
    r = _upload(client, "Three link", "arm.urdf", URDF.encode())
    assert r.status_code == 201, r.text
    assert r.json()["robot"]["dof"] == 3
    assert any("floor" in n for n in r.json()["notes"])


@pytest.mark.parametrize(("files", "message"), [
    ({"../evil.xml": b"<mujoco/>"}, "unsafe path"),
    ({"arm.xml": b'<!DOCTYPE x [<!ENTITY a "b">]><mujoco/>'}, "DOCTYPE"),
    ({"arm.xml": b'<mujoco><asset><mesh file="/etc/passwd"/></asset></mujoco>'}, "outside the upload"),
    ({"arm.xml": b'<mujoco><asset><mesh file="../../x.stl"/></asset></mujoco>'}, "outside the upload"),
    ({"arm.xml": b"<mujoco><extension><plugin plugin='x'/></extension></mujoco>"}, "plugins"),
    ({"readme.txt": b"hello"}, "No .xml or .urdf"),
])
def test_unsafe_or_empty_zips_are_refused(client, files, message):
    r = _upload(client, "Bad", "arm.zip", _zip(files))
    assert r.status_code == 422 and message in r.json()["detail"], r.text


def test_models_without_an_arm_are_refused_as_arms(client):
    free = b"<mujoco><worldbody><body><freejoint/><geom size='0.1'/></body></worldbody></mujoco>"
    detail = _upload(client, "Free", "f.xml", free).json()["detail"]
    assert "No arm of 3 to 10 joints" in detail and "model only" in detail
    one = (b"<mujoco><worldbody><body><joint name='a' axis='0 0 1'/><geom size='0.05' fromto='0 0 0 0 0 0.3' "
           b"type='capsule'/></body></worldbody></mujoco>")
    assert "the longest limb has 1" in _upload(client, "One", "o.xml", one).json()["detail"]


def test_wrong_file_type_and_bad_name_are_refused(client):
    assert _upload(client, "x", "arm.exe", b"MZ").status_code == 422
    assert _upload(client, "<script>", "arm.xml", b"<mujoco/>").status_code == 422


def test_uploads_reload_after_restart(client):
    stored = client.app.state.registry.uploaded_robots()
    assert stored
    decl = uploads.decl_from_json(stored[0])
    assert decl.source == "upload" and decl.scene_path.exists()
    unregister(decl.robot_id)
    assert uploads.load_uploaded(stored) == []
    assert decl.robot_id in ROBOTS
