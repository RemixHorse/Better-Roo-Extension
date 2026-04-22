# Better Roo — Deliveroo Browser Extension
## Design Document

---

## Context

Deliveroo's search results hide information that matters to users: food hygiene ratings are buried inside the "Allergens and info" section of each restaurant's page, and virtual brands (multiple names operating from the same kitchen) are invisible. The default card view also makes it difficult to compare restaurants across multiple attributes simultaneously.

**Better Roo** is a Chrome extension that enriches the Deliveroo experience by surfacing this data directly on the search results page, adding a filterable table view, and building a local database of restaurant data to detect shared-address patterns over time.

---

## Decisions Made

| # | Decision | Choice |
|---|----------|--------|
| 1 | Target browser | Chrome only (MV3) |
| 2 | Target market | UK only — deliveroo.co.uk |
| 3 | Hygiene rating source | UK FSA Ratings API (ratings.food.gov.uk) |
| 4 | Restaurant data source | `__NEXT_DATA__` JSON blob embedded in the page — parsed by `reader.js` |
| 5 | Shared address detection | Postcode + street number grouping — any two restaurants sharing both are flagged |
| 6 | FSA match strategy | Name + postcode sent to FSA API; street number used to pick best result when multiple establishments match |
| 7 | Address normalisation | Lowercase, strip punctuation, expand abbreviations (St→Street, Rd→Road, etc.) |
| 8 | FSA badge display | `FSA N/5` (colour-coded), `FSA ?` (address not yet known), `FSA —` (no FSA record found) |
| 9 | DB persistence | IndexedDB, until manually cleared via popup |
| 10 | View mode | Toggle: card ⇄ table (remembers preference in `chrome.storage.sync`) |
| 11 | Table columns | Name, FSA score, Deliveroo rating, ETA, delivery fee, shared address badge |
| 12 | Table sorting | All columns sortable (click header, toggle asc/desc); pinned rows always appear first |
| 13 | Filter bar placement | Fixed bar at the bottom of the viewport |
| 14 | Filter controls | FSA min score, Deliveroo min rating, shared address mode (all/shared/unique), max delivery time |
| 15 | FSA fetch timing | Listing page: cache-first (7 day TTL), misses batched to background worker. Detail page: read directly from `__NEXT_DATA__` |
| 16 | Shared address card UX | Amber pill badge inline with FSA badge; hover tooltip lists sibling restaurant names |
| 17 | Shared address handling | Always flagged; no dismiss — user decides what to do with the information |
| 18 | Extension popup | DB stats (record count, last updated) + feature toggles + clear data button |
| 19 | Restaurant detail page | FSA badge injected near top if rating is present in page data |
| 20 | No FSA match display | `FSA —` badge |
| 21 | Tech stack | Vanilla JS + Vite |
| 22 | SPA navigation | `history.pushState` patching + `popstate` event listener — re-runs on every route change |
| 23 | Deliveroo resilience | Schema validation on `__NEXT_DATA__` before reading; banner notification if schema has changed |
| 24 | Settings toggles | Hygiene display, shared address badges, table view default, hide promotional carousels, blur card images |
| 25 | Distribution | Open source on GitHub; GitHub Actions builds and zips on tag push |
| 26 | Pinning | User can pin restaurants — pinned rows always sort to the top of the table view, persisted in IndexedDB |
| 27 | Flash prevention | `early.js` runs at `document_start` and hides the card grid immediately if table mode is active, preventing skeleton flash |

---

## Architecture

### Component Overview

```
┌──────────────────────────────────────────────────────────────┐
│ Browser Tab (deliveroo.co.uk)                                │
│                                                              │
│  <script id="__NEXT_DATA__">{ ... }</script>                 │
│            │                                                 │
│            │ read by                                         │
│            ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ content/index.js (isolated world)                   │    │
│  │                                                     │    │
│  │  reader.js     — parses __NEXT_DATA__               │    │
│  │  db.js         — IndexedDB (restaurants, fsa_cache, │    │
│  │                             user_flags)             │    │
│  │  matcher.js    — shared address detection           │    │
│  │  fsa.js        — cache-first FSA lookup             │    │
│  │  ui/           — filter bar, table, badges, modal   │    │
│  └────────────────────────┬────────────────────────────┘    │
└───────────────────────────┼──────────────────────────────────┘
                            │ chrome.runtime.sendMessage (FSA_LOOKUP)
              ┌─────────────▼────────────────┐
              │ background/index.js           │
              │ (Service Worker)              │
              │ - FSA API fetch (CORS)        │
              │ - chrome.storage.sync         │
              │   (settings)                  │
              └───────────────────────────────┘

┌──────────────────────┐
│ popup.html / popup.js│
│ - DB stats           │
│ - Feature toggles    │
│ - Clear data button  │
└──────────────────────┘
```

### Why `__NEXT_DATA__` instead of network interception

