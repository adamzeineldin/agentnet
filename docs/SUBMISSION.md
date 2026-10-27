# Submission checklist

Verified from https://dev.meta.ai/events/global-hackathon on 2026-10-27:
- **Deadline: Nov 4, 2026, 9:00 PM ET** (dates may change at Meta's discretion). Judging Nov 4–8, closing Nov 9.
- Two tracks; every project enters one. **Track 1 (Indie developer)**: creativity, technical ambition, whether it
  works. **Track 2 (Startup)**: technical execution, whether it holds up in production.
- Themes: *Build for Your World* or *Push the Frontier*. Meta models are encouraged (Muse Spark, Muse Image,
  SAM 3.1 via Meta Model API), not stated as required on that page.

**Not verifiable yet** — the page says Official Rules are published separately and they were not publicly
reachable: video length/format, required submission fields, repository visibility/license, team size, rules on
pre-existing code and third-party assets. Check these in the participant portal before submitting.

## Before submitting
- [ ] Read the Official Rules in the participant portal; update this file with video length and required fields.
- [ ] Choose track and theme.
- [ ] Decide on Meta usage: with a `MODEL_API_KEY`, run `agentnet_meta` (estimated cost is recorded per run).
      Without it, the video and README must keep saying “offline deterministic planner”.
- [ ] Add a LICENSE for this repo; keep Menagerie model licenses (fetched, not redistributed) credited in README.
- [ ] `make demo-check` → PASS; `make test`; `make e2e`; fresh-clone check (see PROGRESS.md M7).
- [ ] `make demo-seed && make demo`; record 2–3 min (or the rules' limit) following `docs/DEMO_SCRIPT.md`.
- [ ] Repository URL, video URL, short description using the accurate claim:
      “An interoperable, simulation-verified system for exchanging and adapting robot motion-planning experience
      across different simulated embodiments.”
