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

## M4 — Collective Imagination & Meta API ✅ (2026-10-27) — Meta exercised only against mocks
- ✅ `ReasoningProvider` contract (`propose_strategies`, `revise_strategy`); proposals are candidate ids from a
  fixed vocabulary, validated server-side (unknown ids dropped, omitted ids appended in offline order).
- ✅ `OfflinePlanner`: source-experience prior; after a failed future it demotes that route class.
- ✅ `MetaMuseProvider` (muse-spark-1.3, `POST https://api.meta.ai/v1/chat/completions`, formats checked against
  dev.meta.ai docs on 2026-10-26): bounded read-only tools `inspect_robot`, `inspect_skill`, `check_candidate`,
  `summarize_failure` + terminal `submit_ranking`; `parallel_tool_calls=false`; ≤4 tool rounds then forced
  `json_schema` answer; ≤1 revision; max_tokens 1200; token usage + estimated cost recorded; key never logged.
  Any Meta error → offline fallback, recorded as `fallback_error`; `model_used` stays null.
- ✅ Collective Imagination (`imagination.py`): futures simulated in provider order within the physics budget (3),
  each from a fresh reset; per-future outcome, EE trace (task frame) and rendered final-state thumbnail.
- ✅ Run records `results.reasoning`: provider requested/used, proposals, calls, tokens, cost, offline expected
  selection (+ basis: physics or kinematic estimate), `changed_selection_vs_offline`.
- ✅ API: `reasoning_mode: "offline" | "meta"`; meta without `MODEL_API_KEY` → 409 (never silently substituted).
- ✅ UI: reasoning selector (Meta disabled + labelled when no key), provider badge, Collective Imagination panel
  (future thumbnails, reasoning trace, model-changed-selection), route diagram draws MuJoCo traces for futures.
- ✅ 92 backend tests (15 new: request format, tool loop, id validation, forced JSON final round, error →
  fallback, mocked model changing selection with cost accounting).
- **Gate met (offline):** candidate predictions and the final run are captured from MuJoCo; model usage is
  evidenced per run, and every run so far is marked offline because no key is configured.
- ⚠️ No real Meta call has been made (no `MODEL_API_KEY`). Live behaviour of tool calling + `json_schema` on
  muse-spark-1.3 is unverified until a key is added; the adapter falls back honestly if the format differs.

## M5 — Full Control Center ✅ (2026-10-27)
- ✅ Presentation mode (`/present`, **▶ Present** in the header): 5 scenes (Discover, Publish, Passports, Imagine,
  Adapt), chrome-less 16:9 layout, keyboard ←/→/space.
  - **Replay recorded**: latest real chain from `GET /api/demo/story` (selects existing runs/capsules only; failed
    transfers never used); badge shows recording time.
  - **Run live**: one click runs discover (seed 7) → publish → transfer → publish and auto-advances; verified in
    the browser: ~20 s end to end, new capsules published with lineage. Failures stop the show with the reason.
  - Clips play at 0.5×, labelled “0.5× speed · simulated time”.
- ✅ Capture-ready renders: 960×540 clips, graphite sky/floor (visual-only texture change; offscreen framebuffer
  set to 1280×720). A run that crashed before this fix is kept in history as failed with its error.
- ✅ Run History: type filter, robots/skill/planner·model/seed/candidates columns, evidence drawer with
  replay, prior-ranked candidates, provider badge, registry lineage graph, event log.
- ✅ Overview: skills / adaptations / transfers counts, activity list with model used, Presentation + Transfer Lab CTAs.
- ✅ Error states: app-wide “backend unreachable” banner with recovery hint; empty states on every list.
- ✅ `docs/DEMO_SCRIPT.md` with scene-by-scene accurate claims.
- ✅ 96 backend tests (demo-story chain selection, failed-transfer exclusion).
- **Gate met:** the whole A→B story runs from the web UI (live or replay) with no terminal after startup.
- Not done: automated browser (Playwright) UI tests — planned with M6 end-to-end checks.

