"""M0/M1 smoke test: load both Menagerie robots, step physics, move a joint,
solve and execute one IK reach, and render real frames.

Run from backend/:  .venv/bin/python scripts/smoke_sim.py
Exits non-zero if any check fails.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import mujoco
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import ARTIFACT_DIR  # noqa: E402
from app.services.kinematics import make_seeds, solve_ik  # noqa: E402
from app.services.render import FrameRecorder  # noqa: E402
from app.services.robot_adapter import RobotAdapter  # noqa: E402
from app.services.robot_catalog import ROBOTS  # noqa: E402
from app.services.scene import SceneSpec, build_model  # noqa: E402
from app.services.simulation import execute_path  # noqa: E402

log = logging.getLogger("smoke_sim")
TARGET = np.array([0.40, 0.25, 0.30])
JOG_RAD = 0.35


def check_robot(robot_id: str, out_dir: Path) -> bool:
    decl = ROBOTS[robot_id]
    model = build_model(decl, SceneSpec(target=tuple(TARGET)))
    adapter = RobotAdapter(decl, model)
    data = adapter.new_data()
    log.info("%s: nq=%d nu=%d dof=%d ee_site=%s", robot_id, model.nq, model.nu, adapter.dof,
             decl.end_effector.site_name)
    for j, a in zip(adapter.joints, adapter.actuators, strict=True):
        log.info("  joint %-20s [% .4f, % .4f] -> actuator %-14s kp=%.0f kv=%.0f",
                 j.name, j.lower, j.upper, a.name, a.kp, a.kv)

    t0 = data.time
    for _ in range(100):
        mujoco.mj_step(model, data)
    ok = data.time > t0
    log.info("  mj_step advanced %.3fs", data.time - t0)

    home = adapter.home_q()
    jog = home.copy()
    jog[0] = np.clip(home[0] + JOG_RAD, adapter.lower[0], adapter.upper[0])
    ik = solve_ik(adapter, TARGET, make_seeds(adapter, 8, np.random.default_rng(0)))
    log.info("  IK success=%s err=%.5fm iters=%d seed=%d", ik.success, ik.position_error_m,
             ik.iterations, ik.seed_index)
    ok &= ik.success

    adapter.reset_home(data)
    with FrameRecorder(model) as rec:
        jog_res = execute_path(adapter, data, [home, jog], frame_hook=rec.capture)
        achieved = jog_res.final_q[0] - home[0]
        log.info("  jog %s: commanded %.3f rad, achieved %.4f rad", adapter.joints[0].name,
                 jog[0] - home[0], achieved)
        ok &= abs(achieved - (jog[0] - home[0])) < 2e-3
        reach = execute_path(adapter, data, [jog, np.array(ik.q)], frame_hook=rec.capture)
        err = float(np.linalg.norm(np.array(reach.final_ee_pos) - TARGET))
        log.info("  reach: endpoint error %.4fm, collisions=%d, limit violations=%s, sim %.2fs",
                 err, len(reach.collisions), reach.limit_violations, reach.simulated_seconds)
        ok &= err < 0.01 and not reach.collisions and not reach.limit_violations
        png = rec.save_png(rec.frames[-1], out_dir / f"{robot_id}_reach.png")
        mp4 = rec.save_mp4(out_dir / f"{robot_id}_smoke.mp4")
        log.info("  wrote %s and %s (%d frames)", png, mp4, len(rec.frames))
    return bool(ok)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    log.info("MuJoCo %s", mujoco.__version__)
    out_dir = ARTIFACT_DIR / "smoke"
    results = {rid: check_robot(rid, out_dir) for rid in ROBOTS}
    for rid, ok in results.items():
        log.info("%s: %s", rid, "PASS" if ok else "FAIL")
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
