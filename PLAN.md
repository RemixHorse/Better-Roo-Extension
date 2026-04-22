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

- [x] **0.1** Initialise `package.json` with `vitest` and `vite-plugin-web-extension` (or `@crxjs/vite-plugin`) as dev dependencies
- [x] **0.2** Write `vite.config.js` — entry points: `content/index.js`, `content/inject.js` (if retained), `background/index.js`, `popup/popup.html`
- [x] **0.3** Write `manifest.json` (MV3):
  - `permissions`: `storage`, `alarms`
  - `host_permissions`: `https://deliveroo.co.uk/*`, `https://api.ratings.food.gov.uk/*`
  - `content_scripts`: match `*://deliveroo.co.uk/*`, run `content/index.js` in isolated world
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
  - `extractStreetNumber(address1)` — first numeric token (handles `146/148` range format → `146`)
  - `normalise(address1)` — lowercase, strip punctuation, expand abbreviations (`St→Street`, `Rd→Road`, `Ave→Avenue`, etc.) for fuzzy FSA matching
- [x] **1.3** Write unit tests for `addressNorm.js` (Vitest):
  - Postcode extraction from plain addresses, range-format addresses, addresses with null postCode field
  - Street number extraction including range formats and lettered numbers (`145a`)
  - Normalisation round-trips

---

## Phase 2 — Data Extraction from `__NEXT_DATA__`

**Goal:** reliably read restaurant data from the page on both listing and detail pages.

- [x] **2.1** Write `src/content/reader.js` (new file, replaces the inject.js approach):
  - `getPageType()` — returns `'listing'`, `'detail'`, or `null` based on `window.location.pathname`
  - `readListingRestaurants()` — walks `__NEXT_DATA__.props.initialState.home.feed.results.data`, deduplicates by `restaurant_id`, returns array of normalised restaurant objects:
    ```js
    { id, drn_id, brand_drn_id, name, href, rating, ratingCount, distance, deliveryTimeMin, deliveryFee }
    ```
  - `readDetailRestaurant()` — reads `__NEXT_DATA__.props.initialState.menuPage.menu.metas.root.restaurant`, returns:
    ```js
    { id, drn_id, brand_drn_id, name, uname, address1, postcode, neighborhood, city }
    ```
  - `readDetailFsaRating()` — walks `menuPage.menu.layoutGroups` for block with `actionId === 'layout-list-hygiene-rating'`, extracts score from image URL (`fhrs_{N}@3x.png`) and last-updated date text. Returns `{ score: number|null, ratingDate: string|null }` or `null` if block absent.
  - `validateListingSchema()` — checks feed structure exists, returns bool; if false, triggers schema-changed banner
  - `validateDetailSchema()` — checks restaurant object exists and has required fields
- [x] **2.2** Write unit tests for schema validation functions — test both valid shape and deliberate breakage

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
  - Upsert each into IndexedDB (listing-level fields only — no address yet)
  - Run ghost kitchen detection (Phase 4)
  - Trigger UI injection (Phase 5)
- [x] **3.3** `handleDetailPage()`:
  - Read restaurant + address via `reader.js`
  - Upsert into IndexedDB (now with address fields)
  - Read FSA rating from `__NEXT_DATA__` directly; if present, upsert into `fsa_cache`
  - If FSA rating absent, request from background (Phase 5)
  - Inject detail badge (Phase 8)

---

## Phase 4 — Ghost Kitchen Detection

**Goal:** classify every restaurant in the current listing as `ghost_brand`, `ghost_parent`, or `clean`.

- [x] **4.1** Rewrite `src/content/matcher.js` against the finalised scoring model:

  | Signal | Weight |
  |--------|--------|
  | Shared `brandDrnId` (non-empty) | +0.6 |
  | Slug contains `-at-` pattern | +0.4 |
  | Name in bundled `ghost-kitchens.json` | +0.5 |
  | Same postcode + same street number | +0.5 |
  | Same postcode only | +0.1 |
  | User-flagged | → 1.0 override |

  **Threshold:** `> 0.5` → `ghost_brand` (strictly greater — address-only score of 0.5 keeps host restaurants clean for pass 2 ghost_parent promotion)

  Pass 2: any `clean` restaurant sharing postcode + street number with a confirmed `ghost_brand` → `ghost_parent`

