---
name: extension-release-packaging
description: Use in this repository when the user says 打包, package, build zip, release package, or asks to generate Chrome/Firefox extension store-upload archives; runs the local packaging workflow and keeps Chrome and Firefox manifests in sync.
---

# Extension Release Packaging

Use this skill for release/version changes or packaging work in this repository. If the user says only "打包", generate both Chrome and Firefox store-upload zips locally.

## Required Workflow

1. Update both extension manifests together:
   - `manifest.json`
   - `manifest.firefox.json`

2. Keep these fields synchronized:
   - `version`
   - `name`, unless a browser-specific name is intentional
   - content script file list
   - popup/icon paths

3. Keep browser-specific manifest differences:
   - Chrome uses `background.service_worker` and keeps `identity` / `identity.email`.
   - Firefox uses `background.scripts`, omits `identity` / `identity.email`, and keeps `browser_specific_settings.gecko`.

4. For packaging requests, run:

```bash
scripts/package-extensions.sh
npx --yes web-ext lint --source-dir dist/firefox --self-hosted
```

5. The generated store-upload zips are:
   - `dist/packages/chatgpt-bulk-delete-chrome-v<version>.zip`
   - `dist/packages/chatgpt-bulk-delete-firefox-v<version>.zip`

Do not commit `dist/`; it is generated output.
