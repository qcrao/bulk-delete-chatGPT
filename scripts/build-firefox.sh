#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist/firefox"

cd "$ROOT_DIR"

VERSION="$(node -p "require('./manifest.json').version")"
FIREFOX_VERSION="$(node -p "require('./manifest.firefox.json').version")"

if [[ "$VERSION" != "$FIREFOX_VERSION" ]]; then
  echo "Version mismatch: manifest.json is $VERSION, manifest.firefox.json is $FIREFOX_VERSION" >&2
  exit 1
fi

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

cp "$ROOT_DIR"/manifest.firefox.json "$DIST_DIR"/manifest.json
cp "$ROOT_DIR"/*.js "$DIST_DIR"/
cp "$ROOT_DIR"/popup.html "$DIST_DIR"/
cp "$ROOT_DIR"/popup.css "$DIST_DIR"/
cp "$ROOT_DIR"/icon48.png "$DIST_DIR"/

echo "Firefox extension prepared at $DIST_DIR"
