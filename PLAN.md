# Better Roo — Implementation Plan

---

## Notes Before Starting

Several findings from API research (see `API.md`) supersede the original design assumptions. The plan below reflects the corrected approach:

| Original Design | Actual Approach |
|----------------|-----------------|
| `inject.js` wraps `window.fetch` in `world: MAIN` | **Not needed.** Read `window.__NEXT_DATA__` directly — restaurant data is SSR'd |
| FSA rating fetched via API on every detail page visit | **FSA rating is already embedded** in `__NEXT_DATA__` on detail pages — read it first, fall back to API only if absent |
| Address available from listing feed | **Address only on detail pages** — build up lazily as user browses |
| SPA navigation via fetch intercept | **Patch `history.pushState`** and listen to `popstate` |

---

## Phase 0 — Project Scaffolding

**Goal:** working build that produces a loadable unpacked extension.

- [x] **0.1** Initialise `package.json` with `vitest` and `vite-plugin-web-extension` as dev dependencies
- [x] **0.2** Write `vite.config.js` — entry points: `content/index.js`, `background/index.js`, `popup/popup.html`
- [x] **0.3** Write `manifest.json` (MV3):
  - `permissions`: `storage`, `alarms`
  - `host_permissions`: `*://deliveroo.co.uk/*`, `https://api.ratings.food.gov.uk/*`
  - `content_scripts`: match `*://deliveroo.co.uk/*`, run `content/index.js` in isolated world; run `content/early.js` at `document_start`
  - `background`: service worker `background/index.js`
  - `action`: popup `popup/popup.html`
- [x] **0.4** Create the full `src/` directory structure as defined in DESIGN.md
- [x] **0.5** Confirm extension loads unpacked in Chrome with no errors in DevTools

---

## Phase 1 — Core Data Layer

**Goal:** IndexedDB is usable by all other modules.

- [x] **1.1** Write `src/content/db.js`:
  - Open/upgrade IndexedDB (`better-roo`, version 1)
  - Create three object stores: `restaurants` (keyPath: `id`), `fsa_cache` (keyPath: `restaurantId`), `user_flags` (keyPath: `restaurantId`)
  - Export: `upsertRestaurant(r)`, `getRestaurant(id)`, `getAllRestaurants()`, `upsertFsaCache(entry)`, `getFsaCache(id)`, `getUserFlag(id)`, `setUserFlag(id, patch)`, `clearAll()`
- [x] **1.2** Write `src/content/addressNorm.js`:
  - `extractPostcode(address1)` — last whitespace token, validated against UK postcode regex, uppercased
  - `extractStreetNumber(address1)` — first numeric token at start of string (handles `146/148` range format → `146`)
  - `normalise(address1)` — lowercase, strip punctuation, expand abbreviations (`St→Street`, `Rd→Road`, `Ave→Avenue`, etc.)
- [x] **1.3** Write unit tests for `addressNorm.js` (Vitest):
  - Postcode extraction from plain addresses, compact postcodes, range-format addresses, null input
  - Street number extraction including range formats and lettered numbers (`10a`)
  - Normalisation round-trips

---

## Phase 2 — Data Extraction from `__NEXT_DATA__`

**Goal:** reliably read restaurant data from the page on both listing and detail pages.

- [x] **2.1** Write `src/content/reader.js`:
  - `getPageType()` — returns `'listing'`, `'detail'`, or `null` based on `window.location.pathname`
  - `readListingRestaurants()` — walks `__NEXT_DATA__.props.initialState.home.feed.results.data`, deduplicates by `restaurant_id`, returns array of normalised restaurant objects:
    ```js
    { id, drn_id, brand_drn_id, name, href, rating, ratingCount, distance, deliveryTimeMin, deliveryFee }
    ```
  - `readDetailRestaurant()` — reads `__NEXT_DATA__.props.initialState.menuPage.menu.metas.root.restaurant`, returns:
    ```js
    { id, drn_id, brand_drn_id, name, uname, address1, postcode, neighborhood, city }
    ```
  - `readDetailFsaRating()` — walks `menuPage.menu.layoutGroups` recursively for block with `actionId === 'layout-list-hygiene-rating'`, extracts score from image URL (`fhrs_{N}@3x.png`) and last-updated date from text spans. Returns `{ score: number|null, ratingDate: timestamp|null }` or `null` if block absent.
  - `validateListingSchema()` — checks feed structure exists, returns bool
  - `validateDetailSchema()` — checks restaurant object exists and has an `id`
