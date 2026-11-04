"""More robot kinds in uploads: a mobile manipulator, a two-armed torso and a quadruped. The arm is found (or picked
by the uploader), the rest is held still and every change is reported; a robot with no arm is kept as a model only."""

from __future__ import annotations

import math
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.robot_catalog import ROBOTS, register, unregister
from app.services.task_scene import SCENE_FAMILY, default_placement, generate_task, world_scene


def _arm(prefix: str, pos: str) -> str:
    """The shipped example's six-joint capsule arm, named with a prefix (no motors: Nimbotics adds servos)."""
    return f"""
    <body name="{prefix}base" pos="{pos}">
      <geom type="cylinder" size="0.07 0.025" pos="0 0 0.025"/>
      <body name="{prefix}shoulder" pos="0 0 0.05">
        <joint name="{prefix}base_yaw" axis="0 0 1" range="-170 170"/>
        <geom type="capsule" fromto="0 0 0.05 0 0 0.12" size="0.045"/>
        <body name="{prefix}upper_arm" pos="0 0 0.12">
          <joint name="{prefix}shoulder_pitch" axis="0 1 0" range="-110 110"/>
          <geom type="capsule" fromto="0 0 0 0 0 0.30" size="0.04"/>
          <body name="{prefix}forearm" pos="0 0 0.30">
            <joint name="{prefix}elbow_pitch" axis="0 1 0" range="-150 150"/>
            <geom type="capsule" fromto="0 0 0 0 0 0.28" size="0.035"/>
            <body name="{prefix}wrist_1" pos="0 0 0.28">
              <joint name="{prefix}wrist_roll" axis="0 0 1" range="-170 170"/>
              <geom type="capsule" fromto="0 0 0 0 0 0.06" size="0.03"/>
              <body name="{prefix}wrist_2" pos="0 0 0.06">
                <joint name="{prefix}wrist_pitch" axis="0 1 0" range="-120 120"/>
                <geom type="capsule" fromto="0 0 0 0 0 0.05" size="0.028"/>
                <body name="{prefix}flange" pos="0 0 0.05">
                  <joint name="{prefix}flange_roll" axis="0 0 1" range="-170 170"/>
                  <geom type="cylinder" size="0.03 0.008" pos="0 0 0.008"/>
                </body>
              </body>
            </body>
          </body>
        </body>
      </body>
    </body>"""


def _robot(name: str, body: str, extra: str = "") -> bytes:
    return f"""<mujoco model="{name}"><compiler angle="degree"/>
  <default><joint type="hinge" damping="0.5" armature="0.01"/><geom density="800"/></default>
  <worldbody>{body}</worldbody>{extra}</mujoco>""".encode()


WHEELS = "".join(f"""
      <body name="wheel_{w}" pos="{x} {y} -0.04"><joint name="wheel_{w}" axis="0 1 0"/>
        <geom type="cylinder" size="0.06 0.02" euler="90 0 0"/></body>"""
                 for w, x, y in (("fl", .2, .22), ("fr", .2, -.22), ("rl", -.2, .22), ("rr", -.2, -.22)))
MOBILE = _robot("mobile", f"""
    <body name="cart" pos="0 0 0.12"><freejoint name="cart_free"/><geom type="box" size="0.3 0.2 0.06" density="400"/>
      {WHEELS}{_arm("", "0 0 0.06")}
    </body>""", "<actuator>" + "".join(f'<velocity name="drive_{w}" joint="wheel_{w}" kv="5"/>'
                                       for w in ("fl", "fr", "rl", "rr")) + "</actuator>")
TORSO = _robot("torso", f"""
    <body name="torso" pos="0 0 0.4"><geom type="box" size="0.1 0.15 0.2"/>
      <body name="neck" pos="0 0 0.25"><joint name="neck_yaw" axis="0 0 1"/><geom size="0.05"/>
        <body name="head"><joint name="neck_pitch" axis="0 1 0"/><geom size="0.05" pos="0.05 0 0"/></body></body>
      {_arm("left_", "0 0.2 0.1")}{_arm("right_", "0 -0.2 0.1")}
    </body>""")
LEGS = "".join(f"""
      <body name="{leg}_hip" pos="{x} {y} 0"><joint name="{leg}_hip_roll" axis="1 0 0"/><geom size="0.03"/>
        <body name="{leg}_thigh"><joint name="{leg}_hip_pitch" axis="0 1 0"/>
          <geom type="capsule" fromto="0 0 0 0 0 -0.2" size="0.025"/>
          <body name="{leg}_calf" pos="0 0 -0.2"><joint name="{leg}_knee" axis="0 1 0"/>
            <geom type="capsule" fromto="0 0 0 0 0 -0.2" size="0.02"/></body></body></body>"""
               for leg, x, y in (("fl", .2, .1), ("fr", .2, -.1), ("rl", -.2, .1), ("rr", -.2, -.1)))
