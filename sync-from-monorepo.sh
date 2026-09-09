#!/usr/bin/env bash
# The working copy lives in the QVAC monorepo at test/37-music-desk. This pulls
# it in, minus everything that must not ship, and leaves the commit to you.
set -euo pipefail
SRC="${1:-$HOME/Documents/PRO/QVAC/QVAC-agent/test/37-music-desk}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$SRC/server.js" ] || { echo "not a Music Desk checkout: $SRC" >&2; exit 1; }
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude out --exclude library \
  --exclude models --exclude .DS_Store --exclude sync-from-monorepo.sh \
  "$SRC/" "$HERE/"
cd "$HERE"
git status --short
echo
echo "Review the diff, then: git add -A && git commit && git push"
