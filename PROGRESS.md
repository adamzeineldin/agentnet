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

## M2 — Source skill discovery ✅ (2026-10-26)
- ✅ Task frame + seeded scene family `wall_reach_v1` (wall on the floor between start and target); per-robot placement.
- ✅ Route search: 4 route classes (direct / over / near_side / far_side) × clearances {4, 8, 12 cm} = 10 candidates.
  Each: densified task-space IK tracking with continuity check → dense kinematic collision screening →
  measured link-obstacle clearance (`mj_geomDistance`, ≥ 10 mm) → physics rollout of the top 3 by cost.
- ✅ Rejections recorded with reasons. Seed 42 (Panda): direct + 5 side routes collide, 2 have < 10 mm
  clearance, `over@0.08` and `over@0.12` verified; `over@0.08` selected; endpoint error 0.72 mm, 0 contacts.
  Seed 7 (live from UI): 3 verified, `far_side@0.12` selected, 0.57 mm, 0 contacts.
- ✅ Winner re-executed in a fresh simulation with rendering; must reproduce the rollout (|Δerror| < 1 mm).
- ✅ Experience Capsule v1.0 (task-frame waypoints + executed trace, strategy, candidate outcomes, provenance,
  validation). Drafted on success, published only via explicit `POST /api/skills`; failed or non-discover runs → 409.
- ✅ APIs: `POST /api/runs/discover`, `GET/POST /api/skills`, `GET /api/skills/{id}` (ancestors/children);
  passport `obstacle_aware_reach` becomes `verified_in_sim` only from published skills.
- ✅ UI: Transfer Lab (source side: seed, Discover, stepper, live log, video, Publish; candidate route
  diagrams + cards), Skill Library. Target side is visibly disabled until M3.
- ✅ 70 backend tests pass (incl. M2 gate test); `scripts/discover_skill.py` headless demo.
- **Gate met:** on fixed seed 42 the Panda moves to the target in MuJoCo with zero obstacle contacts and the capsule is stored in the registry.
- Observed: across seeds 1–5 and 42, `over` routes are always feasible for both robots — this scene family is
  easy; harder variants are needed for a meaningful evaluation (M6).

## M3 — Cross-robot transfer ✅ (2026-10-26) — GO
- ✅ `POST /api/transfers` → run: `retrieving` (capsule from registry) → `profiling` (task re-placed in UR5e
  base frame) → `checking` (compatibility vs UR5e passport: validation, 7→6 DOF, EE, scene, reach %) →
  `proposing` (candidates ordered by source experience) → kinematic evaluation → physics rollouts in prior
  order (same budget of 3 as discovery) → first verified selected → rendered execution + verify.
- ✅ Prior order: capsule strategy → same route class at nearest clearances → source's other verified routes
  → source-feasible → source clearance failures → source collisions.
- ✅ UR5e solves its own 6-DOF IK from task-frame geometry; capsules contain no joint vectors (tested).
- ✅ Adaptation capsule: `parent_skill_id`, `lineage`, `transferred_from_robot`, `source_strategy`,
  `strategy_preserved`, `prior_rank_of_selected`; published via the same explicit publish step.
- ✅ Measured results (UR5e, offline planner):
  - seed 42, source `over@0.08` → UR5e `over@0.08` (prior #1, preserved), 0.62 mm, 0 contacts, 1st rollout succeeded.
  - seed 7, source `far_side@0.12` → all far-side candidates collide on UR5e (forearm/wrist vs wall) →
    `over@0.08` (prior #4, adapted), 0.64 mm, 0 contacts.
  - held-out scene seed 3 from the seed-42 skill → `over@0.08` (prior #1), 0.68 mm, 0 contacts.
- ✅ Reproducible: re-running a transfer gives identical selection, start pose and endpoint error (tested).
- ✅ UI: Transfer Lab split screen (Panda replay | UR5e live), skill selector, same/new scene, compatibility,
  adaptation summary, Publish Adaptation, per-robot candidate tabs with prior rank; Skill Library lineage.
- ✅ 77 backend tests pass (incl. M3 gate); `scripts/transfer_demo.py`.
- **Gate met:** UR5e executes a transferred strategy; joint arrays are never shared; runs reproduce from stored seed.

## M4 — Collective Imagination & Meta API ⬜
Next: `ReasoningProvider` (offline + Meta Muse Spark) proposing/re-ranking strategies from structured tool
results; record whether the model changed selection vs the offline prior; show multiple predicted futures.
Note: candidate rollouts already exist (top-3 physics rollouts per run); M4 adds the reasoning layer + UI.
## M5 — Full Control Center ⬜
## M6 — Evaluation & docs ⬜
## M7 — Record & finalize ⬜
