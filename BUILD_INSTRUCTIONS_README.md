# Build Instructions

## Prerequisites

- **Node.js** v18 or later
- **npm** (included with Node.js)

## Setup

```bash
git clone https://github.com/RemixHorse/Better-Roo-Extension.git
cd better-roo
npm install
```

## Building

```bash
npm run build:chrome    # Chrome extension → dist-chrome/
npm run build:xpi      # Firefox extension → dist-firefox/ + better-roo.xpi
```

## Testing

```bash
npm test               # Run test suite (54 tests)
```

## File Structure

```
src/
├── background/
│   └── index.js          # Service worker: FSA API, page fetcher
├── content/
│   ├── early.js
│   ├── index.js          # Main orchestrator
│   ├── reader.js         # __NEXT_DATA__ parser
│   ├── db.js             # IndexedDB wrapper
│   ├── fsa.js            # FSA cache + lookup
│   ├── scanner.js        # Auto-scan
│   ├── listingSnapshot.js
│   ├── addressNorm.js
│   ├── timeAgo.js
│   └── ui/               # UI components
├── shared/
│   └── pageParser.js
└── popup/
```

## Key Features Implemented

- **FSA Hygiene Ratings** — fetched from UK Food Standards Agency API, cached for 14 days
- **Shared Address Detection** — groups restaurants at the same physical location
- **Custom Card Grid** — sortable, filterable, with pinning support
- **Compact Table View** — all restaurants in a single sortable table
- **Auto-Scan** — background fetching of unvisited restaurants (one every 3 seconds)
- **Two-Pass Listing Render** — localStorage snapshot for instant display, then fresh data loads in background

## Documentation

- **DESIGN.md** — Architecture and design decisions
- **CACHING.md** — Two-pass rendering and caching strategy
- **PLAN-AUTOSCAN.md** — Auto-scan feature specification
- **API.md** — Deliveroo data structure research
