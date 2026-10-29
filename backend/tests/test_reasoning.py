"""Reasoning providers. Meta is exercised only against a mocked HTTP transport (no network, no cost)."""

from __future__ import annotations

import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app.services.reasoning.base import CandidateView, ReasoningContext, RolloutFeedback, validate_ranking
from app.services.reasoning.base import ReasoningCall
from app.services.reasoning.meta_muse import (
    MAX_TOOL_ROUNDS,
    MetaMuseProvider,
    MetaReasoningError,
    estimated_cost_usd,
)
from app.services.reasoning.offline import OfflinePlanner

IDS = ("far_side@0.12", "over@0.08", "over@0.12", "direct@0.00")


def _context() -> ReasoningContext:
    outcomes = {"far_side@0.12": "collision", "over@0.08": "feasible", "over@0.12": "feasible",
                "direct@0.00": "collision"}
    views = tuple(
        CandidateView(cid, cid.split("@")[0], float(cid.split("@")[1]), outcomes[cid], "r", None, None, "verified")
        for cid in IDS
    )
    return ReasoningContext(task={"scene_id": "s"}, capsule={"skill_id": "k"}, source_robot={"dof": 7},
                            target_robot={"dof": 6}, candidates=views, offline_order=IDS, physics_budget=3)


def _completion(message: dict, usage=(100, 20)) -> dict:
    return {"choices": [{"message": message, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": usage[0], "completion_tokens": usage[1]}}


def _tool_call(name: str, args: dict, call_id: str = "c1") -> dict:
    return {"role": "assistant", "content": None,
            "tool_calls": [{"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}


class Script:
    """Mock transport that replays scripted responses and records requests."""

    def __init__(self, responses: list[httpx.Response]) -> None:
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.responses.pop(0)

    def bodies(self) -> list[dict]:
        return [json.loads(r.content) for r in self.requests]


def _provider(script: Script) -> MetaMuseProvider:
    return MetaMuseProvider("test-key", "muse-spark-1.3", transport=httpx.MockTransport(script))


def test_validate_ranking_drops_unknown_and_appends_missing():
    ranking, notes = validate_ranking(["over@0.12", "bogus", "over@0.12"], _context())
    assert ranking[0] == "over@0.12" and set(ranking) == set(IDS) and len(ranking) == len(IDS)
    assert any("bogus" in n for n in notes) and any("appended" in n for n in notes)


def test_meta_tool_loop_request_format_and_answer():
    script = Script([
        httpx.Response(200, json=_completion(_tool_call("check_candidate", {"candidate_id": "over@0.08"}))),
        httpx.Response(200, json=_completion(_tool_call(
            "submit_ranking", {"ranking": ["over@0.12", "over@0.08"], "rationale": "wider clearance"}, "c2"))),
    ])
    proposal = _provider(script).propose_strategies(_context())
    assert proposal.ranking[:2] == ("over@0.12", "over@0.08") and proposal.model_id == "muse-spark-1.3"
    assert proposal.rationale == "wider clearance" and len(proposal.calls) == 2
    first, second = script.bodies()
    req = script.requests[0]
    assert str(req.url) == "https://api.meta.ai/v1/chat/completions"
    assert req.headers["authorization"] == "Bearer test-key"
    assert first["model"] == "muse-spark-1.3" and first["tool_choice"] == "auto"
    assert first["parallel_tool_calls"] is False
    assert first["reasoning_effort"] == "low"  # reasoning tokens bill as output and share max_tokens
    assert {t["function"]["name"] for t in first["tools"]} == {
        "inspect_robot", "inspect_skill", "check_candidate", "summarize_failure", "submit_ranking"}
    tool_msg = second["messages"][-1]
    assert tool_msg["role"] == "tool" and tool_msg["tool_call_id"] == "c1"
    assert json.loads(tool_msg["content"])["candidate_id"] == "over@0.08"
    assert second["messages"][-2]["tool_calls"][0]["id"] == "c1"  # assistant message echoed back


def test_meta_unknown_ids_from_model_are_not_simulated_first():
    script = Script([httpx.Response(200, json=_completion(_tool_call(
        "submit_ranking", {"ranking": ["teleport@9", "over@0.08"], "rationale": "x"})))])
    proposal = _provider(script).propose_strategies(_context())
    assert "teleport@9" not in proposal.ranking and proposal.ranking[0] == "over@0.08"


def test_meta_final_round_forces_json_schema():
    loop = [httpx.Response(200, json=_completion(_tool_call("inspect_skill", {}, f"c{i}")))
            for i in range(MAX_TOOL_ROUNDS)]
    final = httpx.Response(200, json=_completion(
        {"role": "assistant", "content": json.dumps({"ranking": ["over@0.08"], "rationale": "done"})}))
    script = Script([*loop, final])
    proposal = _provider(script).propose_strategies(_context())
    last = script.bodies()[-1]
    assert "tools" not in last and last["response_format"]["type"] == "json_schema"
    assert last["response_format"]["json_schema"]["strict"] is True
    assert last["messages"][-1]["role"] == "user" and "JSON" in last["messages"][-1]["content"]
    assert last["response_format"]["json_schema"]["schema"]["properties"]["ranking"]["items"]["enum"] == list(IDS)
    assert proposal.ranking[0] == "over@0.08" and len(script.requests) == MAX_TOOL_ROUNDS + 1


@pytest.mark.parametrize("response", [
    httpx.Response(500, text="boom"),
    httpx.Response(200, json={"choices": []}),
    httpx.Response(200, json=_completion({"role": "assistant", "content": "I think over is best"})),
    httpx.Response(200, json=_completion(_tool_call("submit_ranking", {"ranking": [], "rationale": ""}))),
])
def test_meta_errors_raise(response):
    with pytest.raises(MetaReasoningError):
        _provider(Script([response])).propose_strategies(_context())


def test_meta_requires_key():
    with pytest.raises(MetaReasoningError):
        MetaMuseProvider("", "muse-spark-1.3")


def test_meta_tool_args_are_validated():
    from app.services.reasoning.meta_muse import run_tool

    ctx = _context()
    assert "error" in run_tool("check_candidate", {"candidate_id": "nope"}, ctx, [])
    assert "error" in run_tool("inspect_robot", {"robot": "admin"}, ctx, [])
    assert "error" in run_tool("delete_everything", {}, ctx, [])
    fb = [RolloutFeedback("over@0.08", "physics_failure", "settled", 0.02, 0)]
    assert run_tool("summarize_failure", {"candidate_id": "over@0.08"}, ctx, fb)["target_physics"]["outcome"] == "physics_failure"


def test_offline_revision_demotes_failed_route_class():
    ctx = _context()
    revised = OfflinePlanner().revise_strategy(
        ctx, [RolloutFeedback("over@0.08", "physics_failure", "x", 0.05, 1)], IDS)
    assert revised.ranking.index("over@0.12") > revised.ranking.index("direct@0.00")
    assert revised.ranking[0] == "over@0.08"  # tried ids keep their place at the front


# ---------------------------------------------------------------- end to end with a mocked model
def _wait(client, run_id, timeout=120.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("succeeded", "failed"):
            return run
        time.sleep(0.2)
    raise TimeoutError(run_id)


@pytest.fixture(scope="module")
def client():
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c


@pytest.fixture(scope="module")
def skill_7(client):
    r = client.post("/api/runs/discover", json={"robot_id": "panda_01", "scene_seed": 7})
    run = _wait(client, r.json()["run_id"])
    return client.post("/api/skills", json={"run_id": run["run_id"]}).json()


def test_meta_mode_without_key_is_refused(client, skill_7, monkeypatch):
    monkeypatch.setattr("app.api.transfers.meta_available", lambda: False)
    r = client.post("/api/transfers", json={"source_skill_id": skill_7["skill_id"], "reasoning_mode": "meta"})
    assert r.status_code == 409 and "MODEL_API_KEY" in r.json()["detail"]


def test_offline_transfer_records_no_model(client, skill_7):
    r = client.post("/api/transfers", json={"source_skill_id": skill_7["skill_id"]})
    run = _wait(client, r.json()["run_id"])
    rs = run["results"]["reasoning"]
    assert run["model_used"] is None and rs["provider_used"] == "offline_deterministic" and rs["model_calls"] == 0
    futures = [c for c in run["results"]["candidates"] if c.get("physics")]
    assert len(futures) >= 2  # multiple simulated futures before selection
    for f in futures:
        assert f["physics"]["trace_task"] and client.get(f["physics"]["thumbnail"]).status_code == 200


def test_mocked_meta_transfer_can_change_selection(client, skill_7, monkeypatch):
    def scripted(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_completion(_tool_call(
            "submit_ranking", {"ranking": ["over@0.12", "over@0.08"], "rationale": "prefer wider clearance"})))

    monkeypatch.setattr("app.api.transfers.meta_available", lambda: True)
    monkeypatch.setattr("app.services.transfer.get_provider",
                        lambda mode: MetaMuseProvider("k", "muse-spark-1.3", transport=httpx.MockTransport(scripted)))
    r = client.post("/api/transfers", json={"source_skill_id": skill_7["skill_id"], "reasoning_mode": "meta"})
    run = _wait(client, r.json()["run_id"])
    rs = run["results"]["reasoning"]
    assert run["status"] == "succeeded" and run["model_used"] == "muse-spark-1.3"
    assert rs["provider_used"] == "meta_muse_spark" and rs["model_calls"] == 1
    assert run["results"]["selected"] == "over@0.12"
    assert rs["offline_expected_selection"] == "over@0.08" and rs["changed_selection_vs_offline"] is True
    assert rs["estimated_cost_usd"] == pytest.approx(100 / 1e6 * 1.25 + 20 / 1e6 * 4.25)


def test_meta_failure_falls_back_to_offline_honestly(client, skill_7, monkeypatch):
    monkeypatch.setattr("app.api.transfers.meta_available", lambda: True)
    monkeypatch.setattr("app.services.transfer.get_provider", lambda mode: MetaMuseProvider(
        "k", "muse-spark-1.3", transport=httpx.MockTransport(lambda req: httpx.Response(503, text="down"))))
    r = client.post("/api/transfers", json={"source_skill_id": skill_7["skill_id"], "reasoning_mode": "meta"})
    run = _wait(client, r.json()["run_id"])
    rs = run["results"]["reasoning"]
    assert run["status"] == "succeeded" and run["model_used"] is None
    assert rs["provider_requested"] == "meta_muse_spark" and rs["provider_used"] == "offline_deterministic"
    assert "503" in rs["fallback_error"] and rs["changed_selection_vs_offline"] is False
    assert rs["model_calls"] == 0 and rs["estimated_cost_usd"] is None  # offline fallback is not a paid call


def test_cost_uses_the_configured_models_price():
    calls = (ReasoningCall(kind="propose", summary="", prompt_tokens=1_000_000, completion_tokens=1_000_000),)
    assert estimated_cost_usd(calls, "muse-spark-1.3") == pytest.approx(1.25 + 4.25)
    assert estimated_cost_usd(calls, "muse-spark-1.3-contributor") == pytest.approx(0.10 + 0.20)
    assert estimated_cost_usd(calls, "unpriced-model") is None


def test_meta_final_answer_tolerates_text_around_the_json():
    wrapped = 'Ranking ready:\n```json\n{"ranking": ["over@0.12"], "rationale": "wider"}\n```'
    script = Script([httpx.Response(200, json=_completion({"role": "assistant", "content": wrapped}))])
    assert _provider(script).propose_strategies(_context()).ranking[0] == "over@0.12"


def test_meta_failure_keeps_the_paid_calls():
    loop = [httpx.Response(200, json=_completion(_tool_call("inspect_skill", {}, f"c{i}")))
            for i in range(MAX_TOOL_ROUNDS)]
    prose = httpx.Response(200, json=_completion({"role": "assistant", "content": "still thinking"}))
    with pytest.raises(MetaReasoningError) as info:
        _provider(Script([*loop, prose])).propose_strategies(_context())
    assert len(info.value.calls) == MAX_TOOL_ROUNDS + 1
    assert sum(c.prompt_tokens for c in info.value.calls) == 100 * (MAX_TOOL_ROUNDS + 1)


def test_meta_fallback_run_still_records_spend(client, skill_7, monkeypatch):
    prose = lambda req: httpx.Response(200, json=_completion({"role": "assistant", "content": "no json"}))
    monkeypatch.setattr("app.api.transfers.meta_available", lambda: True)
    monkeypatch.setattr("app.services.transfer.get_provider",
                        lambda mode: MetaMuseProvider("k", "muse-spark-1.3", transport=httpx.MockTransport(prose)))
    r = client.post("/api/transfers", json={"source_skill_id": skill_7["skill_id"], "reasoning_mode": "meta"})
    run = _wait(client, r.json()["run_id"])
    rs = run["results"]["reasoning"]
    assert run["status"] == "succeeded" and run["model_used"] is None
    assert rs["provider_used"] == "offline_deterministic" and rs["model_id"] is None
    assert rs["model_requested"] == "muse-spark-1.3" and rs["model_calls"] == 1
    assert rs["estimated_cost_usd"] == pytest.approx(100 / 1e6 * 1.25 + 20 / 1e6 * 4.25)
