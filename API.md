# Better Roo — Deliveroo API Research

Investigated: 2026-04-21 via live browser session on `deliveroo.co.uk/restaurants/royal-tunbridge-wells/sevenoaks`

---

## Key Finding: No XHR/Fetch API for Restaurant Listings

Deliveroo is a **Next.js SSR application**. Restaurant listing and detail data is **not fetched client-side** — it is server-rendered and embedded in the page's `__NEXT_DATA__` script tag. There is no XHR or fetch request to intercept for restaurant listings.

The design doc's approach of monkey-patching `window.fetch` will **not** capture restaurant data. Data must be read directly from `window.__NEXT_DATA__` instead.

---

## Restaurant Listing Page

**URL pattern:** `/restaurants/{city}/{area}?fulfillment_method=DELIVERY&geohash={geohash}`

**Data location:** `window.__NEXT_DATA__.props.initialState.home.feed.results`

### Feed Structure

```js
feed.results = {
  data: [  // array of ~52 sections
    {
      blocks: [  // array of UI blocks
        {
          data: { /* flat key-value map of component data */ }
        }
      ]
    }
  ]
}
```

Restaurant blocks are identified by the presence of `block.data['partner-name.content']`.

Tested against Sevenoaks: **143 unique restaurants** across 210 total blocks (duplicates appear in promoted/featured carousels).

### Available Fields Per Restaurant Block

| Field | Key in `block.data` | Example |
|-------|---------------------|---------|
| Name | `partner-name.content` | `Wagamama` |
| Deliveroo rating | `partner-rating.content` | `4.4` |
| Review count | `partner-rating-count.content` | `(500+)` |
| Distance | `distance-presentational.content` | `0.6 mi` |
| Delivery time | `home-units-delivery-time.content` | `15` (minutes) |
| Delivery fee | `partner-delivery-fee.content` | `£0 delivery fee` |
| Card image URL | `card-image.url` | `https://ads-sams.roocdn.com/image/{uuid}/en/hero.jpg` |
| Screen reader label | `partner-card.accessibility.screen-reader` | `Wagamama. 0.6 mi. Delivers at 15...` |

### Restaurant IDs

IDs are nested at `block.data['partner-card.on-tap'].action.parameters`:

| Field | Example | Notes |
|-------|---------|-------|
| `restaurant_id` | `71729` | Integer. Stable numeric ID |
| `partner_drn_id` | `50dad45e-b521-4179-b94d-e7af841cd082` | UUID. Matches `drnId` on detail page |
| `restaurant_href` | `/menu/Royal%20Tunbridge%20Wells/sevenoaks/wagamama-sevenoaks` | Path to detail page (has query params — strip at `?`) |
| `restaurant_name` | `Wagamama` | Short name without branch suffix |
| `fulfillment_method` | `DELIVERY` | |
| `navigate_to_restaurant_branch_type` | `RESTAURANT` | |
| `sp_id` | `NjY2MDE1...` | Base64 — sponsored placement tracking, not useful |

### Extraction Pattern

```js
const feed = window.__NEXT_DATA__.props.initialState.home.feed.results;
const seen = new Set();
const restaurants = [];

feed.data.forEach(section => {
  (section.blocks || []).forEach(block => {
    const d = block.data;
    if (!d?.['partner-name.content']) return;
    const params = d['partner-card.on-tap']?.action?.parameters || {};
    const id = params.restaurant_id;
    if (!id || seen.has(id)) return;
    seen.add(id);
    restaurants.push({
      id,                                          // integer
      drn_id: params.partner_drn_id,               // UUID
      href: params.restaurant_href?.split('?')[0], // /menu/city/area/slug
      name: d['partner-name.content'],
      rating: d['partner-rating.content'],
      ratingCount: d['partner-rating-count.content'],
      distance: d['distance-presentational.content'],
      deliveryTimeMin: d['home-units-delivery-time.content'],
      deliveryFee: d['partner-delivery-fee.content'],
    });
  });
});
```

### What Is NOT in the Listing Feed

- **No address** — not available at listing level
- **No postcode** — not available at listing level
- **No coordinates** — not available at listing level
- **No FSA hygiene rating** — not available at listing level
- **No minimum order value** — not available at listing level

---

## Restaurant Detail Page

**URL pattern:** `/menu/{city}/{area}/{slug}`

**Data location:** `window.__NEXT_DATA__.props.initialState.menuPage`

### Restaurant Identity

Path: `menuPage.menu.metas.root.restaurant`

