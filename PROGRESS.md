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

## Own domain ✅ (2026-11-03)
- ✅ `deploy/codespace.sh` starts a Cloudflare Tunnel (`cloudflare/cloudflared:2026.10.0`, host network → :7860) when
  the `CLOUDFLARE_TUNNEL_TOKEN` Codespaces secret is set; nothing changes without it (D80).
- ✅ `www.` of `NIMBOTICS_PUBLIC_URL` redirects to it (308, path and query kept); the apex, codespace link and
  localhost are served as before. Tests: `test_cloud.py` (+2).
- ✅ Live at https://nimbotics.net (2026-11-03): domain from Namecheap, nameservers moved to Cloudflare (Free plan),
  tunnel `nimbotics` with routes nimbotics.net and www.nimbotics.net → http://localhost:7860, Codespaces secrets
  `CLOUDFLARE_TUNNEL_TOKEN` and `NIMBOTICS_PUBLIC_URL`. Checked from outside: `/api/health` 200, home page 200,
  `www.nimbotics.net/robots?x=1` → 308 to `https://nimbotics.net/robots?x=1`; stored runs kept. Image built at
  `3e57264`. Sign-in is still off (no OAuth secrets), and the domain is down whenever the codespace is stopped.


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

## Muse designs new task types ✅ (2026-11-03)
- ✅ "Design a new task" on the Teach page: Muse turns a description into a new task type (layout, title, summary,
  what it leaves out), checked against fixed limits before it is saved; top and side sketches and the list of checks
  are shown; "Teach this task" selects it. Designed types are listed under the built-in ones with who designed them
  (D86). Offline designer without a key (6 templates: open box, beam, staggered walls, high shelf, staircase, wall).
- ✅ Measured: offline templates on Panda and UR5e, two layouts each: beam, staggered walls, high shelf, staircase and
  wall all learned; the open box was learned by the UR5e only (Panda and Gen3 hands hit its walls).
- ✅ Real Muse calls (local): "Reach over a low fence and into a bin behind it" → 1 call, $0.0009, learned by no arm (wrists hit the bin);
  with measured limits and learning evidence in the prompt, "Reach into a bin that sits behind a low fence" → 2 calls (Muse fixed a
  broken first layout), $0.0012; the UR5e learned it (over the fence, 8 cm clearance, 0.6 mm), the Panda did not.
- ✅ Tests: 350 backend (task design 36), smoke 10/10, Playwright 20/20.

