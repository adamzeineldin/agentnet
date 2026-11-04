# Architecture (M6)

```
Next.js Control Center ──HTTP/SSE──▶ FastAPI ──submit──▶ Simulation worker (1 thread)
  Home / Lab / Library               api/robots, runs        scene → RobotAdapter → IK → execute_path → render
                                       │                                   │
                                       └──── Registry (SQLite: passports, runs) ◀──┘   artifacts/ (MP4, PNG)
```

- **scene.py** builds the MJCF with `MjSpec`: Menagerie scene + Nimbotics TCP site (if needed) +
  obstacle boxes (collidable) + target/waypoint marker sites (visual only).
- **robot_adapter.py** discovers joints/actuators/EE from the compiled model; FK, Jacobian, servo
  commands, contact classification, kinematic collision screening.
- **kinematics.py** DLS position IK. **simulation.py** speed-limited interpolation, physics execution
  with adaptive settle, dense path screening.
- **passports.py** builds `RobotPassport` (model facts + sampled workspace + IK probes, provenance-tagged).
- **jobs.py** single worker, run creation, typed events; any exception becomes a `failed` run.
- Run status vocabulary: `queued → profiling → retrieving → checking → proposing → planning →
  simulating → selecting → executing → verifying → publishing → succeeded | failed`.

## Skill discovery (M2)

```
generate_task(seed) ─▶ TaskSpec (task frame) ─▶ world_scene(placement) ─▶ MjSpec model
                         │
 generate_candidates ─▶ 10 RouteCandidates ─▶ evaluate_candidate:
                         IK tracking → continuity → kinematic screening → clearance  (route_planner.py)
                         │ feasible, sorted by cost
                         ▼
 physics_rollout × top-3 (fresh MjData each) ─▶ select lowest-cost verified
                         ▼
 re-execute winner with FrameRecorder ─▶ verify (incl. reproduces rollout) ─▶ capsule draft in run.results
                         ▼
 POST /api/skills {run_id} ─▶ publish_from_run ─▶ skills table (lineage via parent_skill_id)
```

## Cross-robot transfer (M3)

```
POST /api/transfers {source_skill_id, target_robot_id, scene_seed?}
  retrieving  registry.get_skill  ─▶ capsule (task-frame geometry, strategy, source outcomes; no joints)
  profiling   task (stored or regenerated) placed in target base frame; target solves its own start pose
  checking    compatibility vs target passport (advisory)
  proposing   prior_order(candidates, capsule)            (transfer.py)
  checking    evaluate_all on target kinematics           (candidate_search.py)
  simulating  rollout(order = prior, budget = 3)
  selecting   first verified in prior order
  executing / verifying  → adaptation capsule draft (parent_skill_id, lineage) → POST /api/skills
```

## Collective Imagination + reasoning (M4)

```
evaluate_all (target kinematics) ─▶ ReasoningContext (task, capsule, both passports, kinematic results, prior)
  provider.propose_strategies ─▶ validate_ranking ─▶ order
     OfflinePlanner | MetaMuseProvider (tools: inspect_robot, inspect_skill, check_candidate,
                                        summarize_failure, submit_ranking; ≤4 rounds; JSON-schema final)
  imagine: for each feasible id in order (≤ budget): fresh reset → physics_rollout → thumbnail + trace
           failed future → provider.revise_strategy (bounded)
  select first verified in final order ─▶ execute_and_verify ─▶ adaptation capsule
  results.reasoning: provider used, calls, tokens, cost, offline expected selection, changed_selection_vs_offline
```

## Evaluation (M6)

```
benchmark.run_benchmark
  dev library: discover_headless(panda, dev seeds × families)   (in memory, never published)
  for each held-out scene: prepare(ur5e) once → retrieve nearest same-family capsule
     run_variant(order) for baseline_no_sharing | retarget_only | nimbotics_offline
        lazy: kinematic stages → physics rollout if feasible → stop at first verified (≤3 rollouts)
  summarize (per family / all / common) + paired_vs_baseline → run.results
scripts/benchmark.py → docs/EVALUATION_RESULTS.md (generated)     Library → Runs → Comparisons
```
