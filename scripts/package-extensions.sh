#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
CHROME_DIR="$DIST_DIR/chrome"
FIREFOX_DIR="$DIST_DIR/firefox"
PACKAGE_DIR="$DIST_DIR/packages"

cd "$ROOT_DIR"

VERSION="$(node -p "require('./manifest.json').version")"
FIREFOX_VERSION="$(node -p "require('./manifest.firefox.json').version")"

if [[ "$VERSION" != "$FIREFOX_VERSION" ]]; then
  echo "Version mismatch: manifest.json is $VERSION, manifest.firefox.json is $FIREFOX_VERSION" >&2
  exit 1
fi

# Translations must be complete and valid, and _locales/ in sync.
if ! I18N_OUTPUT="$(node scripts/i18n-check.mjs 2>&1)"; then
  echo "$I18N_OUTPUT" | grep -v '^warn' >&2
  echo "i18n check failed" >&2
  exit 1
fi

rm -rf "$CHROME_DIR" "$FIREFOX_DIR" "$PACKAGE_DIR"
mkdir -p "$CHROME_DIR" "$FIREFOX_DIR" "$PACKAGE_DIR"

FILES=(
  addCheckboxes.js
  background.js
  bulkArchiveConversations.js
  bulkDeleteConversations.js
  chatgptApi.js
  checkboxManager.js
  config.js
  conversationHandler.js
  conversationPreview.js
  domHandler.js
  extensionCore.js
  globals.js
  i18n.js
  icon48.png
  popup.css
  popup.html
  popup.js
  remoteConfig.js
  removeCheckboxes.js
  selectionBar.js
  toggleCheckboxes.js
  utils.js
)

cp manifest.json "$CHROME_DIR/manifest.json"
cp manifest.firefox.json "$FIREFOX_DIR/manifest.json"
cp "${FILES[@]}" "$CHROME_DIR/"
cp "${FILES[@]}" "$FIREFOX_DIR/"
cp -R locales _locales "$CHROME_DIR/"
cp -R locales _locales "$FIREFOX_DIR/"

(
  cd "$CHROME_DIR"
  zip -qr "$PACKAGE_DIR/chatgpt-bulk-delete-chrome-v$VERSION.zip" .
)

(
  cd "$FIREFOX_DIR"
  zip -qr "$PACKAGE_DIR/chatgpt-bulk-delete-firefox-v$VERSION.zip" .
)

echo "Created:"
ls -1 "$PACKAGE_DIR"
