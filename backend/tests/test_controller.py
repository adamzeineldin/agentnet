"""Controller execution (URSim via ur_bridge): frames, streaming, metrics and the transfer step.

The controller is mocked: httpx.MockTransport → the real ur_bridge.BridgeApp → a fake UR whose TCP comes from
the UR5e MuJoCo model expressed in the UR controller's base frame. No URSim, no ur_rtde, no network.
"""

from __future__ import annotations

import json
import time

import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import MAX_JOINT_SPEED_RAD_S
from app.main import create_app
from app.services import controller
from app.services.controller.bridge_client import BridgeClient
from app.services.controller.execution import (
    CONTROLLER_LABEL,
    controller_samples,
    run_on_controller,
    to_controller_frame,
)
from app.services.robot_catalog import get_robot_decl
from ur_bridge.server import BridgeApp

UR5E = get_robot_decl("ur5e_01")

# Measured on URSim 5.26.3 (UR5e, e-series image) on 2026-10-29: actual TCP position (m) at these joints,
# against the same joints in the Menagerie UR5e. Kept as a regression check of the declared base-frame rotation.
URSIM_MEASURED = [
    ((-1.571, -1.571, 1.571, -1.571, -1.571, 0.0), (-0.1333, 0.4919, 0.4879)),
    ((-0.063, -1.021, 0.704, -1.159, -0.326, 0.05), (-0.704, -0.1838, 0.6059)),
]


class FakeUR:
    """Perfect tracker; TCP from MuJoCo FK in the controller frame. Optional protective stop."""

    def __init__(self, adapter, q0, stop_after: int | None = None) -> None:
        self.adapter, self.data = adapter, adapter.new_data()
        self.q = list(q0)
        self.stop_after, self.servo_count, self.safety = stop_after, 0, 1

    def moveJ(self, q, speed, accel):  # noqa: N802
        self.q = list(q)
        return True

    def servoJ(self, q, speed, accel, dt, lookahead, gain):  # noqa: N802
        self.servo_count += 1
        if self.stop_after is not None and self.servo_count > self.stop_after:
            self.safety = 3
            return False
        self.q = list(q)
        return True

    def servoStop(self, decel=10.0):  # noqa: N802
        pass

    def initPeriod(self):  # noqa: N802
        return 0

    def waitPeriod(self, t0):  # noqa: N802
        pass

    def stopScript(self):  # noqa: N802
        pass

    def getActualQ(self):  # noqa: N802
        return list(self.q)

    def getActualQd(self):  # noqa: N802
        return [0.0] * 6

    def getActualTCPPose(self):  # noqa: N802
        p = to_controller_frame(self.adapter, UR5E, self.adapter.fk(self.data, np.array(self.q)))
        return [*p, 0.0, 3.14, 0.0]

    def getSafetyMode(self):  # noqa: N802
        return self.safety

    def getRobotMode(self):  # noqa: N802
        return 7

    def isProtectiveStopped(self):  # noqa: N802
        return self.safety == 3

    def polyscopeVersion(self):  # noqa: N802
        return "URSoftware 5.26.3.140631 (Oct 12 2026)"

    def getRobotModel(self):  # noqa: N802
        return "UR5"

    def isInRemoteControl(self):  # noqa: N802
        return True


def mock_client(robot) -> BridgeClient:
    app = BridgeApp(open_control=lambda: robot, open_receive=lambda: robot, open_dashboard=lambda: robot)

    def handler(request: httpx.Request) -> httpx.Response:
        code, body = app.handle(request.method, request.url.path, request.content)
        return httpx.Response(code, json=body)

    return BridgeClient("http://ur-bridge.test", transport=httpx.MockTransport(handler))


def unreachable_client() -> BridgeClient:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    return BridgeClient("http://ur-bridge.test", transport=httpx.MockTransport(handler))


def short_path(ur5e) -> list[tuple[float, ...]]:
    home = ur5e.home_q()
    return [tuple(home + np.array([0.3 * k / 4, -0.2 * k / 4, 0.1 * k / 4, 0, 0, 0])) for k in range(5)]


@pytest.mark.parametrize("q, measured", URSIM_MEASURED)
def test_controller_frame_matches_ursim_measurement(ur5e, q, measured):
    p = to_controller_frame(ur5e, UR5E, ur5e.fk(ur5e.new_data(), np.array(q)))
    assert np.linalg.norm(p - np.array(measured)) < 0.002


def test_panda_has_no_controller_and_ur5e_declares_its_frame():
    assert get_robot_decl("panda_01").controller is None
    assert UR5E.controller is not None and UR5E.controller.base_yaw_deg == 180.0
    assert "URSim" in UR5E.controller.note


def test_controller_samples_follow_the_mujoco_timing_rule(ur5e):
    path = short_path(ur5e)
    samples = controller_samples(path, hz=125.0)
    assert np.allclose(samples[0], path[0]) and np.allclose(samples[-1], path[-1])
    assert np.abs(np.diff(samples, axis=0)).max() <= MAX_JOINT_SPEED_RAD_S / 125.0 + 1e-9


