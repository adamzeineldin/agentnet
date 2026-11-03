# Cloud deployment

The whole system runs in one container, `deploy/Dockerfile`:

| Process | What it is |
|---|---|
| `uvicorn app.main:app` on **:7860** | API, single MuJoCo worker thread, and the static website (`NIMBOTICS_WEB_DIR`) |
| URSim 5.26 (UR5e) | Universal Robots' controller software, from UR's official `universalrobots/ursim_e-series` image |
| `ur_bridge` on :8765 (internal) | `ur_rtde` 1.6.5 bridge between the API and URSim |
| `ursim_setup.py` | Powers URSim on, releases the brakes, confirms the default safety configuration, and switches the pendant to Remote |

When the image is built, the following happen:

1. The pinned MuJoCo Menagerie models are fetched.
2. A demo registry is seeded from real simulation runs (`seed_demo.py`).
3. The website is exported as static files.

When the container starts, it copies the registry to a writable location. New runs last until the container
restarts.

## GitHub Codespaces (free tier, the current host)

`.devcontainer/devcontainer.json` asks for a 4-core, 16 GB machine with Docker. When the codespace is created,
`deploy/codespace.sh build` builds the same image (about 15 minutes). Each time the codespace starts,
`deploy/codespace.sh start` runs that image on port 7860.

```bash
gh codespace create -R adamzeineldin/agentnet -b feat/ursim-execution -m standardLinux32gb --idle-timeout 240m
```

```bash
gh codespace ports visibility 7860:public -c <codespace-name>
```

The public link is `https://<codespace-name>-7860.app.github.dev`. Limits of the free tier:

- About 30 hours a month on this machine (120 core-hours).
- The codespace stops after 4 hours without activity in it; visitors to the link don't count as activity.
  Restart it with this command (or from github.com/codespaces) before a demo:

  ```bash
  gh codespace start -c <codespace-name>
  ```

