"""Designed task types: layout checks, seeded shifts, the offline and Muse designers, and the API."""

from __future__ import annotations

import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models.skill import BoxSpec
from app.models.task_design import TaskLayout
from app.services.librarian import design_templates
from app.services.librarian import scout as scout_mod
from app.services.librarian.designer import DESIGN_MAX_TOKENS, REACH_ONLY, design_task, offline_design
from app.services.reasoning.meta_client import MetaChatClient
from app.services.task_design import POINT_CLEARANCE_M, _gap, check_layout, designed_task, family_id, install
from app.services.task_families import TASK_TYPES, TaskType, family_of, register, unregister, wall_task

WALL = BoxSpec(name="wall", center=(0.0, 0.0, 0.12), half_size=(0.1, 0.02, 0.12))
GOOD = TaskLayout(start=(0.0, -0.22, 0.12), target=(0.0, 0.22, 0.10), obstacles=[WALL])


@pytest.fixture(autouse=True)
def _fresh_cap():
    scout_mod._spent.clear()


def _with(**update) -> TaskLayout:
    return GOOD.model_copy(update=update)


def test_a_sensible_layout_passes_with_its_checks_in_words():
    errors, checks = check_layout(GOOD)
    assert errors == [] and any("apart" in c for c in checks) and any("robot base" in c for c in checks)


@pytest.mark.parametrize(("layout", "problem"), [
    (_with(start=(0.0, -0.03, 0.12)), "Start y"),
    (_with(target=(0.0, 0.22, 0.6)), "Target z"),
    (_with(obstacles=[BoxSpec(name="near", center=(0.0, -0.16, 0.1), half_size=(0.1, 0.02, 0.1))]), "from an obstacle"),
    (_with(obstacles=[]), "1 to 4 obstacles"),
    (_with(obstacles=[WALL] * 2), "unique"),
    (_with(obstacles=[BoxSpec(name="base", center=(-0.3, 0.0, 0.1), half_size=(0.05, 0.05, 0.1))]), "work area"),
    (_with(obstacles=[BoxSpec(name="sheet", center=(0.0, 0.0, 0.1), half_size=(0.1, 0.002, 0.1))]), "thinner"),
    (_with(obstacles=[BoxSpec(name="sunk", center=(0.0, 0.0, 0.0), half_size=(0.1, 0.02, 0.1))]), "work area"),
])
def test_layouts_that_break_a_limit_are_rejected(layout, problem):
    errors, _ = check_layout(layout)
    assert any(problem in e for e in errors), errors


@pytest.mark.parametrize("template", design_templates.TEMPLATES, ids=lambda t: t.key)
@pytest.mark.parametrize("scale", [0.75, 1.0, 1.35])
def test_every_offline_template_passes_the_checks(template, scale):
    assert check_layout(template.build(scale))[0] == []


def test_layout_numbers_shift_the_design_but_keep_clearance():
    design = offline_design("put a cup into a deep box")
    assert designed_task(design, 0).start == design.layout.start
    assert designed_task(design, 5) == designed_task(design, 5) != designed_task(design, 6)
    for seed in range(1, 300):
        task = designed_task(design, seed)
        assert task.scene_id == f"{design.family}_s{seed}"
        for p in (task.start, task.target):
            assert min(_gap(p, b) for b in task.obstacles) > POINT_CLEARANCE_M - 0.045


def test_family_ids_are_stable_and_registered_types_resolve():
    design = offline_design("reach under a beam")
    assert design.family == family_id(design.title, design.layout) and design.family.startswith("custom_reach_under")
    install(design)
    try:
        assert family_of(f"{design.family}_s12") == design.family
        assert TASK_TYPES[design.family].generate(0).obstacles == design.layout.obstacles
    finally:
        unregister(design.family)
    assert family_of(f"{design.family}_s12") == "wall_reach_v1"
    assert family_of("shelf_v1_s42") == "shelf_v1"
    with pytest.raises(ValueError):
        register(TaskType("shelf_v1", "x", "x", wall_task))


def test_offline_designer_is_labelled_and_flags_reach_only_goals():
    d = offline_design("pick up a cup from inside a bin")
    assert d.provider == "offline_designer" and d.title == "Reach into an open box"
    assert d.limitation == REACH_ONLY and d.usage is None and "'bin'" in " ".join(d.notes)
    assert design_task("reach over a wall", "offline").limitation == ""


ANSWER = {
    "title": "Reach behind a low crate", "summary": "A crate stands in front of the target.", "limitation": "",
    "start": {"x": 0.0, "y": -0.22, "z": 0.14}, "target": {"x": 0.0, "y": 0.25, "z": 0.08},
    "obstacles": [{"name": "Crate!", "x": 0.0, "y": 0.05, "width": 0.24, "depth": 0.14, "bottom": 0.0, "height": 0.16}],
}


