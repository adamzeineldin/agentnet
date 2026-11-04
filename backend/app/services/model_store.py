"""Catalog arm models (MuJoCo Menagerie) in the file store, so every robot model lives in the cloud Library.

Each arm is stored under its pinned Menagerie commit, "models/menagerie/<commit>/<model_dir>/...", with a manifest
"models/menagerie/<commit>/<model_dir>.manifest.json" holding the model folder's hash (passports.model_dir_hash).
A machine without the files (a fresh server, a slimmer image) fetches them into a temporary folder, checks the hash
against the manifest and only then moves them into MENAGERIE_DIR; a mismatch is refused, never loaded. Passports
keep their provenance: the same commit and the same model hash as a local checkout.
Without a store everything stays as before: models come from scripts/fetch_models.sh.
"""

from __future__ import annotations

import json
import logging
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.config import MENAGERIE_COMMIT
from app.services import storage
from app.services.passports import model_dir_hash
from app.services.robot_catalog import ROBOTS, RobotDecl

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class PushResult:
    robot_id: str
    files: int
    skipped: bool


def catalog_prefix(decl: RobotDecl) -> str:
    return storage.safe_key("models", "menagerie", MENAGERIE_COMMIT, decl.model_dir)


def _manifest_key(decl: RobotDecl) -> str:
    return catalog_prefix(decl) + ".manifest.json"


def _local_files(folder: Path) -> list[Path]:
    return sorted(p for p in folder.rglob("*") if p.is_file() and ".git" not in p.parts)


def _stored_manifest(store: storage.ObjectStore, decl: RobotDecl) -> dict | None:
    raw = store.get_bytes(_manifest_key(decl))
    return json.loads(raw) if raw else None


def push_catalog_model(decl: RobotDecl) -> PushResult:
    """Upload one catalog arm's model folder and its manifest; skipped when the bucket already holds this hash."""
    store = storage.get_store()
    if store is None:
        raise RuntimeError("No file store configured: set the NIMBOTICS_S3_* variables first")
    if decl.source != "menagerie" or not decl.scene_path.is_file():
        raise ValueError(f"{decl.robot_id}: no local catalog model at {decl.model_path}")
    digest = model_dir_hash(decl.model_path)
    stored = _stored_manifest(store, decl)
    if stored and stored.get("model_dir_hash") == digest:
        return PushResult(decl.robot_id, int(stored.get("files", 0)), skipped=True)
    files = _local_files(decl.model_path)
    for path in files:
        store.put(storage.safe_key(catalog_prefix(decl), path.relative_to(decl.model_path).as_posix()), path)
    manifest = {"robot_id": decl.robot_id, "model_dir": decl.model_dir, "menagerie_commit": MENAGERIE_COMMIT,
                "model_dir_hash": digest, "files": len(files)}
    # The manifest goes last: a reader never sees a hash for a folder that is not fully uploaded.
    store.put_bytes(_manifest_key(decl), json.dumps(manifest, indent=2).encode())
    return PushResult(decl.robot_id, len(files), skipped=False)


def push_catalog_models() -> list[PushResult]:
    """Every catalog arm whose model is on this disk."""
    return [push_catalog_model(d) for d in ROBOTS.values() if d.source == "menagerie" and d.scene_path.is_file()]


def ensure_catalog_model(decl: RobotDecl) -> bool:
    """True when the arm's model is on this disk, fetching and checking it from the store first if needed.

    Raises StoreError when the stored copy is incomplete or does not match its manifest.
    """
    if decl.source != "menagerie" or decl.scene_path.is_file():
        return decl.scene_path.is_file()
    store = storage.get_store()
    manifest = _stored_manifest(store, decl) if store else None
    if manifest is None:
        return False
    decl.model_path.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{decl.model_dir}-", dir=decl.model_path.parent))
    try:
        count = storage.pull_dir(catalog_prefix(decl), staging)
        digest = model_dir_hash(staging)
        if count != manifest["files"] or digest != manifest["model_dir_hash"]:
            raise storage.StoreError(f"{decl.robot_id}: stored model does not match its manifest "
                                     f"({count} of {manifest['files']} files, hash {digest[:12]})")
        if decl.model_path.exists():
            shutil.rmtree(decl.model_path)  # an incomplete folder without its scene file
        staging.rename(decl.model_path)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    log.info("Fetched %s from the file store (%d files, Menagerie %s)", decl.robot_id, count, MENAGERIE_COMMIT[:7])
    return True


def ensure_catalog_models(robot_ids: list[str]) -> list[str]:
    """Fetch every listed catalog arm the disk lacks; returns the ids still missing (logged, never fatal here)."""
    missing = []
    for robot_id in robot_ids:
        decl = ROBOTS[robot_id]
        try:
            if not ensure_catalog_model(decl):
                missing.append(robot_id)
        except (storage.StoreError, ValueError):
            log.exception("Could not fetch %s from the file store", robot_id)
            missing.append(robot_id)
    return missing
