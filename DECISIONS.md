# Decisions & assumptions

| # | Decision | Why |
|---|----------|-----|
| D1 | Python 3.13 venv (system default is 3.14) | Safer wheel availability for MuJoCo/SciPy; project supports ≥3.11. |
| D2 | Menagerie via sparse git checkout pinned to `f3b6013`, gitignored | Reproducible, only ~81 MB, avoids redistributing model assets. |
| D3 | Panda TCP site added by AgentNet on `hand` at +0.1034 m z | Menagerie Panda has no EE site; offset is Franka's documented flange-to-TCP. Tagged `declared` in the passport. UR5e uses the model's `attachment_site`. |
| D4 | Use `panda.xml` (with hand) not `panda_nohand.xml` | Hand is real collision geometry and looks like the robot; gripper held open, unused (tool_type says so). |
| D5 | Arm joints = hinge/slide joints on the chain EE→world; actuators must be joint-transmission position servos (bias = [0, −kp, −kv]) | Detects structure from the model; `ctrl` is a joint position target only after this check. |
| D6 | Gravity/Coriolis feed-forward: servo setpoint = q_target + qfrc_bias/kp | Plain PD servos sagged 6–9 mm under gravity (measured). Feed-forward uses MuJoCo's own bias forces from the simulated state; recorded in passport assumptions. |
| D7 | Adaptive settle after the last setpoint (|Δq| < 0.5 mrad, |q̇| < 0.01, cap 2.5 s) | UR5e wrist servos (kp 500) needed ~1–1.5 s; fixed 0.6 s left 4–5 mm error. Settle time is recorded per run. |
| D8 | Position-only IK (DLS, λ=0.05, null-space pull to home, ≤0.15 rad/iter, multi-seed, collision rejection) | Sufficient for a reaching task; orientation constraints can be added if transfer needs approach direction. |
| D9 | Joint-space linear interpolation at ≤1.0 rad/s per joint | Simple, speed-limited; task-space paths come in M2 via IK waypoints. |
| D10 | Collision = any MuJoCo contact involving a robot geom (self/obstacle/floor/env) | Conservative; finger/self contacts at home were checked to be zero for both robots. |
| D11 | Single `ThreadPoolExecutor(max_workers=1)` simulation worker; SSE by polling SQLite | MuJoCo/GL state never crosses threads; no extra infra. |
| D12 | Runs stored as validated Pydantic JSON in SQLite; updates create new records (`model_copy`) | Immutable records, easy replay, schema-versioned. |
| D13 | Frontend data pages are client components under thin server pages | Next 16 `cacheComponents` prerenders shells; live backend data is fetched client-side. `useSearchParams` wrapped in `<Suspense>`. |
| D14 | CORS: regex for localhost/127.0.0.1 any port | Next dev may move off :3000; app is local-only. Override via `AGENTNET_CORS_ORIGIN_REGEX`. |
| D15 | Data-mark color `#0ea5c6` | Passed the dataviz validator lightness band and contrast on the dark surface; brighter cyan kept for UI chrome only. |
| D16 | Skill Library / Transfer Lab nav items shown disabled | Avoid UI that does not map to backend data before M2/M3. |
| D17 | Task frame: origin on the floor in front of the robot, +x radial, +y lateral, +z up; placement = translation (+ yaw, not yet supported for boxes) | Capsules carry geometry in a robot-independent frame; target robots re-place it in their own base frame. |
| D18 | Source skill = enumerated route classes × clearances, not RRT | Plan's recommended start; gives interpretable, transferable strategy classes and honest per-candidate failure reasons. |
| D19 | IK tracking along 2 cm task-space steps, each seeded by the previous solution; reject joint jumps > 0.25 rad | Prevents IK branch flips producing sweeping motions between screened samples. |
| D20 | Minimum link-obstacle clearance 10 mm (from `mj_geomDistance` on every 25th physics-rate sample) | Contact-free but grazing paths are rejected as unsafe; threshold recorded in reasons. |
| D21 | Cost = joint path length (rad) + 1.0 × EE path length (m); top 3 feasible by cost get physics rollouts | Matched simulation budget per run; mixed units are documented, weights are not tuned. |
| D22 | Discovery drafts the capsule; publishing is a separate explicit call | Matches the "Publish Experience" step; failed runs can never become validated capsules. |
| D23 | Capability `obstacle_aware_reach` derived at read time from published skills (passport copy) | Stored passport stays a pure model/measurement artifact. |

## Open questions / blockers
- Meta Model API: no key configured yet; reasoning runs offline. Endpoint and tool-calling format to be verified against https://dev.meta.ai/docs before M4.
- Hackathon deadline/rules to be verified in the participant portal.
