#!/usr/bin/env bash
# Recording stack: backend on the demo registry + production frontend (no Next dev overlay).
# Ports: DEMO_API_PORT (default 8000), DEMO_WEB_PORT (default 3000). Ctrl-C stops both.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${DEMO_API_PORT:-8000}"
WEB_PORT="${DEMO_WEB_PORT:-3000}"
export AGENTNET_DB_PATH="$ROOT/backend/app/data/demo/agentnet.db"
export AGENTNET_ARTIFACT_DIR="$ROOT/backend/app/data/demo/artifacts"
if [ ! -f "$AGENTNET_DB_PATH" ]; then
  echo "No demo registry yet; run: make demo-seed" >&2
  exit 1
fi
(cd "$ROOT/frontend" && NEXT_DIST_DIR=.next-demo NEXT_PUBLIC_API_BASE="http://127.0.0.1:$API_PORT" npx next build >/dev/null)
trap 'kill 0' EXIT INT TERM
(cd "$ROOT/backend" && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT") &
(cd "$ROOT/frontend" && NEXT_DIST_DIR=.next-demo npx next start -p "$WEB_PORT" -H 127.0.0.1) &
echo "Demo: http://127.0.0.1:$WEB_PORT/present  (API :$API_PORT, registry $AGENTNET_DB_PATH)"
wait
