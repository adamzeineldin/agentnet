"""The librarian check (known / adapt / learn), the improvement verdict, the scout's match and designer dedup."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models.robot import RobotSummary
from app.models.run import RunRecord
from app.models.task_design import TaskLayout
from app.services.librarian import scout as scout_mod
from app.services.librarian.check import check, judge, path_length, tried_on
from app.services.librarian.designer import offline_design
from app.services.librarian.scout import keyword_match, offline_plan
from app.services.task_design import install, same_layout
from app.services.task_families import unregister
from tests.factories import capsule


def _robot(rid: str, name: str, dof: int, reach: float) -> RobotSummary:
    return RobotSummary(robot_id=rid, display_name=name, short_name=name, dof=dof, model_source="m", model_hash="h",
                        tool_type="t", max_reach_m=reach, fallback_model=False, snapshot_url="", created_at=datetime.now(UTC))


PANDA, UR5E, GEN3 = _robot("panda_01", "Panda", 7, 0.95), _robot("ur5e_01", "UR5e", 6, 0.97), _robot("gen3_01", "Gen3", 7, 0.9)
ROBOTS = [PANDA, UR5E, GEN3]


def _timed(skill_id: str, seconds: float, **kw):
    c = capsule(skill_id, **kw)
    return c.model_copy(update={"validation": c.validation.model_copy(update={"simulated_seconds": seconds})})


def _transfer(source_skill_id: str, target: str, scene_id: str) -> RunRecord:
    return RunRecord(run_id=f"run_{source_skill_id}", run_type="transfer", status="failed", target_robot_id=target,
                     task_seed=7, planner="p", simulator="s", created_at=datetime.now(UTC),
                     results={"source_skill_id": source_skill_id, "task": {"scene_id": scene_id}})


@pytest.fixture(autouse=True)
def _fresh_scout_cache():
    scout_mod._cache.clear()


# ---- the three cases


def test_known_replays_the_robots_own_fastest_skill_and_never_retrains():
    skills = [_timed("ur_slow", 3.0, robot="ur5e_01"), _timed("ur_fast", 2.0, robot="ur5e_01", minute=1),
              _timed("panda_wall", 2.5)]
    c = check(UR5E, "wall_reach_v1", ROBOTS, skills)
    assert c.case == "known" and c.existing.skill_id == "ur_fast" and c.sources == []
    assert [s.skill_id for s in c.improve_sources] == ["panda_wall"]


def test_known_skips_improvements_already_tried_on_that_layout():
    skills = [capsule("ur_wall", robot="ur5e_01"), capsule("panda_wall"), capsule("gen3_wall", robot="gen3_01")]
    runs = [_transfer("panda_wall", "ur5e_01", "wall_reach_v1_s7")]
    c = check(UR5E, "wall_reach_v1", ROBOTS, skills, runs)
    assert [s.skill_id for s in c.improve_sources] == ["gen3_wall"] and c.already_tried == ["panda_wall"]
    # A try on another layout does not count.
    assert tried_on([_transfer("gen3_wall", "ur5e_01", "wall_reach_v1_s9")], "ur5e_01", "wall_reach_v1_s7") == set()


def test_adapt_picks_the_most_similar_body_first():
    skills = [capsule("panda_shelf", family="shelf_v1"), capsule("ur_shelf", robot="ur5e_01", family="shelf_v1")]
    c = check(GEN3, "shelf_v1", ROBOTS, skills)
    assert c.case == "adapt" and [s.robot_id for s in c.sources] == ["panda_01", "ur5e_01"]  # 7 joints like the Gen3
    assert "Panda" in c.reason


def test_learn_when_no_robot_knows_the_task():
    c = check(UR5E, "posts_v1", ROBOTS, [capsule("panda_wall")])
    assert c.case == "learn" and c.sources == [] and c.existing is None


def test_a_requested_source_is_used_only_when_it_has_the_skill():
    skills = [capsule("panda_shelf", family="shelf_v1"), capsule("ur_shelf", robot="ur5e_01", family="shelf_v1")]
    asked = check(GEN3, "shelf_v1", ROBOTS, skills, requested="ur5e_01")
    assert asked.sources[0].robot_id == "ur5e_01" and asked.requested_note is None
    missing = check(UR5E, "posts_v1", ROBOTS, skills, requested="panda_01")
    assert missing.case == "learn" and "no saved skill" in missing.requested_note
    known = check(UR5E, "shelf_v1", ROBOTS, skills, requested="panda_01")
    assert known.case == "known" and "nothing was retrained" in known.requested_note


# ---- the improvement verdict


def test_verdict_keeps_the_existing_skill_unless_measurably_better():
    old = _timed("old", 2.0, robot="ur5e_01")
    faster = judge(old, _timed("new", 1.5, robot="ur5e_01"))
    assert faster.better and faster.kept_skill_id == "new"
    same = judge(old, _timed("same", 1.99, robot="ur5e_01"))
    assert not same.better and same.kept_skill_id == "old"
    assert not judge(old, None).better


def test_verdict_rejects_unsafe_or_other_layout_candidates():
    old = _timed("old", 2.0, robot="ur5e_01")
    close = _timed("close", 1.0, robot="ur5e_01")
    close = close.model_copy(update={"validation": close.validation.model_copy(update={"min_clearance_m": 0.004})})
    assert not judge(old, close).better and "mm from an obstacle" in judge(old, close).reasons[0]
    elsewhere = _timed("elsewhere", 1.0, robot="ur5e_01", seed=9)
    assert not judge(old, elsewhere).better and "different layout" in judge(old, elsewhere).reasons[0]


def test_path_length_sums_the_segments():
    assert path_length([(0, 0, 0), (0.3, 0, 0), (0.3, 0.4, 0)]) == pytest.approx(0.7)


# ---- the scout confirms a task type before anything new is designed


def test_scout_says_how_sure_it_is_and_asks_when_not():
    assert keyword_match("put a cup on a high shelf")[0] == "confident"
    unsure, alternatives, question = keyword_match("reach under a low beam")
    assert unsure == "unsure" and alternatives and question
    none, _, ask = keyword_match("wave hello")
    assert none == "none" and ask


def test_scout_matches_an_existing_designed_task_by_its_title():
    design = offline_design("reach under a beam")
    install(design)
    try:
        plan = offline_plan("reach under the low beam", "ur5e_01", ROBOTS, [])
        assert plan.task_family == design.family and plan.match == "confident"
    finally:
        unregister(design.family)


def test_layouts_a_few_centimetres_apart_are_the_same_task():
    layout = offline_design("reach into a deep box").layout
    nudged = TaskLayout(start=layout.start, target=(layout.target[0] + 0.02, *layout.target[1:]),
                        obstacles=list(reversed(layout.obstacles)))
    assert same_layout(layout, nudged)
    moved = TaskLayout(start=layout.start, target=(layout.target[0] + 0.08, *layout.target[1:]), obstacles=layout.obstacles)
    assert not same_layout(layout, moved)