- [x] **4.2** Update `src/data/ghost-kitchens.json` — seed with Bangtan, SoBe Burger, Mac & Wings, E K B Gourmet Burger and any other confirmed brands from research
- [x] **4.3** Rewrite `tests/matcher.test.js` to match updated scoring (+0.5 for address match):
  - Galitos/Bangtan/SoBe cluster (ghost_parent + ghost_brand)
  - El Kervan / EKB cluster (postcode+number match alone, score 0.5)
  - PizzaExpress / Mac & Wings cluster (postcode+number match alone, score 0.5)
  - Station Parade false-positive guard (Pizza Uno / Hattusa / El Kervan — same postcode, different numbers → all clean)
  - User flag override
  - Empty `brandDrnId` string treated as absent

---

## Phase 5 — FSA Integration

**Goal:** FSA hygiene scores available for all listing-page restaurants, sourced from cache, `__NEXT_DATA__`, or the FSA API.

- [x] **5.1** Write `src/background/index.js` (service worker):
  - Listen for `{ type: 'FSA_LOOKUP', restaurants: [{id, name, address1}] }`
  - For each: `GET https://api.ratings.food.gov.uk/Establishments?name={name}&address={postcode}&pageSize=5` with `Accept: application/json; version=2`
  - Fuzzy-match top result using normalised address; fall back to name + postcode only
  - Parse `RatingValue` (`"1"`–`"5"` → number, `"Exempt"` / `"AwaitingInspection"` → `null`)
  - Return `{ id, score, ratingDate }` per restaurant
  - Also handle `{ type: 'GET_SETTINGS' }` and `{ type: 'SET_SETTINGS', patch }` via `chrome.storage.sync`
- [x] **5.2** Write `src/content/fsa.js`:
  - `getFsaRatings(restaurants)` — checks IndexedDB cache first (7-day TTL), batches misses, sends to background, caches results, returns map of `id → { score, ratingDate }`
- [x] **5.3** Wire FSA fetch into `handleListingPage()` — after ghost detection, call `getFsaRatings`, then refresh UI badges

---

## Phase 6 — Filter Bar UI

**Goal:** visible filter controls above the Deliveroo results grid.

- [x] **6.1** Write `src/content/ui/filterBar.js`:
  - Inject a `<div id="better-roo-bar">` immediately above Deliveroo's results container (query for the grid wrapper element by inspecting the DOM)
  - Controls:
    - FSA minimum score: slider or dropdown (0–5, default 0)
    - Deliveroo minimum rating: slider (0–5, default 0)
    - Ghost kitchen filter: 3-way toggle — Show all / Hide ghost / Only ghost
    - Max delivery time: dropdown (Any / 15 / 20 / 30 / 45 min)
    - Card ⇄ Table toggle button (right-aligned)
  - On any control change: call `applyFiltersAndRender()`
  - Persist card/table preference to `chrome.storage.sync`
  - Injection anchor: `#home-feed-container`, prepended before `HomeFeedResults`
- [x] **6.2** `applyFiltersAndRender()` — filters the current restaurant array in memory and triggers the active view (card or table) to re-render

---

## Phase 7 — Card Mode Badges

**Goal:** FSA score, ghost kitchen status, and pin control visible on each Deliveroo card.

- [x] **7.1** Write `src/content/ui/cardBadge.js`:
  - `injectBadges(restaurantId, { fsaResult, ghostResult })` — finds the card DOM element for a given restaurant ID and injects:
    - **FSA badge**: `★ N/5` or `Not rated`, positioned bottom-left of card image
    - **Ghost badge** (if `isGhostKitchen`): 👻 or 🏠 depending on type; `title` attribute = full tooltip string including sibling names and `· Score: 0.XX`
    - **Pin button**: 📌 top-right of card; toggles `isPinned` in IndexedDB, calls `reorderPinnedCards()`
  - `reorderPinnedCards()` — moves pinned card DOM elements to the top of the results container without re-fetching data
