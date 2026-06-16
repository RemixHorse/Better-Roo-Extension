# Listing Page Caching Plan

## Problem

After `early.js` hides Deliveroo's grid, the listing page is blank for ~300ms while
`handleListingPage` works through four sequential async operations before anything renders:

1. `getAllRestaurants()` — one IDB read
2. `Promise.all(upsertRestaurant(...))` — N IDB writes
3. `getFsaRatings()` — N IDB reads (one per restaurant)
4. `initCardGrid()` / `renderTable()` — N IDB reads for pin flags

The fix is a two-pass render: paint from a localStorage snapshot immediately
(synchronous, ~20–50ms), then load fresh data in the background and reconcile.

---

## Snapshot Shape

Stored in `localStorage` under key `br-listing-{geohash}`.
Geohash is extracted from the URL query string on the listing page.
A snapshot older than 24 hours is treated as a cache miss.

```js
{
  geohash:  string,              // URL geohash — used for cache invalidation on location change
  savedAt:  number,              // Date.now() at save time
  restaurants: [                 // Thin projection — only fields the card/table renders
    {
      id, name, href, imageUrl,
      rating, ratingCount,
      deliveryTimeMin, deliveryTimeLabel,
      deliveryFee, distance,
      address1                   // needed for FSA badge state (? vs —)
    }
  ],
  fsaRatings: {                  // id → { score, ratingDate }
    "123": { score: 5, ratingDate: 1748563200000 }
  },
  sharedAddressResults: {        // id → { isSharedAddress, siblingNames }
    "123": { isSharedAddress: true, siblingNames: ["Burger Place"] }
  },
  pinFlags: {                    // id → bool (only pinned ones need to be stored)
    "456": true
  }
}
```

Plain objects (not Maps) so JSON round-trips cleanly.
Estimated size: ~20–30 KB for a typical listing of 50–80 restaurants.

---

## New File: `src/content/listingSnapshot.js`

Owns all snapshot read/write logic. No other module touches localStorage directly.

```js
export function saveSnapshot(geohash, restaurants, fsaRatings, sharedAddressResults, pinFlags) {}
// Serialises to JSON and writes to localStorage.
// Silently swallows QuotaExceededError.

export function loadSnapshot(geohash) {}
// Returns the parsed snapshot object, or null on:
//   - no snapshot
//   - geohash mismatch (location changed)
//   - snapshot older than 24 hours
//   - JSON parse error
```

Helper to extract geohash from `window.location.search` also lives here.

---

## Two-Pass Render in `src/content/index.js`

### Pass 1 — Synchronous snapshot render (new, runs first)

```
loadSnapshot(geohash)
  ↓ hit
Convert plain objects back to Maps
initCardGrid(restaurants, sharedAddressResults, fsaRatings, pinFlags)
  — pinFlags passed in, IDB reads skipped entirely
injectFilterBar(restaurants, sharedAddressResults, fsaRatings)
```

If snapshot miss → skip Pass 1, fall through to Pass 2 as today.

### Pass 2 — Fresh data load (always runs)

Same as today's `handleListingPage` flow, but:
- If Pass 1 ran: call `reconcileCardGrid` / re-render table instead of `initCardGrid`
- After completing: call `saveSnapshot(...)` with the fresh state
- Call `updateFilterBarData(...)` so filter bar reflects up-to-date data

Pass 2 always runs regardless of snapshot hit/miss — the snapshot is purely a
first-paint optimisation, not a substitute for fresh data.

### Rough timeline (snapshot hit)

```
0ms    early.js hides Deliveroo grid
~10ms  content.js starts, reads snapshot from localStorage (sync)
~40ms  initCardGrid renders from snapshot (sync DOM ops + one settings IDB read)
~50ms  Cards visible, filter bar rendered          ← user sees content here
~350ms Pass 2 completes, reconcileCardGrid patches changed cards
~360ms saveSnapshot writes updated state
```

