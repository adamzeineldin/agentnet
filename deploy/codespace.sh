#!/bin/bash
# Build and run the cloud image inside a GitHub Codespace (called by .devcontainer/devcontainer.json).
#   build: once, when the codespace is created (~15 min)
#   start: every time the codespace starts; reuses the container, so runs recorded earlier are kept
set -euo pipefail
IMAGE=agentnet-cloud
NAME=agentnet
cd "$(dirname "$0")/.."

for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done

case "${1:-}" in
  build)
    docker build -f deploy/Dockerfile -t "$IMAGE" .
    ;;
  start)
    if docker container inspect "$NAME" >/dev/null 2>&1; then
      docker start "$NAME"
    else
      docker run -d --name "$NAME" --restart unless-stopped -p 7860:7860 "$IMAGE"
    fi
    echo "AgentNet starting on port 7860 (URSim is ready about 1-2 minutes later)"
    ;;
  *)
    echo "usage: deploy/codespace.sh build|start" >&2
    exit 2
    ;;
esac
