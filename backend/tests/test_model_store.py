"""Catalog arm models in the file store: pushed once per Menagerie commit, fetched only when the hash matches."""

from __future__ import annotations

from dataclasses import replace

import boto3
import pytest
from moto import mock_aws

from app.config import MENAGERIE_COMMIT
from app.services import model_store, storage
from app.services.passports import model_dir_hash
from app.services.robot_catalog import ROBOTS

BUCKET = "nimbotics-models"


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        previous = storage.use_store(storage.ObjectStore(client, BUCKET))
        try:
            yield client
        finally:
            storage.use_store(previous)


@pytest.fixture
def arm(tmp_path):
    """A catalog declaration whose (small, fake) model folder lives under tmp_path/src."""
    decl = replace(ROBOTS["lite6_01"], model_root=tmp_path / "src")
    (decl.model_path / "assets").mkdir(parents=True)
    decl.scene_path.write_text("<mujoco/>")
    (decl.model_path / "assets" / "link.stl").write_bytes(b"solid link")
    (decl.model_path / ".git").mkdir()
    (decl.model_path / ".git" / "HEAD").write_text("not a model file")
    return decl


def _on(decl, root):
    return replace(decl, model_root=root)


def test_push_stores_the_folder_and_its_hash_under_the_commit(s3, arm):
    result = model_store.push_catalog_model(arm)
    assert result.files == 2 and not result.skipped
    prefix = f"models/menagerie/{MENAGERIE_COMMIT}/{arm.model_dir}"
    keys = {o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET)["Contents"]}
    assert keys == {f"{prefix}/{arm.scene_xml}", f"{prefix}/assets/link.stl", f"{prefix}.manifest.json"}
    assert model_store.push_catalog_model(arm).skipped  # same hash: nothing uploaded again


def test_a_fresh_machine_fetches_the_same_model(s3, arm, tmp_path):
    model_store.push_catalog_model(arm)
    fresh = _on(arm, tmp_path / "fresh")
    assert model_store.ensure_catalog_model(fresh)
    assert fresh.scene_path.read_text() == "<mujoco/>"
    assert model_dir_hash(fresh.model_path) == model_dir_hash(arm.model_path)
    assert [p.name for p in fresh.model_path.parent.iterdir()] == [arm.model_dir]  # no staging folder left


def test_a_stored_copy_that_does_not_match_is_refused(s3, arm, tmp_path):
    model_store.push_catalog_model(arm)
    key = f"{model_store.catalog_prefix(arm)}/assets/link.stl"
    s3.put_object(Bucket=BUCKET, Key=key, Body=b"tampered")
    fresh = _on(arm, tmp_path / "fresh")
    with pytest.raises(storage.StoreError, match="does not match"):
        model_store.ensure_catalog_model(fresh)
    assert not fresh.model_path.exists() and list(fresh.model_path.parent.iterdir()) == []
    assert model_store.ensure_catalog_models([]) == []


def test_nothing_stored_or_no_store_means_not_available(s3, arm, tmp_path):
    fresh = _on(arm, tmp_path / "fresh")
    assert not model_store.ensure_catalog_model(fresh)  # bucket has no manifest for it
    previous = storage.use_store(None)
    try:
        assert not model_store.ensure_catalog_model(fresh)
        assert model_store.ensure_catalog_model(arm)  # already on disk: nothing to fetch
    finally:
        storage.use_store(previous)
