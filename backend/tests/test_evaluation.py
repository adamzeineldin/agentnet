from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.candidate_search import prepare
from app.services.evaluation import (
    PHYSICS_BUDGET, Row, common_scene_ids, run_variant, scene_features, summarize, variant_orders,
)
from app.services.robot_catalog import ROBOTS
from app.services.route_planner import generate_candidates
from app.services.task_scene import default_placement, ROOF_FAMILY, SCENE_FAMILY, generate_task


def test_roof_family_is_deterministic_and_distinct():
    a, b = generate_task(5, ROOF_FAMILY), generate_task(5, ROOF_FAMILY)
    assert a == b and a.scene_id == "wall_roof_v1_s5" and len(a.obstacles) == 2
    roof = next(o for o in a.obstacles if o.name == "roof")
    wall = next(o for o in a.obstacles if o.name == "wall")
    assert roof.lo[2] > wall.hi[2]  # roof sits above the wall with a gap
    with pytest.raises(ValueError):
        generate_task(1, "nope")


def test_scene_features_fixed_length():
    assert scene_features(generate_task(1)).shape == scene_features(generate_task(1, ROOF_FAMILY)).shape


@pytest.fixture(scope="module")
def ur5e_setup():
    task = generate_task(42)
    setup = prepare(ROBOTS["ur5e_01"], task, default_placement("ur5e_01"), 42)
    assert setup is not None
    return task, setup


def test_lazy_variant_stops_at_first_success(ur5e_setup):
    task, setup = ur5e_setup
    res = run_variant(setup, generate_candidates(task))
    assert res["success"] and res["rollouts_to_first_success"] == res["physics_rollouts"] <= PHYSICS_BUDGET
    assert res["kinematic_evaluations"] < 10  # stopped early
    assert res["endpoint_error_m"] < 0.01


def test_lazy_variant_respects_budget_and_records_failure(ur5e_setup):
    task, setup = ur5e_setup
    direct_only = [c for c in generate_candidates(task) if c.route_class == "direct"]
    res = run_variant(setup, direct_only)
    assert not res["success"] and res["physics_rollouts"] == 0 and res["kinematic_evaluations"] == 1


def test_variant_orders_without_capsule_only_baseline_applicable():
    orders = variant_orders(generate_task(1), None)
    assert orders["baseline_no_sharing"] and orders["retarget_only"] is None and orders["nimbotics_offline"] is None


def _row(variant, scene, applicable=True, success=True, family=SCENE_FAMILY, rollouts=1):
    return Row(variant=variant, family=family, seed=1, scene_id=scene, applicable=applicable, success=success,
               selected="x" if success else None, kinematic_evaluations=2, physics_rollouts=rollouts,
               rollouts_to_first_success=rollouts if success else None, endpoint_error_m=0.001 if success else None,
               collisions_in_rollouts=0, sim_steps=10, wall_time_s=0.1, api_calls=0, source_skill=None,
               source_strategy=None, note="")


def test_summary_common_subset_excludes_partially_applicable_scenes():
    rows = [
        _row("baseline_no_sharing", "a"), _row("retarget_only", "a", success=False), _row("nimbotics_offline", "a"),
        _row("baseline_no_sharing", "b"), _row("retarget_only", "b", applicable=False, success=False),
        _row("nimbotics_offline", "b", applicable=False, success=False),
    ]
    assert common_scene_ids(rows) == {"a"}
    s = summarize(rows)
    assert s["baseline_no_sharing"]["all"]["successes"] == 2 and s["baseline_no_sharing"]["common"]["applicable"] == 1
    assert s["retarget_only"]["common"]["success_rate"] == 0.0
    assert s["nimbotics_offline"]["all"]["applicable"] == 1


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def test_benchmark_api_overlap_rejected(client):
    r = client.post("/api/benchmarks", json={"dev_seeds": [1, 2], "eval_seeds": [2, 3]})
    assert r.status_code == 422


def test_benchmark_api_small_run(client):
    r = client.post("/api/benchmarks", json={"families": ["wall_reach_v1"], "dev_seeds": [0, 1], "eval_seeds": [100]})
    assert r.status_code == 202
    run_id = r.json()["run_id"]
    deadline = time.time() + 120
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("succeeded", "failed"):
            break
        time.sleep(0.3)
    assert run["status"] == "succeeded", run["events"][-1]
    res = run["results"]
    assert {r["variant"] for r in res["rows"]} == {"baseline_no_sharing", "retarget_only", "nimbotics_offline"}
    assert all(r["scene_id"] == "wall_reach_v1_s100" for r in res["rows"])
    assert set(res["summary"]) == {"baseline_no_sharing", "retarget_only", "nimbotics_offline"}
    assert res["protocol"]["eval_seeds"] == [100] and len(res["dev_library"]) == 2
    assert client.get("/api/benchmarks").json()[0]["run_id"] == run_id
    assert client.get("/api/skills").json() == [] or all(
        not s["provenance"]["run_id"].startswith("eval-dev") for s in client.get("/api/skills").json())


def test_paired_comparison_counts_wins_and_losses():
    from app.services.evaluation import paired_vs_baseline

    rows = [
        _row("baseline_no_sharing", "a"), _row("nimbotics_offline", "a"),
        _row("baseline_no_sharing", "b"), _row("nimbotics_offline", "b", success=False),
        _row("baseline_no_sharing", "c", applicable=True), _row("nimbotics_offline", "c", applicable=False, success=False),
    ]
    rows[1] = Row(**{**rows[1].__dict__, "kinematic_evaluations": 1})
    pr = paired_vs_baseline(rows, "nimbotics_offline")
    assert pr["scenes"] == 2 and pr["both_succeeded"] == 1 and pr["only_baseline"] == 1
    assert pr["fewer_kinematic_evals"] == 1
