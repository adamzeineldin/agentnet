"""Muse librarian: model adds wording and priorities on top of rule-computed facts (mocked transport)."""

from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.librarian import build_report, organize
from app.services.librarian.muse import MAX_SUMMARY_CHARS, MuseLibrarian, run_tool
from tests.factories import ROBOT_IDS, capsule

SKILLS = [
    capsule("p7", minute=0), capsule("p7_dup", minute=1),
    capsule("p42", seed=42, route="over", clearance=0.08, minute=2),
    capsule("p3", seed=3, route="over", clearance=0.12, minute=3),
]
FACT_FIELDS = ("skill_count", "robot_ids", "duplicates", "gaps")


def _completion(message: dict, usage=(100, 20)) -> dict:
    return {"choices": [{"message": message, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": usage[0], "completion_tokens": usage[1]}}


def _submit(args: dict, call_id: str = "c1") -> dict:
    return {"role": "assistant", "content": None, "tool_calls": [
        {"id": call_id, "type": "function", "function": {"name": "submit_organization", "arguments": json.dumps(args)}}]}


class Script:
    def __init__(self, responses: list[httpx.Response]) -> None:
        self.responses, self.requests = list(responses), []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.responses.pop(0)

    def bodies(self) -> list[dict]:
        return [json.loads(r.content) for r in self.requests]


def _librarian(script: Script, model: str = "muse-spark-1.3-contributor") -> MuseLibrarian:
    return MuseLibrarian("test-key", model, transport=httpx.MockTransport(script))


def _answer(**overrides) -> dict:
    base = {"summary": "Mostly over-the-wall routes; one seed-7 skill was published twice.",
            "collection_notes": [{"collection_id": "wall_reach_v1:over", "note": "Shared by both arms."}],
            "suggestion_order": ["transfer:p3:ur5e_01", "transfer:p42:ur5e_01"],
            "priority_rationale": "p3 uses the wider clearance, which transferred more reliably."}
    return {**base, **overrides}


def test_request_is_bounded_cheap_and_carries_the_rule_facts():
    script = Script([httpx.Response(200, json=_completion(_submit(_answer())))])
    _librarian(script).organize(SKILLS, ROBOT_IDS)
    body = script.bodies()[0]
    assert body["model"] == "muse-spark-1.3-contributor" and body["reasoning_effort"] == "low"
    assert {t["function"]["name"] for t in body["tools"]} == {"inspect_skill", "compare_skills", "submit_organization"}
    user = json.loads(body["messages"][1]["content"])
    assert {c["collection_id"] for c in user["collections"]} == {"wall_reach_v1:far_side", "wall_reach_v1:over"}
    assert set(user["suggestion_ids"]) == {"transfer:p42:ur5e_01", "transfer:p3:ur5e_01", "transfer:p7:ur5e_01"}


def test_model_adds_wording_and_order_but_facts_match_the_offline_rules():
    script = Script([httpx.Response(200, json=_completion(_submit(_answer())))])
    report = _librarian(script).organize(SKILLS, ROBOT_IDS)
    offline = organize(SKILLS, ROBOT_IDS)
    for field in FACT_FIELDS:
        assert getattr(report, field) == getattr(offline, field)
    assert [c.skill_ids for c in report.collections] == [c.skill_ids for c in offline.collections]
    assert report.provider == "meta_muse_spark" and report.model_id == "muse-spark-1.3-contributor"
    assert report.summary.startswith("Mostly over-the-wall")
    over = next(c for c in report.collections if c.collection_id == "wall_reach_v1:over")
    assert over.model_note == "Shared by both arms."
    assert [s.source_skill_id for s in report.suggestions] == ["p3", "p42", "p7"]  # unranked one appended
    assert report.priority_rationale.startswith("p3 uses")


def test_unknown_ids_are_dropped_and_long_text_is_truncated():
    answer = _answer(summary="x" * (MAX_SUMMARY_CHARS + 50),
                     collection_notes=[{"collection_id": "made_up", "note": "?"}],
                     suggestion_order=["transfer:ghost:ur5e_01", "transfer:p7:ur5e_01"])
    report = _librarian(Script([httpx.Response(200, json=_completion(_submit(answer)))])).organize(SKILLS, ROBOT_IDS)
    assert len(report.summary) == MAX_SUMMARY_CHARS
    assert all(c.model_note is None for c in report.collections)
    assert report.suggestions[0].source_skill_id == "p7" and len(report.suggestions) == 3
    assert any("ghost" in n for n in report.notes)


def test_text_claiming_physical_hardware_is_dropped():
    # Live check (2026-10-29) wrote "demonstrated on Panda hardware"; all results are simulation-only.
    answer = _answer(summary="Verified on real robots.",
                     collection_notes=[{"collection_id": "wall_reach_v1:over", "note": "Shown on UR hardware."},
                                       {"collection_id": "wall_reach_v1:far_side", "note": "Panda-only so far."}],
                     priority_rationale="Fills the last simulated gap.")
    report = _librarian(Script([httpx.Response(200, json=_completion(_submit(answer)))])).organize(SKILLS, ROBOT_IDS)
    notes = {c.collection_id: c.model_note for c in report.collections}
    assert report.summary is None and notes["wall_reach_v1:over"] is None
    assert notes["wall_reach_v1:far_side"] == "Panda-only so far."
    assert report.priority_rationale == "Fills the last simulated gap."
    assert sum("simulation" in n and "dropped" in n for n in report.notes) == 2


def test_system_prompt_states_simulation_only():
    script = Script([httpx.Response(200, json=_completion(_submit(_answer())))])
    _librarian(script).organize(SKILLS, ROBOT_IDS)
    assert "simulation" in script.bodies()[0]["messages"][0]["content"].lower()
    assert "hardware" in script.bodies()[0]["messages"][0]["content"].lower()


def test_usage_and_cost_are_recorded_at_the_models_price():
    report = _librarian(Script([httpx.Response(200, json=_completion(_submit(_answer()), (1000, 500)))])) \
        .organize(SKILLS, ROBOT_IDS)
    assert report.usage.model_calls == 1
    assert report.usage.prompt_tokens == 1000 and report.usage.completion_tokens == 500
    assert report.usage.estimated_cost_usd == pytest.approx(1000 / 1e6 * 0.10 + 500 / 1e6 * 0.20)


def test_tools_are_read_only_and_validate_arguments():
    by_id = {c.skill_id: c for c in SKILLS}
    assert run_tool("inspect_skill", {"skill_id": "p42"}, by_id)["strategy"] == "over@0.08"
    diff = run_tool("compare_skills", {"skill_a": "p7", "skill_b": "p7_dup"}, by_id)
    assert diff["same_robot"] and diff["same_task_geometry"] and diff["same_strategy"]
    assert "error" in run_tool("inspect_skill", {"skill_id": "nope"}, by_id)
    assert "error" in run_tool("delete_skill", {"skill_id": "p7"}, by_id)


def test_model_failure_falls_back_to_offline_and_keeps_the_billed_calls():
    prose = httpx.Response(200, json=_completion({"role": "assistant", "content": "no json here"}))
    tool_round = httpx.Response(200, json=_completion({"role": "assistant", "content": None, "tool_calls": [
        {"id": "t1", "type": "function", "function": {"name": "inspect_skill", "arguments": '{"skill_id": "p7"}'}}]}))
    report = build_report(SKILLS, ROBOT_IDS, _librarian(Script([tool_round, prose])))
    assert report.provider == "offline_librarian" and report.model_id is None
    assert report.provider_requested == "meta_muse_spark" and "not JSON" in report.fallback_error
    assert report.summary is None and report.usage.model_calls == 2
    assert report.usage.estimated_cost_usd == pytest.approx(2 * (100 / 1e6 * 0.10 + 20 / 1e6 * 0.20))


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def test_api_meta_without_key_is_refused(client, monkeypatch):
    monkeypatch.setattr("app.api.library.meta_available", lambda: False)
    assert client.post("/api/library/reports", json={"provider": "meta"}).status_code == 409


def test_api_meta_report_is_stored_and_skills_are_unchanged(client, monkeypatch):
    skills_before = client.get("/api/skills").json()
    answer = _answer(collection_notes=[], suggestion_order=[])
    monkeypatch.setattr("app.api.library.meta_available", lambda: True)
    monkeypatch.setattr("app.api.library.get_librarian", lambda mode: _librarian(
        Script([httpx.Response(200, json=_completion(_submit(answer)))])))
    created = client.post("/api/library/reports", json={"provider": "meta"})
    assert created.status_code == 201
    report = created.json()
    assert report["provider"] == "meta_muse_spark" and report["usage"]["model_calls"] == 1
    assert client.get("/api/library/reports/latest").json()["report_id"] == report["report_id"]
    assert client.get("/api/skills").json() == skills_before