- Runs and the registry are kept across stops, because the container is reused.
- The first time a browser opens the link, GitHub shows a one-time notice ("You are about to access a development
  port"); visitors click **Continue**.

### Turning on sign-in (Google and GitHub)

Without sign-in settings the public copy lets anyone start runs. To require an account for starting runs,
publishing skills and adding robots (browsing stays open), create the OAuth apps yourself and store their ids and
secrets as Codespaces secrets. Nimbotics never sees your passwords; it keeps only the name and avatar a provider
returns.

1. **GitHub**: github.com → Settings → Developer settings → OAuth Apps → New OAuth App.
   Homepage: `https://<codespace-name>-7860.app.github.dev`.
   Callback URL: `https://<codespace-name>-7860.app.github.dev/api/auth/callback/github`.
2. **Google**: Google Cloud console → APIs & Services → Credentials → Create OAuth client ID → Web application.
   Authorized redirect URI: `https://<codespace-name>-7860.app.github.dev/api/auth/callback/google`.
   The consent screen needs only the default `openid`, `email` and `profile` scopes.
3. Store each value as a Codespaces secret for this repository (each command prompts for the value):

   ```bash
   gh secret set GITHUB_CLIENT_ID --user --app codespaces --repos adamzeineldin/agentnet
   ```

   Repeat for `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Restart the codespace so it sees the secrets, then recreate the container (runs are kept on the
   `nimbotics-runtime` volume):

   ```bash
   gh codespace ssh -c <codespace-name> -- 'bash -lc "docker rm -f nimbotics; cd /workspaces/agentnet && bash deploy/codespace.sh start"'
   ```

`deploy/codespace.sh` passes the secrets into the container, sets `NIMBOTICS_PUBLIC_URL` to the codespace link
(OAuth redirects need the public address) and generates a session-signing secret.

### Turning on Meta Muse Spark

Without a model key the public copy uses the offline skill scout and route ranking, and says so on screen. To let
Muse plan on the live site, store your Meta Model API key as a Codespaces secret (the command prompts for it; the
key never enters the repository or the page):

```bash
gh secret set MODEL_API_KEY --user --app codespaces --repos adamzeineldin/agentnet
```

Then restart the codespace and recreate the container as in step 4 above. The image uses the
`muse-spark-1.3-contributor` model and caps the skill scout at 200 model calls per day
(`NIMBOTICS_SCOUT_DAILY_MODEL_CALLS`); repeated questions are answered from a cache.

### Own domain (nimbotics.net)

A codespace link can't take a custom domain, because GitHub's proxy only answers for its own hostname. A free
Cloudflare Tunnel connects the domain to the site instead. The tunnel only makes outbound connections from the
codespace, Cloudflare provides HTTPS, and visitors no longer see GitHub's "development port" notice.

1. Buy the domain. Then, in the Cloudflare dashboard, choose **Add a domain** (Free plan) and change the
   registrar's nameservers to the two that Cloudflare shows. If you buy the domain from Cloudflare Registrar, it is
   already set up this way.
2. Go to **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, name it `nimbotics`, and copy the
   token from the install command (the long string after `--token`).
3. In the tunnel, open **Public hostnames** and add two:
   - `nimbotics.net` → service `HTTP`, URL `localhost:7860`
   - `www.nimbotics.net` → the same service (the site redirects www to `https://nimbotics.net`)
4. Store the tunnel token and the public address as Codespaces secrets:

   ```bash
   gh secret set CLOUDFLARE_TUNNEL_TOKEN --user --app codespaces --repos adamzeineldin/agentnet
   ```

   ```bash
   gh secret set NIMBOTICS_PUBLIC_URL --user --app codespaces --repos adamzeineldin/agentnet --body https://nimbotics.net
   ```

5. If sign-in is turned on, change the OAuth apps to the new address: homepage `https://nimbotics.net`,
   callbacks `https://nimbotics.net/api/auth/callback/github` and `https://nimbotics.net/api/auth/callback/google`.
6. Restart the codespace so it picks up the secrets. Then recreate the site container so it gets the new public
   URL. Runs are kept on the volume. `codespace.sh start` also starts the `nimbotics-tunnel` container:

   ```bash
   gh codespace ssh -c <codespace-name> -- 'bash -lc "docker rm -f nimbotics; cd /workspaces/agentnet && bash deploy/codespace.sh start"'
   ```

7. Check the result: `curl -sI https://nimbotics.net/api/health` should return 200, and
   `curl -sI https://www.nimbotics.net/` should return a 308 redirect to `https://nimbotics.net/`. To see the
   tunnel's logs, run `docker logs nimbotics-tunnel` in the codespace.

The domain is only as available as the codespace. While the codespace is stopped (after 4 hours without activity,
or when the monthly free hours run out), nimbotics.net shows a Cloudflare error page. If you move to an always-on
server, run the same image and the same `cloudflared` command there. The domain setup stays the same.

## Hugging Face Spaces (needs PRO)

Since 2026, Docker Spaces on free CPU need a PRO subscription ($9/month); creating one without it returns HTTP 402.

Log in once yourself:

```bash
hf auth login
```

Use a token with write access from https://huggingface.co/settings/tokens. Then push:

```bash
deploy/push_space.sh <your-user>/nimbotics
```

The script uploads the committed files only, so `.env` and local data are never uploaded. It puts the Dockerfile
at the Space root and adds the Space front matter to `README.md`. The first build takes about 15–25 minutes.

Defaults on the public copy:

- No `MODEL_API_KEY`, so strategy reasoning is the offline planner. If you add the key as a Space secret, every
  visitor could spend your Meta credits.
- At most 3 queued simulation jobs (`NIMBOTICS_MAX_PENDING_JOBS`). Further requests get HTTP 429.
- URSim is ready about 1–2 minutes after start. Until then, the "also run on URSim" option stays disabled, and
  How it works shows the reason.
- A free Space sleeps after 48 h without visitors, and its disk is not persistent.

## Run the same image locally

```bash
docker build -f deploy/Dockerfile -t nimbotics-cloud .
```

```bash
docker run --rm -p 7860:7860 nimbotics-cloud
```

Then open http://localhost:7860. On Apple Silicon the image runs under amd64 emulation, so it is slow but works.

## What this is not

URSim is controller software on an idealized arm. The obstacle exists only in MuJoCo, and no physical robot is
attached. The site labels every result with its source: a real recording, a MuJoCo simulation, URSim controller
software, or model-written text.