QUADRUPED = _robot("quadruped", f"""
    <body name="trunk" pos="0 0 0.42"><freejoint/><geom type="box" size="0.25 0.1 0.05"/>{LEGS}</body>""")


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.main.DATABASE", tmp_path_factory.mktemp("kinds") / "kinds.db")
        with TestClient(create_app()) as c:
            yield c
    for rid in [r for r, d in ROBOTS.items() if d.source == "upload" and r.startswith(("up_mobile", "up_torso"))]:
        unregister(rid)


def _upload(client, name: str, data: bytes, **params):
    return client.post("/api/robots/upload", params={"name": name, "filename": "robot.xml", **params}, content=data)


def test_a_mobile_manipulator_runs_with_its_arm_and_the_base_held_still(client):
    r = _upload(client, "Mobile arm", MOBILE)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["robot"]["dof"] == 6
    notes = " ".join(body["notes"])
    assert "'cart' is fixed at its home pose" in notes
    assert "Held 4 joints outside the arm still" in notes and "wheel_fl" in notes
    assert "Removed 4 motors" in notes
    assert body["robot"]["robot_id"] in {x["robot_id"] for x in client.get("/api/robots").json()}


def test_a_two_armed_torso_asks_which_arm_and_holds_the_other_still(client):
    asked = _upload(client, "Torso", TORSO)
    assert asked.status_code == 409
    options = asked.json()["detail"]["options"]
    assert {(o["tool"], o["joints"]) for o in options} == {("left_flange", 6), ("right_flange", 6)}  # not the head

    r = _upload(client, "Torso", TORSO, tool="left_flange")
    assert r.status_code == 201, r.text
    assert r.json()["robot"]["dof"] == 6
    notes = " ".join(r.json()["notes"])
    assert "Held 8 joints outside the arm still" in notes
    assert "mounted on 'left_base' at 0.50 m" in notes and "in front of its mount" in notes
    # Tasks sit in front of the left arm's base plate (0, 0.2, 0.5), not the world origin.
    placement = default_placement(r.json()["robot"]["robot_id"])
    decl = ROBOTS[r.json()["robot"]["robot_id"]]
    assert placement.translation == pytest.approx((decl.task_distance_m, 0.2, 0.5))
    assert placement.mount == pytest.approx((0.0, 0.2, 0.5)) and placement.yaw_rad == 0.0


def test_a_mount_facing_sideways_turns_the_task_and_its_boxes(tmp_path):
    decl = replace(ROBOTS["panda_01"], robot_id="up_test_turned", source="upload",
                   mount=(1.0, 0.0, 0.3, math.pi / 2 + 0.02))
    register(decl)
    try:
        placement = default_placement("up_test_turned")
    finally:
        unregister("up_test_turned")
    assert placement.yaw_rad == pytest.approx(math.pi / 2)
    assert placement.translation == pytest.approx((1.0, decl.task_distance_m, 0.3))
    assert "rounded" not in placement.rationale  # 1° off a quarter turn needs no note
    task = generate_task(7, SCENE_FAMILY)
    scene = world_scene(task, placement)
    assert scene.obstacles[0].half_size == (task.obstacles[0].half_size[1], task.obstacles[0].half_size[0],
                                            task.obstacles[0].half_size[2])
    with pytest.raises(ValueError, match="quarter-turn"):
        world_scene(task, placement.model_copy(update={"yaw_rad": 0.3}))


def test_a_quadruped_is_kept_as_a_model_only(client):
    asked = _upload(client, "Dog", QUADRUPED)
    assert asked.status_code == 409 and len(asked.json()["detail"]["options"]) == 4  # four legs could be "arms"

    r = _upload(client, "Dog", QUADRUPED, mode="model_only")
    assert r.status_code == 201, r.text
    model = r.json()["model"]
    assert r.json()["robot"] is None
    assert model["joints"] == 12 and model["bodies"] == 13 and "cannot run tasks" in model["notes"][0]
    rid = model["robot_id"]
    assert rid not in {x["robot_id"] for x in client.get("/api/robots").json()}
    assert rid not in ROBOTS
    assert rid in {m["robot_id"] for m in client.get("/api/robots/models").json()}
    assert client.get(model["snapshot_url"]).status_code == 200
    assert _upload(client, "Dog", QUADRUPED, mode="model_only").status_code == 422  # same model, same name


def test_a_robot_without_any_arm_points_to_model_only(client):
    detail = _upload(client, "Ball", _robot("ball", "<body name='b'><freejoint/><geom size='0.1'/></body>")).json()
    assert "No arm of 3 to 10 joints" in detail["detail"] and "model only" in detail["detail"]
