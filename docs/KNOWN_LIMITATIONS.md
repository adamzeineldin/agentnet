# Known limitations (current)

- Simulation only (MuJoCo 3.17.0). No claims about real-robot safety, payload, friction or calibration.
- Panda TCP site is declared by AgentNet (model has none); UR5e uses a bare flange site.
- IK is position-only; end-effector orientation is unconstrained.
- Workspace estimates are Monte-Carlo samples (3000, seeded), not exact reachability.
- Motion check is a single-robot capability test without obstacles; it is not a skill.
- Gravity compensation uses MuJoCo's bias forces (perfect model knowledge), which a real controller would not have.
- Skill discovery, transfer, Meta reasoning and evaluation are not implemented yet.