Deliveroo renders its restaurant data server-side into a `<script id="__NEXT_DATA__">` JSON blob on every page load. This means the full restaurant payload — including names, IDs, addresses, ratings, and delivery info — is available synchronously in the DOM as soon as the page loads, with no need to intercept fetch/XHR calls. `reader.js` simply parses this blob. The FSA rating for a restaurant's detail page is also embedded in `__NEXT_DATA__` via Deliveroo's own hygiene layout block.

---

## File Structure

```
better-roo/
├── manifest.json
├── package.json
├── vite.config.js
├── src/
│   ├── background/
│   │   └── index.js          # Service worker: FSA API proxy, settings storage
│   ├── content/
│   │   ├── early.js          # document_start: hides card grid to prevent table-mode flash
│   │   ├── index.js          # Orchestrator: reads page, drives DB + UI
│   │   ├── reader.js         # __NEXT_DATA__ parser for listing and detail pages
│   │   ├── db.js             # IndexedDB wrapper (restaurants, fsa_cache, user_flags)
│   │   ├── matcher.js        # Shared address detection
│   │   ├── fsa.js            # FSA cache + background worker dispatch
│   │   ├── addressNorm.js    # Postcode extraction, street number extraction, normalisation
│   │   ├── timeAgo.js        # Relative time formatting
│   │   └── ui/
│   │       ├── filterBar.js  # Fixed bottom bar: filter chips + card/table toggle
│   │       ├── table.js      # Table view renderer + sorting
│   │       ├── cardBadge.js  # FSA + shared address pills on listing cards
│   │       ├── detailBadge.js # FSA badge on restaurant detail page
│   │       ├── modal.js      # Info modal (features, privacy)
│   │       └── schemaBanner.js # Banner shown when __NEXT_DATA__ schema has changed
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
```

---

## Key Flows

### 1. Page Data Reading

1. On `DOMContentLoaded` (or immediately if already loaded), `index.js` patches `history.pushState` and calls `onRouteChange` for the current path.
2. On every route change, `onRouteChange` checks the path:
   - `/restaurants/…` → `handleListingPage()`
   - `/menu/…` → `handleDetailPage()`
3. `reader.js` validates the `__NEXT_DATA__` shape before reading. If validation fails, `schemaBanner.js` shows a degraded-mode notification.

### 2. Listing Page

