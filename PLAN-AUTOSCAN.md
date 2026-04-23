# Better Roo — Auto-Scan Plan

Automatically fetches unvisited restaurant detail pages in the background while a Deliveroo listing tab is open, populating address data and FSA ratings without the user having to middle-click every restaurant.

---

## Scope

- Scanner runs **only while a Deliveroo tab is open** — content-script-driven, one restaurant per tick via `setTimeout`
- One restaurant fetched every ~3 seconds (configurable)
- Two scan tiers:
  1. Restaurants with `address1` but no valid FSA cache → FSA API lookup only
  2. Restaurants without `address1` → fetch Deliveroo menu page, extract address + FSA in one shot
- Discovering a new address may reveal new shared-address matches — shared address badges update in real time alongside FSA badges

---

## Phase BG1 — Shared Parser Module + Background Page Fetcher

**Goal:** service worker can fetch a Deliveroo menu page and extract address + FSA data. Parser logic is shared between content script and background without duplication.

- [ ] **BG1.1** Extract `src/shared/pageParser.js` (DRY — moves logic out of `reader.js` that both content script and background need):
  - `parseDetailRestaurant(nextData)` — same logic as `readDetailRestaurant()` but takes a parsed `__NEXT_DATA__` object rather than reading from the DOM
  - `parseDetailFsaRating(nextData)` — same for FSA rating
  - `reader.js` updated to call these functions (no behaviour change)

- [ ] **BG1.2** Add `fetchRestaurantPage(href)` to `background/index.js`:
  - `fetch('https://deliveroo.co.uk' + href)` — session cookies sent automatically
  - Extract `__NEXT_DATA__` JSON from HTML via regex: `/__NEXT_DATA__[^>]*>([^<]+)<\/script>/`
  - Parse JSON and call `parseDetailRestaurant` + `parseDetailFsaRating` from `src/shared/pageParser.js`
  - Returns `{ restaurant, fsaRating }` or `null` on parse/network failure

- [ ] **BG1.3** Add message handler `{ type: 'SCAN_NEXT', restaurantId, href, address1 }`:
  - If `address1` present: skip page fetch, go straight to FSA API lookup (existing `lookupOne` logic)
  - If `address1` absent: call `fetchRestaurantPage(href)`, upsert restaurant + FSA to IndexedDB via `db.js`
  - Returns `{ restaurantId, address1, score, ratingDate, skipped: bool }`

---

## Phase BG2 — Queue Logic & Scanner Loop

**Goal:** content script maintains the scan queue and drives one-at-a-time fetching via the background.

- [ ] **BG2.1** Write `src/content/scanner.js`:
  - `buildQueue(listingRestaurants, allCached, fsaRatings)` — ordered scan list:
    - Priority 1: listing restaurants with `address1` but missing/expired FSA
    - Priority 2: listing restaurants without `address1`
    - Priority 3: all other DB-cached restaurants without `address1`
    - Skip restaurants already fully resolved (have both address and valid FSA)
  - `startScanner({ queue, intervalMs, onTick, onComplete })` — begins the tick loop
    - Each tick: pops the next item, sends `SCAN_NEXT` to background, calls `onTick(result)` with the response, schedules the next tick via `setTimeout(tick, intervalMs)`
    - Stops automatically when queue is empty, calls `onComplete()`
  - `stopScanner()` — cancels the pending timeout
  - `getScannerState()` — returns `{ running, scannedCount, totalCount, currentName }`

- [ ] **BG2.2** Wire scanner into `handleListingPage()` in `index.js`:
  - After initial data load, if `autoScanEnabled`, call `startScanner(...)` with `onTick` and `onComplete` callbacks
  - `onTick(result)`:
    - Upserts updated restaurant into `_restaurants` array in `filterBar.js`
    - Re-runs `detectSharedAddresses` over the full updated set — new addresses may create new shared-address matches
    - Refreshes the affected card badge(s) and table row(s)
    - Updates filter bar status text
  - `onComplete()`: updates filter bar to show completion state
  - On `SETTINGS_CHANGED` with `autoScanEnabled` toggled: start or stop scanner accordingly
  - On `CLEAR_DATA`: stop scanner

---

## Phase BG3 — Real-Time Badge Updates

**Goal:** FSA badges, shared address badges, and table rows all reflect scan state live as each restaurant is resolved.

