"""ur_bridge: the ur_rtde side of controller execution, tested against a fake controller (no URSim, no ur_rtde)."""

from __future__ import annotations

import json

import pytest

from ur_bridge.executor import NORMAL_SAFETY_MODE, ExecuteRequest, execute, parse_request
from ur_bridge.server import BridgeApp

HOME = (-1.6, -1.7, -2.2, -0.8, 1.6, 0.0)


def path(n: int = 20, step: float = 0.01) -> list[list[float]]:
    return [[HOME[0] + i * step, *HOME[1:]] for i in range(n)]


class FakeRobot:
    """Tracks commands perfectly unless told to protective-stop after `stop_after` servo commands."""

    def __init__(self, q=HOME, safety_mode: int = NORMAL_SAFETY_MODE, stop_after: int | None = None,
                 servo_ok: bool = True) -> None:
        self.q = list(q)
        self.safety_mode = safety_mode
        self.stop_after = stop_after
        self.servo_ok = servo_ok
        self.calls: list[tuple] = []
        self.servo_count = 0

    # RTDEControlInterface
    def moveJ(self, q, speed, accel):  # noqa: N802 - ur_rtde names
        self.calls.append(("moveJ", tuple(q), speed, accel))
        self.q = list(q)
        return True

    def servoJ(self, q, speed, accel, dt, lookahead, gain):  # noqa: N802
        self.calls.append(("servoJ", tuple(q)))
        self.servo_count += 1
        if self.stop_after is not None and self.servo_count > self.stop_after:
            self.safety_mode = 3
            return False
        self.q = list(q)
        return self.servo_ok

    def servoStop(self, decel=10.0):  # noqa: N802
        self.calls.append(("servoStop",))

    def initPeriod(self):  # noqa: N802
        return 0

    def waitPeriod(self, t0):  # noqa: N802
        pass

    def stopScript(self):  # noqa: N802
        self.calls.append(("stopScript",))

    # RTDEReceiveInterface
    def getActualQ(self):  # noqa: N802
        return list(self.q)

    def getActualQd(self):  # noqa: N802
        return [0.0] * 6

    def getActualTCPPose(self):  # noqa: N802
        return [0.1, 0.2, 0.3, 0.0, 3.14, 0.0]

    def getSafetyMode(self):  # noqa: N802
        return self.safety_mode

    def getRobotMode(self):  # noqa: N802
        return 7

    def isProtectiveStopped(self):  # noqa: N802
        return self.safety_mode == 3

    # DashboardClient
    def polyscopeVersion(self):  # noqa: N802
        return "URSoftware 5.26.3.140631 (Oct 12 2026)"

    def getRobotModel(self):  # noqa: N802
        return "UR5"

    def isInRemoteControl(self):  # noqa: N802
        return True


def request(n: int = 20) -> ExecuteRequest:
    return parse_request({"samples": path(n), "dt": 0.008})


@pytest.mark.parametrize("payload, message", [
    ({"samples": [], "dt": 0.008}, "samples"),
    ({"samples": [[0.0] * 5], "dt": 0.008}, "6 joints"),
    ({"samples": [[float("nan")] * 6], "dt": 0.008}, "finite"),
    ({"samples": [[0.0] * 6, [0.5] + [0.0] * 5], "dt": 0.008}, "step"),
    ({"samples": [[0.0] * 6], "dt": 1.0}, "dt"),
    ({"samples": [[7.0] + [0.0] * 5], "dt": 0.008}, "range"),
])
def test_parse_request_rejects_unsafe_or_malformed_paths(payload, message):
    with pytest.raises(ValueError, match=message):
        parse_request(payload)


def test_execute_approaches_start_then_streams_every_sample_in_order():
    robot = FakeRobot()
    req = request(20)
    out = execute(robot, robot, req)
    assert out["ok"] is True and out["error"] is None
    assert robot.calls[0][0] == "moveJ" and robot.calls[0][1] == tuple(req.samples[0])
    servo = [c[1] for c in robot.calls if c[0] == "servoJ"]
    assert servo == [tuple(s) for s in req.samples]
    assert ("servoStop",) in robot.calls
    assert len(out["samples"]) == 20
    assert out["samples"][-1]["q_cmd"] == list(req.samples[-1])
    assert out["final_q"] == list(req.samples[-1])
    assert out["approach"]["from_q"] == list(HOME) and out["approach"]["ok"] is True
    assert out["safety_mode_before"] == out["safety_mode_after"] == NORMAL_SAFETY_MODE
    assert out["protective_stopped"] is False


