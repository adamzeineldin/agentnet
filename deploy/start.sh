#!/bin/bash
# Start everything in the cloud container: URSim, the ur_rtde bridge, the URSim setup, and the API + website.
# The API is the foreground process; if it exits, the container exits.
set -u

# Fresh writable registry from the baked demo registry (Spaces disks are not persistent).
if [ ! -f "$AGENTNET_DB_PATH" ]; then
  mkdir -p "$(dirname "$AGENTNET_DB_PATH")"
  cp /app/seed/demo/agentnet.db "$AGENTNET_DB_PATH"
  cp -r /app/seed/demo/artifacts "$AGENTNET_ARTIFACT_DIR"
fi

echo "[start] URSim (UR controller software)"
/entrypoint.sh >/tmp/ursim.log 2>&1 &

echo "[start] ur_rtde bridge on :$BRIDGE_PORT"
(cd /app/backend && /app/venv/bin/python -m ur_bridge.server >/tmp/ur_bridge.log 2>&1) &

echo "[start] URSim setup (power on, brakes, Remote Control) in the background"
/app/venv/bin/python /app/deploy/ursim_setup.py >/tmp/ursim_setup.log 2>&1 &

echo "[start] API + website on :$PORT"
cd /app/backend && exec /app/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
