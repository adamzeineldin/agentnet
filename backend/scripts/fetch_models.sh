#!/usr/bin/env bash
# Fetch the pinned MuJoCo Menagerie commit (Panda + UR5e only) into backend/app/data/menagerie.
set -euo pipefail
COMMIT="f3b6013629c7b94f8ee93fd977b161fa8350f9bc"  # keep in sync with app/config.py
DEST="$(cd "$(dirname "$0")/.." && pwd)/app/data/menagerie"
if [ ! -d "$DEST/.git" ]; then
  git clone --filter=blob:none --no-checkout https://github.com/google-deepmind/mujoco_menagerie.git "$DEST"
fi
cd "$DEST"
git sparse-checkout init --cone
git sparse-checkout set franka_emika_panda universal_robots_ur5e
git fetch --depth 1 origin "$COMMIT"
git checkout --quiet "$COMMIT"
echo "Menagerie pinned at $(git rev-parse HEAD)"
