#!/bin/bash
# Run the cloud image on an always-on server (Ubuntu 24.04, amd64, e.g. Hetzner CX43). Runs as root on the server;
# deploy/move_to_vps.sh calls it over ssh, so you rarely run it by hand.
#   setup:   once: Docker, a firewall that only lets ssh in, and the settings file
#   build:   build the image (~15 min the first time)
#   start:   start the site and the Cloudflare Tunnel (reuses existing containers)
#   restart: recreate both containers so they pick up a new image or changed settings
# Settings (the former Codespaces secrets) live in $ENV_FILE, readable by root only. The site listens on
# 127.0.0.1:7860 only; visitors arrive through the outbound Cloudflare Tunnel, so no web port is opened.
set -euo pipefail
ENV_FILE="${NIMBOTICS_ENV_FILE:-/etc/nimbotics/env}"
cd "$(dirname "$0")/.."

load_settings() {
  if [ ! -s "$ENV_FILE" ]; then
    echo "missing $ENV_FILE: run deploy/move_to_vps.sh prepare first" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  # A fixed session secret keeps visitors signed in across restarts; codespace.sh would otherwise make a new one.
  if [ -z "${NIMBOTICS_SESSION_SECRET:-}" ] || [ -z "${NIMBOTICS_PUBLIC_URL:-}" ]; then
    echo "$ENV_FILE needs NIMBOTICS_SESSION_SECRET and NIMBOTICS_PUBLIC_URL" >&2
    exit 1
  fi
  export NIMBOTICS_PUBLISH=127.0.0.1:7860:7860
}

case "${1:-}" in
  setup)
    apt-get update
    apt-get install -y --no-install-recommends docker.io docker-buildx ufw curl openssl
    systemctl enable --now docker
    ufw allow OpenSSH
    ufw --force enable
    install -d -m 700 /etc/nimbotics
    ;;
  build)
    bash deploy/codespace.sh build
    ;;
  start)
    load_settings
    bash deploy/codespace.sh start
    ;;
  restart)
    load_settings
    docker rm -f nimbotics nimbotics-tunnel 2>/dev/null || true
    bash deploy/codespace.sh start
    ;;
  *)
    echo "usage: deploy/vps.sh setup|build|start|restart" >&2
    exit 2
    ;;
esac