- [x] **2.2** Write unit tests for `reader.js` — valid listing and detail shapes, deliberate schema breakage, FSA block present/absent, deduplication

---

## Phase 3 — SPA Navigation & Orchestration

**Goal:** extension reacts to every page navigation, not just hard loads.

- [x] **3.1** Write `src/content/index.js` (orchestrator):
  - On `DOMContentLoaded`: call `onRouteChange(location.pathname)`
  - Patch `history.pushState` and listen to `popstate` to detect client-side navigations; call `onRouteChange` each time
  - `onRouteChange(path)`:
    - If listing page: call `handleListingPage()`
    - If detail page: call `handleDetailPage()`
    - Otherwise: no-op
- [x] **3.2** `handleListingPage()`:
  - Read restaurants via `reader.js`
  - Merge with DB-cached records (preserves richer address fields written by detail page visits)
  - Upsert merged records into IndexedDB
  - Run shared address detection over merged set + all other DB-cached restaurants
  - Fetch FSA ratings (Phase 5)
  - Inject filter bar and card badges (Phases 6, 7)
- [x] **3.3** `handleDetailPage()`:
  - Read restaurant + address via `reader.js`
  - Upsert into IndexedDB (now with address fields)
  - Read FSA rating from `__NEXT_DATA__` directly; if present, upsert into `fsa_cache`
  - Inject detail badge (Phase 9)

---

## Phase 4 — Shared Address Detection

**Goal:** identify restaurants operating from the same physical address.

- [x] **4.1** Write `src/content/matcher.js`:
  - `detectSharedAddresses(restaurants)` — single-pass grouping algorithm:
    1. Parse each restaurant's `address1` for postcode and street number (first numeric token, scanning the full string to handle prefixed formats like `"Whitehall Grill 10 Downing Street"`)
    2. Group by `"{postcode}|{streetNumber}"` key
    3. Any restaurant sharing a key with ≥1 other is flagged `isSharedAddress: true` with `siblingNames: string[]`
    4. Restaurants with no parseable postcode or street number → `isSharedAddress: false`
  - Returns `Map<id, { isSharedAddress: boolean, siblingNames: string[] }>`
- [x] **4.2** Write `tests/matcher.test.js`:
  - Westminster fixture (Whitehall Grill / Big Ben Burger / Parliament Pizza — same postcode + number, different address string formats)
  - All three flagged as shared; correct sibling lists for each
  - Single restaurant alone → not flagged
  - Parliament Street false-positive guard (same postcode, different street numbers → all clean)
  - No address data → not flagged
  - Two restaurants at identical address → both flagged

---

## Phase 5 — FSA Integration

**Goal:** FSA hygiene scores available for all listing-page restaurants, sourced from cache or the FSA API.

- [x] **5.1** Write `src/background/index.js` (service worker):
  - Listen for `{ type: 'FSA_LOOKUP', restaurants: [{id, name, address1}] }`
  - For each: `GET https://api.ratings.food.gov.uk/Establishments?name={name}&address={postcode}&pageSize=5` with required headers
  - If multiple results, prefer the one whose `AddressLine1` contains the restaurant's street number; otherwise use first result
  - Parse `RatingValue` (`"0"`–`"5"` → integer, `"Exempt"` / `"AwaitingInspection"` / other → `null`)
  - Return `{ id, score, ratingDate }` per restaurant
  - Also handle `{ type: 'GET_SETTINGS' }` and `{ type: 'SET_SETTINGS', patch }` via `chrome.storage.sync`
- [x] **5.2** Write `src/content/fsa.js`:
  - `getFsaRatings(restaurants)` — checks IndexedDB cache first (7-day TTL on non-null scores), batches misses, sends to background, caches results, returns `Map<id, { score, ratingDate }>`
  - Restaurants without an `address1` are skipped (no FSA lookup possible)
- [x] **5.3** Wire FSA fetch into `handleListingPage()` — called after shared address detection, results passed to UI

---

## Phase 6 — Filter Bar UI

**Goal:** persistent filter controls fixed to the bottom of the viewport.

