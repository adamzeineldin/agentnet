# Cloud deployment

The whole system runs in one container, `deploy/Dockerfile`:

| Process | What it is |
|---|---|
| `uvicorn app.main:app` on **:7860** | API, single MuJoCo worker thread, and the static website (`AGENTNET_WEB_DIR`) |
| URSim 5.26 (UR5e) | Universal Robots' controller software, from UR's official `universalrobots/ursim_e-series` image |
| `ur_bridge` on :8765 (internal) | `ur_rtde` 1.6.5 bridge between the API and URSim |
| `ursim_setup.py` | Powers URSim on, releases the brakes, confirms the default safety configuration, and switches the pendant to Remote |

When the image is built, the following happen:

1. The pinned MuJoCo Menagerie models are fetched.
2. A demo registry is seeded from real simulation runs (`seed_demo.py`).
3. The website is exported as static files.

When the container starts, it copies the registry to a writable location. New runs last until the container
restarts.

## Hugging Face Spaces (free CPU: 2 vCPU, 16 GB)

Log in once yourself:

```bash
hf auth login
```

Use a token with write access from https://huggingface.co/settings/tokens. Then push:

```bash
deploy/push_space.sh <your-user>/agentnet
```

The script uploads the committed files only, so `.env` and local data are never uploaded. It puts the Dockerfile
at the Space root and adds the Space front matter to `README.md`. The first build takes about 15–25 minutes.

Defaults on the public copy:

- No `MODEL_API_KEY`, so strategy reasoning is the offline planner. If you add the key as a Space secret, every
  visitor could spend your Meta credits.
- At most 3 queued simulation jobs (`AGENTNET_MAX_PENDING_JOBS`). Further requests get HTTP 429.
- URSim is ready about 1–2 minutes after start. Until then, the "also run on URSim" option stays disabled, and
  How it works shows the reason.
- A free Space sleeps after 48 h without visitors, and its disk is not persistent.

## Run the same image locally

```bash
docker build -f deploy/Dockerfile -t agentnet-cloud .
```

```bash
docker run --rm -p 7860:7860 agentnet-cloud
```

Then open http://localhost:7860. On Apple Silicon the image runs under amd64 emulation, so it is slow but works.

## What this is not

URSim is controller software on an idealized arm. The obstacle exists only in MuJoCo, and no physical robot is
attached. The site labels every result with its source: a real recording, a MuJoCo simulation, URSim controller
software, or model-written text.
