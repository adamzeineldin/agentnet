"""Skill scout: goal -> task type + saved skills to learn from. Offline rules, and Muse with a mocked transport."""

from __future__ import annotations

import json
from datetime import UTC, datetime

import httpx
import pytest

from app.models.robot import RobotSummary
from app.services.librarian import scout as scout_mod
from app.services.librarian.scout import keyword_family, offline_plan, scout
from app.services.reasoning.meta_client import MetaChatClient
from tests.factories import capsule


def _robot(rid: str, name: str, dof: int, reach: float) -> RobotSummary:
    return RobotSummary(robot_id=rid, display_name=name, short_name=name, dof=dof, model_source="m", model_hash="h",
                        tool_type="t", max_reach_m=reach, fallback_model=False, snapshot_url="", created_at=datetime.now(UTC))


ROBOTS = [_robot("panda_01", "Panda", 7, 0.95), _robot("ur5e_01", "UR5e", 6, 0.97), _robot("z1_01", "Z1", 6, 0.74)]
SKILLS = [
    capsule("shelf_panda", family="shelf_v1", seed=42, route="over"),
    capsule("shelf_ur5e", robot="ur5e_01", family="shelf_v1", seed=7, route="direct"),
    capsule("wall_panda", seed=3),
]


@pytest.fixture(autouse=True)
def _fresh_cache():
    scout_mod._cache.clear()
    scout_mod._spent.clear()


class Script:
    def __init__(self, answer: dict) -> None:
        self.answer, self.requests = answer, []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": json.dumps(self.answer)}}],
                                         "usage": {"prompt_tokens": 900, "completion_tokens": 120}})


def _client(answer: dict) -> tuple[MetaChatClient, Script]:
    script = Script(answer)
    return MetaChatClient("test-key", "muse-spark-1.3-contributor", transport=httpx.MockTransport(script)), script


@pytest.mark.parametrize(("goal", "family"), [
    ("put a cup on the top shelf of a cupboard", "shelf_v1"),
    ("reach through a narrow gap between two posts", "posts_v1"),
    ("reach under a table", "wall_roof_v1"),
    ("wave hello", "wall_reach_v1"),
])
def test_offline_keywords_pick_a_task_type(goal, family):
    assert keyword_family(goal)[0] == family


def test_offline_plan_picks_other_robots_skills_of_that_type():
    plan = offline_plan("place a box on a shelf", "z1_01", ROBOTS, SKILLS)
    assert plan.provider == "offline_scout" and plan.task_family == "shelf_v1"
    assert [p.skill_id for p in plan.picks] == ["shelf_panda", "shelf_ur5e"] or {p.skill_id for p in plan.picks} == {
        "shelf_panda", "shelf_ur5e"}
    assert plan.teacher_robot_id is None
    # The learner's own skills are never suggested to it.
    assert all(p.source_robot_id != "panda_01" for p in offline_plan("shelf", "panda_01", ROBOTS, SKILLS).picks)


def test_offline_plan_names_a_teacher_when_nothing_is_saved():
    plan = offline_plan("between two posts", "z1_01", ROBOTS, SKILLS)
    assert plan.picks == [] and plan.teacher_robot_id == "panda_01"


def test_muse_plan_is_one_bounded_call_and_ids_are_checked():
    client, script = _client({
        "task_family": "shelf_v1", "task_why": "The goal is to put something on a shelf.",
        "picks": [{"skill_id": "shelf_ur5e", "why": "Six joints like the Z1."},
                  {"skill_id": "wall_panda", "why": "Wrong type."},
                  {"skill_id": "made_up", "why": "Invented."}],
        "teacher_robot_id": "", "teacher_why": "", "summary": "Learn from the UR5e first; the simulator will test it."})
    plan = scout("Put a cup on a high shelf", ROBOTS[2], ROBOTS, SKILLS, "meta", client=client)
    assert len(script.requests) == 1
    body = script.requests[0]
    assert body["response_format"]["json_schema"]["strict"] and "tools" not in body
    # Reasoning tokens count toward max_tokens; the shared 1200 cut live answers off mid-JSON.
    assert body["max_tokens"] == scout_mod.SCOUT_MAX_TOKENS > 1200
    sent = json.loads(body["messages"][1]["content"])
    assert {s["skill_id"] for s in sent["skills"]} == {"shelf_panda", "shelf_ur5e", "wall_panda"}
    assert plan.provider == "meta_muse_spark" and plan.task_family == "shelf_v1"
    assert [p.skill_id for p in plan.picks] == ["shelf_ur5e"]
    assert any("wall_panda" in n for n in plan.notes) and any("made_up" in n for n in plan.notes)
    assert plan.usage.model_calls == 1 and plan.usage.estimated_cost_usd is not None


def test_muse_text_implying_hardware_is_dropped_and_results_are_cached():
    client, script = _client({"task_family": "shelf_v1", "task_why": "Proven on real robots.", "picks": [],
                              "teacher_robot_id": "", "teacher_why": "", "summary": "Works on hardware."})
    plan = scout("shelf", ROBOTS[2], ROBOTS, SKILLS, "meta", client=client)
    assert plan.task_why == "" and plan.summary is None
    assert plan.picks and plan.picks[0].skill_id in {"shelf_panda", "shelf_ur5e"}  # best saved skill filled in
    assert scout("shelf", ROBOTS[2], ROBOTS, SKILLS, "meta", client=client) is plan
    assert len(script.requests) == 1


def test_daily_cap_falls_back_to_offline(monkeypatch):
    monkeypatch.setattr(scout_mod, "SCOUT_DAILY_MODEL_CALLS", 0)
    client, script = _client({})
    plan = scout("shelf", ROBOTS[2], ROBOTS, SKILLS, "meta", client=client)
    assert plan.provider == "offline_scout" and script.requests == []
    assert any("limit" in n for n in plan.notes)


def test_failed_model_call_keeps_the_billed_attempt():
    def broken(_request):
        return httpx.Response(500, text="boom")
    client = MetaChatClient("k", "muse-spark-1.3-contributor", transport=httpx.MockTransport(broken))
    plan = scout("shelf", ROBOTS[2], ROBOTS, SKILLS, "meta", client=client)
    assert plan.provider == "offline_scout" and plan.provider_requested == "meta_muse_spark"
    assert "HTTP 500" in plan.fallback_error
