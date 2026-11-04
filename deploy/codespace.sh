#!/bin/bash
# Build and run the cloud image inside a GitHub Codespace (called by .devcontainer/devcontainer.json).
#   build: once, when the codespace is created (~15 min)
#   start: every time the codespace starts; reuses the container. Runs and clips live on the `nimbotics-runtime`
#          volume, so they also survive a recreated container (redeploy)
# Sign-in (GOOGLE_*/GITHUB_*) and Muse (MODEL_API_KEY) come from Codespaces secrets (see deploy/README.md) and are passed
# into the container when it is first created; delete the container (docker rm -f nimbotics) to pick up new ones.
# Own domain: with a CLOUDFLARE_TUNNEL_TOKEN secret, a Cloudflare Tunnel container carries the public hostname (e.g.
# nimbotics.net) to port 7860; set NIMBOTICS_PUBLIC_URL to that address so sign-in redirects there.
set -euo pipefail
IMAGE=nimbotics-cloud
NAME=nimbotics
TUNNEL=nimbotics-tunnel
TUNNEL_IMAGE=cloudflare/cloudflared:2026.10.0
# deploy/vps.sh sets 127.0.0.1:7860:7860 so only the tunnel reaches the site (Docker's ports bypass the firewall).
PUBLISH="${NIMBOTICS_PUBLISH:-7860:7860}"
cd "$(dirname "$0")/.."

for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done

start_tunnel() {
  if [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
    return
  fi
  if docker container inspect "$TUNNEL" >/dev/null 2>&1; then
    docker start "$TUNNEL"
  else
    # Host network: the tunnel reaches the site on the port published above (localhost:7860).
    docker run -d --name "$TUNNEL" --restart unless-stopped --network host -e TUNNEL_TOKEN="$CLOUDFLARE_TUNNEL_TOKEN" \
      "$TUNNEL_IMAGE" tunnel --no-autoupdate run
  fi
  echo "Cloudflare Tunnel started (${NIMBOTICS_PUBLIC_URL:-public hostname set in Cloudflare})"
}

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
      docker run -d --name "$NAME" --restart unless-stopped -p "$PUBLISH" -v nimbotics-runtime:/app/runtime \
        -e GOOGLE_CLIENT_ID -e GOOGLE_CLIENT_SECRET -e GITHUB_CLIENT_ID -e GITHUB_CLIENT_SECRET \
        -e MODEL_API_KEY \
        -e DATABASE_URL -e NIMBOTICS_S3_ENDPOINT -e NIMBOTICS_S3_BUCKET -e NIMBOTICS_S3_ACCESS_KEY_ID \
        -e NIMBOTICS_S3_SECRET_ACCESS_KEY -e NIMBOTICS_S3_PUBLIC_URL \
        -e NIMBOTICS_SESSION_SECRET="${NIMBOTICS_SESSION_SECRET:-$(openssl rand -hex 32)}" \
        -e NIMBOTICS_PUBLIC_URL="$public_url" \
        "$IMAGE"
    fi
    start_tunnel
    echo "Nimbotics starting on port 7860 (URSim is ready about 1-2 minutes later)"
    ;;
  *)
    echo "usage: deploy/codespace.sh build|start" >&2
    exit 2
    ;;
esac