## Landing page: How it works as a scroll story ✅ (2026-11-03)
- ✅ Below the hero, a pinned scroll-driven 3D illustration in the site theme tells the idea in four one-line beats
  (Learn, Remember, Adapt, Prove), caption centred above the scene and progress below it. The camera orbits as you
  scroll (perspective SVG, no 3D library). Arms are lit solids (pedestal and turret, tube links, joint housings, a
  two-finger gripper that closes around the start and target knobs); the glass wall is depth-sorted against the
  gripper; everything casts a floor shadow. Robot A's failed tries stop where any drawn part first touches the wall
  (spark, red flash, an X at the end of each try's own route; the gripper is the widest part, so it is what meets the wall), the task folds
  into a skill card laid out like the Skills page (task, robot row, route, "learned it itself"); as Adapt begins the card
  lifts away, its route slides out of the thumbnail and settles as the dashed "Robot A's route" in front of a
  differently built Robot B while the task rises from the floor, and B previews and traces its own route, then the physics
  checks and the new skill's lineage. Clearances were checked numerically: successful routes clear the wall by about 28 units, failed tries
  touch it, no part passes through a post or the floor. It is an illustration and shows no run data.
- ✅ Under the story: seven short questions and answers (what it does, why not joint angles, who decides, where AI
  fits, real robots, which arms, failures) and "Try it now". The old step list, glossary, evidence cards and server
  status panel are gone from the home page; the simulation-only note is the "real robot" answer and the footer. On phones the stage shrinks
  to the scene with numbered progress.
- ✅ Tests: 350 backend, smoke 10/10, Playwright home + how-it-works tests updated and passing.

## Header: neumorphic nav pill ✅ (2026-11-03)
- ✅ The logo stands on its own at the left, sized to the nav pill (32px, 26px on phones) and aligned with the page edge; the nav sits centred in a recessed pill track with a raised thumb that
  slides to the current page (`components/NavPill.tsx`); Sign in / the user chip are raised soft buttons that press in.
  The header has no bar or border, just a light blur over the page. On phones the track scrolls to the current page.
- ✅ Playwright control-center 19/19. Frontend-only change, so backend `make test` / `make smoke` were not rerun.

## Console pages: less text, more at-a-glance visuals ✅ (2026-11-03)
- ✅ Robots, Skills, Teach, Real data, Results and All runs: page intros cut to one line; explanations that were
  paragraphs moved to hover hints (`title`) or became chips. Numbers are unchanged and still come from stored runs.
- ✅ Robots: facts are big-number tiles (joints, reach, learned itself, learned from others); upload rules are chips.
- ✅ Teach: the run steps show chips (placement, joints, route checks, final checks) instead of sentences; the learner
  step shows what it does as chips and the layout choice is a toggle. Offline / Muse labels are kept.
- ✅ Real data: pick the replay robot from thumbnail cards. Results: by-layout cards show where sharing helped or
  hurt; the generated sentences fold under "What the numbers say". All runs: cards use robot names (a replay
  showed "null → panda_01") and compact stat chips.
- ✅ `make test` 350 passed, `make smoke` pass, tsc + eslint clean; Playwright passes (see Library below).

## Library: skills and runs in one place ✅ (2026-11-03)
- ✅ Nav is now Home · Robots · Teach · Library. Real data and Results pages are gone; Skills and All runs became the
  Library's two views (`components/library/`). Old links (`/skills`, `/history`, `/real`, `/evaluation`) forward
  to the Library with their query.
- ✅ Shared filters across both views: search, robot, task type and one layout, plus where a skill came from (Skills)
  or run type and result (Runs). Everything is in the URL, including the open run.
- ✅ Links both ways: a task card → "Every run on this layout"; a skill → "Open the run that made it"; a run that
  saved a skill → "Its saved skill". Run cards name their task ("Reach past a wall · layout 7") and mark saved runs.
- ✅ Backend: `GET /api/runs?family=&scene_id=` filters by task type or layout; robot / task filters apply before
  paging (robot used to filter after the limit); compact runs carry `results.scene_id`. 3 new tests.
- ✅ `make test` 353 passed, `make smoke` pass, tsc + eslint clean, Playwright control-center 17/17 (real-data and
  results tests removed with their pages; a new test walks skill → runs → run → skill).
- Note: the dev backend on :8000 started before this change and has no auto-reload, so the layout filter and task
  names on run cards show only after it restarts.

## Home · Lab · Library ✅ (2026-11-03)
- ✅ Nav has three places. Teach is renamed Lab and lives at `/lab`; the Robots page is the Library's Robots view
  (fleet cards, at-a-glance tiles, technical sheet, add / upload). Picking an arm there sets the robot filter, and
  "See its skills" / "See its runs" switch view with that robot kept.
- ✅ `/transfer`, `/robots` (and the earlier `/skills`, `/history`, `/real`, `/evaluation`) forward with their query
  through `components/Forward.tsx`. Links across the app and `docs/ARCHITECTURE.md` point at the new places.
- ✅ `make test` 353 passed, `make smoke` pass, tsc + eslint clean, Playwright control-center 17/17 (tests now
  also check that `/robots` and `/transfer` forward).

## Library · Lab · Blog, and sign-in for the Lab ✅ (2026-11-03)
- ✅ Nav is Home · Library · Lab · Blog. The account control is always top right: a "Sign in" button (with the
  Google mark when Google is set up), or the user's picture and name with a profile menu (Open the Lab, Your posts,
  Write a post, Sign out). If sign-in isn't set up on the server, the dialog says so instead of hiding the button.
- ✅ Lab: signed-out visitors get one card ("The Lab is where robots learn", Continue with Google, browse the
  Library). The Library stays open; adding or uploading robots and saving skills ask for sign-in (server-enforced).
- ✅ Blog: list (newest first, featured first card), read, write with a preview, edit and delete your own posts.
  `backend/app/api/blog.py`, `models/blog.py`, `blog_posts` table; 9 backend tests.
- ✅ Checked in the browser against a temporary backend with placeholder Google settings: gate, the Google redirect
  (`accounts.google.com`, scope openid email profile, back to `/lab`), a signed-in test user writing a post,
  markup shown as text, profile menu, sign-out bringing the gate back, phone width.