class Script:
    def __init__(self, *answers: dict) -> None:
        self.answers, self.requests = list(answers), []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(json.loads(request.content))
        answer = self.answers[min(len(self.requests), len(self.answers)) - 1]
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": json.dumps(answer)}}],
                                         "usage": {"prompt_tokens": 1500, "completion_tokens": 200}})


def _client(*answers: dict) -> tuple[MetaChatClient, Script]:
    script = Script(*answers)
    return MetaChatClient("test-key", "muse-spark-1.3-contributor", transport=httpx.MockTransport(script)), script


def test_muse_design_is_one_schema_call_with_every_task_type_as_an_example():
    client, script = _client(ANSWER)
    d = design_task("reach behind a crate", "meta", client=client, learned_by={"shelf_v1": ["panda_01"]})
    assert len(script.requests) == 1 and script.requests[0]["response_format"]["json_schema"]["strict"]
    assert script.requests[0]["max_tokens"] == DESIGN_MAX_TOKENS
    sent = json.loads(script.requests[0]["messages"][1]["content"])
    assert len(sent["existing_task_types"]) >= 6 and "limits" in sent and "measured_in_this_simulator" in sent
    assert next(t for t in sent["existing_task_types"] if t["title"] == "Reach onto a shelf")["learned_by"] == ["panda_01"]
    assert d.provider == "meta_muse_spark" and d.title == "Reach behind a low crate"
    assert d.layout.obstacles[0].name == "crate" and d.layout.obstacles[0].center == (0.0, 0.05, 0.08)
    assert d.usage.model_calls == 1 and d.checks


def test_muse_gets_one_chance_to_fix_a_layout_and_hardware_text_is_dropped():
    broken = {**ANSWER, "start": {"x": 0.0, "y": 0.0, "z": 0.1}, "summary": "Works on real robots."}
    client, script = _client(broken, {**ANSWER, "summary": "Proven on hardware."})
    d = design_task("reach behind a crate", "meta", client=client)
    assert len(script.requests) == 2 and json.loads(script.requests[1]["messages"][1]["content"])["problems"]
    assert d.provider == "meta_muse_spark" and d.summary == "" and d.usage.model_calls == 2
    assert any("dropped" in n for n in d.notes)


def test_a_layout_still_broken_after_the_fix_falls_back_to_offline_with_the_calls_counted():
    broken = {**ANSWER, "obstacles": [{**ANSWER["obstacles"][0], "x": -0.4}]}
    client, script = _client(broken, broken)
    d = design_task("reach behind a crate", "meta", client=client)
    assert len(script.requests) == 2
    assert d.provider == "offline_designer" and d.provider_requested == "meta_muse_spark"
    assert d.usage.model_calls == 2 and "limits" in d.fallback_error


def test_used_up_daily_cap_designs_offline_without_a_call(monkeypatch):
    monkeypatch.setattr(scout_mod, "SCOUT_DAILY_MODEL_CALLS", 0)
    client, script = _client(ANSWER)
    d = design_task("reach behind a crate", "meta", client=client)
    assert script.requests == [] and d.provider == "offline_designer" and any("limit" in n for n in d.notes)


@pytest.fixture(scope="module")
def api():
    with TestClient(create_app()) as c:
        yield c


def test_design_api_adds_a_task_type_that_robots_can_learn(api):
    r = api.post("/api/tasks/design", json={"goal": "Reach under a low beam", "provider": "offline"})
    assert r.status_code == 201, r.text
    body = r.json()
    family = body["design"]["family"]
    assert body["reused"] is False and body["example"]["scene_id"] == f"{family}_s0"
    listed = {t["family"]: t for t in api.get("/api/tasks").json()}
    assert listed[family]["design"]["goal"] == "Reach under a low beam"
    again = api.post("/api/tasks/design", json={"goal": "reach under a LOW beam", "provider": "offline"}).json()
    assert again["reused"] is True and again["design"]["family"] == family

    run = api.post("/api/runs/discover", json={"robot_id": "panda_01", "scene_seed": 3, "task_family": family})
    assert run.status_code == 202
    run_id, deadline = run.json()["run_id"], time.time() + 120
    while (rec := api.get(f"/api/runs/{run_id}").json())["status"] not in ("succeeded", "failed"):
        assert time.time() < deadline
        time.sleep(0.2)
    assert rec["status"] == "succeeded", rec["events"][-1]
    skill = api.post("/api/skills", json={"run_id": run_id}).json()
    assert skill["task"]["scene_id"] == f"{family}_s3"


def test_design_api_validates_input(api):
    assert api.post("/api/tasks/design", json={"goal": "x"}).status_code == 422
    assert api.post("/api/runs/discover", json={"robot_id": "panda_01", "task_family": "custom_nope_000000"}
                    ).status_code == 422