def test_successful_controller_run_is_labelled_and_measured(ur5e):
    path = short_path(ur5e)
    target = ur5e.fk(ur5e.new_data(), np.array(path[-1]))
    out = run_on_controller(mock_client(FakeUR(ur5e, ur5e.home_q())), ur5e, UR5E, path, target)
    assert out.status == "succeeded" and out.error is None
    assert out.label == CONTROLLER_LABEL == "URSim controller, not physical"
    assert out.controller_version.startswith("URSoftware 5.26") and out.robot_model == "UR5"
    assert out.path_waypoints == 5 and out.commanded_samples > 5
    assert out.final_joint_error_rad < 1e-9 and out.path_deviation_rad < 1e-9
    assert out.tcp_vs_model_mm < 0.01 and out.tcp_to_target_mm < 0.01
    assert all(out.checks.values()) and out.protective_stopped is False
    assert 0 < len(out.trace) <= 200
    assert any("not physical-world evidence" in n for n in out.notes)


def test_unreachable_bridge_is_a_failed_controller_run_not_an_exception(ur5e):
    path = short_path(ur5e)
    out = run_on_controller(unreachable_client(), ur5e, UR5E, path, np.zeros(3))
    assert out.status == "failed" and "unreachable" in out.error
    assert out.trace == [] and out.final_joint_error_rad is None


def test_protective_stop_fails_the_controller_run(ur5e):
    path = short_path(ur5e)
    out = run_on_controller(mock_client(FakeUR(ur5e, ur5e.home_q(), stop_after=3)), ur5e, UR5E, path, np.zeros(3))
    assert out.status == "failed" and "protective stop" in out.error
    assert out.protective_stopped is True and out.checks["no_protective_stop"] is False


# ---------------------------------------------------------------------------------------------- transfer step
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
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture(scope="module")
def source_skill(client):
    r = client.post("/api/runs/discover", json={"robot_id": "panda_01", "scene_seed": 42})
    run = _wait(client, r.json()["run_id"])
    assert run["status"] == "succeeded"
    return client.post("/api/skills", json={"run_id": run["run_id"]}).json()


def _transfer(client, skill_id, **extra):
    return client.post("/api/transfers", json={"source_skill_id": skill_id, "target_robot_id": "ur5e_01", **extra})


def test_ursim_request_without_a_bridge_is_refused(client, source_skill, monkeypatch):
    monkeypatch.setattr(controller, "URSIM_BRIDGE_URL", None)
    r = _transfer(client, source_skill["skill_id"], execute_on="ursim")
    assert r.status_code == 409 and "NIMBOTICS_URSIM_BRIDGE_URL" in r.json()["detail"]


def test_controller_status_endpoint_reports_not_configured(client, monkeypatch):
    monkeypatch.setattr(controller, "URSIM_BRIDGE_URL", None)
    body = client.get("/api/controller/status").json()
    assert body == {"configured": False, "reachable": False, "label": CONTROLLER_LABEL, "detail": body["detail"]}


def test_transfer_with_ursim_stores_the_controller_execution_on_the_run(client, source_skill, monkeypatch, adapters):
    robot = FakeUR(adapters["ur5e_01"], adapters["ur5e_01"].home_q())
    monkeypatch.setattr(controller, "URSIM_BRIDGE_URL", "http://ur-bridge.test")
    monkeypatch.setattr(controller, "make_client", lambda: mock_client(robot))
    run = _wait(client, _transfer(client, source_skill["skill_id"], execute_on="ursim").json()["run_id"])
    assert run["status"] == "succeeded", run["events"][-1]
    ce = run["results"]["controller_execution"]
    assert ce["status"] == "succeeded" and ce["label"] == "URSim controller, not physical"
    assert ce["tcp_to_target_mm"] < 10 and ce["path_waypoints"] > 1
    assert any("URSim" in e["message"] for e in run["events"])
    assert run["results"]["capsule_draft"] is not None  # the sim-verified adaptation is unaffected


def test_failed_controller_run_is_recorded_without_changing_the_simulation_result(client, source_skill, monkeypatch):
    monkeypatch.setattr(controller, "URSIM_BRIDGE_URL", "http://ur-bridge.test")
    monkeypatch.setattr(controller, "make_client", unreachable_client)
    run = _wait(client, _transfer(client, source_skill["skill_id"], execute_on="ursim").json()["run_id"])
    assert run["status"] == "succeeded"
    ce = run["results"]["controller_execution"]
    assert ce["status"] == "failed" and "unreachable" in ce["error"]
    assert any("URSim execution failed" in e["message"] for e in run["events"])
    json.dumps(run)  # stored record stays plain JSON


def test_transfer_without_ursim_has_no_controller_execution(client, source_skill):
    run = _wait(client, _transfer(client, source_skill["skill_id"]).json()["run_id"])
    assert run["status"] == "succeeded" and "controller_execution" not in run["results"]
