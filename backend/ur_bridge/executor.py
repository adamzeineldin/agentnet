"""Stream a timed joint path to a UR controller through ur_rtde and record what the controller reports.

Interfaces are injected (ur_rtde's RTDEControlInterface / RTDEReceiveInterface or test fakes), so this module
imports nothing from ur_rtde. Every recorded value is read back from the controller, never copied from the command.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

NORMAL_SAFETY_MODE = 1  # ur_rtde getSafetyMode(): 1 = NORMAL
JOINTS = 6
MAX_SAMPLES = 20_000
MIN_DT, MAX_DT = 0.002, 0.1
MAX_STEP_RAD = 0.05  # largest joint change between consecutive streamed samples
MAX_ABS_Q = 2 * math.pi + 1e-6
SETTLE_QD_TOL = 1e-3
HOLD_TOL_RAD = 1e-4  # final pose counts as reached within this (max joint)


@dataclass(frozen=True)
class ExecuteRequest:
    samples: tuple[tuple[float, ...], ...]
    dt: float
    approach_speed: float = 0.5
    approach_accel: float = 0.5
    lookahead: float = 0.1
    gain: float = 300.0
    settle_s: float = 2.0


def parse_request(payload: Any) -> ExecuteRequest:
    """Validate a JSON payload; raises ValueError with the reason."""
    if not isinstance(payload, dict):
        raise ValueError("payload must be a JSON object")
    raw = payload.get("samples")
    if not isinstance(raw, list) or not raw or len(raw) > MAX_SAMPLES:
        raise ValueError(f"samples must be a list of 1..{MAX_SAMPLES} joint vectors")
    samples = []
    for q in raw:
        if not isinstance(q, list) or len(q) != JOINTS:
            raise ValueError(f"every sample needs {JOINTS} joints")
        vals = tuple(float(v) for v in q)
        if not all(math.isfinite(v) for v in vals):
            raise ValueError("joint values must be finite")
        if any(abs(v) > MAX_ABS_Q for v in vals):
            raise ValueError("joint value out of range (|q| <= 2π)")
        samples.append(vals)
    for a, b in zip(samples, samples[1:]):
        if max(abs(x - y) for x, y in zip(a, b)) > MAX_STEP_RAD:
            raise ValueError(f"step between samples exceeds {MAX_STEP_RAD} rad")
    dt = float(payload.get("dt", 0))
    if not MIN_DT <= dt <= MAX_DT:
        raise ValueError(f"dt must be within [{MIN_DT}, {MAX_DT}] s")
    return ExecuteRequest(samples=tuple(samples), dt=dt)


def _settle(rec, timeout_s: float, sleep: Callable[[float], None], clock: Callable[[], float]) -> None:
    deadline = clock() + timeout_s
    while clock() < deadline and max(abs(v) for v in rec.getActualQd()) > SETTLE_QD_TOL:
        sleep(0.02)


def execute(
    ctl, rec, req: ExecuteRequest,
    clock: Callable[[], float] = time.monotonic, sleep: Callable[[float], None] = time.sleep,
) -> dict:
    """moveJ to the first sample, then servoJ every sample at req.dt. Stops on the first refused command."""
    out: dict[str, Any] = {"ok": False, "error": None, "approach": None, "samples": [],
                           "safety_mode_before": rec.getSafetyMode(), "robot_mode": rec.getRobotMode()}
    if out["safety_mode_before"] != NORMAL_SAFETY_MODE:
        return {**out, "error": f"controller safety mode is {out['safety_mode_before']}, not NORMAL; nothing sent",
                **_final(rec)}
    from_q = list(rec.getActualQ())
    ok = bool(ctl.moveJ(list(req.samples[0]), req.approach_speed, req.approach_accel))
    out["approach"] = {"from_q": from_q, "to_q": list(req.samples[0]), "ok": ok,
                       "actual_q": list(rec.getActualQ())}
    if not ok:
        return {**out, "error": "controller refused the approach move to the path start", **_final(rec)}
    t0 = clock()
    # Paced by our own clock: ur_rtde's initPeriod/waitPeriod pace at the interface rate (500 Hz), not req.dt.
    error = _stream(ctl, rec, req, out["samples"], t0, clock, sleep)
    reached = error is None and _hold_final(ctl, rec, req, clock, sleep)
    ctl.servoStop()
    if error is None:
        _settle(rec, req.settle_s, sleep, clock)
    final = _final(rec)
    if error is None and final["safety_mode_after"] != NORMAL_SAFETY_MODE:
        error = f"controller safety mode is {final['safety_mode_after']} after the path"
    return {**out, **final, "ok": error is None, "error": error, "hold_reached": reached,
            "duration_s": clock() - t0, "nominal_duration_s": len(req.samples) * req.dt}


def _stream(ctl, rec, req: ExecuteRequest, record: list, t0: float, clock, sleep) -> str | None:
    for i, q in enumerate(req.samples):
        accepted = ctl.servoJ(list(q), 0.0, 0.0, req.dt, req.lookahead, req.gain)
        record.append({"t": clock() - t0, "q_cmd": list(q), "q": list(rec.getActualQ()),
                       "tcp": list(rec.getActualTCPPose())})
        if rec.isProtectiveStopped():
            return "controller entered a protective stop during the path"
        if not accepted:
            return "controller refused a servo command"
        delay = t0 + (i + 1) * req.dt - clock()
        if delay > 0:
            sleep(delay)
    return None


def _hold_final(ctl, rec, req: ExecuteRequest, clock, sleep) -> bool:
    """Keep commanding the last sample until the controller reports it (servo lookahead lags the stream)."""
    q_final = list(req.samples[-1])
    deadline = clock() + req.settle_s
    while True:
        if max(abs(a - b) for a, b in zip(rec.getActualQ(), q_final)) <= HOLD_TOL_RAD:
            return True
        if clock() >= deadline or rec.isProtectiveStopped():
            return False
        ctl.servoJ(q_final, 0.0, 0.0, req.dt, req.lookahead, req.gain)
        sleep(req.dt)


def _final(rec) -> dict:
    return {"final_q": list(rec.getActualQ()), "final_tcp": list(rec.getActualTCPPose()),
            "safety_mode_after": rec.getSafetyMode(), "protective_stopped": bool(rec.isProtectiveStopped())}


def status(rec, dash) -> dict:
    return {"controller_version": dash.polyscopeVersion(), "robot_model": dash.getRobotModel(),
            "remote_control": bool(dash.isInRemoteControl()), "robot_mode": rec.getRobotMode(),
            "safety_mode": rec.getSafetyMode()}
