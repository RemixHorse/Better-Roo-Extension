# Better Roo — Firefox Port Plan

---

## Overview

The extension avoids the two historically hardest cross-browser problems:

- **No `world: "MAIN"` injection** — `__NEXT_DATA__` is read from the DOM in the isolated content script world, so no page-context scripting is needed.
- **No `chrome.*` callback-only APIs** — all `chrome.*` calls used by the extension are promise-based and Firefox supports them via its built-in `chrome.*` alias.

The port is therefore mostly a build system task, with a small number of targeted fixes.

---

## Compatibility Audit

| API / Feature | Firefox MV3 Support | Notes |
|---|---|---|
| `chrome.runtime.sendMessage` | ✅ | |
| `chrome.runtime.onMessage` | ✅ | |
| `chrome.storage.sync` | ✅ | |
| `chrome.storage.local` | ✅ | |
| `chrome.tabs.query({ url })` | ⚠️ | Requires `tabs` permission in Firefox; Chrome only needs `host_permissions` |
| `chrome.tabs.sendMessage` | ✅ | |
| `chrome.alarms` | ✅ | MV3, Firefox 128+ |
| Service worker (`"type": "module"`) | ✅ | Firefox 128+ |
| `content_scripts` at `document_start` | ✅ | |
| `isolation: isolate` (CSS) | ✅ | |
| `position: fixed` | ✅ | |
| IndexedDB | ✅ | |
| `history.pushState` patching | ✅ | |
| `__NEXT_DATA__` DOM reading | ✅ | Same HTML, same structure |

**One required code change:** add `"tabs"` to `permissions` in the Firefox manifest.

---

## Phase F1 — Dual-Build System

**Goal:** `npm run build:chrome` and `npm run build:firefox` produce separate `dist-chrome/` and `dist-firefox/` directories from the same source.

- [ ] **F1.1** Add build scripts to `package.json`:
  ```json
  "build:chrome":  "BROWSER=chrome vite build",
  "build:firefox": "BROWSER=firefox vite build",
  "build":         "npm run build:chrome"
  ```
  On Windows, use `cross-env` to set the env variable cross-platform:
  ```bash
  npm install --save-dev cross-env
  ```

- [ ] **F1.2** Update `vite.config.js` to read `process.env.BROWSER` and:
  - Set `outDir` to `dist-chrome` or `dist-firefox` based on the target
  - Pass the target to the `copyExtensionFiles` plugin so it writes the correct manifest

- [ ] **F1.3** Update the manifest-writing logic in `vite.config.js`:
  - For **Chrome**: current behaviour unchanged
  - For **Firefox**: apply Firefox-specific overrides (see Phase F2)
  - Keep a single `manifest.json` source — the plugin applies the right overrides at build time

---

## Phase F2 — Firefox Manifest

**Goal:** Firefox build gets a valid, correctly-scoped manifest.

- [ ] **F2.1** Add `browser_specific_settings` in the Firefox manifest output:
  ```json
  "browser_specific_settings": {
    "gecko": {
      "id": "better-roo@remixhorse",
      "strict_min_version": "128.0"
    }
  }
  ```
  Firefox 128 is the minimum for MV3 service worker support.

- [ ] **F2.2** Add `"tabs"` to `permissions` in the Firefox manifest:
  ```json
  "permissions": ["storage", "alarms", "tabs"]
  ```
  Required for `chrome.tabs.query({ url: ... })` to work in Firefox.

- [ ] **F2.3** Verify `early.js` is wired up as a second content script in both manifests:
  ```json
  "content_scripts": [
    {
      "matches": ["*://deliveroo.co.uk/*"],
      "js": ["early.js"],
      "run_at": "document_start"
    },
    {
      "matches": ["*://deliveroo.co.uk/*"],
      "js": ["content.js"],
      "run_at": "document_end"
    }
  ]
  ```
  Add `early: resolve(root, 'src/content/early.js')` to the Vite rollup `input` map so it is built as a separate output file.

---

## Phase F3 — Testing in Firefox

**Goal:** all features verified working in Firefox on deliveroo.co.uk.

- [ ] **F3.1** Load the Firefox build as a temporary add-on:
  - Navigate to `about:debugging#/runtime/this-firefox`
  - Click **Load Temporary Add-on…**
  - Select `dist-firefox/manifest.json`

- [ ] **F3.2** Smoke test checklist:
  - [ ] Filter bar appears fixed at the bottom of the page
  - [ ] FSA badges appear on cards
  - [ ] Shared Address pill appears with correct sibling tooltip
  - [ ] Card/table toggle works; table renders and sorts correctly
  - [ ] Popup opens: stats display, all toggles functional
  - [ ] Settings broadcast to active tabs on toggle change
  - [ ] Detail page FSA badge injected correctly
  - [ ] Clear data resets state

- [ ] **F3.3** Firefox-specific edge cases:
  - [ ] `chrome.tabs.query` returns tabs correctly (confirms `tabs` permission is effective)
  - [ ] Service worker starts and handles `FSA_LOOKUP` messages
  - [ ] `early.js` fires at `document_start` and suppresses card grid flash in table mode

---

## Phase F4 — GitHub Actions

**Goal:** release workflow builds and publishes both Chrome and Firefox zips on tag push.

- [ ] **F4.1** Create `.github/workflows/release.yml`:
  ```yaml
  name: Release

  on:
    push:
      tags:
        - 'v*'

  jobs:
    build:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: npm
        - run: npm ci
        - run: npm test
        - run: npm run build:chrome
        - run: npm run build:firefox
        - name: Zip Chrome build
          run: cd dist-chrome && zip -r "../better-roo-chrome-${GITHUB_REF_NAME}.zip" .
        - name: Zip Firefox build
          run: cd dist-firefox && zip -r "../better-roo-firefox-${GITHUB_REF_NAME}.zip" .
        - uses: softprops/action-gh-release@v2
          with:
            files: |
              better-roo-chrome-*.zip
              better-roo-firefox-*.zip
            generate_release_notes: true
  ```

---

## Phase F5 — Firefox Add-ons (AMO) Distribution

**Goal:** extension published and installable from addons.mozilla.org.

- [ ] **F5.1** Create an account at [addons.mozilla.org](https://addons.mozilla.org/developers/)

- [ ] **F5.2** Submit the Firefox zip for review:
  - AMO requires source code submission for extensions built with a bundler (Vite). Upload the repo source zip alongside the built extension.
  - Choose **Listed** for public discovery, or **Unlisted** for self-distributed signed XPIs.

- [ ] **F5.3** Update `README.md` with Firefox installation instructions once the listing is live.

---

## Build Order

```
F1 → Dual-build system     (Chrome build must remain unchanged)
F2 → Firefox manifest      (depends on F1)
F3 → Firefox testing       (depends on F2)
F4 → GitHub Actions        (depends on F1, can be done alongside F3)
F5 → AMO submission        (depends on F3 passing)
```

---

## Notes

- The existing Chrome build (`npm run build` / `dist-chrome`) must continue to work identically — all changes are additive.
- `cross-env` is the only new runtime dependency; everything else is manifest and build config.
- The `tabs` permission addition is Firefox-only and scoped to the Firefox manifest — Chrome does not need it and it would unnecessarily broaden the Chrome permission footprint.
