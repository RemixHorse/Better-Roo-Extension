# Better Roo — Deliveroo Browser Extension
## Design Document

---

## Context

Deliveroo's search results hide information that matters to users: food hygiene ratings are buried inside the "Allergens and info" section of each restaurant's page, and ghost kitchens (multiple brand names operating from the same address) are invisible. The default card view also makes it difficult to compare restaurants across multiple attributes simultaneously.

**Better Roo** is a browser extension that enriches the Deliveroo experience by surfacing this data directly on the search results page, adding a filterable table view, and building a local database of restaurant data to detect address-sharing patterns over time.

---

## Decisions Made

| # | Decision | Choice |
|---|----------|--------|
| 1 | Target browsers | Chrome, Firefox, Edge (cross-browser) |
| 2 | Target market | UK only — deliveroo.co.uk |
| 3 | Hygiene rating source | UK FSA Ratings API (ratings.food.gov.uk) |
| 4 | Restaurant data source | Network intercept (fetch/XHR monkey-patch in page context) |
| 5 | Ghost kitchen detection | Structural (same address in DB) + bundled known brand list + user-markable |
| 6 | FSA match strategy | Name + full address (fuzzy), fall back to name + postcode |
| 7 | Address normalisation | Fuzzy string match (lowercase, strip punctuation, expand St→Street etc.) |
| 8 | Hygiene rating display | Numeric badge (★ N/5), "Not rated" if no FSA match found |
| 9 | Ghost kitchen brand list | Bundled JSON + user can mark/unmark any restaurant |
| 10 | DB persistence | IndexedDB, until manually cleared |
| 11 | View mode | Toggle: card ⇄ table (remembers preference) |
| 12 | Table columns | Name, cuisine, distance, ETA, delivery fee, min order, Deliveroo ★, FSA score, ghost kitchen flag |
| 13 | Table sorting | All columns sortable (click header, toggle asc/desc) |
| 14 | Filter UI placement | Injected bar above results |
| 15 | Filter controls | FSA min score, Deliveroo min rating, ghost kitchen toggle, max distance/ETA |
| 16 | FSA fetch timing | Batch on results load, cached 7 days; always re-fetch on restaurant detail page |
| 17 | Ghost kitchen card UX | Badge + hover tooltip listing sibling brands and ghost score (e.g. "Score: 0.8") |
| 18 | Shared address handling | Always flagged; user decides — no dismiss button (keep it simple) |
| 19 | Extension popup | Stats (record count, last updated) + feature toggles (hygiene display, ghost kitchen detection, table default) |
| 20 | Restaurant detail page | FSA badge injected prominently at top |
| 21 | No FSA match display | "Not rated" badge |
| 22 | Tech stack | Vanilla JS + Vite |
| 23 | Manifest version | MV3 everywhere |
| 24 | Network intercept mechanism | Content script injects into page world (world: "MAIN") to monkey-patch window.fetch and XHR |
| 25 | SPA navigation | Reactive: re-process every time a new restaurant payload is intercepted |
| 26 | Settings toggles | Hygiene display, ghost kitchen detection, table view default |
| 27 | Deliveroo resilience | Schema validation on intercepted payloads; banner notification if schema has changed |
| 28 | Distribution | Open source on GitHub; built to Chrome Web Store standards |
| 29 | Pinning | User can pin any restaurant — pinned restaurants always sort to the top of both card and table views, persisted in IndexedDB |

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│ Browser Tab (deliveroo.co.uk)                           │
│                                                         │
│  ┌─────────────────────┐   postMessage    ┌──────────┐  │
│  │ inject.js           │ ──────────────►  │          │  │
│  │ (world: MAIN)       │                  │          │  │
│  │ - Wraps fetch/XHR   │                  │content.js│  │
│  │ - Filters Deliveroo │                  │(isolated)│  │
│  │   API responses     │                  │          │  │
│  └─────────────────────┘                  │- IndexedDB│ │
│                                           │- UI inject│ │
│                                           │- FSA req  │ │
│                                           └─────┬─────┘  │
└─────────────────────────────────────────────────┼───────┘
                                                  │ chrome.runtime.sendMessage
                                    ┌─────────────▼────────────┐
                                    │ background.js            │
                                    │ (Service Worker)         │
                                    │ - FSA API fetch (CORS)   │
                                    │ - chrome.storage.sync    │
                                    │   (user settings)        │
                                    └──────────────────────────┘