- ✅ `make test` 362 passed, `make smoke` pass, tsc + eslint clean, Playwright 19/19 (new: sign-in placement and the
  "not switched on" dialog, and a blog write → edit → delete flow).
- ⬜ Real Google sign-in needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `NIMBOTICS_SESSION_SECRET` on the
  server, and the redirect URI `https://nimbotics.net/api/auth/callback/google` registered with Google
  (deploy/README.md, "Turning on sign-in"). Not set locally, so the Lab is open in local dev.

## Header: no Home item, bigger nav, black sign-in ✅ (2026-11-03)
- ✅ Nav is Library · Lab · Blog (the logo is the way home). Nav links are 44 px tall (track 56 px); the sign-in
  button is solid ink, 56 px, with the Google mark on a white disc; the signed-in chip matches its height.
- ✅ Measured at 1440 px: nav track and button both span y 16–72 (centre 44); the logo's letters measure 29.6–58.5
  (centre 44); logo left and button right sit on the page gutter (32 px). At 375 px logo and button share the top
  row on one centre line with 16 px gutters, nav centred below, no horizontal scroll.
- ✅ Restarted the dev backend on :8000 (nothing was running) so the blog API and run filters are live.
- ✅ `make test` 362 passed, `make smoke` pass, tsc + eslint clean, Playwright 19/19.

## Sign-in: why it didn't work, and the local fixes ✅ / ⬜ (2026-11-03)
- Cause: no Google client is configured anywhere (`/api/auth/config` shows no providers locally and on
  nimbotics.net), so the Sign in button could only say sign-in is off.
- ✅ Fixed two local-dev bugs that would have broken it even with keys: after Google, people were sent to the API
  origin (`:8000/lab`, a 404 in dev); now `NIMBOTICS_APP_URL` sends them to the pages (`:3000`). And the pages on
  `localhost:3000` called the API on `127.0.0.1:8000`, a different site, so the Lax session cookie was never sent;
  the default API base is now `http://localhost:8000`. Checked in the browser with a temporary user (removed).
- ✅ Local `.env` now has a generated `NIMBOTICS_SESSION_SECRET`, `NIMBOTICS_APP_URL` and empty Google fields.
- ⬜ Needs the owner: a Google OAuth client (redirect URIs `http://localhost:8000/api/auth/callback/google` and
  `https://nimbotics.net/api/auth/callback/google`), its id and secret in `.env` locally and as Codespaces secrets
  for nimbotics.net, then a backend / container restart (deploy/README.md, "Turning on sign-in").

## Google sign-in client created ✅ / ⬜ (2026-11-04)
- ✅ Google Cloud project `nimbotics` (account azeineld1@gmail.com): consent screen "Nimbotics", External, authorized
  domain nimbotics.net, home page https://nimbotics.net, privacy policy https://nimbotics.net/privacy; web client
  "Nimbotics web" with redirect URIs `https://nimbotics.net/api/auth/callback/google` and
  `http://localhost:8000/api/auth/callback/google`; published "In production" (basic scopes, no logo: no review).
- ✅ `/privacy` page added (linked from the footer), written from what the backend stores.
- ⬜ The client id and secret go into `.env` (local) and Codespaces secrets (nimbotics.net) by the owner; then restart.

## Sign in with email or Google ✅ (2026-11-04)
- ✅ Header shows a plain black "Sign in" (no Google mark) that opens `/signin`; pages `/signin` ("Sign in to
  Nimbotics": Google, or, email → password) and `/signup` ("Create your account": Google, or, email + password with a
  show/hide eye → your name) follow the owner's reference layout, with no site nav. The Lab gate offers Sign in and
  Create an account; both come back to where you were.
- ✅ Backend: `POST /api/auth/register`, `POST /api/auth/signin` (`api/password_auth.py`, `services/auth/passwords.py`,
  `credentials` table); 16 tests (hashing, one account per email, validation, one failure message, lockout, sign-up
  cap). Tests and Playwright now blank the session secret and Google keys so a filled-in `.env` can't leak in.
- ✅ Checked in the browser on localhost with a generated test account (deleted after): sign up → back to the Library
  signed in; sign out; wrong password → "Wrong email or password."; right password → back to the Lab; phone width.