| Field | Example | Notes |
|-------|---------|-------|
| `id` | `71729` | Same integer as listing `restaurant_id` |
| `name` | `Wagamama - Sevenoaks` | Full name including branch |
| `uname` | `wagamama-sevenoaks` | URL slug |
| `drnId` | `50dad45e-b521-4179-b94d-e7af841cd082` | Same UUID as listing `partner_drn_id` |
| `brandDrnId` | `1449ec7f-a367-4532-991c-b2b25bbd488c` | Parent brand UUID — useful for grouping chains |
| `branchType` | `RESTAURANT` | |
| `fulfillmentType` | `DELIVEROO` | |
| `menuId` | (integer) | |

### Address

Path: `menuPage.menu.metas.root.restaurant.location`

| Field | Example | Notes |
|-------|---------|-------|
| `address.address1` | `138 High St., Royal Tunbridge Wells, TN131XE` | Full address including postcode embedded |
| `address.postCode` | `null` | Always null — postcode is in `address1` |
| `address.neighborhood` | `Sevenoaks` | Useful display name |
| `address.city` | `royal-tunbridge-wells` | Slugified |
| `address.country` | `GB` | |
| `cityId` | `86` | Deliveroo internal |
| `zoneId` | `703` | Deliveroo internal |

**Important:** `postCode` is always `null`. Extract postcode by parsing `address1` — it appears at the end as the last whitespace-separated token (e.g. `TN131XE`).

```js
const postcode = addr.address1?.trim().split(/\s+/).slice(-1)[0] ?? null;
```

### FSA Hygiene Rating — Critical Finding

**Deliveroo already fetches and embeds the FSA hygiene rating on the detail page.** There is no need to call the FSA API for detail-page visits.

Path: walk `menuPage.menu.layoutGroups` looking for a block with `actionId === 'layout-list-hygiene-rating'`.

```js
function findHygieneBlock(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.actionId === 'layout-list-hygiene-rating') return obj;
  for (const v of Object.values(obj)) {
    const found = findHygieneBlock(v);
    if (found) return found;
  }
  return null;
}

const hygieneGroup = findHygieneBlock(
  window.__NEXT_DATA__.props.initialState.menuPage.menu.layoutGroups
);
```

The block contains:

| Field | Path | Example |
|-------|------|---------|
| Image URL | `blocks[0].image.url` | `https://ow.roocdn.com/assets/images/fsa/fhrs_5@3x.png` |
| Image alt text | `blocks[0].image.altText` | `The FSA food hygiene rating is 5 out of 5...` |
| Last updated | `blocks[0].lines[n].spans[n].text` | `Last updated: 18 Apr 2026` |

**Score extraction** — two reliable methods:

```js
// Method 1: parse image URL  (most reliable)
const score = parseInt(hygieneGroup.blocks[0].image.url.match(/fhrs_(\d+)@/)?.[1]);

// Method 2: parse alt text
const score = parseInt(hygieneGroup.blocks[0].image.altText.match(/rating is (\d+) out of/)?.[1]);
```

Image URL score values observed: `fhrs_0`, `fhrs_1`, `fhrs_2`, `fhrs_3`, `fhrs_4`, `fhrs_5`.
When not yet rated or exempt, the block may be absent — treat `null` as "Not rated".

---

## Client-Side API Calls (Background/Non-Restaurant)

These are the only XHR/fetch calls observed. None return restaurant listing data.

| Endpoint | Method | Status | Purpose |
|----------|--------|--------|---------|
| `https://api.uk.deliveroo.com/consumer/basket/graphql` | POST | 200 | Basket state (GraphQL) |
| `https://api.uk.deliveroo.com/consumer/addresses/graphql` | POST | 200 | Saved addresses (GraphQL) |
| `https://api.uk.deliveroo.com/consumer/order-history/v1/orders?limit=26&offset=0&include_ugc=true` | GET | 200 | Order history |
| `https://api.uk.deliveroo.com/orderapp/v1/events` | POST | 204 | Analytics event sink |
| `https://api.uk.deliveroo.com/pg/{uuid}` | POST | 204 | Performance telemetry |
| `https://events-tracker.deliveroo.net/track/CUSTOMER_VIEWED_RESTAURANT_LIST` | GET | 503 | Event tracking (currently down) |

---

## Implications for Extension Architecture

### 1. Replace fetch interceptor with `__NEXT_DATA__` reader

The `inject.js` / `world: MAIN` fetch-monkey-patch approach is unnecessary. Replace with a direct read of `window.__NEXT_DATA__` after the page is ready.

**Trigger:** `DOMContentLoaded` or observe `document.readyState === 'complete'`.

**Detection logic:**
- On listing pages (`/restaurants/`): read `initialState.home.feed.results`
- On detail pages (`/menu/`): read `initialState.menuPage`

