# Architecture (M3)

```
Next.js Control Center ──HTTP/SSE──▶ FastAPI ──submit──▶ Simulation worker (1 thread)
  Overview / Fleet / History          api/robots, runs        scene → RobotAdapter → IK → execute_path → render
                                       │                                   │
                                       └──── Registry (SQLite: passports, runs) ◀──┘   artifacts/ (MP4, PNG)
```

- **scene.py** builds the MJCF with `MjSpec`: Menagerie scene + AgentNet TCP site (if needed) +
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
