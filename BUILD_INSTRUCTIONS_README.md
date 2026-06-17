# Build Instructions

## No build toolchain required

The extension ships its source files directly — there is no bundling, minification, or code transformation. The "build" step is a simple file copy that generates a browser-specific `manifest.json` and packages the result.

## Prerequisites

- **Node.js** v18 or later (only needed for the copy script and XPI packaging)

## Setup

```bash
git clone https://github.com/RemixHorse/Better-Roo-Extension.git
cd better-roo
npm install
```

## Packaging

```bash
npm run build:chrome    # Chrome extension → dist-chrome/
npm run build:firefox   # Firefox extension → dist-firefox/
npm run build:xpi       # Firefox extension → dist-firefox/ + better-roo.xpi
```

The build script (`scripts/build-unbundled.js`) does the following:
1. Copies `src/` into `dist-{browser}/src/`
2. Copies icons to `dist-{browser}/icons/`
3. Generates a `manifest.json` with browser-specific fields (service_worker vs scripts, gecko settings)

**No code is transformed.** The files in `dist-{browser}/src/` are byte-for-byte identical to the files in `src/`.

## Running Tests

```bash
npm test
```

## Source Structure

```
src/
├── background/
│   └── index.js            # Service worker: FSA API, page fetcher
├── content/
│   ├── early.js            # Runs at document_start (hides Deliveroo grid)
│   ├── loader.js           # Classic script that bootstraps index.js via dynamic import
│   ├── index.js            # Main orchestrator (ES module)
│   ├── reader.js           # __NEXT_DATA__ parser
│   ├── db.js               # IndexedDB wrapper
│   ├── fsa.js              # FSA cache + lookup
│   ├── scanner.js          # Auto-scan queue + loop
│   ├── matcher.js          # Shared address detection
│   ├── listingSnapshot.js  # localStorage two-pass cache
│   ├── addressNorm.js      # Address utilities
│   ├── timeAgo.js          # Relative time formatting
│   └── ui/                 # UI components (filterBar, cardGrid, table, badges, modal)
├── shared/
│   └── pageParser.js       # Parsers shared between content + background
├── popup/
│   ├── popup.html
│   └── popup.js
└── icons/
```

## How it runs in the browser

- `early.js` — injected as a classic script at `document_start`
- `loader.js` — injected as a classic script at `document_end`, uses `import()` to load `index.js` as an ES module
- `index.js` and all its dependencies — loaded as ES modules via the browser's native module system
- `background/index.js` — loaded as an ES module service worker (Chrome) or background script (Firefox)

## Documentation

- **DESIGN.md** — Architecture and design decisions
- **CACHING.md** — Two-pass rendering and caching strategy
- **PLAN-AUTOSCAN.md** — Auto-scan feature specification
- **API.md** — Deliveroo data structure research