## M6 — Evaluation, docs, UI tests ✅ (2026-10-27)
- ✅ Second scene family `wall_roof_v1` (shorter wall + roof slab). Probed first: original gap made every scene
  infeasible for both robots; widened the gap once for solvability (documented).
- ✅ Evaluation harness (`evaluation.py`, `benchmark.py`): dev library from Panda on seeds 0–9 (not published),
  UR5e on held-out seeds 100–109 × 2 families; nearest-capsule retrieval; variants `baseline_no_sharing`,
  `retarget_only`, `nimbotics_offline` with matched budgets (≤3 rollouts, same start, same candidate set,
  lazy evaluation); raw rows, per-family/all/common summaries, paired per-scene comparison. `nimbotics_meta` not run.
- ✅ `POST/GET /api/benchmarks`; `make benchmark` writes `docs/EVALUATION_RESULTS.md` from the stored run.
- ✅ Measured (run `run_20261027_004624_6244c9`, deterministic on re-run): success 17/20 baseline, 10/20 retarget,
  17/20 Nimbotics. Nimbotics fewer kinematic evaluations on 11 scenes, more on 6 (negative transfer on the roof
  family, median 10 vs 7). See `docs/EVALUATION.md`.
- ✅ Evaluation page: generated findings (including losses), summary by subset, per-scene strip chart, protocol,
  dev library, raw rows, “Run benchmark”.
- ✅ Playwright: 7 UI tests on an isolated stack (backend :8011 temp DB, production build in `.next-e2e` :3011):
  overview, passports, full discover→publish→transfer→publish flow, presentation replay, failed-run display,
  benchmark page, offline banner — all pass. `make e2e`.
- ✅ 104 backend tests pass.
- **Gate met:** tests pass end to end; benchmark summary includes raw runs, actual numbers and limitations.
- Not done: fresh-clone startup check (M7), Meta evaluation (needs key + approval).

## M7 — Record & finalize 🟡 (engineering done 2026-10-27; recording and submission are yours)
- ✅ Deadline verified on dev.meta.ai: **Nov 4, 2026, 9:00 PM ET**. Official Rules (video length, fields,
  repo/license, asset rules) were not publicly reachable → `docs/SUBMISSION.md` checklist.
- ✅ Fresh-clone check on a copy of exactly the committable files (no venv/node_modules/models):
  `make setup` → `make smoke` (PASS both) → `make test` (104 passed) → `make e2e` (7 passed). ~1 min with warm
  pip/npm caches; a cold machine will take longer.
- ✅ Stability: `make demo-check` — seed 7 and seed 42 chains, 5 repeats each in a throwaway registry, identical
  selections and errors every time (seed 7: Panda far_side@0.12 0.57 mm → UR5e over@0.08 0.64 mm), ~1.9 s per chain.
- ✅ Recording stack: `make demo-seed` (clean demo registry from real runs) + `make demo` (production build,
  no dev badge, demo registry only). Clips fixed to exact 960×540 (were being resized to 544).
