"""Create the configured bucket (local S3 stand-in), or with --check confirm the real one accepts our keys.

Usage (from the repo root, NIMBOTICS_S3_* set in .env): backend/.venv/bin/python backend/scripts/make_bucket.py [--check]
--check writes, lists, reads back and deletes one small object, so it proves the keys can do what Nimbotics needs.
"""

from __future__ import annotations

import argparse
import sys
import tempfile
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import S3_BUCKET  # noqa: E402
from app.services import storage  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="round-trip one object instead of creating the bucket")
    args = parser.parse_args()
    store = storage.get_store()
    if store is None:
        print("No file store configured: set NIMBOTICS_S3_BUCKET and its keys.", file=sys.stderr)
        return 2
    if not args.check:
        store._client.create_bucket(  # noqa: SLF001 - setup script for the local stand-in
            Bucket=S3_BUCKET, CreateBucketConfiguration={"LocationConstraint": "auto"})
        print(f"Bucket {S3_BUCKET} created")
        return 0
    key = f"_check/{uuid.uuid4().hex}.txt"
    with tempfile.TemporaryDirectory() as tmp:
        src, dest = Path(tmp) / "in.txt", Path(tmp) / "out.txt"
        src.write_text("nimbotics")
        store.put(key, src)
        assert key in store.keys("_check/"), "listed keys do not include the new object"
        store.get(key, dest)
        assert dest.read_text() == "nimbotics", "read back different bytes"
    store._client.delete_object(Bucket=S3_BUCKET, Key=key)  # noqa: SLF001
    print(f"Bucket {S3_BUCKET}: write, list, read and delete all work. Link form: {store.url('example.txt')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