- ✅ `make test` 379 passed, `make smoke` pass, tsc + eslint clean, Playwright 19/19. Privacy page covers email accounts.
- ⬜ No email verification or password reset yet (need an email sender). nimbotics.net still needs the Codespaces
  secrets and a deploy.

## Deployed to nimbotics.net ✅ (2026-11-04)
- ✅ Codespaces secrets: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (copied from the local `.env` without printing them)
  and a fresh fixed NIMBOTICS_SESSION_SECRET. Codespace restarted, `cddfbf8` pulled, image rebuilt, container swapped.
- ✅ Live: `/api/auth/config` shows Google + email accounts on; `/`, `/library`, `/lab`, `/blog`, `/signin`, `/signup`,
  `/privacy` and the old `/transfer`, `/robots` links answer 200; Google login returns to
  `https://nimbotics.net/api/auth/callback/google` and Google accepts the client.
- ⬜ A first real sign-in on the live site is the owner's to try.

## Library as a shared registry ✅ (2026-11-04)
- ✅ Library header is just the title and "Open the Lab"; one search bar sits under it. Typing searches the view;
  matching robots and task types are offered and become removable tokens. Fixed choices are chips (known by several
  robots / one, sort, run result, run type); no dropdowns.
- ✅ Skill cards: task from above plus teacher → learners (two names, then +N). A skill page lists who worked it out and
  who learned it from whom (collapsed after 6), "Not yet" robots (collapsed after 8) with a Teach link each, and links to
  every run on the layout. Robot pages show the arm, its counts, a paged grid of what it knows and the technical sheet.
- ✅ Past 12 skills, browsing shows one sideways row per task type (6 at a time); search or a task token shows a
  paged grid (24). Robots page 24 at a time; adding a robot sits behind one button.
- ✅ Removed: the librarian's "What to teach next" strip (backend API kept), the site footer's simulation sentence
  (footer keeps How it works · Privacy). Old `/robots?robot=` links open that robot's page.
- ✅ Fixed a race where removing a filter and typing straight after brought the filter back.
- ✅ Checked in the browser with real data, at phone width (no sideways scroll), and with the lists inflated 40× in the
  page only (160 skills, 43 robots) to see rows, paging and collapsing. `make test` 379 passed, `make smoke` pass,
  tsc + eslint clean, Playwright 19/19.

## Library: lists, no Runs tab ✅ (2026-11-04)
- ✅ Skills tab is a plain list (title, who taught whom, robot count); sections by task type once there are 13+.
  Robot cards keep their pictures.
- ✅ Runs tab removed. Runs now sit on the skill page (runs on that layout) and robot page (recent runs), collapsed to
  5 each. `/history` and old `?layout=` links still land somewhere sensible.
- ✅ Skill page: picture and robot list on the left, the picked robot's video/stats/lineage and the runs on the right.
  Robot page: facts, skills it knows, recent runs, technical sheet. Kept the Lab session's "Open it in the Lab" and
  "Teach the X" links.
- ✅ tsc + eslint clean; Playwright 19/19 together with the Lab session's rewritten Lab tests.

## Lab: librarian-first workflow and redesign ✅ (2026-11-04)
- ✅ The Lab is rebuilt in the Library's style: title, robot avatars as chips, one describe bar, task-type chips,
  one card that says what the library holds, and the run below it. Old four-step teacher/learner flow removed.
- ✅ Librarian check first (`POST /api/library/check`): replay a known skill (no retraining), adapt another robot's
  skill to this robot (best body match, saved when verified), or learn directly when nobody knows it (saved when
  verified). A requested source robot without the skill is explained and direct learning offered.
- ✅ "Improve this skill" adapts another robot's experience onto the same layout and keeps it only if it is verified,
  safe and measurably faster or shorter; the verdict and the measured comparison are stored on the run and shown.
- ✅ Task matching asks before creating: confident / unsure / none with alternatives and a question; designing a new
  task is the last option; near-identical designed layouts reuse the existing type.
- ✅ `make test` 391 passed (new: `test_learning_check.py`, `test_learning_api.py` with real MuJoCo runs of learn →
  adapt → improve), `make smoke` pass, tsc + eslint clean. Checked in the browser on a copy of the dev registry:
  replay, improve (kept, 2.82 s vs 2.82 s), adapt (UR5e onto a shelf, saved, card turned to "known"), learn (Panda
  between two posts, saved), Muse's unsure match, phone width without sideways scroll.