┌──────────────────────┐
│ popup.html / popup.js│
│ - DB stats           │
│ - Feature toggles    │
│ - Clear data button  │
└──────────────────────┘
```

### Why inject.js must run in world: MAIN

Deliveroo is a React SPA. Its `fetch` calls are made from page JS context. A content script in the isolated world cannot intercept them — only a script running in the page's own JavaScript context can wrap `window.fetch`. MV3 supports this via `"world": "MAIN"` in `content_scripts` (Chrome 111+, Firefox 128+).

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
│   │   ├── inject.js         # Page-world fetch/XHR interceptor
│   │   ├── index.js          # Orchestrator: receives data, drives UI
│   │   ├── db.js             # IndexedDB wrapper (restaurants, FSA cache, user flags)
│   │   ├── matcher.js        # Ghost kitchen detection logic
│   │   ├── fsa.js            # FSA API client (requests via background)
│   │   ├── addressNorm.js    # Fuzzy address normalisation
│   │   └── ui/
│   │       ├── filterBar.js  # Injected filter controls above results
│   │       ├── table.js      # Table view renderer + sorting
│   │       ├── cardBadge.js  # Hygiene + ghost kitchen badges on cards
│   │       └── detailBadge.js # FSA badge on restaurant detail page
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   └── data/
│       └── ghost-kitchens.json  # Bundled known ghost kitchen brand names
```

---

## Key Flows

### 1. Restaurant Data Interception

1. `inject.js` wraps `window.fetch` in the page context.
2. On every response, it checks the URL against known Deliveroo API patterns (to be discovered by inspecting DevTools network tab on deliveroo.co.uk during development).
3. If the response matches, it clones and reads the JSON body.
4. Validates against an expected schema (has `restaurants[].address`, `restaurants[].name`, etc.).
   - If schema mismatch: posts a `SCHEMA_CHANGED` message → `content.js` shows a degraded-mode notification.
5. Posts `RESTAURANTS_FETCHED` message with the payload to `content.js`.

### 2. Storing & Ghost Kitchen Detection

1. `content.js` receives `RESTAURANTS_FETCHED`.
2. Calls `db.js` to upsert each restaurant by Deliveroo's internal ID.
3. After upsert, calls `matcher.js`:
   - **Structural**: query IndexedDB for all restaurants sharing the same normalised address. Any address with ≥2 entries is a ghost kitchen cluster.
   - **Brand list**: check each restaurant name against `ghost-kitchens.json` (case-insensitive).
   - **User flags**: check IndexedDB `user_flags` store for manually marked entries.
4. Tags each restaurant object with `{ isGhostKitchen: bool, siblingBrands: string[] }`.

### 3. FSA Hygiene Lookup

1. For each restaurant in the current results batch, `fsa.js` checks IndexedDB for a cached FSA record (expires after 7 days).
2. Cache misses are batched and sent to `background.js` via `chrome.runtime.sendMessage`.
3. `background.js` calls the FSA API: `https://api.ratings.food.gov.uk/Establishments?name={name}&address={address}&pageSize=5`.
4. Fuzzy-matches the top result using `addressNorm.js`. Falls back to name + postcode if full address fails.
5. Returns `{ score: 0-5 | null, ratingDate: string | null }` per restaurant.
6. `content.js` caches results in IndexedDB and triggers UI refresh.

### 4. UI Injection

