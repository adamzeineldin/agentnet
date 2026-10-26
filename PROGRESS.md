# Progress

Legend: ✅ done & verified · 🟡 partial · ⬜ not started

## M0 — Environment & scaffold ✅ (2026-10-26)
- ✅ Env: macOS 26.6 arm64 (M4 Max), Python 3.13.6 venv, Node 24.7, MuJoCo 3.17.0.
- ✅ Menagerie pinned at `f3b6013` (Panda + UR5e sparse checkout) via `backend/scripts/fetch_models.sh`.
- ✅ Backend (FastAPI/Pydantic/SQLAlchemy) and frontend (Next.js 16.4, Tailwind 4) scaffolded.
- ✅ `make smoke` passes: both robots step under `mj_step`, offscreen renders PNG + MP4.
- ✅ Frontend shows live backend health (MuJoCo version, reasoning mode).
- **Gate met.**

## M1 — Two robots, movement, passports ✅ (2026-10-26)
- ✅ Arm joints / actuators / EE site discovered from the model (Panda 7 DOF, UR5e 6 DOF; finger joints excluded).
- ✅ Joint jog: commanded +0.350 rad, measured +0.3495 rad on both robots (smoke script).
- ✅ IK reach executed in physics: endpoint error 0.5 mm (Panda), 0.2 mm (UR5e), 0 contacts (smoke target).
- ✅ Passports with provenance, sampled workspace (3000 samples), IK probes (Panda 24/24, UR5e 23/24), cached in SQLite.
- ✅ Frontend: Overview, Robot Fleet (comparison table, passport, joint limits, workspace plot, live motion check with SSE + MP4), Run History.
- ✅ 42 backend tests pass (FK vs mj_forward, Jacobian vs finite differences, IK, physics reach, obstacle detection, honest failure, API/SSE).
- **Gate met:** both robots move as commanded in MuJoCo; passport fields come from the loaded model.

## M2 — Source skill discovery ⬜
Next: obstacle scene in a shared task frame, multi-candidate route planner (direct/left/right/over),
dense collision screening, physics verification, Experience Capsule schema + registry, `/api/runs/discover`.

## M3 — Cross-robot transfer ⬜
## M4 — Collective Imagination & Meta API ⬜
## M5 — Full Control Center ⬜
## M6 — Evaluation & docs ⬜
## M7 — Record & finalize ⬜
