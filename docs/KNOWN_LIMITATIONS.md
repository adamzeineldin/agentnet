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
- Cross-robot transfer, Meta reasoning and evaluation are not implemented yet.
