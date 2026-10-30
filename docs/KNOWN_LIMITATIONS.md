# Known limitations (current)

- Simulation only (MuJoCo 3.17.0). No claims about real-robot safety, payload, friction or calibration.
- Panda TCP site is declared by AgentNet (model has none); UR5e uses a bare flange site.
- IK is position-only; end-effector orientation is unconstrained.
- Workspace estimates are Monte-Carlo samples (3000, seeded), not exact reachability.
- Motion check is a single-robot capability test without obstacles; it is not a skill.
- Gravity compensation uses MuJoCo's bias forces (perfect model knowledge), which a real controller would not have.
- Skill discovery searches a fixed set of route templates (4 classes × 3 clearances), not a general motion planner.
- `wall_reach_v1` is easy: `over` routes were feasible on every seed tried for both robots.
- Placement yaw is not supported for box obstacles yet; all placements are pure translations.
- The side-view route diagram is a 2D projection; side routes appear to cross the wall there (captioned).
- Transfer ordering is a hand-designed prior over route classes; it is not learned.
- Both robots use the same placement; transfer across very different workspaces is untested.
- Meta Muse Spark is tested against mocked HTTP responses; live use so far is a handful of runs (see PROGRESS.md).
- URSim controller execution is controller software on an idealized arm: no payload, no real dynamics, and no
  obstacle (the wall exists only in MuJoCo). The `moveJ` approach to the path start is not collision-checked.
  Nothing has run on a physical arm.
- URSim settings (remote control, safety confirmation) are set by hand in the pendant after every fresh container.
- The model ranks a fixed set of 10 template hypotheses; it cannot invent new routes or parameters.
- "Offline would select" may be a kinematic estimate when the offline choice was not simulated (labelled).
- On wall_reach_v1 the offline prior already succeeds on the first future, so there is little room for a model to help.
- Evaluation: shared experience did not raise success over a from-scratch search; it reduced search effort on
  11/17 scenes and increased it on 6 (negative transfer on wall_roof_v1). n=20 held-out scenes, no CIs.
- Side routes are often infeasible because IK is position-only with a posture bias toward the start pose.