- [ ] **BG3.1** Extend FSA badge states in `cardBadge.js`:
  | State | Badge | Condition |
  |---|---|---|
  | Queued | `FSA ⏳` | In scan queue, not yet started |
  | Scanning | `FSA …` | Currently in-flight |
  | Rated | `FSA N` | Score resolved |
  | No record | `FSA —` | FSA returned no match |
  | Unknown | `FSA ?` | No address, auto-scan disabled |

- [ ] **BG3.2** Same states in `table.js` FSA column

- [ ] **BG3.3** Shared address badge real-time update:
  - On each `onTick` where a new `address1` was discovered:
    - Re-run `detectSharedAddresses([...updatedRestaurants, ...cachedOnly])` with the full updated set
    - Compare new results against previous — find any restaurants whose `isSharedAddress` status changed
    - For each changed restaurant: re-render its card badge row and table row
    - This catches cases where discovering restaurant B's address reveals it shares a kitchen with already-known restaurant A

- [ ] **BG3.4** Expose `refreshCardBadge(restaurantId, fsaRating, sharedResult)` and `refreshTableRow(restaurantId, ...)` as public functions from `cardBadge.js` and `table.js` so `index.js` can update individual entries without full re-renders

---

## Phase BG4 — Filter Bar Status Text

**Goal:** filter bar shows live scan progress, replacing the "Better Roo" label.

- [ ] **BG4.1** Remove the `Better Roo v{version}` label from the filter bar

- [ ] **BG4.2** Add a status text element positioned **after the `?` button**, before the chip filters:
  ```
  12 / 47  Discovering Galitos…
  ```
  - Format: `{scannedCount} / {totalCount}  Discovering {currentRestaurantName}…`
  - While idle (scan not started or complete): element hidden / empty
  - On completion: `47 / 47  Scan complete`  — fades out after 4 seconds

- [ ] **BG4.3** Export `updateScanStatus(scannedCount, totalCount, currentName)` from `filterBar.js` so `index.js` can update it from the `onTick` callback without coupling the scanner to the UI

---

## Phase BG5 — Popup Settings & Stats

**Goal:** user can enable/disable auto-scan; popup shows scan state.

- [ ] **BG5.1** Add `autoScanEnabled: false` to `DEFAULT_SETTINGS` in `background/index.js` and `popup.js`

- [ ] **BG5.2** Add toggle to `popup.html` / `popup.js`: **"Auto-scan unvisited restaurants"**

- [ ] **BG5.3** Add stats line to popup (below the existing restaurant count):
  ```
  Auto-scan: 12 / 47 · last scanned 3s ago
  ```
  or when disabled/idle:
  ```
  Auto-scan: off
  ```
  - Reads from `chrome.storage.local` key `brScanStats`
  - Live-updated via `chrome.storage.onChanged` listener in the popup while it's open

- [ ] **BG5.4** Content script writes `brScanStats` to `chrome.storage.local` on each tick:
  ```js
  {
    scanning: boolean,
    scannedCount: number,
    totalCount: number,
    lastScannedAt: timestamp,
    currentName: string | null,
  }
  ```

---

## Build Order

```
BG1 → Shared parser + background page fetcher   (no UI, independently testable)
BG2 → Queue + scanner loop                       (depends on BG1)
BG3 → Real-time badge + shared address updates  (depends on BG2)
BG4 → Filter bar status text                     (depends on BG2)
BG5 → Popup toggle + stats                       (depends on BG2, BG4)
```

---

## Notes

- **Rate limiting:** Deliveroo has not rate-limited middle-click browsing at similar speeds. One request per 3 seconds is conservative. If a fetch returns a non-200 status, skip that restaurant and continue — do not retry immediately.
- **Service worker sleep (Chrome):** The scanner loop lives in the content script (`setTimeout`), not the service worker, so Chrome's service worker sleep does not affect it. The service worker is only awake during the brief window of each `SCAN_NEXT` message exchange.
- **Firefox:** No changes needed — background scripts are persistent, and the content-script-driven loop works identically.
- **Multi-tab:** If the user has two Deliveroo listing tabs open, both content scripts would start scanning independently. A future improvement could use a `BroadcastChannel` lock, but for now duplicate work is acceptable and harmless.
