"""One-time move of a Library into the cloud: every registry row, then every run file and uploaded robot.

Rows are copied as they are (same ids, same JSON); a row whose key the target already holds is left alone, so the
copy can be re-run after an interruption. Nothing is deleted from the source.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import insert, inspect, select
from sqlalchemy.dialects import postgresql, sqlite

from app.services import storage
from app.services.registry import Base, make_engine, upgrade_schema

_BATCH = 500


def _insert_ignoring_existing(table, dialect: str):  # noqa: ANN001, ANN202 - SQLAlchemy Table / Insert
    if dialect == "postgresql":
        return postgresql.insert(table).on_conflict_do_nothing()
    if dialect == "sqlite":
        return sqlite.insert(table).on_conflict_do_nothing()
    return insert(table).prefix_with("IGNORE")


def copy_database(source: str | Path, target: str | Path) -> dict[str, int]:
    """Copy every registry table from source to target; returns the rows read per table."""
    src, dst = make_engine(source), make_engine(target)
    Base.metadata.create_all(dst)
    upgrade_schema(dst)  # a target from before newer columns gains them first
    counts: dict[str, int] = {}
    try:
        present = inspect(src)
        with src.connect() as reader, dst.begin() as writer:
            for table in Base.metadata.sorted_tables:
                if not present.has_table(table.name):
                    counts[table.name] = 0
                    continue
                # An older source lacks newer columns (e.g. owner_id, visibility): those take their defaults.
                have = {c["name"] for c in present.get_columns(table.name)}
                columns = [c for c in table.columns if c.name in have]
                rows = [dict(r._mapping) for r in reader.execute(select(*columns))]
                for start in range(0, len(rows), _BATCH):
                    writer.execute(_insert_ignoring_existing(table, dst.dialect.name), rows[start:start + _BATCH])
                counts[table.name] = len(rows)
    finally:
        src.dispose()
        dst.dispose()
    return counts


def push_files(artifact_dir: Path, upload_dir: Path) -> tuple[int, int]:
    """Upload run files and uploaded robots to the configured store; returns (artifact files, robot files)."""
    if storage.get_store() is None:
        raise RuntimeError("No file store configured: set the NIMBOTICS_S3_* variables first")
    return (storage.push_dir(artifact_dir, storage.ARTIFACTS_PREFIX),
            storage.push_dir(upload_dir, storage.UPLOADS_PREFIX))
