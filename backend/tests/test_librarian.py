"""Skill librarian: deterministic organization of the published registry (no model calls)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models.skill import CapsuleValidation, ExperienceCapsule, Placement, StrategySpec
from app.services.librarian import organize
from app.services.registry import Registry
from app.services.task_scene import ROOF_FAMILY, SCENE_FAMILY, generate_task

ROBOT_IDS = ("panda_01", "ur5e_01")
T0 = datetime(2026, 10, 29, tzinfo=UTC)


def _capsule(skill_id: str, robot: str = "panda_01", seed: int = 7, route: str = "far_side",
             clearance: float = 0.12, family: str = SCENE_FAMILY, parent: str | None = None,
             lineage: tuple[str, ...] = (), minute: int = 0) -> ExperienceCapsule:
    task = generate_task(seed, family)
    return ExperienceCapsule(
        skill_id=skill_id, parent_skill_id=parent, lineage=list(lineage), status="verified_in_sim",
        source_robot_id=robot, source_model_hash="h", goal="g", frame_convention="f", task=task,
        placement=Placement(translation=(0.5, 0, 0)),
        strategy=StrategySpec(route_class=route, clearance_m=clearance, description="d"),
        waypoints_task_frame=[task.start, task.target], executed_trace_task_frame=[],
        candidate_outcomes=[], requirements={}, environment={}, provenance={"run_id": f"run_{skill_id}"},
        validation=CapsuleValidation(success=True, collisions=0, endpoint_error_m=0.0006, min_clearance_m=0.02,
                                     simulated_seconds=1, candidates_evaluated=10, candidates_verified=2,
                                     tolerance_m=0.01),
        created_at=T0 + timedelta(minutes=minute),
    )


def test_empty_library_gives_an_empty_report():
    report = organize([], ROBOT_IDS)
    assert report.skill_count == 0 and report.provider == "offline_librarian" and report.model_id is None
    assert not (report.collections or report.duplicates or report.gaps or report.suggestions)


def test_identical_skills_from_the_same_robot_are_grouped_keeping_the_earliest():
    skills = [_capsule("a", minute=0), _capsule("b", minute=5), _capsule("c", minute=9),
              _capsule("other_clearance", clearance=0.08, minute=1),
              _capsule("other_robot", robot="ur5e_01", minute=2),
              _capsule("other_scene", seed=42, minute=3)]
    report = organize(skills, ROBOT_IDS)
    assert len(report.duplicates) == 1
    group = report.duplicates[0]
    assert group.keep_skill_id == "a" and group.duplicate_skill_ids == ["b", "c"]
    assert group.robot_id == "panda_01" and group.strategy == "far_side@0.12"
    assert "wall_reach_v1_s7" in group.basis


def test_collections_group_by_scene_family_and_route_class():
    skills = [_capsule("p_far"), _capsule("p_over", route="over", clearance=0.08, seed=42),
              _capsule("u_over", robot="ur5e_01", route="over", clearance=0.08, parent="p_far", lineage=("p_far",)),
              _capsule("p_roof", route="over", clearance=0.08, family=ROOF_FAMILY, seed=100)]
    report = organize(skills, ROBOT_IDS)
    by_id = {c.collection_id: c for c in report.collections}
    assert set(by_id) == {"wall_reach_v1:far_side", "wall_reach_v1:over", "wall_roof_v1:over"}
    over = by_id["wall_reach_v1:over"]
    assert set(over.skill_ids) == {"p_over", "u_over"} and over.robot_ids == ["panda_01", "ur5e_01"]
    assert sum(len(c.skill_ids) for c in report.collections) == len(skills)


def test_untransferred_original_becomes_a_gap_and_a_transfer_suggestion():
    report = organize([_capsule("p42", seed=42, route="over", clearance=0.08)], ROBOT_IDS)
    gaps = [g for g in report.gaps if g.kind == "skill_not_transferred"]
    assert [(g.skill_id, g.robot_id) for g in gaps] == [("p42", "ur5e_01")]
    assert [(s.action, s.source_skill_id, s.target_robot_id) for s in report.suggestions] == [
        ("transfer", "p42", "ur5e_01")]


def test_an_adaptation_of_any_duplicate_covers_the_whole_group():
    skills = [_capsule("a", minute=0), _capsule("b", minute=5),
              _capsule("u", robot="ur5e_01", route="over", clearance=0.08, parent="b", lineage=("b",), minute=6)]
    report = organize(skills, ROBOT_IDS)
    assert report.suggestions == []
    assert not any(g.kind == "skill_not_transferred" for g in report.gaps)


def test_adaptations_and_duplicates_are_never_suggested_for_transfer():
    skills = [_capsule("a", minute=0), _capsule("dup", minute=1),
              _capsule("u", robot="ur5e_01", route="over", clearance=0.08, parent="x", lineage=("x",), minute=2)]
    suggested = {s.source_skill_id for s in organize(skills, ROBOT_IDS).suggestions}
    assert suggested == {"a"}


def test_robot_with_no_skill_in_a_scene_family_is_a_gap():
    skills = [_capsule("p_roof", route="over", clearance=0.08, family=ROOF_FAMILY, seed=100),
              _capsule("u_wall", robot="ur5e_01", route="over", clearance=0.08, parent="z", lineage=("z",))]
    gaps = {(g.robot_id, g.scene_family) for g in organize(skills, ROBOT_IDS).gaps
            if g.kind == "robot_missing_family"}
    assert gaps == {("ur5e_01", ROOF_FAMILY), ("panda_01", SCENE_FAMILY)}


def test_report_is_deterministic_apart_from_id_and_time():
    skills = [_capsule("a"), _capsule("b", minute=3), _capsule("c", seed=42, route="over", clearance=0.08)]
    first, second = organize(skills, ROBOT_IDS), organize(list(reversed(skills)), ROBOT_IDS)
    volatile = {"report_id", "created_at"}
    assert first.model_dump(exclude=volatile) == second.model_dump(exclude=volatile)
    assert first.report_id != second.report_id


def test_registry_stores_reports_newest_first(tmp_path):
    registry = Registry(tmp_path / "lib.db")
    assert registry.latest_library_report() is None
    older = organize([_capsule("a")], ROBOT_IDS)
    newer = organize([_capsule("a"), _capsule("b", minute=1)], ROBOT_IDS)
    registry.save_library_report(older)
    registry.save_library_report(newer)
    assert registry.get_library_report(older.report_id) == older
    assert registry.latest_library_report() == newer


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def test_api_creates_reads_and_never_changes_skills(client):
    skills_before = client.get("/api/skills").json()
    created = client.post("/api/library/reports", json={})
    assert created.status_code == 201
    report = created.json()
    assert report["provider"] == "offline_librarian" and report["skill_count"] == len(skills_before)
    assert client.get("/api/library/reports/latest").json()["report_id"] == report["report_id"]
    assert client.get(f"/api/library/reports/{report['report_id']}").json() == report
    assert client.get("/api/skills").json() == skills_before


def test_api_rejects_unknown_reports_and_providers(client):
    assert client.get("/api/library/reports/lib_missing").status_code == 404
    assert client.post("/api/library/reports", json={"provider": "meta"}).status_code == 422
