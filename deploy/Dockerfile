# Nimbotics cloud image: one container with the website, the API + MuJoCo worker, the ur_rtde bridge and URSim
# (Universal Robots' controller software, from UR's official image). Built from the repo root:
#   docker build -f deploy/Dockerfile -t nimbotics-cloud .
# Runs as uid 1000 (Hugging Face Spaces) and listens on 7860.

# ---- website: static export (platform-independent output, so build natively)
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN NEXT_OUTPUT=export NEXT_DIST_DIR=out NEXT_PUBLIC_API_BASE= NEXT_TELEMETRY_DISABLED=1 npx next build

# uv binary for the runtime platform (URSim exists for amd64 only).
FROM --platform=linux/amd64 ghcr.io/astral-sh/uv:0.8.22 AS uv

# ---- runtime: URSim base (Debian 12, amd64)
FROM --platform=linux/amd64 universalrobots/ursim_e-series:5.26
USER root
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends libosmesa6 libgl1 xdotool git ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Python 3.12 (ur-rtde 1.6.5 has wheels up to cp312) via uv's standalone builds.
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/python UV_LINK_MODE=copy
WORKDIR /app
COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/app backend/app
COPY backend/scripts backend/scripts
COPY backend/ur_bridge backend/ur_bridge
RUN uv venv --python 3.12 /app/venv \
 && uv pip install --python /app/venv/bin/python -e backend "ur-rtde==1.6.5"

# Pinned MuJoCo Menagerie models, then a demo registry built from real runs (nothing fabricated).
ENV MUJOCO_GL=osmesa PYOPENGL_PLATFORM=osmesa
RUN backend/scripts/fetch_models.sh
RUN cd backend && NIMBOTICS_DB_PATH=/app/seed/demo/nimbotics.db NIMBOTICS_ARTIFACT_DIR=/app/seed/demo/artifacts \
    /app/venv/bin/python scripts/seed_demo.py --reset

# tini as PID 1 reaps orphaned processes: URSim restarts its controller with `killall -w`, which waits forever
# on an unreaped zombie when the API server is PID 1.
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

COPY --from=web /web/out /app/web
COPY deploy/start.sh deploy/ursim_setup.py deploy/remotecontrol.properties /app/deploy/

# URSim keeps "Remote Control enabled" in this file; the Local/Remote switch itself is clicked at start-up.
RUN mkdir -p /ursim/.polyscope /home/root /urcaps /app/runtime \
 && cp /app/deploy/remotecontrol.properties /ursim/.polyscope/remotecontrol.properties \
 && chmod +x /app/deploy/start.sh \
 && chown -R 1000:1000 /ursim /home/root /etc/service /opt/novnc /urcaps /app /entrypoint.sh \
 && chmod 1777 /tmp

USER 1000
ENV HOME=/home/root ROBOT_MODEL=UR5 DISPLAY=:1 \
    NIMBOTICS_WEB_DIR=/app/web NIMBOTICS_URSIM_BRIDGE_URL=http://127.0.0.1:8765 NIMBOTICS_MAX_PENDING_JOBS=3 \
    NIMBOTICS_RENDER_WIDTH=640 NIMBOTICS_RENDER_HEIGHT=360 NIMBOTICS_VIDEO_FPS=15 \
    NIMBOTICS_DB_PATH=/app/runtime/nimbotics.db NIMBOTICS_ARTIFACT_DIR=/app/runtime/artifacts \
    UR_HOST=127.0.0.1 BRIDGE_PORT=8765 PORT=7860
EXPOSE 7860
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/deploy/start.sh"]
