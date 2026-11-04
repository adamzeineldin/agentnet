"""Cloud Library: Postgres URLs, the S3 file store (moto), /artifacts fallback, uploads that outlive the disk,
and the one-time copy. Postgres itself is exercised when NIMBOTICS_TEST_DATABASE_URL points at a scratch database.
"""

from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app.config import ARTIFACT_DIR, UPLOAD_DIR
from app.main import create_app
from app.services import storage, uploads
from app.services.cloud_copy import copy_database
from app.services.registry import Registry, database_url
from app.services.robot_catalog import ROBOTS, unregister
from tests import factories

BUCKET = "nimbotics-test"
EXAMPLE = Path(__file__).resolve().parents[2] / "frontend" / "public" / "examples" / "nimbotics-capsule-arm.xml"
PG_URL = os.environ.get("NIMBOTICS_TEST_DATABASE_URL")


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        previous = storage.use_store(storage.ObjectStore(client, BUCKET))
        try:
            yield client
        finally:
            storage.wait_for_pushes()
            storage.use_store(previous)


def _keys(client, prefix: str = "") -> set[str]:
    return {o["Key"] for o in client.list_objects_v2(Bucket=BUCKET, Prefix=prefix).get("Contents", [])}


# ---------------------------------------------------------------- database URLs
@pytest.mark.parametrize("given, expected", [
    ("postgres://u:p@h/db?sslmode=require", "postgresql+psycopg://u:p@h/db?sslmode=require"),
    ("postgresql://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
    ("postgresql+psycopg://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
])
def test_postgres_urls_use_psycopg(given, expected):
    assert database_url(given) == expected


def test_sqlite_path_still_works(tmp_path):
    assert database_url(tmp_path / "r.db") == f"sqlite:///{tmp_path / 'r.db'}"
    reg = Registry(tmp_path / "nested" / "r.db")
    assert reg.list_runs() == []


# ---------------------------------------------------------------- the store
@pytest.mark.parametrize("bad", ["../x", "/etc/passwd", "a/../../b"])
def test_keys_cannot_leave_their_prefix(bad):
    with pytest.raises(ValueError):
        storage.safe_key("uploads", bad)


def test_without_a_store_everything_stays_local(tmp_path):
    previous = storage.use_store(None)
    try:
        (tmp_path / "f.txt").write_text("x")
        assert storage.push_dir(tmp_path, "artifacts") == 0
        assert storage.pull_dir("uploads/x", tmp_path / "out") == 0
        assert storage.artifact_url("runs/r/clip.mp4") is None
    finally:
        storage.use_store(previous)


def test_folders_round_trip_through_the_store(s3, tmp_path):
    src = tmp_path / "src"
    (src / "meshes").mkdir(parents=True)
    (src / "robot.xml").write_text("<mujoco/>")
    (src / "meshes" / "link.stl").write_bytes(b"solid")
    assert storage.push_dir(src, "uploads/up_arm") == 2
    assert _keys(s3) == {"uploads/up_arm/robot.xml", "uploads/up_arm/meshes/link.stl"}
    dest = tmp_path / "dest"
    assert storage.pull_dir("uploads/up_arm", dest) == 2
    assert (dest / "meshes" / "link.stl").read_bytes() == b"solid"
    # The prefix match stops at the folder: "up_arm" never pulls "up_arm2".
    assert storage.pull_dir("uploads/up_ar", tmp_path / "none") == 0


def test_videos_are_stored_with_their_content_type(s3, tmp_path):
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"\x00\x00")
    storage.get_store().put("artifacts/runs/r1/clip.mp4", clip)
    assert s3.head_object(Bucket=BUCKET, Key="artifacts/runs/r1/clip.mp4")["ContentType"] == "video/mp4"


def test_links_are_public_or_signed(s3):
    public = storage.ObjectStore(s3, BUCKET, "https://files.example.net")
    assert public.url("artifacts/runs/r/a.png") == "https://files.example.net/artifacts/runs/r/a.png"
    signed = storage.ObjectStore(s3, BUCKET).url("artifacts/runs/r/a.png")
    assert "artifacts/runs/r/a.png" in signed and "Signature" in signed


def test_store_failures_raise_store_error(s3, tmp_path):
    broken = storage.ObjectStore(s3, "no-such-bucket")
    with pytest.raises(storage.StoreError):
        broken.keys("uploads/")
    with pytest.raises(storage.StoreError):
        broken.get("uploads/x", tmp_path / "x")


def test_run_files_are_pushed_after_a_run(s3):
    run_dir = ARTIFACT_DIR / "runs" / "run_cloud_push"
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "clip.mp4").write_bytes(b"mp4")
    storage.push_run_files_later("run_cloud_push")
    storage.wait_for_pushes()
    assert _keys(s3, "artifacts/runs/run_cloud_push/") == {"artifacts/runs/run_cloud_push/clip.mp4"}


# ---------------------------------------------------------------- /artifacts
@pytest.fixture(scope="module")
def client(tmp_path_factory):
    # Own registry: the robots uploaded here must not reload into other modules' apps from the shared test DB.
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.main.DATABASE", tmp_path_factory.mktemp("cloud") / "cloud.db")
        with TestClient(create_app(), follow_redirects=False) as c:
            yield c
    for rid in [r for r, d in ROBOTS.items() if d.source == "upload" and r.startswith("up_cloud_arm")]:
        unregister(rid)


def test_artifacts_on_disk_are_served_directly(client, s3):
    path = ARTIFACT_DIR / "runs" / "run_local" / "a.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("here")
    r = client.get("/artifacts/runs/run_local/a.txt")
    assert r.status_code == 200 and r.text == "here"


