"""Registry (SQLAlchemy 2.x; SQLite file or Postgres) for passports, runs, skills, library reports, fleet, users and blog posts.

Rows store validated Pydantic JSON; the repository functions return Pydantic
objects so callers never touch ORM state.
"""

from __future__ import annotations

from collections.abc import Collection
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import JSON, DateTime, String, Text, create_engine, inspect, or_, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.models.blog import BlogPost
from app.models.library import LibraryReport
from app.models.robot import RobotPassport
from app.models.run import RunEvent, RunRecord
from app.models.sharing import Visibility
from app.models.skill import ExperienceCapsule
from app.models.user import Credential, User


class Base(DeclarativeBase):
    pass


class PassportRow(Base):
    __tablename__ = "passports"
    robot_id: Mapped[str] = mapped_column(String, primary_key=True)
    model_hash: Mapped[str] = mapped_column(String)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def run_scene_id(run: RunRecord) -> str | None:
    """The layout a run worked on ("shelf_v1_s3"), when it got far enough to build one."""
    task = run.results.get("task")
    return task.get("scene_id") if isinstance(task, dict) else None


def _run_matches(run: RunRecord, robot_id: str | None, family: str | None, scene_id: str | None) -> bool:
    if robot_id and robot_id not in (run.source_robot_id, run.target_robot_id):
        return False
    scene = run_scene_id(run)
    if scene_id and scene != scene_id:
        return False
    return not family or (scene is not None and scene.rpartition("_s")[0] == family)


class RunRow(Base):
    __tablename__ = "runs"
    run_id: Mapped[str] = mapped_column(String, primary_key=True)
    run_type: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    owner_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    visibility: Mapped[str] = mapped_column(String, index=True, default="public")