---

## Changes to `src/content/ui/cardGrid.js`

### `initCardGrid` — accept optional pre-loaded `pinFlags`

```js
export async function initCardGrid(restaurants, sharedAddressResults, fsaRatings, pinFlags = null)
```

If `pinFlags` is provided (snapshot path), skip the `getUserFlag` IDB reads entirely.
If null (first-visit path), load from IDB as today.

### New: `reconcileCardGrid(restaurants, sharedAddressResults, fsaRatings)`

Called after Pass 2 completes when a snapshot was used for first paint.

Three operations, in order:

1. **Update existing cards** — for restaurants present in both old and new listing:
   patch ETA, fee, rating, open/closed class, FSA badge, shared badge.
   These are the fields most likely to drift between page loads.

2. **Add new cards** — restaurants in fresh listing but absent from the snapshot grid.
   Appended to the grid; `applyCardSort` is re-run to slot them correctly.

3. **Remove stale cards** — restaurants in the snapshot grid but absent from the fresh
   listing. Removed from DOM. (Restaurant closed, outside delivery radius, etc.)

After all three: re-run `applyCardFilter` and `applyCardSort` with current filter/sort state
so the grid reflects the fresh data without the user needing to interact.

---

## Changes to `src/content/ui/table.js`

### `renderTable` — accept optional pre-loaded `pinFlags`

```js
export async function renderTable(restaurants, sharedAddressResults, fsaRatings, pinFlags = null)
```

If `pinFlags` provided, pass through to `buildTable` / `buildRow` instead of calling
`loadPinFlags` (which does N IDB reads).

On Pass 2 completion when in table mode: call `renderTable` again with fresh data.
The table rebuilds entirely — no need for a reconcile step since `renderTable` is
already a full rebuild. Add a short CSS opacity transition on `#better-roo-table-wrap`
so the rebuild doesn't flash.

---

## Changes to `src/content/ui/filterBar.js`

No structural changes needed. `injectFilterBar` already removes and rebuilds the bar
on each call, so calling it twice (once per pass) is safe.

`updateFilterBarData` is already exported and used by the scanner — Pass 2 reuses
the same call to push fresh restaurant/FSA/shared data into the filter state.

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| First ever visit | No snapshot — full 300ms load as today. Snapshot saved for next time. |
| Location changed | Geohash mismatch → cache miss → full load. New snapshot saved. |
| Snapshot > 24 hours old | Treated as miss → full load. |
| Restaurant added to listing | Pass 2 adds it via `reconcileCardGrid`. Absent from first paint. |
| Restaurant removed from listing | Pass 2 removes it via `reconcileCardGrid`. Visible for ~350ms. |
| Pin changed in another tab | Stale for one page load (~350ms). Resolved when Pass 2 reads fresh IDB state. |
| localStorage full | `saveSnapshot` swallows `QuotaExceededError`. Next load is a miss. |
| IDB unavailable | Pass 2 fails gracefully as today. Snapshot still saved if Pass 1 ran. |
| Clear data clicked | `clearAll()` in `index.js` should also call `clearSnapshot(geohash)` to remove the localStorage entry so stale cards don't re-appear. |

---

## Files Changed Summary

| File | Change |
|---|---|
| `src/content/listingSnapshot.js` | **New** — `saveSnapshot`, `loadSnapshot`, `clearSnapshot`, `getGeohash` |
| `src/content/index.js` | Two-pass `handleListingPage`; call `reconcileCardGrid`; save snapshot; clear snapshot on CLEAR_DATA |
| `src/content/ui/cardGrid.js` | Optional `pinFlags` param on `initCardGrid`; new `reconcileCardGrid` export |
| `src/content/ui/table.js` | Optional `pinFlags` param on `renderTable`; CSS transition on rebuild |
| `src/content/ui/filterBar.js` | No structural changes — safe to call twice already |
