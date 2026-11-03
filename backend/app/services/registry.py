"""SQLite registry (SQLAlchemy 2.x) for passports, runs, skills, library reports, fleet and users.

Rows store validated Pydantic JSON; the repository functions return Pydantic
objects so callers never touch ORM state.
"""

from __future__ import annotations

from collections.abc import Collection
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import JSON, DateTime, String, create_engine, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.models.library import LibraryReport
from app.models.robot import RobotPassport
from app.models.run import RunEvent, RunRecord
from app.models.skill import ExperienceCapsule
from app.models.user import User


class Base(DeclarativeBase):
    pass


class PassportRow(Base):
    __tablename__ = "passports"
    robot_id: Mapped[str] = mapped_column(String, primary_key=True)
    model_hash: Mapped[str] = mapped_column(String)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RunRow(Base):
    __tablename__ = "runs"
    run_id: Mapped[str] = mapped_column(String, primary_key=True)
    run_type: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class SkillRow(Base):
    __tablename__ = "skills"
    skill_id: Mapped[str] = mapped_column(String, primary_key=True)
    source_robot_id: Mapped[str] = mapped_column(String, index=True)
    parent_skill_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    run_id: Mapped[str] = mapped_column(String, unique=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


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


class UserRow(Base):
    __tablename__ = "users"
    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Registry:
    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.engine: Engine = create_engine(
            f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(self.engine)
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
        with self._tx() as s:
            s.merge(
                RunRow(
                    run_id=run.run_id,
                    run_type=run.run_type,
                    status=run.status,
                    payload=run.model_dump(mode="json"),
                    created_at=run.created_at,
                )
            )
        return run

    def get_run(self, run_id: str) -> RunRecord | None:
        with self._session() as s:
            row = s.get(RunRow, run_id)
            return RunRecord.model_validate(row.payload) if row else None

    def list_runs(
        self, run_type: str | None = None, robot_id: str | None = None, limit: int = 100, offset: int = 0,
        statuses: Collection[str] | None = None, exclude_statuses: Collection[str] | None = None,
    ) -> list[RunRecord]:
        stmt = select(RunRow).order_by(RunRow.created_at.desc()).offset(offset).limit(limit)
        if run_type:
            stmt = stmt.where(RunRow.run_type == run_type)
        if statuses:
            stmt = stmt.where(RunRow.status.in_(statuses))
        if exclude_statuses:
            stmt = stmt.where(RunRow.status.not_in(exclude_statuses))
        with self._session() as s:
            runs = [RunRecord.model_validate(r.payload) for r in s.scalars(stmt)]
        if robot_id:
            runs = [r for r in runs if robot_id in (r.source_robot_id, r.target_robot_id)]
        return runs

    # ---------------------------------------------------------------- skills
    def save_skill(self, capsule: ExperienceCapsule) -> ExperienceCapsule:
        with self._tx() as s:
            s.add(
                SkillRow(
                    skill_id=capsule.skill_id,
                    source_robot_id=capsule.source_robot_id,
                    parent_skill_id=capsule.parent_skill_id,
                    run_id=capsule.provenance["run_id"],
                    payload=capsule.model_dump(mode="json"),
                    created_at=capsule.created_at,
                )
            )
        return capsule

    def get_skill(self, skill_id: str) -> ExperienceCapsule | None:
        with self._session() as s:
            row = s.get(SkillRow, skill_id)
            return ExperienceCapsule.model_validate(row.payload) if row else None

    def get_skill_by_run(self, run_id: str) -> ExperienceCapsule | None:
        with self._session() as s:
            row = s.scalars(select(SkillRow).where(SkillRow.run_id == run_id)).first()
            return ExperienceCapsule.model_validate(row.payload) if row else None

    def list_skills(
        self, source_robot_id: str | None = None, parent_skill_id: str | None = None
    ) -> list[ExperienceCapsule]:
        stmt = select(SkillRow).order_by(SkillRow.created_at.desc())
        if source_robot_id:
            stmt = stmt.where(SkillRow.source_robot_id == source_robot_id)
        if parent_skill_id:
            stmt = stmt.where(SkillRow.parent_skill_id == parent_skill_id)
        with self._session() as s:
            return [ExperienceCapsule.model_validate(r.payload) for r in s.scalars(stmt)]

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
    def save_user(self, user: User) -> User:
        with self._tx() as s:
            s.merge(UserRow(user_id=user.user_id, payload=user.model_dump(mode="json"), created_at=user.created_at))
        return user

    def get_user(self, user_id: str) -> User | None:
        with self._session() as s:
            row = s.get(UserRow, user_id)
            return User.model_validate(row.payload) if row else None

    def append_event(self, run_id: str, event: RunEvent, **changes: object) -> RunRecord:
        """Return a new RunRecord with the event appended (and fields changed), persisted."""
        current = self.get_run(run_id)
        if current is None:
            raise KeyError(run_id)
        updated = current.model_copy(
            update={"events": [*current.events, event], "status": event.status, **changes}
        )
        return self.save_run(updated)


def utcnow() -> datetime:
    return datetime.now(UTC)
