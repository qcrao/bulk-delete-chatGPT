#!/usr/bin/env bash
# Release regression test for bulk delete (see docs/regression-test.md).
# Usage: scripts/regression-delete.sh [count]   (default 3, minimum 3)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
COUNT="${1:-3}"
if [ "$COUNT" -lt 3 ]; then
  echo "count must be at least 3" >&2
  exit 2
fi

if ! command -v ego-browser >/dev/null; then
  echo "ego-browser not found; install ego lite first" >&2
  exit 2
fi

sed -e "s#__REPO__#${REPO}#" -e "s#__COUNT__#${COUNT}#" \
  "$REPO/scripts/regression/ego-delete.mjs" | ego-browser nodejs
