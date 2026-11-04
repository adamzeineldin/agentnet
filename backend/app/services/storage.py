"""File store for the cloud Library: run files, robot snapshots and uploaded robot models.

Without NIMBOTICS_S3_* settings (local dev, tests) files live only on disk under ARTIFACT_DIR and UPLOAD_DIR and
every function here does nothing. With a bucket (Cloudflare R2 or any S3-compatible store) the bucket is the copy
that lasts and the disk is a cache:
  - run files are pushed in the background once a run ends; /artifacts serves the disk copy while it exists and
    otherwise redirects to the bucket, so the "/artifacts/..." links stored on runs keep working on any machine;
  - an uploaded robot is pushed before it is recorded, and pulled back at startup when the disk lost it.
Keys mirror the disk layout: "artifacts/runs/<run_id>/clip.mp4", "uploads/<robot_id>/nimbotics_scene.xml".
"""

from __future__ import annotations

import logging
import mimetypes
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PurePosixPath

from app.config import (
    ARTIFACT_DIR, S3_ACCESS_KEY_ID, S3_BUCKET, S3_ENDPOINT, S3_PUBLIC_URL, S3_SECRET_ACCESS_KEY, UPLOAD_DIR,
)

log = logging.getLogger(__name__)

ARTIFACTS_PREFIX = "artifacts"
UPLOADS_PREFIX = "uploads"
SIGNED_URL_SECONDS = 3600
_PUSH_THREADS = 2


class StoreError(RuntimeError):
    """The file store could not be reached or refused a request."""


def safe_key(*parts: str) -> str:
    """Join key parts; refuses absolute paths and "..", so a key can never leave its prefix."""
    path = PurePosixPath(*(p.replace("\\", "/") for p in parts))
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError(f"Unsafe file store key: {'/'.join(parts)!r}")
    return path.as_posix()


class ObjectStore:
    """One S3-compatible bucket. Every network failure surfaces as StoreError."""

    def __init__(self, client: object, bucket: str, public_url: str | None = None) -> None:
        self._client = client
        self._bucket = bucket
        self._public_url = public_url

    def put(self, key: str, path: Path) -> None:
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        try:
            self._client.upload_file(str(path), self._bucket, key, ExtraArgs={"ContentType": content_type})
        except Exception as exc:  # noqa: BLE001 - boto raises many types; callers handle one
            raise StoreError(f"Could not store {key}: {exc}") from exc

    def get(self, key: str, dest: Path) -> None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            self._client.download_file(self._bucket, key, str(dest))
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Could not fetch {key}: {exc}") from exc

    def keys(self, prefix: str) -> list[str]:
        try:
            pages = self._client.get_paginator("list_objects_v2").paginate(Bucket=self._bucket, Prefix=prefix)
            return [obj["Key"] for page in pages for obj in page.get("Contents", [])]
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Could not list {prefix}: {exc}") from exc

    def url(self, key: str, signed: bool = False) -> str:
        """A link to the object: the public bucket address, or a signed link (always, when signed=True)."""
        if self._public_url and not signed:
            return f"{self._public_url}/{key}"
        try:
            return self._client.generate_presigned_url(
                "get_object", Params={"Bucket": self._bucket, "Key": key}, ExpiresIn=SIGNED_URL_SECONDS)
        except Exception as exc:  # noqa: BLE001
            raise StoreError(f"Could not sign {key}: {exc}") from exc


def _from_config() -> ObjectStore | None:
    if not S3_BUCKET:
        return None
    if not (S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY):
        raise RuntimeError("NIMBOTICS_S3_BUCKET is set but the access key id or secret is missing")
    import boto3  # only the cloud configuration needs it
    from botocore.config import Config

    client = boto3.client(
        "s3", endpoint_url=S3_ENDPOINT, aws_access_key_id=S3_ACCESS_KEY_ID,
        aws_secret_access_key=S3_SECRET_ACCESS_KEY, region_name="auto",
        # R2 and MinIO: path-style keys, and checksums only where S3 requires them (boto3 >= 1.36 adds them always).
        config=Config(s3={"addressing_style": "path"}, request_checksum_calculation="when_required",
                      response_checksum_validation="when_required"),
    )
    return ObjectStore(client, S3_BUCKET, S3_PUBLIC_URL)


_store: ObjectStore | None = _from_config()
_pusher = ThreadPoolExecutor(max_workers=_PUSH_THREADS, thread_name_prefix="store-push")


def get_store() -> ObjectStore | None:
    return _store


def use_store(store: ObjectStore | None) -> ObjectStore | None:
    """Swap the active store (tests and scripts); returns the previous one."""
    global _store
    previous, _store = _store, store
    return previous


# ---------------------------------------------------------------- folders
def push_dir(local: Path, prefix: str) -> int:
    """Upload every file under local to prefix/<relative path>; returns the count. Raises StoreError."""
    store = get_store()
    if store is None or not local.is_dir():
        return 0
    files = sorted(p for p in local.rglob("*") if p.is_file())
    for path in files:
        store.put(safe_key(prefix, path.relative_to(local).as_posix()), path)
    return len(files)


def pull_dir(prefix: str, local: Path) -> int:
    """Download every key under prefix/ into local; returns the count (0 when nothing is stored)."""
    store = get_store()
    if store is None:
        return 0
    keys = store.keys(prefix.rstrip("/") + "/")
    for key in keys:
        relative = safe_key(key[len(prefix):].lstrip("/"))
        store.get(key, local / relative)
    return len(keys)


# ---------------------------------------------------------------- artifacts
def artifact_url(relative: str, private: bool = False) -> str | None:
    """Bucket link for a file under /artifacts (signed when private), or None without a store."""
    store = get_store()
    return store.url(safe_key(ARTIFACTS_PREFIX, relative), signed=private) if store else None


def push_artifact_later(path: Path) -> None:
    """Queue a file or folder under ARTIFACT_DIR for upload; failures are logged, the disk copy stays."""
    if get_store() is not None and path.exists():
        _pusher.submit(_push_artifact, path)


def _push_artifact(path: Path) -> None:
    relative = path.relative_to(ARTIFACT_DIR).as_posix()
    try:
        if path.is_dir():
            count = push_dir(path, safe_key(ARTIFACTS_PREFIX, relative))
        else:
            get_store().put(safe_key(ARTIFACTS_PREFIX, relative), path)
            count = 1
        log.info("Stored %d file(s) from artifacts/%s", count, relative)
    except (StoreError, ValueError):
        log.exception("Could not store artifacts/%s; it is served from this machine's disk only", relative)


def push_run_files_later(run_id: str) -> None:
    push_artifact_later(ARTIFACT_DIR / "runs" / run_id)


def wait_for_pushes() -> None:
    """Block until queued uploads finish (shutdown, scripts, tests); later pushes still work."""
    global _pusher
    previous, _pusher = _pusher, ThreadPoolExecutor(max_workers=_PUSH_THREADS, thread_name_prefix="store-push")
    previous.shutdown(wait=True)


# ---------------------------------------------------------------- uploaded robots
def push_upload(robot_id: str) -> int:
    return push_dir(UPLOAD_DIR / robot_id, safe_key(UPLOADS_PREFIX, robot_id))


def pull_upload(robot_id: str) -> int:
    return pull_dir(safe_key(UPLOADS_PREFIX, robot_id), UPLOAD_DIR / robot_id)
