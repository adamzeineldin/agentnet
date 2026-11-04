"""Private workspaces: new work is private to its owner, others never see it (API, lists, files), and making it
public or private carries what must change with it, refusing changes that would break someone else's work."""

from __future__ import annotations

import itertools
import sqlite3
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import auth as auth_api
from app.api import deps, password_auth
from app.main import create_app
from app.models.run import RunRecord
from app.services.jobs import create_run
from app.services.registry import Registry
from app.services.robot_catalog import ROBOTS, unregister
from app.services.skill_registry import publish_from_run
from tests import factories

SECRET = "test-secret"
EXAMPLE = Path(__file__).resolve().parents[2] / "frontend" / "public" / "examples" / "nimbotics-capsule-arm.xml"


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(deps, "SESSION_SECRET", SECRET)
        mp.setattr(auth_api, "SESSION_SECRET", SECRET)
        mp.setattr("app.main.DATABASE", tmp_path_factory.mktemp("sharing") / "sharing.db")
        password_auth.SIGNUPS.clear()
        with TestClient(create_app()) as c:
            yield c
    for rid in [r for r, d in ROBOTS.items() if d.source == "upload" and r.startswith("up_private_arm")]:
        unregister(rid)


class Person:
    """One signed-in account; calls go out with its session cookie."""

    def __init__(self, client: TestClient, name: str) -> None:
        self.client = client
        made = client.post("/api/auth/register", json={
            "name": name, "email": f"{name}.{uuid.uuid4().hex[:8]}@example.com", "password": "correct horse battery"})
        assert made.status_code == 201, made.text
        self.user_id = made.json()["user_id"]
        self.cookie = client.cookies.get(deps.SESSION_COOKIE)
        client.cookies.clear()

    def _call(self, method: str, url: str, **kw):
        self.client.cookies.clear()
        self.client.cookies.set(deps.SESSION_COOKIE, self.cookie)
        try:
            return self.client.request(method, url, **kw)
        finally:
            self.client.cookies.clear()

    def get(self, url: str, **kw):
        return self._call("GET", url, **kw)

    def post(self, url: str, **kw):
        return self._call("POST", url, **kw)


@pytest.fixture(scope="module")
def ada(client) -> Person:
    return Person(client, "Ada")


@pytest.fixture(scope="module")
def bob(client) -> Person:
    return Person(client, "Bob")


