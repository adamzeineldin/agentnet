# AgentNet engineering rules (condensed)

- Never fake simulation results, hardcode success, or fabricate run histories. Every number in the UI
  must come from a stored backend run or a passport computed from the loaded model.
- Simulation verification is not physical-world proof; say "simulation-verified".
- Transfer task intent and task-frame geometry, never source joint angles. Target robots re-solve IK.
- Failure is a first-class state. Failed runs never create validated-success capsules.
- MuJoCo state lives only on the single simulation worker thread (`services/jobs.py`).
- Read joint/actuator/site names from the model (`RobotAdapter`); only `robot_catalog.py` holds
  declared facts, and passports tag every field with provenance.
- Offline planner must be labelled as such; never claim Meta Muse Spark was used unless a real call
  was made and logged. Keep `MODEL_API_KEY` server-side; never commit `.env`.
- Run `make test` and `make smoke` before reporting progress. Update PROGRESS.md / DECISIONS.md.
- Next.js 16 differs from older versions: read `frontend/node_modules/next/dist/docs/` before using
  unfamiliar APIs. Client components that read search params sit under `<Suspense>`.
