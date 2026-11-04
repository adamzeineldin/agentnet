#!/usr/bin/env bash
# Move the live site from the codespace to an always-on server, and deploy to that server later. Run on your computer.
# The server is a fresh Ubuntu 24.04 amd64 machine you can reach as root with your ssh key (e.g. root@203.0.113.7).
#   deploy/move_to_vps.sh prepare root@<ip>   # copy code + settings, install Docker, build (~15 min); site untouched
#   deploy/move_to_vps.sh cutover root@<ip>   # start the server's site and tunnel, then stop the codespace
#   deploy/move_to_vps.sh update  root@<ip>   # later deploys: copy code, rebuild, recreate the containers
# Only committed files are copied (git archive), so .env and local data never leave this machine. The settings come
# from the codespace's running containers straight to the server's root-only /etc/nimbotics/env; they are never
# printed or stored here. The Library is in Postgres and R2 (D95), so there are no runs to copy: the codespace's
# volume is only a cache, and the server pulls uploaded robot models back from R2 when it starts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO=adamzeineldin/agentnet
APP_DIR=/opt/nimbotics
HEALTH_WAIT_SECONDS=300
# Settings the site container reads; empty ones are skipped.
SETTING_KEYS="GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET MODEL_API_KEY DATABASE_URL
NIMBOTICS_S3_ENDPOINT NIMBOTICS_S3_BUCKET NIMBOTICS_S3_ACCESS_KEY_ID NIMBOTICS_S3_SECRET_ACCESS_KEY
NIMBOTICS_S3_PUBLIC_URL NIMBOTICS_SESSION_SECRET NIMBOTICS_PUBLIC_URL"

usage() {
  echo "usage: deploy/move_to_vps.sh prepare|cutover|update <user@server>" >&2
  exit 2
}
[ $# -eq 2 ] || usage
ACTION="$1"
SERVER="$2"

remote() {
  ssh -o ServerAliveInterval=30 -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$SERVER" "$@"
}

codespace_name() {
  local name="${NIMBOTICS_CODESPACE:-}"
  if [ -z "$name" ]; then
    name="$(gh codespace list -R "$REPO" --json name -q '.[0].name')"
  fi
  if [ -z "$name" ]; then
    echo "no codespace found for $REPO (set NIMBOTICS_CODESPACE)" >&2
    exit 1
  fi
  echo "$name"
}

check_server() {
  local arch
  arch="$(remote uname -m)" || { echo "cannot ssh to $SERVER as a key-based login" >&2; exit 1; }
  if [ "$arch" != "x86_64" ]; then
    echo "$SERVER is $arch; URSim needs an x86_64 (amd64) server" >&2
    exit 1
  fi
}

ship_code() {
  git -C "$ROOT" diff --quiet HEAD || echo "note: uncommitted changes are NOT copied"
  echo "Copying $(git -C "$ROOT" rev-parse --short HEAD) to $SERVER:$APP_DIR"
  git -C "$ROOT" archive HEAD \
    | remote "rm -rf $APP_DIR.new && mkdir -p $APP_DIR.new && tar -x -C $APP_DIR.new \
              && rm -rf $APP_DIR && mv $APP_DIR.new $APP_DIR"
}

# Runs inside the codespace with the setting names as arguments and prints NAME=value lines for the live containers.
# %q quotes each value so the file can be sourced; the tunnel container calls its token TUNNEL_TOKEN.
read_settings_script() {
  cat <<'SH'
keys=" $* "
docker inspect nimbotics --format '{{range .Config.Env}}{{println .}}{{end}}' | while IFS= read -r line; do
  # `docker run -e NAME` with NAME unset leaves a bare NAME (no "="): that setting is off.
  case "$line" in *=*) ;; *) continue ;; esac
  k="${line%%=*}"
  v="${line#*=}"
  case "$keys" in *" $k "*) [ -n "$v" ] && printf '%s=%q\n' "$k" "$v" ;; esac
done
docker inspect nimbotics-tunnel --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | while IFS= read -r line; do
      case "$line" in TUNNEL_TOKEN=?*) printf 'CLOUDFLARE_TUNNEL_TOKEN=%q\n' "${line#TUNNEL_TOKEN=}" ;; esac
    done
SH
}

copy_settings() {
  if remote "test -s /etc/nimbotics/env"; then
    echo "Settings already on the server (/etc/nimbotics/env); keeping them"
    return
  fi
  local cs
  cs="$(codespace_name)"
  echo "Copying settings from codespace $cs to $SERVER:/etc/nimbotics/env (values are not shown)"
  # shellcheck disable=SC2086
  read_settings_script | gh codespace ssh -c "$cs" -- bash -s -- $SETTING_KEYS \
    | remote "umask 077 && cat > /etc/nimbotics/env.new && mv /etc/nimbotics/env.new /etc/nimbotics/env"
  local keys
  keys="$(remote "cut -d= -f1 /etc/nimbotics/env | tr '\n' ' '")"
  echo "Server settings: $keys"
  for required in NIMBOTICS_SESSION_SECRET NIMBOTICS_PUBLIC_URL CLOUDFLARE_TUNNEL_TOKEN DATABASE_URL; do
    case " $keys " in
      *" $required "*) ;;
      *) echo "missing $required in the copied settings; is the codespace's site running?" >&2; exit 1 ;;
    esac
  done
}

wait_for_health() {
  echo "Waiting for the server's site to answer /api/health"
  local waited=0
  until remote "curl -fsS -o /dev/null http://127.0.0.1:7860/api/health"; do
    if [ "$waited" -ge "$HEALTH_WAIT_SECONDS" ]; then
      echo "the site did not become healthy in ${HEALTH_WAIT_SECONDS}s; see: ssh $SERVER docker logs nimbotics" >&2
      exit 1
    fi
    sleep 5
    waited=$((waited + 5))
  done
}

case "$ACTION" in
  prepare)
    check_server
    ship_code
    remote "bash $APP_DIR/deploy/vps.sh setup"
    copy_settings
    remote "bash $APP_DIR/deploy/vps.sh build"
    echo "Prepared. The live site still runs on the codespace; next: deploy/move_to_vps.sh cutover $SERVER"
    ;;
  cutover)
    check_server
    # Both tunnel connectors serve nimbotics.net for a moment; they share Postgres and R2, so visitors see one site.
    remote "bash $APP_DIR/deploy/vps.sh start"
    wait_for_health
    cs="$(codespace_name)"
    echo "Server is healthy; stopping codespace $cs"
    gh codespace stop -c "$cs"
    public_url="$(remote "grep '^NIMBOTICS_PUBLIC_URL=' /etc/nimbotics/env | cut -d= -f2-")"
    sleep 10
    if curl -fsS -o /dev/null "$public_url/api/health"; then
      echo "$public_url answers from $SERVER. The codespace is stopped, not deleted."
    else
      echo "$public_url did not answer yet; check: ssh $SERVER docker logs nimbotics-tunnel" >&2
      exit 1
    fi
    ;;
  update)
    check_server
    ship_code
    remote "bash $APP_DIR/deploy/vps.sh build && bash $APP_DIR/deploy/vps.sh restart"
    wait_for_health
    echo "Updated $SERVER to $(git -C "$ROOT" rev-parse --short HEAD)"
    ;;
  *)
    usage
    ;;
esac