def _wait(person: Person, run_id: str, timeout: float = 120.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = person.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("succeeded", "failed"):
            return run
        time.sleep(0.2)
    raise TimeoutError(run_id)


_LAYOUTS = itertools.count(100)


def _saved_skill(registry: Registry, owner: str | None, robot: str = "panda_01", parent: str | None = None,
                 seed: int | None = None, route: str = "far_side", seconds: float = 1.0):
    """A succeeded discover run of `owner` with a verified skill saved from it (no simulation needed).

    Each skill gets its own layout unless `seed` is given, so tests do not collide with the no-duplicates rule."""
    seed = next(_LAYOUTS) if seed is None else seed
    run = create_run(registry, "discover", seed, "test", source_robot_id=robot, owner_id=owner)
    skill_id = f"skill_{uuid.uuid4().hex[:8]}"
    draft = factories.capsule(skill_id, robot=robot, seed=seed, route=route, parent=parent,
                              lineage=(parent,) if parent else ())
    draft = draft.model_copy(update={"provenance": {"run_id": run.run_id},
                                     "validation": draft.validation.model_copy(update={"simulated_seconds": seconds})})
    registry.save_run(run.model_copy(update={"status": "succeeded",
                                             "results": {"capsule_draft": draft.model_dump(mode="json")}}))
    return publish_from_run(registry, run.run_id)


def _change(person: Person, kind: str, item_id: str, visibility: str, confirm: bool = False):
    return person.post("/api/visibility", json={"kind": kind, "id": item_id, "visibility": visibility,
                                                "confirm": confirm})


# ---------------------------------------------------------------- new work is private
def test_a_signed_in_users_run_is_private_to_them(client, ada, bob):
    r = ada.post("/api/robots/panda_01/motion-check", json={"seed": 0})
    assert r.status_code == 202, r.text
    run = r.json()
    assert run["visibility"] == "private" and run["mine"] and "owner_id" not in run
    done = _wait(ada, run["run_id"])
    assert done["status"] == "succeeded" and done["mine"]

    assert bob.get(f"/api/runs/{run['run_id']}").status_code == 404
    assert client.get(f"/api/runs/{run['run_id']}").status_code == 404
    assert bob.get(f"/api/runs/{run['run_id']}/events").status_code == 404
    assert bob.get(f"/api/runs/{run['run_id']}/live").status_code == 404
    assert run["run_id"] not in {r["run_id"] for r in bob.get("/api/runs").json()}
    assert run["run_id"] in {r["run_id"] for r in ada.get("/api/runs?mine=true").json()}
    assert bob.get("/api/runs?mine=true").json() == []

    video = next(v for v in done["artifacts"].values() if v.endswith(".mp4"))
    mine = ada.get(video)
    assert mine.status_code == 200 and mine.headers["cache-control"] == "private, no-store"
    assert bob.get(video).status_code == 404
    assert client.get(video).status_code == 404


def test_a_skill_saved_from_a_private_run_is_private(client, ada, bob):
    skill = _saved_skill(client.app.state.registry, ada.user_id)
    assert skill.visibility == "private"
    assert ada.get(f"/api/skills/{skill.skill_id}").json()["capsule"]["mine"]
    assert bob.get(f"/api/skills/{skill.skill_id}").status_code == 404
    assert skill.skill_id not in {s["skill_id"] for s in bob.get("/api/skills").json()}
    assert skill.skill_id in {s["skill_id"] for s in ada.get("/api/skills?mine=true").json()}
    # Nobody can adapt or improve from a skill they cannot see.
    r = bob.post("/api/transfers", json={"source_skill_id": skill.skill_id, "target_robot_id": "ur5e_01"})
    assert r.status_code == 404


def test_only_the_run_owner_saves_its_skill(client, ada, bob):
    registry = client.app.state.registry
    run = create_run(registry, "discover", 7, "test", source_robot_id="panda_01", owner_id=ada.user_id)
    registry.save_run(run.model_copy(update={"visibility": "public"}))
    assert bob.post("/api/skills", json={"run_id": run.run_id}).status_code == 403


# ---------------------------------------------------------------- making things public / private
def test_making_a_skill_public_brings_its_run_and_private_robot_after_asking(client, ada, bob):
    registry = client.app.state.registry
    registry.save_uploaded_robot("up_fake_bot", "{}", ada.user_id, "private")
    skill = _saved_skill(registry, ada.user_id, robot="up_fake_bot")

    asked = _change(ada, "skill", skill.skill_id, "public")
    assert asked.status_code == 409
    also = {(i["kind"], i["id"]) for i in asked.json()["detail"]["also"]}
    assert also == {("run", skill.provenance["run_id"]), ("robot", "up_fake_bot")}
    assert registry.get_skill(skill.skill_id).visibility == "private"  # nothing changed yet

    done = _change(ada, "skill", skill.skill_id, "public", confirm=True)
    assert done.status_code == 200 and done.json()["applied"]
    assert bob.get(f"/api/skills/{skill.skill_id}").json()["capsule"]["mine"] is False
    assert bob.get(f"/api/runs/{skill.provenance['run_id']}").status_code == 200
    assert registry.robot_access()["up_fake_bot"] == (ada.user_id, "public")


def test_nothing_else_to_change_needs_no_confirmation(client, ada, bob):
    registry = client.app.state.registry
    run = create_run(registry, "motion_check", 0, "test", source_robot_id="panda_01", owner_id=ada.user_id)
    assert _change(ada, "run", run.run_id, "public").json()["also"] == []
    assert bob.get(f"/api/runs/{run.run_id}").status_code == 200
    assert _change(ada, "run", run.run_id, "private").status_code == 200
    assert bob.get(f"/api/runs/{run.run_id}").status_code == 404


def test_hiding_a_skill_someone_else_built_on_is_refused(client, ada, bob):
    registry = client.app.state.registry
    skill = _saved_skill(registry, ada.user_id)
    _change(ada, "skill", skill.skill_id, "public", confirm=True)
    # Bob adapts Ada's public skill: his transfer run and the skill saved from it name hers as their source.
    bobs = _saved_skill(registry, bob.user_id, robot="ur5e_01", parent=skill.skill_id)
    assert bobs.parent_skill_id == skill.skill_id

    r = _change(ada, "skill", skill.skill_id, "private")
    assert r.status_code == 409 and "Someone else's work uses it" in r.json()["detail"]
    assert registry.get_skill(skill.skill_id).visibility == "public"


def test_publishing_what_depends_on_someone_elses_private_work_is_refused(client, ada, bob):
    registry = client.app.state.registry
    registry.save_uploaded_robot("up_bobs_secret", "{}", bob.user_id, "private")
    run = create_run(registry, "motion_check", 0, "test", source_robot_id="up_bobs_secret", owner_id=ada.user_id)
    r = _change(ada, "run", run.run_id, "public")
    assert r.status_code == 409 and "keeps private" in r.json()["detail"]


def test_only_the_owner_changes_visibility(client, ada, bob):
    registry = client.app.state.registry
    skill = _saved_skill(registry, ada.user_id)
    _change(ada, "skill", skill.skill_id, "public", confirm=True)
    assert _change(bob, "skill", skill.skill_id, "private").status_code == 403
    assert _change(bob, "skill", "skill_missing", "public").status_code == 404
    assert _change(bob, "robot", "panda_01", "private").status_code == 409  # catalog arms are always public


def test_work_from_before_accounts_stays_public(client, ada):
    legacy = _saved_skill(client.app.state.registry, None)
    assert legacy.visibility == "public"
    r = _change(ada, "skill", legacy.skill_id, "private")
    assert r.status_code == 409 and "before accounts" in r.json()["detail"]


# ---------------------------------------------------------------- private robots
def test_an_uploaded_robot_is_private_until_its_owner_shares_it(client, ada, bob):
    r = ada.post("/api/robots/upload", params={"name": f"Private arm {uuid.uuid4().hex[:4]}",
                                               "filename": EXAMPLE.name}, content=EXAMPLE.read_bytes())
    assert r.status_code == 201, r.text
    robot = r.json()["robot"]
    rid = robot["robot_id"]
    assert robot["visibility"] == "private" and robot["mine"]

    assert rid in {x["robot_id"] for x in ada.get("/api/robots?mine=true").json()}
    assert rid not in {x["robot_id"] for x in bob.get("/api/robots").json()}
    assert rid not in {x["robot_id"] for x in bob.get("/api/robots/catalog").json()}
    assert bob.get(f"/api/robots/{rid}").status_code == 404
    assert bob.post(f"/api/robots/{rid}/motion-check", json={"seed": 0}).status_code == 404
    assert bob.post("/api/library/check", json={"robot_id": rid, "task_family": "wall_reach_v1"}).status_code == 404
    snapshot = robot["snapshot_url"]
    assert ada.get(snapshot).status_code == 200 and bob.get(snapshot).status_code == 404

    assert _change(ada, "robot", rid, "public").status_code == 200
    seen = {x["robot_id"]: x for x in bob.get("/api/robots").json()}
    assert seen[rid]["visibility"] == "public" and not seen[rid]["mine"]
    assert bob.get(snapshot).status_code == 200


# ---------------------------------------------------------------- sign-in off, old databases
def test_with_sign_in_off_everything_is_public(tmp_path):
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.main.DATABASE", tmp_path / "open.db")
        mp.setattr(deps, "SESSION_SECRET", None)  # this module's client fixture turned it on
        with TestClient(create_app()) as c:
            run = c.post("/api/robots/panda_01/motion-check", json={"seed": 0}).json()
            assert run["visibility"] == "public" and not run["mine"]
            r = c.post("/api/visibility", json={"kind": "run", "id": run["run_id"], "visibility": "private"})
            assert r.status_code == 409 and "everything is public" in r.json()["detail"]


def test_an_old_database_gains_the_columns_and_reads_as_public(tmp_path):
    path = tmp_path / "old.db"
    run = RunRecord(run_id="run_old", run_type="discover", status="succeeded", task_seed=1, planner="p",
                    simulator="s", created_at=datetime(2026, 10, 1, tzinfo=UTC))
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE runs (run_id VARCHAR PRIMARY KEY, run_type VARCHAR, status VARCHAR, "
                   "payload JSON, created_at DATETIME)")
        db.execute("INSERT INTO runs VALUES (?, ?, ?, ?, ?)",
                   ("run_old", "discover", "succeeded", run.model_dump_json(exclude={"visibility", "mine"}),
                    "2026-10-01 00:00:00.000000"))
    registry = Registry(path)
    old = registry.get_run("run_old", viewer=None)
    assert old is not None and old.visibility == "public" and old.owner_id is None
    assert [r.run_id for r in registry.list_runs(viewer="someone")] == ["run_old"]


# ---------------------------------------------------------------- no duplicates, and who shared what
def test_making_public_records_who_shared_it_and_private_clears_it(client, ada, bob):
    skill = _saved_skill(client.app.state.registry, ada.user_id)
    assert _change(ada, "skill", skill.skill_id, "public", confirm=True).status_code == 200
    seen = bob.get(f"/api/skills/{skill.skill_id}").json()["capsule"]
    assert seen["published_by"] == "Ada" and seen["published_at"]
    run = bob.get(f"/api/runs/{skill.provenance['run_id']}").json()
    assert run["published_by"] == "Ada"  # the run went public with it, under the same name
    assert _change(ada, "skill", skill.skill_id, "private", confirm=True).status_code == 200
    mine = ada.get(f"/api/skills/{skill.skill_id}").json()["capsule"]
    assert mine["published_by"] is None and mine["published_at"] is None


def test_a_second_public_skill_for_the_same_robot_and_layout_must_be_better(client, ada, bob):
    registry = client.app.state.registry
    first = _saved_skill(registry, ada.user_id, seed=900)
    _change(ada, "skill", first.skill_id, "public", confirm=True)

    same = _saved_skill(registry, bob.user_id, seed=900)
    r = _change(bob, "skill", same.skill_id, "public", confirm=True)
    assert r.status_code == 409
    assert "already has the Panda's skill on" in r.json()["detail"] and "(shared by Ada)" in r.json()["detail"]
    assert registry.get_skill(same.skill_id).visibility == "private"  # nothing changed, its run included
    assert registry.get_run(same.provenance["run_id"]).visibility == "private"

    faster = _saved_skill(registry, bob.user_id, seed=900, seconds=0.5)
    assert _change(bob, "skill", faster.skill_id, "public", confirm=True).status_code == 200
    # Another robot on the same layout is not a duplicate.
    other = _saved_skill(registry, bob.user_id, robot="ur5e_01", seed=900)
    assert _change(bob, "skill", other.skill_id, "public", confirm=True).status_code == 200


def test_the_same_robot_model_is_made_public_only_once(client, ada, bob):
    model = b"<mujoco><worldbody><body name='puck'><freejoint/><geom size='0.1'/></body></worldbody></mujoco>"

    def store(person: Person, name: str) -> str:
        r = person.post("/api/robots/upload", params={"name": name, "filename": "puck.xml", "mode": "model_only"},
                        content=model)
        assert r.status_code == 201, r.text
        return r.json()["model"]["robot_id"]

    adas, bobs = store(ada, "Puck"), store(bob, "Hockey puck")
    assert _change(ada, "robot", adas, "public").status_code == 200
    r = _change(bob, "robot", bobs, "public")
    assert r.status_code == 409 and "already public as the Puck (shared by Ada)" in r.json()["detail"]
    shown = {m["robot_id"]: m for m in client.get("/api/robots/models").json()}
    assert shown[adas]["published_by"] == "Ada" and bobs not in shown