- [x] **6.1** Write `src/content/ui/filterBar.js`:
  - Inject `<div id="better-roo-bar">` fixed to bottom of viewport (`position: fixed; bottom: 0`)
  - Add `padding-bottom` to `body` so page content isn't obscured
  - Anchor: wait for `[class*="HomeFeedGrid"]` via MutationObserver, insert bar before its parent
  - Controls (pill chip dropdowns, popovers open upward):
    - **FSA** — min score: Any / 1+ / 2+ / 3+ / 4+ / 5 only
    - **Rating** — min Deliveroo rating: Any / 3+ / 4+ / 4.5+
    - **Address** — Show all / Shared only / Unique only
    - **Delivery** — max ETA: Any / ≤15 min / ≤20 min / ≤30 min / ≤45 min
    - **Card ⇄ Table** toggle button (right side)
    - **?** info button (opens modal)
  - Active filters highlighted; chip shows current value inline
  - Bar remains visible in both card and table modes
- [x] **6.2** `applyFiltersAndRender()` — filters the restaurant array in memory and triggers the active view (card or table) to re-render. In card mode, non-matching cards are dimmed rather than hidden.

---

## Phase 7 — Card Mode Badges

**Goal:** FSA score and shared address status visible on each Deliveroo card.

- [x] **7.1** Write `src/content/ui/cardBadge.js`:
  - `initCardBadges(restaurants, sharedAddressResults, fsaRatings)` — processes each card in the DOM matched by restaurant `href`
  - Inject `br-badge-row` flex container inside card image wrapper with `isolation: isolate` (prevents badges escaping the card's stacking context and appearing above Deliveroo's fixed header)
  - **FSA badge**: colour-coded pill — green (5) → red (0/1), grey `FSA ?` for unvisited restaurants, `FSA —` for no FSA record
  - **Shared Address badge**: amber `Shared Address` pill with hover tooltip listing sibling names. `pointer-events: auto` + `e.stopPropagation()` to make tooltip usable inside anchor elements
  - `blurCardImages` setting: toggled via `br-blur-images` body class; CSS blurs card background images
- [x] **7.2** Respect settings toggles — `hygieneEnabled` / `sharedAddressEnabled` / `blurCardImages` applied via body classes on `SETTINGS_CHANGED` message

---

## Phase 8 — Table Mode

**Goal:** sortable table as an alternative to Deliveroo's card grid.

- [x] **8.1** Write `src/content/ui/table.js`:
  - `renderTable(restaurants, sharedAddressResults, fsaRatings)` — hides Deliveroo's native grid, renders `<table id="better-roo-table">` with columns:
    - 📌 (pin toggle) · Name · FSA · Deliveroo ★ · ETA · Delivery fee · Shared
  - Pinned rows always rendered first, separated by a subtle divider, regardless of sort state
  - Closed restaurants (no `deliveryTimeMin`) greyed out and sorted to the bottom, separated by a "CLOSED" divider
  - Click column header: sort ascending → descending → clear (returns to pinned-first natural order)
  - Shared column: amber `Shared` pill; hover tooltip lists sibling names
- [x] **8.2** `destroyTable()` — removes table and restores Deliveroo's grid
- [x] **8.3** `showTableSkeleton()` — called immediately on listing page load before async data resolves, shows a loading state while data is fetched

---

## Phase 9 — Detail Page Badge

**Goal:** FSA rating shown when a user opens a restaurant page.

- [x] **9.1** Write `src/content/ui/detailBadge.js`:
  - Called from `handleDetailPage()` with the restaurant record and FSA result from `__NEXT_DATA__`
  - If Deliveroo already shows the hygiene section (`layout-list-hygiene-rating` block present in page), skip injection to avoid duplication
  - Otherwise inject FSA badge near the top of the page

---

## Phase 10 — Popup

**Goal:** quick-access panel for stats and feature toggles.

- [x] **10.1** Write `src/popup/popup.html` — extension name/version, stats section, toggles section, clear data button
- [x] **10.2** Write `src/popup/popup.js`:
  - On open: read stats from `chrome.storage.local` (`restaurantCount`, `lastUpdated` written by content script after each listing page load); display as "N restaurants tracked · updated X ago"
  - Render toggles for `hygieneEnabled`, `sharedAddressEnabled`, `tableViewDefault`, `hidePromotionalGroups`, `blurCardImages` — read/write via background `GET_SETTINGS` / `SET_SETTINGS`
  - On toggle change: broadcast `{ type: 'SETTINGS_CHANGED', settings }` to all active Deliveroo tabs
  - "Clear all data" button — sends `CLEAR_DATA` to active tabs, removes `brStats` from local storage

---

## Phase 11 — Schema Resilience