**Search results page** (`/area/...`):
- `filterBar.js` is injected above the results container. Contains: FSA min score slider, Deliveroo min rating slider, ghost kitchen toggle (Show all / Hide GK / Only GK), max distance/ETA dropdown.
- A card/table toggle button is added to the filter bar.
- In **card mode**: `cardBadge.js` injects FSA badge and ghost kitchen badge onto each Deliveroo card. Ghost kitchen badge opens a tooltip on hover listing sibling brands. A pin button (📌) is injected on each card; pinned cards are re-ordered to the top of the results container.
- In **table mode**: `table.js` hides Deliveroo's native card grid (display:none) and renders a sortable HTML table. Each row has a "Flag as ghost kitchen" button and a pin toggle. Pinned rows always appear above the sorted results regardless of column sort state.

**Restaurant detail page**:
- `detailBadge.js` detects the page type, retrieves the FSA record from IndexedDB (or triggers a fresh fetch), and injects a hygiene rating panel near the top of the page.

### 5. Settings & Popup

- `chrome.storage.sync` stores: `{ hygieneEnabled, ghostKitchenEnabled, tableViewDefault }`.
- Popup reads these on open, renders toggles. Changes are broadcast to active Deliveroo tabs via `chrome.tabs.sendMessage`.

---

## IndexedDB Schema

**`restaurants` store** — keyed by Deliveroo restaurant ID
```js
{
  id: string,            // Deliveroo internal ID
  name: string,
  address: string,       // full address
  postcode: string,
  lat: number,
  lng: number,
  cuisine: string,
  deliverooRating: number,
  priceRange: string,
  lastSeen: timestamp,   // for UI sorting/freshness
}
```

**`fsa_cache` store** — keyed by Deliveroo restaurant ID
```js
{
  restaurantId: string,
  fsaScore: number | null,   // null = "Not rated"
  ratingDate: string | null,
  fetchedAt: timestamp,      // expires after 7 days
}
```

**`user_flags` store** — keyed by Deliveroo restaurant ID
```js
{
  restaurantId: string,
  isGhostKitchen: boolean,   // user-marked
  isPinned: boolean,         // forces restaurant to top of results
}
```

---

## Ghost Kitchen Detection Logic

### Classification Types

There are two distinct ghost kitchen roles, treated differently in the UI:

| Type | Description | Example |
|------|-------------|---------|
| `ghost_brand` | A virtual brand with no physical presence — it operates from another restaurant's kitchen | Bangtan, SoBe Burger |
| `ghost_parent` | A real restaurant whose kitchen also runs ghost brands | Galitos |
| `clean` | No ghost kitchen association detected | — |

### Ghost Score

Each restaurant is assigned a `ghostScore` (0.0–1.0) based on weighted signals. No single low-confidence signal can fire alone.

| Signal | Weight | Notes |
|--------|--------|-------|
| Shared `brandDrnId` with another restaurant | +0.6 | Deliveroo's own grouping — very reliable |
| Slug matches `-at-{other-slug}` pattern | +0.4 | Explicit naming convention |
| In bundled known ghost-kitchen brand list | +0.5 | Curated, high confidence |
| Same postcode AND same street number | +0.5 | Strong structural signal — pinpoints same building. Confirmed catches El Kervan/EKB and PizzaExpress/Mac&Wings in the wild |
| Same postcode only | +0.1 | Weak alone — never fires in isolation |
| User-flagged as ghost kitchen | → 1.0 | Hard override |

**Threshold:** `ghostScore >= 0.4` → classified as `ghost_brand`.

> **Note on street number extraction:** Deliveroo address strings can include range formats (e.g. `146/148 High Street`) — extract the first numeric token only. `brandDrnId` may also be an empty string rather than `null`; treat both as absent.

### Ghost Parent Detection (Two-Pass)

Ghost parents cannot self-identify — they have no `brandDrnId` and appear on the surface like any normal restaurant. They are detected in a second pass after ghost brands are confirmed:

