#!/usr/bin/env bash
# Fetch the pinned MuJoCo Menagerie commit (the arms in app/services/robot_catalog.py) into backend/app/data/menagerie.
set -euo pipefail
COMMIT="f3b6013629c7b94f8ee93fd977b161fa8350f9bc"  # keep in sync with app/config.py
DEST="$(cd "$(dirname "$0")/.." && pwd)/app/data/menagerie"
if [ ! -d "$DEST/.git" ]; then
  git clone --filter=blob:none --no-checkout https://github.com/google-deepmind/mujoco_menagerie.git "$DEST"
fi
cd "$DEST"
git sparse-checkout init --cone
git sparse-checkout set franka_emika_panda universal_robots_ur5e universal_robots_ur10e kuka_iiwa_14 \
  ufactory_xarm7 ufactory_lite6 franka_fr3
git fetch --depth 1 origin "$COMMIT"
git checkout --quiet "$COMMIT"
echo "Menagerie pinned at $(git rev-parse HEAD)"