**Goal:** extension degrades gracefully if Deliveroo changes their page structure.

- [x] **11.1** In `reader.js`, schema validation functions return `false` when `__NEXT_DATA__` structure is unexpected — orchestrator calls `showSchemaBanner()` instead of attempting extraction
- [x] **11.2** Write `src/content/ui/schemaBanner.js`:
  - Injects a dismissible banner: "Better Roo: Deliveroo's page structure has changed — some features may not work. Check for an extension update."

---

## Phase 11B — Additional Features

**Goal:** features added during development beyond the original plan.

- [x] **11B.1** Closed restaurant visibility in table view:
  - Closed = `deliveryTimeMin` is null or non-numeric
  - Closed rows greyed out (`opacity: 0.45`) and sorted to the bottom
  - Separated from open rows by a "CLOSED" divider row

- [x] **11B.2** Flash prevention on table mode load:
  - `src/content/early.js` runs at `document_start` and injects a `display: none` rule for the card grid immediately if `sessionStorage` indicates table mode is active
  - Prevents the flash of Deliveroo's card skeleton before the content script runs

- [x] **11B.3** Pill chip filter bar:
  - Chip buttons with inline dropdowns (popovers open upward) replacing label+select controls
  - Fixed to bottom of viewport; active chips highlighted in teal showing current value
  - Info modal (`modal.js`) accessible via `?` button — describes features and privacy policy

---

## Phase 12 — Polish

**Goal:** clean, stable Chrome extension ready for distribution.

- [x] **12.1** All injected DOM elements use `better-roo-` / `br-` prefix on IDs and class names to avoid collisions with Deliveroo's styles
- [x] **12.2** `manifest.json` permissions confirmed minimal: `storage`, `alarms`, `deliveroo.co.uk`, `api.ratings.food.gov.uk`
- [ ] **12.3** Firefox / Edge support — not currently a goal; extension targets Chrome only

---

## Phase 13 — Testing & Verification

**Goal:** all unit tests pass; manual smoke test checklist complete.

- [x] **13.1** Unit tests (Vitest) — all 54 passing:
  - `addressNorm.js` — postcode extraction, street number extraction, normalisation
  - `matcher.js` — Westminster fixture cluster, false-positive guard, edge cases
  - `reader.js` — schema validation, listing/detail parsing, FSA block extraction, deduplication
  - `timeAgo.js` — relative time formatting
- [ ] **13.2** Manual smoke test on live `deliveroo.co.uk`:
  - [ ] Filter bar appears fixed at the bottom of the page
  - [ ] FSA badges appear on cards (colour-coded pills, `FSA ?` for unvisited)
  - [ ] Shared Address amber pill appears on co-located restaurants; tooltip lists siblings
  - [ ] Toggle to table view — all columns render, sorting works, pinned rows stay at top
  - [ ] Closed restaurants appear greyed out below the CLOSED divider in table view
  - [ ] Click into a restaurant — FSA badge injected near top of detail page (if Deliveroo's own block is absent)
  - [ ] Open popup — correct restaurant count, last-updated time, all toggles functional
  - [ ] Toggle hygiene off in popup — FSA badges disappear across all open Deliveroo tabs
  - [ ] Toggle blur images — card images blur immediately
  - [ ] Toggle hide promotions — promotional carousels hidden
- [ ] **13.3** Edge case verification:
  - [ ] Restaurant with no FSA match → `FSA —` badge
  - [ ] Restaurant not yet visited → `FSA ?` badge
  - [ ] Schema banner appears when `validateListingSchema()` is patched to return false
  - [ ] Clear data in popup — count resets to 0, badges revert to `FSA ?`

---

## Build Order Summary

```
Phase 0  → Scaffold
Phase 1  → DB + Address utils          (foundational, no UI)
Phase 2  → __NEXT_DATA__ reader         (data in, no side effects)
Phase 3  → Orchestrator + SPA nav      (wires phases 2→4→5)
Phase 4  → Shared address detection    (logic + tests)
Phase 5  → FSA background + client    (network layer)
Phase 6  → Filter bar                  (first visible UI)
Phase 7  → Card badges                 (main listing UX)
Phase 8  → Table mode                  (power user UX)
Phase 9  → Detail badge                (detail page UX)
Phase 10 → Popup                       (management UI)
Phase 11 → Schema resilience           (safety net)
Phase 11B→ Additional features
Phase 12 → Polish
Phase 13 → Tests + smoke test
```