```
Pass 1 — score each restaurant individually:
  ghostScore = sum of applicable signal weights
  if ghostScore >= 0.4 → ghost_brand

Pass 2 — detect ghost parents:
  for each restaurant classified as clean:
    cluster = all ghost_brands sharing same postcode + street number
    if cluster.length >= 1 → ghost_parent
      siblingBrands = cluster names
```

### Detection Formula

```
classify(restaurant, allRestaurants) =
  if userFlags[restaurant.id] → ghost_brand (score: 1.0)
  
  score = 0
  score += sharedBrandDrnId(restaurant, allRestaurants)   ? 0.6 : 0
  score += slugHasAtPattern(restaurant.href)               ? 0.4 : 0
  score += knownBrands.includes(restaurant.name)           ? 0.5 : 0
  score += samePostcodeAndNumber(restaurant, allRestaurants) ? 0.3 : 0
  score += samePostcodeOnly(restaurant, allRestaurants)    ? 0.1 : 0
  score = min(score, 1.0)
  
  if score >= 0.4 → ghost_brand
  
  // Pass 2
  ghostBrandsAtAddress = confirmed ghost_brands with same postcode + street number
  if ghostBrandsAtAddress.length >= 1 → ghost_parent
  
  → clean
```

### UI Treatment

| Type | Badge | Tooltip |
|------|-------|---------|
| `ghost_brand` | 👻 Ghost Kitchen | "This is a virtual brand. Also at this address: [siblings] · Score: [0.00]" |
| `ghost_parent` | 🏠 Hosts Ghost Brands | "This kitchen also operates: [ghost brand names] · Score: [0.00]" |
| `clean` | — | — |

The score shown in the tooltip is the raw `ghostScore` value (0.0–1.0, 2 decimal places). This lets power users understand why a restaurant was flagged and gives them context when deciding whether to manually override via user flags.

Sibling brands = all restaurants in the same address cluster, excluding self.

---

## FSA API Notes

- Base URL: `https://api.ratings.food.gov.uk/`
- Key endpoint: `GET /Establishments?name=X&address=Y&pageSize=5`
- Requires header: `Accept: application/json; version=2`
- Free, no API key required
- Rate limit: unknown — batch requests by page load, not per keystroke
- Rating field: `RatingValue` (string "1"–"5", "Exempt", "AwaitingInspection")

---

## Endpoint Discovery Strategy

Since Deliveroo's API is undocumented, the first development step is:
1. Open deliveroo.co.uk in Chrome DevTools > Network tab
2. Filter by `Fetch/XHR`, navigate the site, observe URLs matching `/api/` or `/zone/` patterns
3. Identify the response that contains restaurant listings with full address fields
4. Hardcode those URL patterns into `inject.js` as the intercept filter

The interceptor should be URL-pattern-based (not a catch-all) to minimise overhead.

---

## Manifest Permissions

```json
{
  "permissions": ["storage", "alarms"],
  "host_permissions": [
    "https://www.deliveroo.co.uk/*",
    "https://api.ratings.food.gov.uk/*"
  ]
}
```

Minimal permissions footprint for store submission.

---

## Verification Plan

1. **Unit tests** (Vitest): `addressNorm.js`, `matcher.js`, FSA response parsing.
2. **Manual smoke test**:
   - Load extension unpacked in Chrome.
   - Navigate to deliveroo.co.uk.
   - Verify filter bar appears above results.
   - Verify FSA badges appear on cards after a few seconds.
   - Verify ghost kitchen badge appears on any restaurant sharing an address.
   - Toggle to table view — verify all columns render and sorting works.
   - Click into a restaurant — verify FSA badge at top of detail page.
   - Open popup — verify record count and toggles.
3. **Edge cases**:
   - Restaurant with no FSA match → "Not rated" badge.
   - Address shared by 3 brands → all three flagged, tooltip lists the other two.
   - Settings toggle off hygiene → badges disappear across all open Deliveroo tabs.
   - Schema change simulation → notification banner appears.