- [x] **7.2** Handle Deliveroo's lazy-rendered cards — use a `MutationObserver` on the results container to badge newly rendered cards as they appear
- [x] **7.3** Respect settings toggles — if `hygieneEnabled` is false, skip FSA badge; if `ghostKitchenEnabled` is false, skip ghost badge

---

## Phase 8 — Table Mode

**Goal:** sortable table as an alternative to Deliveroo's card grid.

- [x] **8.1** Write `src/content/ui/table.js`:
  - `renderTable(restaurants, ghostResults, fsaRatings)` — hides Deliveroo's native grid, renders `<table id="better-roo-table">` with columns:
    - 📌 (pin toggle) · Name · Distance · ETA · Delivery fee · Deliveroo ★ · FSA · Ghost
  - Pinned rows always rendered first, separated from the rest by a subtle divider, regardless of current sort column
  - Click column header: sort ascending; click again: descending; click again: clear sort (return to pinned-first, then natural order)
  - Ghost column cell: shows badge icon; hover shows full tooltip with score
- [x] **8.2** `destroyTable()` — removes the table and restores Deliveroo's grid (`display: ''`)
- [x] **8.3** Filter controls move into the table header in table view mode:
  - The filter bar collapses to just the "Card view" toggle button when table mode is active
  - A second `<thead>` row renders inline filter dropdowns beneath the relevant columns: ETA → max delivery, Deliveroo ★ → min rating, FSA → min FSA score, Ghost → ghost mode
  - Filter state remains owned by `filterBar.js`; `table.js` reads it via exported `getFilters()` / `setFilter()` helpers
  - Switching back to card view restores the full filter bar

---

## Phase 9 — Detail Page Badge

**Goal:** FSA rating shown prominently when a user opens a restaurant page.