class SkillRow(Base):
    __tablename__ = "skills"
    skill_id: Mapped[str] = mapped_column(String, primary_key=True)
    source_robot_id: Mapped[str] = mapped_column(String, index=True)
    parent_skill_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    run_id: Mapped[str] = mapped_column(String, unique=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    owner_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    visibility: Mapped[str] = mapped_column(String, index=True, default="public")


class LibraryReportRow(Base):
    __tablename__ = "library_reports"
    report_id: Mapped[str] = mapped_column(String, primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class FleetRow(Base):
    """A catalog arm added to the fleet after startup (default-fleet arms need no row)."""

    __tablename__ = "fleet"
    robot_id: Mapped[str] = mapped_column(String, primary_key=True)
    added_by: Mapped[str | None] = mapped_column(String, nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UploadedRobotRow(Base):
    """An arm a user uploaded: its declared facts (RobotDecl as JSON); the model files live under UPLOAD_DIR."""

    __tablename__ = "uploaded_robots"
    robot_id: Mapped[str] = mapped_column(String, primary_key=True)
    decl: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    owner_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    visibility: Mapped[str] = mapped_column(String, index=True, default="public")


class DesignedTaskRow(Base):
    """A task type designed from a description (TaskDesign as JSON). goal_key: normalized goal + provider."""

    __tablename__ = "designed_tasks"
    family: Mapped[str] = mapped_column(String, primary_key=True)
    goal_key: Mapped[str] = mapped_column(String, index=True)
    design: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UserRow(Base):
    __tablename__ = "users"
    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CredentialRow(Base):
    """Email + password sign-in: one row per normalised email, pointing at its user."""

    __tablename__ = "credentials"
    email: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class BlogPostRow(Base):
    __tablename__ = "blog_posts"
    post_id: Mapped[str] = mapped_column(String, primary_key=True)
    author_id: Mapped[str] = mapped_column(String, index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


def database_url(database: str | Path) -> str:
    """SQLAlchemy URL for a SQLite path or a Postgres URL (postgres:// and postgresql:// use psycopg 3)."""
    if isinstance(database, Path):
        return f"sqlite:///{database}"
    for scheme in ("postgres://", "postgresql://"):
        if database.startswith(scheme):
            return "postgresql+psycopg://" + database[len(scheme):]
    return database


# Columns added after a table first shipped: create_all never alters existing tables, so they are added here.
# Rows that predate them read as public with no owner (models/sharing.py).
_ADDED_COLUMNS = {
    table: {"owner_id": "VARCHAR", "visibility": "VARCHAR NOT NULL DEFAULT 'public'"}
    for table in ("runs", "skills", "uploaded_robots")
}


def _upgrade_schema(engine: Engine) -> None:
    existing = inspect(engine)
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            have = {c["name"] for c in existing.get_columns(table)}
            for name, ddl in columns.items():
                if name not in have:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_{name} ON {table} ({name})"))


class _Everyone:
    """Marker for internal reads (worker, scripts): no visibility filter."""


EVERYONE = _Everyone()
# Who is reading: a user id, None for a signed-out visitor (public only), or EVERYONE for internal code.
Viewer = str | None | _Everyone


def _visible(row_cls, viewer: Viewer):  # noqa: ANN001, ANN202 - an ORM class / SQL condition
    if isinstance(viewer, _Everyone):
        return None
    if viewer is None:
        return row_cls.visibility == "public"
    return or_(row_cls.visibility == "public", row_cls.owner_id == viewer)


def _where_visible(stmt, row_cls, viewer: Viewer):  # noqa: ANN001, ANN202
    condition = _visible(row_cls, viewer)
    return stmt if condition is None else stmt.where(condition)


def _row_visible(row, viewer: Viewer) -> bool:  # noqa: ANN001 - RunRow / SkillRow / UploadedRobotRow
    if isinstance(viewer, _Everyone):
        return True
    return row.visibility == "public" or (row.owner_id is not None and row.owner_id == viewer)


def make_engine(database: str | Path) -> Engine:
    if isinstance(database, Path):
        database.parent.mkdir(parents=True, exist_ok=True)
        return create_engine(database_url(database), connect_args={"check_same_thread": False})
    # pool_pre_ping: hosted Postgres (Neon) closes idle connections when it scales to zero.
    return create_engine(database_url(database), pool_pre_ping=True, pool_size=5, max_overflow=5)


class Registry:
    def __init__(self, database: str | Path) -> None:
        """database: a SQLite file path (local default) or a Postgres URL (DATABASE_URL)."""
        self.engine: Engine = make_engine(database)
        Base.metadata.create_all(self.engine)
        _upgrade_schema(self.engine)
        self._session = sessionmaker(self.engine, expire_on_commit=False)

    def _tx(self) -> Session:
        return self._session.begin()

    # ---------------------------------------------------------------- passports
    def save_passport(self, passport: RobotPassport) -> RobotPassport:
        with self._tx() as s:
            s.merge(
                PassportRow(
                    robot_id=passport.robot_id,
                    model_hash=passport.model_hash,
                    payload=passport.model_dump(mode="json"),
                    created_at=passport.created_at,
                )
            )
        return passport

    def get_passport(self, robot_id: str) -> RobotPassport | None:
        with self._session() as s:
            row = s.get(PassportRow, robot_id)
            return RobotPassport.model_validate(row.payload) if row else None

    # ---------------------------------------------------------------- runs
    def save_run(self, run: RunRecord) -> RunRecord:
        """Insert or update. The owner is set once: a copy without owner_id never clears it."""
        with self._tx() as s:
            existing = s.get(RunRow, run.run_id)
            owner = run.owner_id or (existing.owner_id if existing else None)
            s.merge(
                RunRow(
                    run_id=run.run_id,
                    run_type=run.run_type,
                    status=run.status,
                    payload=run.model_dump(mode="json", exclude={"mine"}),
                    created_at=run.created_at,
                    owner_id=owner,
                    visibility=run.visibility,
                )
            )
        return run.model_copy(update={"owner_id": owner})

    def get_run(self, run_id: str, viewer: Viewer = EVERYONE) -> RunRecord | None:
        with self._session() as s:
            row = s.get(RunRow, run_id)
            return _run(row) if row and _row_visible(row, viewer) else None

    def list_runs(
        self, run_type: str | None = None, robot_id: str | None = None, limit: int = 100, offset: int = 0,
        statuses: Collection[str] | None = None, exclude_statuses: Collection[str] | None = None,
        family: str | None = None, scene_id: str | None = None, viewer: Viewer = EVERYONE,
        owner_id: str | None = None,
    ) -> list[RunRecord]:
        """Newest first. robot_id, family (task type) and scene_id (one layout) are matched before paging.

        viewer limits the list to what that user may see; owner_id to one owner's runs."""
        stmt = _where_visible(select(RunRow).order_by(RunRow.created_at.desc()), RunRow, viewer)
        if owner_id:
            stmt = stmt.where(RunRow.owner_id == owner_id)
        if run_type:
            stmt = stmt.where(RunRow.run_type == run_type)
        if statuses:
            stmt = stmt.where(RunRow.status.in_(statuses))
        if exclude_statuses:
            stmt = stmt.where(RunRow.status.not_in(exclude_statuses))
        in_python = bool(robot_id or family or scene_id)
        if not in_python:
            stmt = stmt.offset(offset).limit(limit)
        with self._session() as s:
            runs = [_run(r) for r in s.scalars(stmt)]
        if not in_python:
            return runs
        matching = [r for r in runs if _run_matches(r, robot_id, family, scene_id)]
        return matching[offset:offset + limit]

    # ---------------------------------------------------------------- skills
    def save_skill(self, capsule: ExperienceCapsule) -> ExperienceCapsule:
        with self._tx() as s:
            s.add(
                SkillRow(
                    skill_id=capsule.skill_id,
                    source_robot_id=capsule.source_robot_id,
                    parent_skill_id=capsule.parent_skill_id,
                    run_id=capsule.provenance["run_id"],
                    payload=capsule.model_dump(mode="json", exclude={"mine"}),
                    created_at=capsule.created_at,
                    owner_id=capsule.owner_id,
                    visibility=capsule.visibility,
                )
            )
        return capsule

    def set_skill_visibility(self, skill_id: str, visibility: Visibility) -> None:
        with self._tx() as s:
            row = s.get(SkillRow, skill_id)
            if row is None:
                raise KeyError(skill_id)
            row.visibility = visibility
            row.payload = {**row.payload, "visibility": visibility}

    def get_skill(self, skill_id: str, viewer: Viewer = EVERYONE) -> ExperienceCapsule | None:
        with self._session() as s:
            row = s.get(SkillRow, skill_id)
            return _skill(row) if row and _row_visible(row, viewer) else None

    def get_skill_by_run(self, run_id: str, viewer: Viewer = EVERYONE) -> ExperienceCapsule | None:
        with self._session() as s:
            row = s.scalars(select(SkillRow).where(SkillRow.run_id == run_id)).first()
            return _skill(row) if row and _row_visible(row, viewer) else None

    def list_skills(
        self, source_robot_id: str | None = None, parent_skill_id: str | None = None, viewer: Viewer = EVERYONE,
        owner_id: str | None = None,
    ) -> list[ExperienceCapsule]:
        stmt = _where_visible(select(SkillRow).order_by(SkillRow.created_at.desc()), SkillRow, viewer)
        if source_robot_id:
            stmt = stmt.where(SkillRow.source_robot_id == source_robot_id)
        if parent_skill_id:
            stmt = stmt.where(SkillRow.parent_skill_id == parent_skill_id)
        if owner_id:
            stmt = stmt.where(SkillRow.owner_id == owner_id)
        with self._session() as s:
            return [_skill(r) for r in s.scalars(stmt)]

    def save_library_report(self, report: LibraryReport) -> LibraryReport:
        with self._tx() as s:
            s.add(LibraryReportRow(report_id=report.report_id, payload=report.model_dump(mode="json"),
                                   created_at=report.created_at))
        return report

    def get_library_report(self, report_id: str) -> LibraryReport | None:
        with self._session() as s:
            row = s.get(LibraryReportRow, report_id)
            return LibraryReport.model_validate(row.payload) if row else None

    def latest_library_report(self) -> LibraryReport | None:
        stmt = select(LibraryReportRow).order_by(LibraryReportRow.created_at.desc()).limit(1)
        with self._session() as s:
            row = s.scalars(stmt).first()
            return LibraryReport.model_validate(row.payload) if row else None

    # ---------------------------------------------------------------- fleet
    def added_robot_ids(self) -> set[str]:
        with self._session() as s:
            return set(s.scalars(select(FleetRow.robot_id)))

    def add_to_fleet(self, robot_id: str, added_by: str | None) -> None:
        with self._tx() as s:
            if s.get(FleetRow, robot_id) is None:
                s.add(FleetRow(robot_id=robot_id, added_by=added_by, added_at=utcnow()))

    # ---------------------------------------------------------------- users
    def save_uploaded_robot(self, robot_id: str, decl_json: str, owner_id: str | None = None,
                            visibility: Visibility = "public") -> None:
        with self._tx() as s:
            s.merge(UploadedRobotRow(robot_id=robot_id, decl=decl_json, created_at=utcnow(), owner_id=owner_id,
                                     visibility=visibility))

    def robot_access(self) -> dict[str, tuple[str | None, str]]:
        """Uploaded robot id -> (owner id, visibility). Catalog arms have no entry: they are public."""
        with self._session() as s:
            return {r.robot_id: (r.owner_id, r.visibility) for r in s.scalars(select(UploadedRobotRow))}

    def set_robot_visibility(self, robot_id: str, visibility: Visibility) -> None:
        with self._tx() as s:
            row = s.get(UploadedRobotRow, robot_id)
            if row is None:
                raise KeyError(robot_id)
            row.visibility = visibility

    def save_designed_task(self, family: str, goal_key: str, design_json: str) -> None:
        with self._tx() as s:
            s.merge(DesignedTaskRow(family=family, goal_key=goal_key, design=design_json, created_at=utcnow()))

    def designed_tasks(self) -> list[str]:
        """TaskDesign JSON of every designed task type, oldest first."""
        with self._session() as s:
            rows = s.scalars(select(DesignedTaskRow).order_by(DesignedTaskRow.created_at)).all()
            return [r.design for r in rows]

    def designed_task_for(self, goal_key: str) -> str | None:
        """The design stored for this goal, or None."""
        with self._session() as s:
            row = s.scalars(select(DesignedTaskRow).where(DesignedTaskRow.goal_key == goal_key)).first()
            return row.design if row else None

    def uploaded_robots(self) -> list[str]:
        """Declared-facts JSON of every uploaded arm, oldest first."""
        with self._session() as s:
            rows = s.scalars(select(UploadedRobotRow).order_by(UploadedRobotRow.created_at)).all()
            return [r.decl for r in rows]

    def save_user(self, user: User) -> User:
        with self._tx() as s:
            s.merge(UserRow(user_id=user.user_id, payload=user.model_dump(mode="json"), created_at=user.created_at))
        return user

    def get_user(self, user_id: str) -> User | None:
        with self._session() as s:
            row = s.get(UserRow, user_id)
            return User.model_validate(row.payload) if row else None

    def add_credential(self, credential: Credential) -> bool:
        """Store a new email sign-in; False when that email already has an account."""
        with self._tx() as s:
            if s.get(CredentialRow, credential.email):
                return False
            s.add(CredentialRow(**credential.model_dump()))
        return True

    def get_credential(self, email: str) -> Credential | None:
        with self._session() as s:
            row = s.get(CredentialRow, email)
            return Credential(email=row.email, user_id=row.user_id, password_hash=row.password_hash,
                              created_at=row.created_at) if row else None

    # ---------------------------------------------------------------- blog
    def save_post(self, post: BlogPost) -> BlogPost:
        with self._tx() as s:
            s.merge(BlogPostRow(post_id=post.post_id, author_id=post.author_id,
                                payload=post.model_dump(mode="json"), created_at=post.created_at))
        return post

    def get_post(self, post_id: str) -> BlogPost | None:
        with self._session() as s:
            row = s.get(BlogPostRow, post_id)
            return BlogPost.model_validate(row.payload) if row else None

    def list_posts(self, limit: int = 50, offset: int = 0, author_id: str | None = None) -> list[BlogPost]:
        stmt = select(BlogPostRow).order_by(BlogPostRow.created_at.desc()).offset(offset).limit(limit)
        if author_id:
            stmt = stmt.where(BlogPostRow.author_id == author_id)
        with self._session() as s:
            return [BlogPost.model_validate(r.payload) for r in s.scalars(stmt)]

    def count_posts_since(self, author_id: str, since: datetime) -> int:
        stmt = select(BlogPostRow.post_id).where(BlogPostRow.author_id == author_id, BlogPostRow.created_at >= since)
        with self._session() as s:
            return len(s.scalars(stmt).all())

    def delete_post(self, post_id: str) -> None:
        with self._tx() as s:
            row = s.get(BlogPostRow, post_id)
            if row:
                s.delete(row)

    def append_event(self, run_id: str, event: RunEvent, **changes: object) -> RunRecord:
        """Return a new RunRecord with the event appended (and fields changed), persisted."""
        current = self.get_run(run_id)
        if current is None:
            raise KeyError(run_id)
        updated = current.model_copy(
            update={"events": [*current.events, event], "status": event.status, **changes}
        )
        return self.save_run(updated)


def _run(row: RunRow) -> RunRecord:
    return RunRecord.model_validate(row.payload).model_copy(
        update={"owner_id": row.owner_id, "visibility": row.visibility})


def _skill(row: SkillRow) -> ExperienceCapsule:
    return ExperienceCapsule.model_validate(row.payload).model_copy(
        update={"owner_id": row.owner_id, "visibility": row.visibility})


def utcnow() -> datetime:
    return datetime.now(UTC)
