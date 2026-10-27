# AgentNet — Collective Intelligence for Physical AI

An interoperable, simulation-verified system for exchanging and adapting robot motion-planning
experience across different simulated embodiments. Robot A (Franka Emika Panda) discovers and
publishes a verified skill; Robot B (Universal Robots UR5e) adapts it with its own kinematics,
previews candidates in MuJoCo, and publishes the adaptation with lineage.

> **Status:** Milestones 0–4 complete (see [PROGRESS.md](PROGRESS.md)). Meta Muse Spark is integrated but has
> only been exercised against mocked responses (no API key configured). The evaluation suite is not built yet. Everything shown is MuJoCo simulation, not
> physical-world verification.

## What works today

- Real Menagerie models (pinned commit) for Panda (7-DOF) and UR5e (6-DOF), loaded with `MjSpec`.
- `RobotAdapter` discovers arm joints, position-servo actuators and the end-effector site from the
  compiled model (no hard-coded link lengths).
- Damped-least-squares position IK with joint-limit clamping, multi-seed retries and collision rejection.
- Physics execution through each robot's own actuators (gravity-compensated servo setpoints), with
  contact, joint-limit and endpoint-error verification.
- Robot Passports with per-field provenance (`model` / `measured` / `declared`), sampled workspace
  and IK reliability probes, cached in SQLite.
- FastAPI backend with a single simulation worker thread, typed run events (SSE) and MP4 renders.
- Source skill discovery: 10 candidate routes searched with IK, collision screening, clearance and
  physics rollouts; the verified winner becomes a publishable Experience Capsule (task-frame only).
- Cross-robot transfer: the UR5e retrieves a Panda capsule from the registry, re-places the task in its own
  frame, orders candidates by the Panda's experience, solves its own IK, verifies in MuJoCo, and publishes an
  adaptation with lineage.
- Collective Imagination: a reasoning provider (offline prior, or Meta Muse Spark with `MODEL_API_KEY`) ranks
  hypotheses; MuJoCo simulates several futures before one is executed. Each run records which provider was
  used, model calls, tokens, estimated cost, and whether the model changed the selection.
- Next.js Control Center: Overview, Robot Fleet, Transfer Lab (Panda ↔ UR5e), Skill Library, Run History.

## Quick start

Requirements: macOS/Linux, Python 3.11+ (tested 3.13), Node 20+ (tested 24), git.

```bash
make setup     # venv + backend deps, pinned Menagerie models, frontend deps
make smoke     # loads both robots, jogs a joint, executes an IK reach, renders MP4s
make test      # backend unit/integration/API tests
make discover  # headless: Panda discovers + publishes a skill on seed 42
make transfer  # headless: Panda skill (seed 7) transferred to the UR5e
make dev       # backend http://127.0.0.1:8000 + frontend http://localhost:3000
```

Copy `.env.example` to `.env` to configure. With no `MODEL_API_KEY` the app runs in the clearly
labelled **Offline deterministic planner** mode.

## Layout

```
backend/app/services   robot_catalog, scene, robot_adapter, kinematics, simulation, render,
                       passports, fleet, registry, jobs, motion_check, task_scene,
                       route_planner, candidate_search, skill_discovery, transfer, imagination,
                       capsules, skill_registry, reasoning/{base,offline,meta_muse}
backend/app/api        health, robots, runs (incl. discover), skills, transfers
backend/scripts        fetch_models.sh, smoke_sim.py, discover_skill.py, transfer_demo.py
backend/tests          passport, IK/physics, registry, API
frontend/              Next.js 16 App Router + Tailwind 4
docs/                  ARCHITECTURE.md, KNOWN_LIMITATIONS.md
```

## Attribution

Robot models from [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie)
(Franka Emika Panda and Universal Robots UR5e, each under its own license in the model directory),
fetched at a pinned commit and not redistributed in this repository.
