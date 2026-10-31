#!/usr/bin/env bash
# Publish the committed repo to a Hugging Face Docker Space (free CPU hardware).
#   hf auth login                      # once, yourself, with a write token
#   deploy/push_space.sh <user>/nimbotics
# Only committed files are uploaded (git archive), so .env and local data never leave this machine.
set -euo pipefail
SPACE="${1:?usage: deploy/push_space.sh <user>/<space-name>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

hf auth whoami >/dev/null || { echo "Not logged in: run 'hf auth login' first."; exit 1; }
git -C "$ROOT" diff --quiet HEAD || echo "note: uncommitted changes are NOT uploaded"

git -C "$ROOT" archive HEAD | tar -x -C "$STAGE"
rm -rf "$STAGE/design_handoff_nimbotics_ui" "$STAGE/assets"
cp "$STAGE/deploy/Dockerfile" "$STAGE/Dockerfile"
{
  cat <<'YAML'
---
title: Nimbotics
emoji: 🤖
colorFrom: gray
colorTo: red
sdk: docker
app_port: 7860
short_description: Robots share and retarget skills; MuJoCo, real DROID data, URSim
---

YAML
  cat "$STAGE/README.md"
} > "$STAGE/README.space.md"
mv "$STAGE/README.space.md" "$STAGE/README.md"

hf repo create "$SPACE" --repo-type space --space-sdk docker --exist-ok
hf upload "$SPACE" "$STAGE" . --repo-type space --commit-message "Deploy $(git -C "$ROOT" rev-parse --short HEAD)"
echo "Pushed. Build logs and the app: https://huggingface.co/spaces/$SPACE"
