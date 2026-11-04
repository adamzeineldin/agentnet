"""Copy this machine's Library (SQLite registry, run files, robot models) into Postgres and the file store.

Usage (from backend/, with DATABASE_URL and the NIMBOTICS_S3_* variables set):
  .venv/bin/python scripts/copy_to_cloud.py [--sqlite app/data/nimbotics.db] [--skip-files]
Safe to re-run: rows already in Postgres are kept, files are overwritten with the same bytes.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import ARTIFACT_DIR, DATABASE_URL, DB_PATH, UPLOAD_DIR  # noqa: E402
from app.services.cloud_copy import copy_database, push_files  # noqa: E402
from app.services.model_store import push_catalog_models  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite", type=Path, default=DB_PATH, help="registry file to copy from")
    parser.add_argument("--skip-files", action="store_true", help="copy the database only")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    log = logging.getLogger("copy_to_cloud")
    if not DATABASE_URL:
        log.error("Set DATABASE_URL to the Postgres database to copy into.")
        return 2
    if not args.sqlite.is_file():
        log.error("No registry file at %s", args.sqlite)
        return 2
    for table, count in copy_database(args.sqlite, DATABASE_URL).items():
        log.info("%-16s %5d rows", table, count)
    if not args.skip_files:
        artifacts, robots = push_files(ARTIFACT_DIR, UPLOAD_DIR)
        log.info("Stored %d run/snapshot files and %d uploaded-robot files", artifacts, robots)
        for result in push_catalog_models():
            log.info("Catalog arm %-12s %4d files%s", result.robot_id, result.files,
                     " (already stored)" if result.skipped else "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