- 🐞 Live Muse scout answers were always cut off: reasoning tokens count toward `max_tokens`, and the shared 1200
  left ~130 for the JSON (finish_reason `length`), so every call fell back to the offline scout ("answer is not
  JSON" / "empty answer"). The scout now has its own `SCOUT_MAX_TOKENS = 4000` (like the designer) and logs each
  fallback. Checked with one real call: Muse answered (1240 reasoning tokens), match "none". When nothing fits,
  "Design a new task for this" is now the primary button (still a user click, never automatic).

## Cloud Library, phase 1: Postgres + R2 storage ✅ (2026-11-04)
- ✅ `DATABASE_URL` puts the registry on Postgres (psycopg 3, pre-ping for Neon); SQLite stays the local default.
- ✅ `NIMBOTICS_S3_*` file store (`services/storage.py`, R2 or any S3 bucket): run folders pushed after each run,
  snapshots after each passport, uploaded robots before they are recorded (store down → 503, nothing added) and
  pulled back at startup. `/artifacts` serves the disk copy, else redirects to the bucket.
- ✅ `scripts/copy_to_cloud.py` (rows + files, re-runnable), `scripts/make_bucket.py [--check]`,
  `deploy/cloud-dev.compose.yml` (Postgres 17 + moto S3 server), `backend-cloud-dev` launch config on :8010.
- ✅ Checked locally: the dev Library (45 runs, 13 skills, 1 uploaded arm, 256 files) copied into Postgres + the S3
  stand-in; an API started with an empty disk listed the same counts, fetched the uploaded arm, redirected an old
  run video to the bucket (same 39 232 bytes) and pushed a new motion check's `motion.mp4` + `final.png`.
- ✅ `make test` 411 passed (new `test_cloud_storage.py`: moto S3, /artifacts fallback, upload survives a lost disk,
  store-down upload refused, copy re-run; the Postgres case ran against Docker Postgres), `make smoke` pass.
- ✅ Real Neon + R2 in use on nimbotics.net since 2026-11-04 (see "Cloud Library live" below).

## Cloud Library, phase 2: private workspaces ✅ (2026-11-04)
- ✅ Owner + visibility on runs, skills and uploaded robots (DECISIONS D101). New signed-in work starts private; old and
  signed-out work stays public; existing databases gain the columns at startup.
- ✅ Every read is filtered by viewer: run/skill/robot lists and pages, live frames, event streams, transfers, improve,
  library check and scout; shared reports, the demo story and the task designer use public work only. `/artifacts`
  enforces the same rule and marks private files uncacheable; private bucket files get signed links only.
- ✅ `POST /api/visibility` with dependency plans (409 + list until confirmed; refuses changes that would break
  someone else's work). Library: "Everyone / Mine" chips (`?who=mine`), Private markers on skills, robots and runs,
  a visibility control on skill, robot and run pages, and the Lab says when a saved skill is private.
- ✅ `make test` 423 passed (new `test_sharing.py`: two accounts, private runs/skills/robots/files, publish with
  dependencies, refusals, sign-in off, old schema upgrade), `make smoke` pass, tsc + eslint clean. Checked in the
  browser on a copy of the dev registry: Ada's new skill showed only under Mine with a Private marker, its video
  played for her and was 404 for a signed-out visitor; "Make this skill public" listed its run, and after confirming
  the skill, run and video were public. Phone width: no sideways scroll.
- ⬜ Not run: Playwright e2e. Phases 3–4 (catalog arms in the store, more robot kinds).

## Cloud Library, phase 3: catalog arms in the file store ✅ (2026-11-04)
- ✅ `services/model_store.py`: each catalog arm stored under its Menagerie commit with a hash manifest; a server
  without the files fetches and hash-checks them (fleet arms at startup, others when added). DECISIONS D97.
- ✅ `copy_to_cloud.py` uploads the ten catalog arms (358 files); re-runs skip stored hashes. Fixed two copy bugs found
  on the way: a source or a target from before the phase-2 columns.
- ✅ Checked locally against Postgres + the S3 stand-in: an API started with an empty models folder fetched the Panda
  and UR5e at startup, and adding the Lite 6 fetched it on demand; all three hashes equal the local checkout.
- ✅ `make test` 429 passed (new `test_model_store.py`, two copy cases), `make smoke` pass.

## Cloud Library, phase 4: more robot kinds in uploads ✅ (2026-11-04)
- ✅ Any robot that carries an arm: limbs of 3–10 joints are offered (409 + list when there are several), the rest is
  held still (joints and what drives them removed, a floating base fixed at its home pose), every change listed in the
  report. Tasks and the motion check are placed in front of the arm's mount (`services/hold_still.py`, D98).
- ✅ Model-only uploads: any robot stored with a picture under "Stored models", private until shared, never run.
- ✅ Upload page: an arm picker and "keep it as a model only"; pages measure "in front" from the mount
  (`lib/placement.ts`).
- ✅ Real Menagerie robots at the pinned commit: ALOHA, Unitree G1, Unitree Go2 (model only) and TidyBot uploaded;
  G1 and TidyBot pass the motion check (0.6 mm, 0.2 mm). Wall reach layout 42 failed on G1, ALOHA and TidyBot with
  recorded physics reasons (self-contact, the held second arm, wall clearance).
- ✅ `make test` 434 passed (new `test_robot_kinds.py`), `make smoke` pass, tsc + eslint clean. Browser check on a copy
  of the dev registry: the ALOHA upload offered both arms and joined the fleet as private; the Go2 kept as a model only
  showed under Stored models, hidden from signed-out visitors until made public. Phone width: no sideways scroll.
- ⬜ Not done: rotated boxes for mounts that are not quarter turns (headings are rounded, and the placement says so);
  a whole-robot view in snapshots of uploaded arms (they use the arm camera).
- ✅ Library filters calmed (D99): the row of black chips (Everyone/Mine, Known by, Sort) became a quiet
  "All · My library" toggle (signed in), one Filters panel (known by, robot, task type, clear; a count badge when any
  is on) and a Sort menu. A "known by" choice now also shows as a removable token in the search bar. Checked in the
  browser at 1280 px and 375 px (panels open over the list, no sideways scroll, Escape returns focus).

## Lab and Library polish ✅ (2026-11-04)
- ✅ Lab decluttered (D96): robot and teacher are dropdowns (search from 7 robots), the decision card is task →
  one-line headline → stored metrics → one primary button, and the run shows the video beside a progress/result panel
  (result compared with the teacher's or old skill, final checks) instead of a 3D route picture. The 3D route view
  was dropped after review; designed tasks keep a 3D layout preview. Checked live (Capsule arm adapting the UR5e's
  shelf skill: 1.79 s vs 2.36 s, saved), at phone width; e2e 20/20.
- ✅ Library filters calmed (D99): the row of black chips (Everyone/Mine, Known by, Sort) became a quiet
  "All · My library" toggle (signed in), one Filters panel (known by, robot, task type, clear; a count badge when any
  is on) and a Sort menu. A "known by" choice now also shows as a removable token in the search bar. Checked in the
  browser at 1280 px and 375 px (panels open over the list, no sideways scroll, Escape returns focus).
- ✅ Faster, cleaner task matching: the scout uses minimal reasoning (5–9 s instead of 11–21 s on the live API,
  same answers after a layout-matching hint in the prompt). The suggestion card is one line with "Use this task", the
  alternatives, Muse's question with an answer box ("Search again"), and "Design a new task" last; the model name is
  no longer shown (offline answers still say "offline"). Example chips search straight away.

## Cloud Library live, no duplicate sharing, "Shared by" ✅ (2026-11-04)
- ✅ nimbotics.net runs on Neon Postgres + private R2 (checked from inside the container: postgresql, store configured).
  Copied: 32 runs, 7 skills, 5 passports, 105 files, 10 catalog arms; real R2 passed write/list/read/delete.
- 🐞 A local `.env` holding the production DATABASE_URL (pasted from Neon's "Copy .env") let a local `make transfer`
  write 2 runs + 2 skills (no videos) into production, and a local dev backend connect to it. Removed the lines and
  restarted the local backend on SQLite; the 2 stray runs remain for the user to delete (SQL given).
- ✅ Public sharing refuses duplicates (same robot + layout unless measurably better; the same robot model) and records
  who shared what (D102). `make test` 437 passed, `make smoke` pass, tsc + eslint clean; browser check: a robot made
  public shows "Shared by you" to its owner and "Shared by Ada" to signed-out visitors.