def test_artifacts_missing_from_disk_redirect_to_the_store(client, s3):
    storage.use_store(storage.ObjectStore(s3, BUCKET, "https://files.example.net"))
    r = client.get("/artifacts/runs/run_elsewhere/clip.mp4")
    assert r.status_code == 307
    assert r.headers["location"] == "https://files.example.net/artifacts/runs/run_elsewhere/clip.mp4"


def test_artifacts_missing_without_a_store_are_404(client):
    previous = storage.use_store(None)
    try:
        assert client.get("/artifacts/runs/nope/clip.mp4").status_code == 404
    finally:
        storage.use_store(previous)


# ---------------------------------------------------------------- uploaded robots
def test_uploaded_robot_survives_losing_the_disk(client, s3):
    name = f"Cloud arm {uuid.uuid4().hex[:4]}"
    r = client.post("/api/robots/upload", params={"name": name, "filename": EXAMPLE.name},
                    content=EXAMPLE.read_bytes())
    assert r.status_code == 201, r.text
    rid = r.json()["robot"]["robot_id"]
    assert f"uploads/{rid}/nimbotics_scene.xml" in _keys(s3, f"uploads/{rid}/")

    shutil.rmtree(UPLOAD_DIR / rid)  # a new machine: the database knows the robot, the disk does not
    unregister(rid)
    stored = [t for t in client.app.state.registry.uploaded_robots() if rid in t]
    assert uploads.load_uploaded(stored) == []
    assert rid in ROBOTS and ROBOTS[rid].scene_path.is_file()
    assert ROBOTS[rid].model_root == UPLOAD_DIR


def test_upload_is_refused_when_the_store_is_down(client, s3):
    storage.use_store(storage.ObjectStore(s3, "no-such-bucket"))
    r = client.post("/api/robots/upload", params={"name": "Cloud arm down", "filename": EXAMPLE.name},
                    content=EXAMPLE.read_bytes())
    assert r.status_code == 503 and "cloud storage" in r.json()["detail"]
    assert not any(rid.startswith("up_cloud_arm_down") for rid in ROBOTS)
    assert not any("Cloud arm down" in t for t in client.app.state.registry.uploaded_robots())


# ---------------------------------------------------------------- the one-time copy
def _filled_registry(path: Path) -> Registry:
    reg = Registry(path)
    reg.save_skill(factories.capsule("skill_a"))
    reg.save_skill(factories.capsule("skill_b", robot="ur5e_01"))
    reg.add_to_fleet("ur10e_01", "user_1")
    return reg


def test_copy_moves_every_row_and_can_be_rerun(tmp_path):
    _filled_registry(tmp_path / "src.db")
    target = tmp_path / "dst.db"
    counts = copy_database(tmp_path / "src.db", target)
    assert counts["skills"] == 2 and counts["fleet"] == 1
    assert copy_database(tmp_path / "src.db", target)["skills"] == 2  # second pass keeps, never duplicates
    copied = Registry(target)
    assert {s.skill_id for s in copied.list_skills()} == {"skill_a", "skill_b"}
    assert copied.added_robot_ids() == {"ur10e_01"}


def test_copy_reads_a_source_from_before_the_newer_columns(tmp_path):
    import sqlite3

    src = tmp_path / "old.db"
    with sqlite3.connect(src) as db:
        db.execute("CREATE TABLE fleet (robot_id VARCHAR PRIMARY KEY, added_by VARCHAR, added_at DATETIME)")
        db.execute("CREATE TABLE runs (run_id VARCHAR PRIMARY KEY, run_type VARCHAR, status VARCHAR, payload JSON, "
                   "created_at DATETIME)")
        db.execute("INSERT INTO fleet VALUES ('ur10e_01', NULL, '2026-10-01 00:00:00.000000')")
    counts = copy_database(src, tmp_path / "new.db")
    assert counts["fleet"] == 1 and counts["runs"] == 0 and counts["skills"] == 0
    assert Registry(tmp_path / "new.db").added_robot_ids() == {"ur10e_01"}


def test_copy_into_a_target_from_before_the_newer_columns(tmp_path):
    import sqlite3

    _filled_registry(tmp_path / "src.db")
    old_target = tmp_path / "old_target.db"
    with sqlite3.connect(old_target) as db:  # what a phase-1 Postgres looked like: no owner/visibility yet
        db.execute("CREATE TABLE skills (skill_id VARCHAR PRIMARY KEY, source_robot_id VARCHAR, "
                   "parent_skill_id VARCHAR, run_id VARCHAR UNIQUE, payload JSON, created_at DATETIME)")
    assert copy_database(tmp_path / "src.db", old_target)["skills"] == 2
    assert {s.visibility for s in Registry(old_target).list_skills()} == {"public"}


@pytest.mark.skipif(not PG_URL, reason="set NIMBOTICS_TEST_DATABASE_URL to a scratch Postgres database")
def test_registry_on_postgres(tmp_path):
    from sqlalchemy import text

    reg = Registry(PG_URL)
    # The test empties tables, so it only runs on a database named *_test, never a real Library.
    assert reg.engine.url.database.endswith("_test"), "NIMBOTICS_TEST_DATABASE_URL must name a *_test database"
    with reg.engine.begin() as conn:  # scratch database: start empty
        for table in ("skills", "fleet"):
            conn.execute(text(f"DELETE FROM {table}"))
    _filled_registry(tmp_path / "src.db")
    counts = copy_database(tmp_path / "src.db", PG_URL)
    assert counts["skills"] == 2
    assert {s.skill_id for s in reg.list_skills(source_robot_id="panda_01")} == {"skill_a"}
    assert reg.get_skill("skill_b").source_robot_id == "ur5e_01"
    assert reg.added_robot_ids() == {"ur10e_01"}
    reg.engine.dispose()