- [x] **9.1** Write `src/content/ui/detailBadge.js`:
  - Called from `handleDetailPage()` after FSA data is resolved
  - Injects a panel near the top of the page (below the hero image, above the menu categories) showing:
    - FSA badge image (matching Deliveroo's own embedded image if present, or fetched from `ow.roocdn.com/assets/images/fsa/fhrs_{N}@3x.png`)
    - Rating date ("Last inspected: DD MMM YYYY")
    - "Not rated" state if score is null
  - If Deliveroo already shows the hygiene section (`layout-list-hygiene-rating` block exists), skip injection to avoid duplication

---

## Phase 10 — Popup

**Goal:** quick-access panel for stats and feature toggles.

- [x] **10.1** Write `src/popup/popup.html` — minimal layout: extension name/version, stats section, toggles section, danger zone
- [x] **10.2** Write `src/popup/popup.js`:
  - On open: read stats from IndexedDB (`restaurants` count, most recent `lastSeen` timestamp); display as "N restaurants tracked · Last updated X"
  - Render toggles for `hygieneEnabled`, `ghostKitchenEnabled`, `tableViewDefault` — read/write via background `GET_SETTINGS` / `SET_SETTINGS`
  - On toggle change: broadcast `{ type: 'SETTINGS_CHANGED', settings }` to all active Deliveroo tabs via `chrome.tabs.query` + `chrome.tabs.sendMessage`
  - "Clear all data" button — calls `db.clearAll()`, resets stats display

---

## Phase 11 — Schema Resilience

**Goal:** extension degrades gracefully if Deliveroo changes their page structure.

- [x] **11.1** In `reader.js`, if `validateListingSchema()` fails:
  - Do not attempt data extraction
  - Post a message to the content script to show the degraded-mode banner
- [x] **11.2** Write `src/content/ui/schemaBanner.js`:
  - Injects a dismissible yellow banner at the top of the page: "Better Roo: Deliveroo's page structure has changed — some features may not work. Check for an extension update."
  - Dismissed state persisted in `sessionStorage` (reappears on next page load)

---

## Phase 11B — Additional Features

**Goal:** new features added before cross-browser polish and final testing.

- [~] **11B.2** Table skeleton on listing page load *(partially complete — revisit)*:
  - Skeleton and spinner are implemented and work correctly once data loads
  - Content script changed to `document_end` (runs at DOMContentLoaded, before React hydrates) to reduce flash window
  - SessionStorage used to cache table mode preference so `hideGrid()` fires synchronously before first `await`
  - Remaining issue: a brief flash of Deliveroo's card skeleton still visible on some loads; `document_start` approach was tried but caused React reconciliation to wipe our DOM insertions

- [ ] **11B.3** Redesigned card-view filter bar:
  - Pill chip buttons (FSA ▾, Rating ▾, Ghost ▾, Delivery ▾) replacing label+select dropdowns
  - Fixed to the bottom of the viewport; popovers open upward
  - Active filters highlighted in teal; chip shows current value
  - Hidden entirely in table mode (table has its own inline filters)
  - Body padding added so bottom content isn't obscured

- [x] **11B.1** Closed restaurant visibility in table view:
  - Closed = `deliveryTimeMin == null`
  - Closed rows greyed out (`opacity: 0.45`) and sorted to the bottom
  - Separated from open rows by a "CLOSED" divider row

---

## Phase 12 — Cross-Browser & Polish

**Goal:** verified working on Chrome, Firefox, and Edge.

- [ ] **12.1** Test on Firefox — confirm `world: MAIN` is not used (removed in our approach), MV3 service worker fallback to `background.scripts` if needed for Firefox MV2 compatibility
- [ ] **12.2** Test on Edge — should work without changes if Chrome build passes
- [ ] **12.3** Review all injected DOM elements — use a `better-roo-` prefix on all IDs and class names to avoid collisions with Deliveroo's styles
- [ ] **12.4** Audit `manifest.json` permissions — confirm minimal footprint before store submission

---

## Phase 13 — Testing & Verification

**Goal:** all unit tests pass; manual smoke test checklist complete.

- [ ] **13.1** Unit tests (Vitest) — all passing:
  - `addressNorm.js` (postcode, street number, normalise)
  - `matcher.js` (full scoring matrix, all real-world clusters, edge cases)
  - FSA response parsing (RatingValue variants)
  - `reader.js` schema validation (valid + broken shapes)
- [ ] **13.2** Manual smoke test on live `deliveroo.co.uk/restaurants/royal-tunbridge-wells/sevenoaks`:
  - [ ] Filter bar appears above results
  - [ ] FSA badges appear on cards
  - [ ] Galitos shows 🏠, Bangtan/SoBe show 👻; hovering shows siblings + score
  - [ ] El Kervan and EKB both show 👻 with each other as sibling
  - [ ] PizzaExpress shows 🏠, Mac & Wings shows 👻
  - [ ] Pin a restaurant — card moves to top; survives filter changes
  - [ ] Toggle to table view — all columns present, sorting works, pinned rows stay top
  - [ ] Click into Wagamama — FSA badge injected near top of page (5/5)
  - [ ] Open popup — correct restaurant count and working toggles
  - [ ] Toggle hygiene off in popup — FSA badges disappear on listing page
- [ ] **13.3** Edge case verification:
  - [ ] Restaurant with no FSA match → "Not rated" badge
  - [ ] Schema banner appears when `validateListingSchema()` is patched to return false
  - [ ] Clear data in popup — count resets to 0

---

## Build Order Summary

```
Phase 0  → Scaffold
Phase 1  → DB + Address utils         (foundational, no UI)
Phase 2  → __NEXT_DATA__ reader        (data in, no side effects)
Phase 3  → Orchestrator + SPA nav     (wires phases 2→4→5)
Phase 4  → Ghost kitchen matcher      (logic + tests)
Phase 5  → FSA background + client   (network layer)
Phase 6  → Filter bar                 (first visible UI)
Phase 7  → Card badges                (main listing UX)
Phase 8  → Table mode                 (power user UX)
Phase 9  → Detail badge               (detail page UX)
Phase 10 → Popup                      (management UI)
Phase 11 → Schema resilience          (safety net)
Phase 11B→ Additional features
Phase 12 → Cross-browser + polish
Phase 13 → Tests + smoke test
```
