#!/bin/bash
# Build and run the cloud image inside a GitHub Codespace (called by .devcontainer/devcontainer.json).
#   build: once, when the codespace is created (~15 min)
#   start: every time the codespace starts; reuses the container, so runs recorded earlier are kept
# Sign-in: GOOGLE_*/GITHUB_* client ids and secrets come from Codespaces secrets (see deploy/README.md) and are passed
# into the container when it is first created; delete the container (docker rm -f nimbotics) to pick up new ones.
set -euo pipefail
IMAGE=nimbotics-cloud
NAME=nimbotics
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
      # OAuth redirect URIs must use the public forwarded URL, not the container's localhost.
      public_url="${NIMBOTICS_PUBLIC_URL:-}"
      if [ -z "$public_url" ] && [ -n "${CODESPACE_NAME:-}" ]; then
        public_url="https://${CODESPACE_NAME}-7860.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
      fi
      docker run -d --name "$NAME" --restart unless-stopped -p 7860:7860 \
        -e GOOGLE_CLIENT_ID -e GOOGLE_CLIENT_SECRET -e GITHUB_CLIENT_ID -e GITHUB_CLIENT_SECRET \
        -e NIMBOTICS_SESSION_SECRET="${NIMBOTICS_SESSION_SECRET:-$(openssl rand -hex 32)}" \
        -e NIMBOTICS_PUBLIC_URL="$public_url" \
        "$IMAGE"
    fi
    echo "Nimbotics starting on port 7860 (URSim is ready about 1-2 minutes later)"
    ;;
  *)
    echo "usage: deploy/codespace.sh build|start" >&2
    exit 2
    ;;
esac