def test_execute_refuses_to_move_when_safety_is_not_normal():
    robot = FakeRobot(safety_mode=3)
    out = execute(robot, robot, request())
    assert out["ok"] is False and "safety mode" in out["error"]
    assert not [c for c in robot.calls if c[0] in ("moveJ", "servoJ")]


def test_protective_stop_mid_path_stops_streaming_and_is_reported():
    robot = FakeRobot(stop_after=5)
    out = execute(robot, robot, request(20))
    assert out["ok"] is False and "protective stop" in out["error"]
    assert out["protective_stopped"] is True
    assert sum(1 for c in robot.calls if c[0] == "servoJ") == 6
    assert ("servoStop",) in robot.calls


def test_app_status_and_execute_over_json():
    robot = FakeRobot()
    app = BridgeApp(open_control=lambda: robot, open_receive=lambda: robot, open_dashboard=lambda: robot)
    code, body = app.handle("GET", "/status", b"")
    assert code == 200
    assert body["controller_version"].startswith("URSoftware 5.26")
    assert body["robot_model"] == "UR5" and body["remote_control"] is True and body["safety_mode"] == 1
    code, body = app.handle("POST", "/execute", json.dumps({"samples": path(10), "dt": 0.008}).encode())
    assert code == 200 and body["ok"] is True
    assert ("stopScript",) in robot.calls  # control script released after every execution


def test_app_rejects_bad_requests_and_unknown_routes():
    robot = FakeRobot()
    app = BridgeApp(open_control=lambda: robot, open_receive=lambda: robot, open_dashboard=lambda: robot)
    assert app.handle("POST", "/execute", b"not json")[0] == 400
    assert app.handle("POST", "/execute", json.dumps({"samples": [[0.0] * 5], "dt": 0.008}).encode())[0] == 400
    assert app.handle("GET", "/nope", b"")[0] == 404


def test_app_reports_controller_connection_failure_honestly():
    def refuse():
        raise RuntimeError("ur_rtde: Please enable remote control on the robot!")

    robot = FakeRobot()
    app = BridgeApp(open_control=refuse, open_receive=lambda: robot, open_dashboard=lambda: robot)
    code, body = app.handle("POST", "/execute", json.dumps({"samples": path(5), "dt": 0.008}).encode())
    assert code == 502 and "remote control" in body["error"]


class LaggingRobot(FakeRobot):
    """Moves only part of the way to each servo target, like a controller with lookahead lag."""

    def servoJ(self, q, speed, accel, dt, lookahead, gain):  # noqa: N802
        self.calls.append(("servoJ", tuple(q)))
        self.q = [a + 0.5 * (b - a) for a, b in zip(self.q, q)]
        return True


def test_stream_is_paced_by_dt_not_by_the_interface_rate():
    clock = {"t": 0.0}
    robot = FakeRobot()
    out = execute(robot, robot, request(20), clock=lambda: clock["t"],
                  sleep=lambda s: clock.__setitem__("t", clock["t"] + s))
    assert out["ok"] is True
    assert out["duration_s"] == pytest.approx(20 * 0.008, abs=1e-6)
    assert out["nominal_duration_s"] == pytest.approx(20 * 0.008)


def test_lagging_controller_is_held_on_the_final_pose_until_it_arrives():
    robot = LaggingRobot()
    req = request(20)
    out = execute(robot, robot, req)
    assert out["ok"] is True
    assert max(abs(a - b) for a, b in zip(out["final_q"], req.samples[-1])) <= 1e-4
    assert sum(1 for c in robot.calls if c[0] == "servoJ") > len(req.samples)  # extra holds on the final pose
    assert out["hold_reached"] is True
