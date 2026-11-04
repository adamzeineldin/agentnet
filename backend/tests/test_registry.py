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


def _with_task(reg: Registry, robot: str, scene_id: str) -> str:
    from app.services.jobs import RunContext

    run = create_run(reg, "discover", 1, planner="p", source_robot_id=robot)
    RunContext(reg, run.run_id).finish(True, "done", results={"task": {"scene_id": scene_id}})
    return run.run_id


def test_list_runs_filters_by_task_type_and_layout(tmp_path):
    reg = Registry(tmp_path / "r.db")
    wall = _with_task(reg, "panda_01", "wall_reach_v1_s7")
    shelf = _with_task(reg, "panda_01", "shelf_v1_s3")
    designed = _with_task(reg, "ur5e_01", "custom_reach_into_a_box_ab12_s5")
    assert [r.run_id for r in reg.list_runs(family="shelf_v1")] == [shelf]
    assert [r.run_id for r in reg.list_runs(family="custom_reach_into_a_box_ab12")] == [designed]
    assert [r.run_id for r in reg.list_runs(scene_id="wall_reach_v1_s7")] == [wall]
    assert reg.list_runs(family="wall_roof_v1") == []


def test_list_runs_pages_after_filtering_by_robot(tmp_path):
    reg = Registry(tmp_path / "r.db")
    mine = [create_run(reg, "motion_check", i, planner="p", source_robot_id="ur5e_01").run_id for i in range(2)]
    for i in range(3):  # newer runs of another robot must not push the UR5e's runs off the page
        create_run(reg, "motion_check", 10 + i, planner="p", source_robot_id="panda_01")
    assert {r.run_id for r in reg.list_runs(robot_id="ur5e_01", limit=2)} == set(mine)
    assert len(reg.list_runs(robot_id="ur5e_01", limit=1, offset=1)) == 1