1. `reader.js` reads all restaurant blocks from `__NEXT_DATA__`, deduplicating by restaurant ID. Fields captured: `id`, `drn_id`, `name`, `href`, `rating`, `deliveryTimeMin`, `deliveryFee`, and related display fields.
2. Existing DB records are fetched and merged with fresh listing data (DB address fields are preserved — they're richer, written by detail page visits).
3. All restaurants are upserted to the `restaurants` IndexedDB store.
4. `matcher.js` runs `detectSharedAddresses` over the merged set (listing + all DB-cached restaurants, so currently-closed brands still contribute as siblings).
5. `fsa.js` runs cache-first FSA lookup (see FSA flow below).
6. `filterBar.js` and `cardBadge.js` are initialised with the enriched data.

### 3. Detail Page

1. `reader.js` reads the restaurant record from `__NEXT_DATA__` — this includes `address1`, `postcode`, `neighborhood`, and `city`, which the listing page does not expose.
2. The restaurant is upserted to IndexedDB, enriching the address fields for future shared address detection.
3. `readDetailFsaRating()` scans `__NEXT_DATA__` for Deliveroo's own hygiene layout block (`actionId: "layout-list-hygiene-rating"`). The FSA score is extracted from the rating image URL (`fhrs_N@3x.png`) and the date from the accompanying text spans.
4. If a rating is found it is written to `fsa_cache` and `detailBadge.js` renders the FSA badge on the page.

### 4. FSA Hygiene Lookup (Listing Page)

1. For each restaurant in the current listing, `fsa.js` checks `fsa_cache` in IndexedDB. Cached entries with a non-null score and age under 7 days are used directly.
2. Cache misses (restaurants with an `address1` but no valid cached score) are batched and sent to the background service worker as a single `FSA_LOOKUP` message.
3. The background worker calls `https://api.ratings.food.gov.uk/Establishments?name={name}&address={postcode}&pageSize=5`.
4. If multiple establishments are returned, the one whose `AddressLine1` contains the restaurant's street number is preferred; otherwise the first result is used.
5. `RatingValue` is parsed as an integer 0–5; non-numeric values ("Exempt", "AwaitingInspection") produce `null`.
6. Results are written back to `fsa_cache` and the UI is updated.

### 5. Shared Address Detection

`matcher.js` runs a single-pass grouping algorithm:

1. Each restaurant's `address1` is parsed for a postcode and a street number (first numeric token, scanning the whole string to handle prefixed formats like `"Whitehall Grill 10 Downing Street"`).
2. A `Map` is built keyed by `"{postcode}|{streetNumber}"`.
3. Any restaurant that shares a key with at least one other restaurant is flagged `isSharedAddress: true`, with `siblingNames` listing the co-located restaurant names.
4. Restaurants with no parseable postcode or street number are flagged `false` and excluded from grouping.

### 6. UI — Filter Bar

- A fixed bar is appended to the bottom of `document.body`, pinned via `position: fixed`.
- Contains: Better Roo label, `?` info button (opens modal), four filter chips (FSA, Rating, Address, Delivery), and a card/table view toggle.
- Each chip opens a popover of options above the bar. The active filter value is shown inline on the chip.
- Filtering in card mode dims non-matching cards rather than hiding them. Filtering in table mode re-renders the table with only matching rows.

### 7. UI — Cards

- `cardBadge.js` processes each Deliveroo card in the DOM, matched by the restaurant's `href`.
- A `br-badge-row` flex container is appended inside the card's image wrapper, with `isolation: isolate` to scope the stacking context and prevent badges appearing above Deliveroo's fixed header.
- FSA badge: colour-coded pill (`FSA 5` green → `FSA 0` red, `FSA ?` grey for unvisited, `FSA —` for no record).
- Shared address badge: amber `Shared Address` pill with a hover tooltip listing sibling names. `pointer-events: auto` and `e.stopPropagation()` are applied to make the tooltip work inside anchor elements.
- `blurCardImages` setting applies a CSS blur to card background images via a body class.

### 8. Settings & Popup

- `chrome.storage.sync` stores: `{ hygieneEnabled, sharedAddressEnabled, tableViewDefault, hidePromotionalGroups, blurCardImages }`.
- The popup reads settings on open and renders toggles. Changes are written via the background worker and broadcast to all open Deliveroo tabs via `chrome.tabs.sendMessage`.
- The popup also displays DB stats (restaurant count, last updated) read from `chrome.storage.local`, written by the content script after each listing page load.

---

## IndexedDB Schema

**`restaurants` store** — keyed by Deliveroo restaurant ID
```js
{
  id: number,
  drn_id: string | null,
  brand_drn_id: string | null,
  name: string,
  href: string | null,
  rating: string | null,
  ratingCount: string | null,
  distance: string | null,
  deliveryTimeMin: string | null,
  deliveryTimeLabel: string | null,
  deliveryFee: string | null,
  // Written on detail page visit:
  address1: string | null,
  postcode: string | null,
  neighborhood: string | null,
  city: string | null,
  uname: string | null,
  lastSeen: timestamp,
}
```

**`fsa_cache` store** — keyed by Deliveroo restaurant ID
```js
{
  restaurantId: number,
  score: number | null,   // 0–5, or null (exempt / not inspected / no match)
  ratingDate: timestamp | null,
  cachedAt: timestamp,    // TTL: 7 days
}
```

**`user_flags` store** — keyed by Deliveroo restaurant ID
```js
{
  restaurantId: number,
  isPinned: boolean,      // forces restaurant to top of table view
}
```

---

## FSA API Notes

- Base URL: `https://api.ratings.food.gov.uk/`
- Key endpoint: `GET /Establishments?name=X&address=Y&pageSize=5`
- Required headers: `Accept: application/json; version=2`, `x-api-version: 2`
- Free, no API key required
- Rating field: `RatingValue` (string `"0"`–`"5"`, `"Exempt"`, `"AwaitingInspection"`, etc.)
- Rate limit: unknown — requests are batched per listing page load, not per keystroke

---

## Manifest Permissions

```json
{
  "permissions": ["storage", "alarms"],
  "host_permissions": [
    "*://deliveroo.co.uk/*",
    "https://api.ratings.food.gov.uk/*"
  ]
}
```

Minimal permissions footprint. `alarms` is declared for future scheduled FSA cache refresh.

---

## Verification Plan

1. **Unit tests** (Vitest): `addressNorm.js`, `matcher.js`, `reader.js`, `timeAgo.js`.
2. **Manual smoke test**:
   - Load extension unpacked in Chrome.
   - Navigate to deliveroo.co.uk and open a restaurant listing.
   - Verify the filter bar appears at the bottom of the page.
   - Verify FSA badges appear on cards (green/amber/red pills or `FSA ?` for unvisited).
   - Visit a restaurant's menu page — verify the shared address badge appears on return if it shares an address.
   - Verify shared address pill tooltip lists the co-located restaurant names.
   - Toggle to table view — verify all columns render and sorting works.
   - Click into a restaurant — verify FSA badge appears near the top of the detail page.
   - Open popup — verify record count, last-updated time, and all toggles work.
3. **Edge cases**:
   - Restaurant with no FSA match → `FSA —` badge.
   - Restaurant whose menu hasn't been visited → `FSA ?` badge.
   - Two or more restaurants at the same address → all flagged, tooltip lists the others.
   - Settings toggle off hygiene → FSA badges disappear across all open Deliveroo tabs.
   - Settings toggle blur images → card images blur immediately.
   - Schema change simulation → notification banner appears, extension degrades gracefully.
