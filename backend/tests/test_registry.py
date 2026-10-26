from __future__ import annotations

from app.models.run import RunEvent
from app.services.jobs import create_run
from app.services.registry import Registry, utcnow


def test_run_roundtrip_and_immutable_event_append(tmp_path):
    reg = Registry(tmp_path / "r.db")
    run = create_run(reg, "motion_check", 7, planner="p", source_robot_id="panda_01")
    assert reg.get_run(run.run_id) == run and run.status == "queued"
    updated = reg.append_event(
        run.run_id, RunEvent(at=utcnow(), status="executing", message="go"), collision_count=0
    )
    assert updated.status == "executing" and len(updated.events) == 2
    assert run.status == "queued" and len(run.events) == 1  # original untouched
    assert reg.get_run(run.run_id) == updated


def test_list_runs_filters(tmp_path):
    reg = Registry(tmp_path / "r.db")
    a = create_run(reg, "motion_check", 1, planner="p", source_robot_id="panda_01")
    b = create_run(reg, "motion_check", 2, planner="p", source_robot_id="ur5e_01")
    assert {r.run_id for r in reg.list_runs()} == {a.run_id, b.run_id}
    assert [r.run_id for r in reg.list_runs(robot_id="ur5e_01")] == [b.run_id]
    assert reg.list_runs(run_type="transfer") == []


def test_failed_discover_run_cannot_publish(tmp_path):
    import pytest

    from app.services.jobs import RunContext
    from app.services.skill_registry import PublishError, publish_from_run

    reg = Registry(tmp_path / "r.db")
    run = create_run(reg, "discover", 3, planner="route_search_v1", source_robot_id="panda_01")
    RunContext(reg, run.run_id).finish(False, "No candidate verified in physics",
                                       results={"capsule_draft": None})
    with pytest.raises(PublishError, match="only succeeded runs"):
        publish_from_run(reg, run.run_id)
    assert reg.list_skills() == []