- ✅ Screenshots of every screen in `assets/screenshots/` (generated from the demo stack); README shows them.
- ✅ `docs/DEMO_SCRIPT.md` recording checklist + evaluation scene; `docs/SUBMISSION.md`.
- ⬜ Read Official Rules in the portal; choose track/theme; add a LICENSE.
- ✅ Meta Model API live (2026-10-29, key in git-ignored `.env`, model `muse-spark-1.3-contributor`).
  - First live transfers exposed: the model spent every tool round inspecting, never called `submit_ranking`,
    and the forced final round returned prose / an empty answer (reasoning used the whole `max_tokens`).
    Runs fell back to offline honestly, but the billed calls were dropped from the run record.
  - Fixed: `reasoning_effort="low"`, 2 tool rounds (was 4), explicit JSON-only final message + `strict`
    schema, tolerant JSON extraction, billed calls/tokens/cost recorded even on fallback (`model_requested`).
  - Verified live: `run_20261029_201106_c3fd94` (Panda seed-7 far_side skill → UR5e): Muse ranked
    over@0.08, over@0.12 first ("only these are kinematically feasible… lower cost first"); executed over@0.08,
    0.64 mm, 0 contacts; 3 calls, 7,349 in / 926 out tokens, $0.00092. Same selection as offline (offline reaches
    it as prior #4 after skipping 3 infeasible candidates), so `changed_selection_vs_offline=false`.
  - Total live spend so far ≈ $0.006 (2 connectivity calls + 4 transfer runs, 3 of which fell back before the fix).
- ⬜ Record the 2–3 min video and submit.

## UI design handoff ✅ (2026-10-28)
- ✅ Read `design_handoff_nimbotics_ui/IMPLEMENTATION.md` and `README.md`; opened the clickable HTML prototype in a browser.
- ✅ Implemented in the requested order: theme/fonts → shell → landing/ParticleArm → routes → shared UI.
  - IBM Plex Sans / Mono, light-default handoff palette, persisted light/dark toggle, square panels and cards,
    underlined navigation, live backend health and existing offline/simulation-only notices.
  - Canvas particle arm port replaces ParticleHand. Includes assembly, cursor-memory particles, future-pose
    ghosts, theme-aware colors, resize/unmount cleanup, and a static reduced-motion rendering.
  - Fleet uses backend snapshots and passport metrics. History has type/status filters, selectable replay cards
    and a split evidence viewer. Skills have search, selected detail and a keyboard-accessible memory graph.
  - Transfer retains discover/publish/transfer/publish workflows, accepts a selected skill link, and compares
    model-derived joint ranges. Evaluation retains generated findings/raw rows and adds backend-derived KPIs.
  - Shared panels, status dots and metric grids match the handoff. Fixed narrow-screen passport overflow and
    light-theme video-label contrast; `/present` retains its existing chrome-less flow.
- ✅ No prototype placeholder robots, successes, GPU-hours, storage totals, predicted transfer success or fit
  scores were introduced. All reported measurements and graph connections come from backend records.
- ✅ Checks after each step (full isolated browser stack each time):

  | Step | `make test` | `make smoke` | `npm run e2e` |
  |---|---|---|---|
  | Theme and fonts | 104 passed | Both robots PASS | 7 passed |
  | Shell | 104 passed | Both robots PASS | 8 passed |
  | Landing and ParticleArm | 104 passed | Both robots PASS | 8 passed |
  | Routes | 104 passed | Both robots PASS | 9 passed |
  | Shared UI, final revisions | 104 passed | Both robots PASS | 10 passed |

- ✅ Added browser coverage for theme persistence, history status filters, skill search, keyboard graph selection,
  and all redesigned routes at a narrow viewport with reduced motion. The initial narrow-screen failure was
  repaired and the complete suite rerun successfully. `npm run lint` and a separate production build also pass.
- ✅ Refreshed `assets/screenshots/` using `frontend/scripts/screenshots.mjs` against a production build and an
  isolated copy of real recorded test runs. Added memory graph, run evidence, dark landing and mobile views.
- Backend test runs retain the existing Starlette/httpx deprecation warning; no test failures remain.

## Skill librarian 🟡 (steps 1–3 of 4 done 2026-10-29, branch `feat/skill-librarian`)
- ✅ Step 1 — offline librarian backend: `services/librarian/offline.py` organizes published capsules by fixed
  rules into a stored `LibraryReport` (collections by scene family × route class; duplicates = same robot, identical
  task geometry and strategy, earliest kept; gaps = robot missing a scene family / original never adapted on another
  robot; one transfer suggestion per untransferred original). Read-only over skills; suggestions are not executed.
- ✅ API: `POST /api/library/reports` (offline only), `GET /api/library/reports/latest`, `GET /api/library/reports/{id}`;
  `library_reports` table in the registry. 11 new tests (119 backend total), `make smoke` PASS. No model calls.
- ✅ Preview on a copy of the dev registry: 11 skills = 3 distinct skills + 8 duplicates; one gap — Panda
  `over@0.08` on seed 42 has no UR5e adaptation.
- ✅ Step 2 — Muse librarian (`services/librarian/muse.py`): facts still come from the offline rules; Muse only
  adds a summary, per-collection notes and a suggestion order + rationale (model-written, labelled). Read-only tools
  `inspect_skill`, `compare_skills`; 1 tool round + forced JSON answer, low reasoning effort. Unknown ids dropped and
  noted; text length-capped; text implying hardware/physical/real-world results is dropped (simulation-only).
  Failure → offline report stored with `fallback_error` and the billed calls. `POST /api/library/reports
  {"provider": "meta"}` (409 without key). Shared Meta tool loop extracted to `reasoning/meta_client.py`
  (transfer provider unchanged in behaviour). 10 mocked tests; full suite verified to make no real Meta calls.
- ✅ One live check (2026-10-29): `lib_20261029_202931_e5fcbd`, 1 call, 2,891 in / 682 out tokens, $0.00043.
  Muse ranked the one real gap (Panda seed-42 `over@0.08` → UR5e) and wrote sensible notes, but described
  results as "Panda hardware" / "UR hardware". That report is kept as recorded (pre-guard); the prompt and the
  hardware-claim guard were added afterwards and are covered by tests, not by a second paid call.
- ✅ Step 3 — "Librarian" tab in the Skill Library (`components/library/`): shows the latest report; "Organize
  library" with Offline rules (default, free) or Meta Muse Spark (disabled without a key). Provider badge, model
  usage/cost line, stats from the report, suggestions linking to the Transfer Lab ("not executed"), collections,
  duplicates ("skills are kept as published"), gaps; model text marked "model-written"; skill chips open the skill.
  Verified in the browser on the dev registry (desktop, 375 px, dark theme; no console errors).
- ✅ e2e: new librarian test (offline only, skills unchanged). The isolated e2e backend now runs with
  `MODEL_API_KEY` blanked: with the key in `.env` the header label changed and the transfer test failed, and UI
  tests must never spend credits. 11 Playwright tests pass; 129 backend tests; smoke PASS.
- ⬜ Step 4 — docs, e2e.


## URSim controller execution 🟡 (2026-10-29, branch `feat/ursim-execution`)
- ✅ URSim e-Series 5.26.3 (UR5e) runs on this Mac under amd64 emulation: ~30 s boot, ~1.5 GB RAM. `ur_rtde` 1.6.5
  has no macOS wheels, so it runs in a Linux container (`backend/ur_bridge`, `make ursim-up`).
- ✅ Frames: joint zeros/order match the Menagerie UR5e; the controller base frame is the Menagerie base body rotated
  180° about z. TCP agrees within 1.1 mm at 4 configurations (declared in `robot_catalog.py`, regression test).
- ✅ Transfer option `execute_on: "ursim"`: after MuJoCo verification the path is retimed with the MuJoCo speed rule,
  streamed (moveJ approach, 125 Hz servoJ, final pose held) and stored as `results.controller_execution` with
  checks. It never changes run status or the capsule. `GET /api/controller/status`; Transfer Lab checkbox + panel.
- ✅ 26 new tests with a fake controller behind `httpx.MockTransport` (no URSim/ur_rtde/network): bridge input
  checks, safety refusal, protective stop, pacing, final hold, frame regression, unreachable bridge, transfer
  integration. Backend suite 155 passed.
- ✅ Live (dev registry, offline planner, no model calls): Librarian gap `skill_reach_over_c2513e` → UR5e.
  - `run_20261030_033654_dfc601`: URSim step **failed** honestly. 211 samples were sent in 0.92 s (ur_rtde
    `waitPeriod` paces at 500 Hz) and `servoStop` cut the lagging arm short: 0.30 rad final error, 188 mm from
    target. Kept as recorded.
  - Fixed: own-clock pacing and holding the final pose.
  - `run_20261030_033905_195f82`: **succeeded**. Controller TCP was 0.59 mm from the target and 0.49 mm from
    MuJoCo FK; final joint error 0.08 mrad; 2.43 s on the controller for a 1.69 s path; all 6 checks pass.
- ⬜ Not physical: URSim has no obstacle, payload or real dynamics. A borrowed physical UR e-Series arm would use the
  same bridge (`UR_HOST`); untested.

## Real robot data, How it works, cloud image 🟡 (2026-10-30, branch `feat/ursim-execution`)
- ✅ DROID import: 8 real Franka Panda episodes (`lerobot/droid_100`@87301a2d2e99, MIT), end-effector positions at
  15 Hz, selection rule recorded in the file (D64). 82 of 100 episodes stay above the base plane; the first 8 with a
  task description, 5–20 s and >= 0.4 m of motion are kept.
- ✅ Real replays (`POST /api/real-data/replays`, run type `real_replay`): the robot stands where the recording robot
  stood, re-solves the path with its own IK, executes in MuJoCo paced to the recorded duration, and is measured
  against the real path (10 mm limit). Optional URSim step (shared with transfers).
  - First probe at 1 rad/s: every replay failed at 30–70 mm (corners cut, sparse trace). Paced to real timing:
    Panda 8/8 pass (3.3–6.7 mm); UR5e 2/8 pass (7.3, 9.6 mm), 6 fail at 10.1–14.1 mm, recorded as failed.
- ✅ Website: Real Data page (recorded vs simulated path plots, replay, step log), How it works page (pipeline,
  evidence legend, live server status), evidence tags, new nav, footer no longer says "simulation only" for
  everything.
- ✅ Cloud mode: static export served by the API (`NIMBOTICS_WEB_DIR`), queued-job cap (429), one-container image
  `deploy/Dockerfile` (URSim + bridge + API + site, uid 1000, :7860), `deploy/push_space.sh` for Hugging Face.
- ✅ Cloud image built and run locally (amd64 emulated, 6.5 GB): site + API on :7860 as uid 1000; demo registry
  seeded at build (motion checks, seed-7 chain, benchmark all succeeded). URSim self-configures in ~25 s after its
  dashboard is up (safety confirmed, powered on, brakes released, Remote via xdotool; `/api/controller/status` ready).
  - First run: URSim's controller restart hung on a zombie (`killall -w`) because uvicorn was PID 1 → `tini`.
  - `run_20261030_190913_786823` in the container: DROID episode 22 (“Use the duster to wipe the whiteboard”) on the
    UR5e, max deviation 7.3 mm (pass), then URSim: TCP 0.91 mm from target, 0.54 mm from MuJoCo, 14.8 s.
- ✅ Tests: 171 backend, 14 Playwright.
- ⬜ Hugging Face Spaces refused the Space (HTTP 402: Docker Spaces need PRO since 2026). Free host instead: GitHub
  Codespaces (`.devcontainer/`, `deploy/codespace.sh`, D68); `deploy/push_space.sh` stays for a later switch.
- ✅ Live on GitHub Codespaces (2026-10-31): codespace `agentnet-demo` (created before the rename) (4-core, 16 GB), image built in ~8 min, port
  7860 public. URSim self-configured (ready, Remote, NORMAL). `run_20261031_182656_61b523` over the public link:
  DROID episode 22 on the UR5e, max deviation 7.3 mm (pass), then URSim: TCP 0.92 mm from target, 0.54 mm from
  MuJoCo, 1802 samples at 125 Hz, no protective stop. Wall clock 154 s.

## How it works rewrite ✅ (2026-10-31)
- Beginner-first How it works page (`frontend/components/how/`): the idea in four steps, the wall task with a side/top
  sketch, a "What is a seed?" box, five steps each with a collapsible technical detail, the four evidence labels in
  plain words, a 16-term glossary, a quick start and the live server status (plain wording; raw detail as tooltip).
  Landing page and colour scheme unchanged. Tests: 14 Playwright.
- ✅ Site-wide plain language: one glossary (`frontend/lib/glossary.ts`) feeds the How it works list and `<Term>` "?" hints
  (seed, route ranking, URSim, imagination, endpoint error, path deviation, passport, skill, benchmark, DROID). Shared
  `PageHeader` with a plain one-line intro on every page. Evaluation uses plain approach names and column headers
  (raw ids kept beside them). Fleet cards side by side. Tests: 15 Playwright.

## Bigger fleet, sign-in, simpler pages ✅ (2026-10-31)
- ✅ Fleet catalog: UR10e, KUKA iiwa 14, xArm 7, Lite 6, FR3 from the pinned Menagerie commit (`fetch_models.sh`).
  Probe runs before inclusion: UR10e/iiwa 14/xArm 7/FR3 passed discover (seeds 42, 7) and transfer from a Panda skill
  (same and new layout), endpoint error 0.5–1.2 mm; Lite 6 failed 3 of 4 (kept); Gen3 and Sawyer dropped (D70).
  `GET /api/robots/catalog`, `POST /api/robots/{id}/enable`; only fleet arms can run (409 otherwise).
- ✅ Any two fleet arms can be teacher and learner in Transfer Lab and Real Data. Live check: Panda → iiwa 14, layout 7:
  the iiwa could not use the Panda's far-side route (collisions), went over the wall instead, 0.81 mm, 0 contacts.
- ✅ Sign-in with Google and GitHub (D72): `/api/auth/{config,me,login,callback,logout}`, gated POST endpoints,
  `started_by` on runs; header button, sign-in dialog, buttons ask to sign in when needed. Not live until the OAuth
  apps exist (deploy/README.md).
- ✅ UI (D73): soft surfaces and motion off the landing page; page map; Robots (cards, at a glance, full passport
  behind a disclosure, Add a robot); Transfer Lab (robot pickers, two plain steps, decision detail in one section);
  Skills (plain skill names, librarian explained); Real Data and Results trimmed; new Under the hood page.
- ✅ Tests: 244 backend (new: auth, fleet), Playwright suite updated (Under the hood, add-a-robot).

## Simpler site, reliable progress on the cloud ✅ (2026-10-31)
- ✅ "Backend unreachable" on Real Data replays (live site): reproduced. The Codespaces proxy cut the progress stream
  after 100 s of silence while replays queued and ran for ~2 min each (139 s executing, mostly OSMesa rendering).
  Fixed with SSE keep-alives + polling fallback (D74) and lighter cloud video settings (D75); the page now says when a
  run is waiting its turn on the shared simulator.
- ✅ Navigation cut to six items; How it works moved under the home hero (with "Where the AI model fits").
- ✅ Try it: a three-step guided flow (pick robots → teacher learns and saves → learner learns and saves), plain
  result sentences built from the stored run, and "What just happened" telling that run's story; technical detail
  (imagination, joint limits, log) behind a disclosure.
- ✅ Robots: plain facts with one-line meanings, task counts (not saves), technical sheet behind a disclosure.
- ✅ Skills rebuilt as task cards (who can do it, how, learned itself / from whom, who can't yet), robot filter,
  librarian strip with plain suggestions.
- ✅ Results: computed verdict with an honest caveat (wall + roof layouts needed more searching), two bar comparisons,
  plain descriptions of the three approaches; full comparison and raw data behind disclosures.
- ✅ Tests: 244 backend, 17 Playwright.

## Watch runs live, see every try ✅ (2026-11-01)
- ✅ Try it, All runs and Real data show the simulation while it runs: a live MuJoCo picture (newest rendered frame)
  next to the run's stages (set up, routes checked, route order from the teacher's skill, physics tries, final
  recording), filled in as progress events arrive, plus a map of every route drawn as it is checked (D77).
- ✅ Every physics try now has its own clip and hand path; any try can be replayed from the step list (D78).
- ✅ "All runs" is in the nav. A run opens in a dialog in view (it used to open above the list, off screen), filters
  cover every run type, results filter on the server, and the list pages instead of capping at 200 (D79).
- ✅ Cloud: rendering without shadows (5× faster frames on OSMesa); registry and clips on a Docker volume so redeploys
  keep runs.
- ✅ Deployed 2026-11-03 (`020d64f`): the 9 runs already on the live site were copied onto the `nimbotics-runtime` volume;
  a discovery run on layout 77 showed live frames, recorded 3 try clips and finished in 9.4 s (was ~17 s with one clip).
- ✅ Tests: 252 backend (live frames, try clips, route events, compact list, paging), smoke, Playwright.

## Logo ✅ (2026-11-03)
- ✅ New wordmark (`frontend/components/Logo.tsx`): the leading n is drawn as a robot arm with its gripper as a dot,
  and the dot on the i is the accent color; drawn in em units so it matches IBM Plex Sans at any size. Used in the
  header and presentation mode; screen readers hear "nimbotics".
- ✅ App icon: the arm n on a dark rounded tile (`app/icon.svg`), rendered into `favicon.ico` (16/32/48) and
  `apple-icon.png` (180).

## Own domain ⬜ (2026-11-03, waiting on the domain)
- ✅ `deploy/codespace.sh` starts a Cloudflare Tunnel (`cloudflare/cloudflared:2026.10.0`, host network → :7860) when
  the `CLOUDFLARE_TUNNEL_TOKEN` Codespaces secret is set; nothing changes without it (D80).
- ✅ `www.` of `NIMBOTICS_PUBLIC_URL` redirects to it (308, path and query kept); the apex, codespace link and
  localhost are served as before. Tests: `test_cloud.py` (+2).
- ⬜ Buy nimbotics.net, add it to Cloudflare, create the tunnel, set the secrets, update the OAuth callback URLs
  (steps in deploy/README.md). Not yet checked against a live tunnel.


## Teach page, more tasks and robots, robot upload, Muse skill scout ✅ (2026-11-03)
- ✅ Menu: "Try it" is now **Teach**, after Skills (Home, Robots, Skills, Teach, Real data, Results, All runs).
- ✅ Layout numbers are no longer asked for: each run gets a new random layout; "Repeat an exact layout (advanced)"
  explains and sets one. The learner chooses "the same layout" or "a new random layout" (D81).
- ✅ Six task types with a picker and top-view sketches; teaching runs take a task type (D81).
- ✅ Catalog: Kinova Gen3, Rethink Sawyer, Unitree Z1 (10 arms); resting-contact exclusions and unlimited ranges fixed
  (D82). Smoke: all 10 PASS.
- ✅ Upload your own robot on the Robots page (MJCF, URDF or zip with meshes), with an example arm to download; the
  example plans 5 of 6 task types, a zipped Menagerie ViperX (meshes) uploads, PiPER is refused with its sag (D83).
- ✅ Muse skill scout on the Teach page: "Describe it" → task type, skills to learn from or a teacher, one click sets
  up the steps; offline scout without a key (D84). Verified locally with a real call: "Put a cup on a high shelf" →
  shelf task, teach the Panda first; the Panda then learned it (layout 2881) and the UR5e learned it from the Panda.
- ✅ Smoother live view: buffered frames at 15 fps, played back evenly (D85).
- ✅ Tests: 314 backend (uploads 12, scout 10, live buffer 2, task types), smoke 10/10, Playwright.
- ⬜ Live site: Muse needs the `MODEL_API_KEY` Codespaces secret (deploy/README.md); until then it shows the offline
  scout.
