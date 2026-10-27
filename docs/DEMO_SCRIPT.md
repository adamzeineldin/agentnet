# Demo script (2–3 min video)

**Setup (once):** `make setup`, then `make transfer` to record one real Panda → UR5e chain for replay.
**Start:** `make dev`, open http://localhost:3000, click **▶ Present** (top right). Record at 1280×720 or larger.

Presentation mode has two sources, always labelled on screen:
- **Replay recorded** — plays the latest recorded chain from the registry (`GET /api/demo/story`). Use this for
  a smooth take; the badge shows when the runs were recorded.
- **Run live** — **▶ Play live demo** runs discovery (seed 7) → publish → transfer → publish for real (~20 s on an
  M-series Mac) and auto-advances. Every scene shows **● LIVE**.

Videos play at **0.5× speed**, labelled on the clip. All numbers on screen come from the stored run records.

| Scene | On screen | Say (accurate claims only) |
|---|---|---|
| Opening | Overview | “Robots learn useful things, but their experience usually stays trapped inside one body.” |
| 1 · Discover | Panda clip, 10 candidates, rejected/verified counts | “The Panda searches ten candidate routes past the wall. MuJoCo rejects seven before anything moves; three verify in physics; the cheapest is executed with sub-millimetre error and zero contacts.” |
| 2 · Publish | Capsule card | “It publishes an Experience Capsule: task-frame geometry, the strategy, every candidate’s outcome, and the run that verified it — but no joint angles.” |
| 3 · Passports | Panda 7-DOF vs UR5e 6-DOF | “The UR5e has a different body: six joints instead of seven, a bare flange instead of a hand.” |
| 4 · Imagine | Prior #1 collision note, future thumbnails, planner badge | “It retrieves the capsule and tries the Panda’s strategy first — but its forearm would hit the wall. It falls back to the Panda’s alternative, previews futures in MuJoCo, and picks the first verified one.” (Say “offline planner” unless the badge reads Meta Muse Spark.) |
| 5 · Adapt | UR5e clip, lineage chain | “The UR5e solves its own joint path, executes it in simulation, and publishes the adaptation with lineage back to the Panda’s skill.” |
| Close | — | “An interoperable, simulation-verified system for exchanging and adapting robot motion experience across different simulated bodies.” |

**Do not say:** physically tested, trained policy, foundation model, guaranteed improvement, or that Meta reasoning
was used when the badge says offline. A measured baseline comparison is Milestone 6 and is not shown yet.

**If something fails live:** the run is recorded as failed with its reason (shown in red); switch to **Replay recorded**.