### 2. Address only available on detail pages

The listing feed has no address data. Options:

- **Option A (lazy):** Cache address when user visits a detail page. Ghost kitchen detection builds up over time as users browse.
- **Option B (eager):** Fetch each restaurant's detail page in the background to extract address. Expensive — 143 requests per listing page load. Not recommended.
- **Option C (FSA-first):** On listing page, call FSA API by name+neighborhood and infer address from FSA match. Less precise but avoids per-restaurant page fetches.

**Recommendation: Option A** — lazy address cache is the lowest friction approach and aligns with how the DB was designed (builds up over time via `lastSeen`).

### 3. FSA rating on detail pages: skip the FSA API

Deliveroo already shows the FSA rating on the detail page, sourced from their own backend. Reading it from `__NEXT_DATA__` is zero-cost and always in sync. Only call the FSA API as a fallback for restaurants whose detail page has never been visited.

### 4. SPA navigation detection

Deliveroo uses client-side routing between pages. `DOMContentLoaded` only fires on hard loads. To detect SPA navigations:

```js
// Watch for Next.js route changes
const origPushState = history.pushState;
history.pushState = function(...args) {
  origPushState.apply(this, args);
  onRouteChange(location.pathname);
};
window.addEventListener('popstate', () => onRouteChange(location.pathname));
```

On each route change, re-read `window.__NEXT_DATA__` — Next.js updates this on client-side navigations.

### 5. Schema resilience

`__NEXT_DATA__` is an internal implementation detail. Key schema signals to validate:

```js
// Listing page: check feed structure exists
const feedValid = !!window.__NEXT_DATA__?.props?.initialState?.home?.feed?.results?.data;

// Detail page: check restaurant object exists
const detailValid = !!window.__NEXT_DATA__?.props?.initialState?.menuPage?.menu?.metas?.root?.restaurant?.id;
```

If either check fails, surface the degraded-mode banner as planned.

---

## Ghost Kitchen Address Reality — Real Example

Investigated using Galitos Sevenoaks (id `770203`) and its two ghost kitchen brands.

| Restaurant | id | drnId | brandDrnId | address1 |
|------------|-----|-------|------------|---------|
| Galitos | 770203 | b442858e-7059-43de-ab61-b4d192e94ebf | **null** | `145a High St, Royal Tunbridge Wells, TN131XJ` |
| Bangtan - Korean Fried Chicken | 782277 | f2756c2d-eeb9-489c-b614-4352b5ef2b44 | 02d0e6c5-1c6e-4f39-92b5-c128047b5fed | `The Galitos 145A high street, Royal Tunbridge Wells, TN131XJ` |
| SoBe Burger | 782300 | bc66c2c3-034b-43f3-8513-3d0c98e14767 | 02d0e6c5-1c6e-4f39-92b5-c128047b5fed | `The Galitos 145A high street, Royal Tunbridge Wells, TN131XJ` |

### Key observations

1. **Addresses are NOT identical strings.** Galitos uses `145a High St` while its ghost brands prepend `The Galitos` and spell out `high street`. Exact string match will fail. Postcode-based matching (`TN131XJ`) is the reliable key.

2. **`brandDrnId` groups ghost brands but not the host.** Bangtan and SoBe share `brandDrnId: 02d0e6c5...`, but Galitos itself has `brandDrnId: null`. Cannot rely on `brandDrnId` alone to detect all three — must combine with address matching.

3. **Postcode is embedded in `address1`** (never in the separate `postCode` field, which is always `null`). Extract with: `address1.trim().split(/\s+/).pop()`.

4. **Slugs are a soft signal.** Both ghost kitchen slugs contain `-at-galitos-sevenoaks`, which is a strong hint but not something to rely on programmatically.

### Normalised address matching strategy

For ghost kitchen detection, extract and normalise the postcode as the primary grouping key:

```js
function extractPostcode(address1) {
  // UK postcode is always the last token
  return address1?.trim().split(/\s+/).pop()?.toUpperCase() ?? null;
}
```

All three restaurants return `TN131XJ` — reliably grouping them regardless of the differing street name format.

---

## CDN Domains Observed

| Domain | Purpose |
|--------|---------|
| `cwa.roocdn.com` | Next.js JS/CSS bundles |
| `rs-menus-api.roocdn.com` | Restaurant/menu images |
| `co-home-content.roocdn.com` | Marketing/brand images |
| `ads-sams.roocdn.com` | Sponsored restaurant hero images |
| `ow.roocdn.com` | Static assets (FSA badge images) |
| `consumer-component-library.roocdn.com` | UI component assets |
