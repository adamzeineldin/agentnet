"""Import recorded real-robot episodes from DROID (lerobot/droid_100) into app/data/real/droid_100.json.

DROID: real Franka Panda teleoperation, MIT license. observation.state = end-effector position (m, robot base
frame), orientation (rad), gripper (0..1) at 15 Hz. Only positions and gripper are kept; nothing is modified.

Selection (documented in the output): episodes with a task description, 5–20 s long, whose recorded end-effector
stays >= 5 cm above the robot base plane and <= 0.78 m from the Panda shoulder (the simulated robots stand on the
floor with no pedestal), and that move at least 0.4 m. The first MAX_EPISODES that qualify are kept.

Usage: .venv/bin/pip install -e ".[data]" && .venv/bin/python scripts/import_real_data.py
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx
import numpy as np
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATA_DIR  # noqa: E402
from app.models.real_data import RealDataset, RealDataSource, RealEpisode  # noqa: E402

REPO = "lerobot/droid_100"
HF = "https://huggingface.co"
MAX_EPISODES = 8
MIN_S, MAX_S = 5.0, 20.0
MIN_Z_M, MAX_REACH_M, MIN_PATH_M = 0.05, 0.78, 0.4
PANDA_SHOULDER = np.array([0.0, 0.0, 0.333])
SELECTION = (f"task described; {MIN_S:.0f}–{MAX_S:.0f} s; end effector >= {MIN_Z_M * 100:.0f} cm above the base "
             f"plane and <= {MAX_REACH_M} m from the shoulder; moves >= {MIN_PATH_M} m; first {MAX_EPISODES}")


def fetch(client: httpx.Client, path: str, revision: str) -> bytes:
    res = client.get(f"{HF}/datasets/{REPO}/resolve/{revision}/{path}", follow_redirects=True)
    res.raise_for_status()
    return res.content


def select(states: np.ndarray, episodes: np.ndarray, task_idx: np.ndarray, tasks: dict[int, str], fps: float):
    for ep in sorted(set(episodes.tolist())):
        mask = episodes == ep
        xyz, task = states[mask, :3], tasks.get(int(task_idx[mask][0]), "").strip()
        duration = mask.sum() / fps
        reach = float(np.linalg.norm(xyz - PANDA_SHOULDER, axis=1).max())
        moved = float(np.linalg.norm(np.diff(xyz, axis=0), axis=1).sum())
        if task and MIN_S <= duration <= MAX_S and xyz[:, 2].min() >= MIN_Z_M and reach <= MAX_REACH_M \
                and moved >= MIN_PATH_M:
            yield RealEpisode(
                episode_index=int(ep), task=task, frames=int(mask.sum()), duration_s=round(float(duration), 3),
                ee_xyz=[tuple(round(float(v), 5) for v in p) for p in xyz],
                gripper=[round(float(g), 4) for g in states[mask, 6]],
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DATA_DIR / "real" / "droid_100.json")
    args = parser.parse_args()
    with httpx.Client(timeout=60) as client:
        revision = client.get(f"{HF}/api/datasets/{REPO}").raise_for_status().json()["sha"]
        info = json.loads(fetch(client, "meta/info.json", revision))
        data = pq.read_table(io.BytesIO(fetch(client, "data/chunk-000/file-000.parquet", revision)))
        task_rows = pq.read_table(io.BytesIO(fetch(client, "meta/tasks.parquet", revision))).to_pylist()
    tasks = {r["task_index"]: r["__index_level_0__"] for r in task_rows}
    fps = float(info["fps"])
    states = np.array(data.column("observation.state").to_pylist())
    chosen = list(select(states, np.array(data.column("episode_index").to_pylist()),
                         np.array(data.column("task_index").to_pylist()), tasks, fps))[:MAX_EPISODES]
    dataset = RealDataset(
        source=RealDataSource(
            dataset_id="droid_100", title="DROID (100-episode sample)", url=f"{HF}/datasets/{REPO}",
            revision=revision, license="MIT",
            citation="Khazatsky et al., DROID: A Large-Scale In-the-Wild Robot Manipulation Dataset, RSS 2024",
            recorded_robot="Franka Emika Panda (real hardware, teleoperated)", recorded_robot_id="panda_01",
            fps=fps, frame="Panda robot base frame (m)",
            state_fields=["x", "y", "z", "roll", "pitch", "yaw", "gripper"],
            notes=["Only end-effector positions and gripper are imported; orientation is not used (Nimbotics IK is "
                   "position-only).", "Objects in the real scene are not modelled in simulation."],
        ),
        selection=SELECTION, imported_at=datetime.now(UTC).isoformat(timespec="seconds"), episodes=chosen,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(dataset.model_dump_json(indent=1))
    print(f"{len(chosen)} episodes from {REPO}@{revision[:12]} → {args.out}")
    for e in chosen:
        print(f"  ep {e.episode_index:3d}  {e.duration_s:5.1f} s  {e.task}")


if __name__ == "__main__":
    main()
