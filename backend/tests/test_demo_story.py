from __future__ import annotations

from app.services.demo_story import latest_story
from app.services.jobs import RunContext, create_run
from app.services.registry import Registry


def test_empty_registry_has_no_story(tmp_path):
    story = latest_story(Registry(tmp_path / "r.db"))
    assert story.source is None and story.target is None and not story.complete


def test_failed_transfer_is_never_used(tmp_path):
    reg = Registry(tmp_path / "r.db")
    run = create_run(reg, "transfer", 1, "p", source_robot_id="panda_01", target_robot_id="ur5e_01")
    RunContext(reg, run.run_id).finish(False, "nope", results={"source_skill_id": "x"})
    assert latest_story(reg).target is None
