# Build Instructions for Better Roo

This document describes how to build the Better Roo extension from source for Chrome and Firefox.

---

## Prerequisites

- **Node.js** v18 or later
- **npm** (comes with Node.js)
- **git** (for cloning the repository)

---

## Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/RemixHorse/Better-Roo-Extension.git
   cd better-roo
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

---

## Building

### Chrome Extension

Build the extension for Chrome (Manifest V3):

```bash
npm run build:chrome
```

Output: `dist-chrome/` directory

### Firefox Extension

Build the extension for Firefox:

```bash
npm run build:xpi
```

Output:
- `dist-firefox/` directory
- `better-roo.xpi` file (signed XPI bundle for installation)

### Both Targets

Build both Chrome and Firefox in one command:

```bash
npm run build:chrome
npm run build:xpi
```

---

## Development

### Watch Mode

Auto-rebuild on file changes:

```bash
npm run dev
```

Outputs to both `dist-chrome/` and `dist-firefox/`.

### Tests

Run the test suite (Vitest):

```bash
npm test
```

Tests cover:
- `timeAgo.js` — relative time formatting
- `addressNorm.js` — postcode/address extraction and normalisation
- `matcher.js` — shared address detection
- `reader.js` — `__NEXT_DATA__` parsing

---

## Loading the Extension

### Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `dist-chrome/` directory

The Better Roo icon will appear in your toolbar. Navigate to any Deliveroo listing to test.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `better-roo.xpi` file from the repo root

The extension is now loaded temporarily (until Firefox restart).

---

## Updating

After making changes to the source:

1. **Rebuild:**
   ```bash
   npm run build:chrome
   ```

2. **Refresh in Chrome:**
   - Go to `chrome://extensions`
   - Click the refresh icon on the Better Roo card

For Firefox, the extension auto-reloads on changes during development.

---

## File Structure

```
src/
├── background/
│   └── index.js          # Service worker: FSA API, page fetcher, settings
├── content/
│   ├── early.js          # Runs at document_start
│   ├── index.js          # Main orchestrator
│   ├── reader.js         # __NEXT_DATA__ parser
│   ├── db.js             # IndexedDB wrapper
│   ├── matcher.js        # Shared address detection
│   ├── fsa.js            # FSA cache + lookup
│   ├── scanner.js        # Auto-scan queue + loop
│   ├── listingSnapshot.js # localStorage cache
│   ├── addressNorm.js    # Address utilities
│   ├── timeAgo.js        # Time formatting
│   └── ui/
│       ├── filterBar.js
│       ├── cardGrid.js
│       ├── table.js
│       ├── cardBadge.js
│       ├── detailBadge.js
│       ├── modal.js
│       └── schemaBanner.js
├── shared/
│   └── pageParser.js     # Shared parsers (content + background)
└── popup/
    ├── popup.html
    └── popup.js
```

---

## Troubleshooting

### Build fails with module errors

Ensure all dependencies are installed:
```bash
npm install
npm run build:chrome
```

### Extension doesn't appear in Chrome

- Check that `dist-chrome/` was created successfully
- Try refreshing the extensions page
- Check the DevTools console for errors

### "Schema validation failed" banner appears

The `__NEXT_DATA__` structure on Deliveroo may have changed. Check `src/content/reader.js` for the validation logic and update if needed.

### Tests fail

Run tests in verbose mode:
```bash
npm test -- --reporter=verbose
```

---

## Release Process

To prepare a new release:

1. **Update version** in `package.json` and `manifest.json`
2. **Build both targets:**
   ```bash
   npm run build:chrome
   npm run build:xpi
   ```
3. **Test locally** in both browsers
4. **Commit and tag:**
   ```bash
   git commit -am "v1.x.x — description"
   git tag v1.x.x
   git push origin master --tags
   ```

GitHub Actions will automatically create a release with the built artifacts.

---

## Documentation

- **[DESIGN.md](DESIGN.md)** — Architecture, design decisions, FSA caching, auto-scan flow
- **[CACHING.md](CACHING.md)** — Two-pass listing page snapshot rendering
- **[PLAN-AUTOSCAN.md](PLAN-AUTOSCAN.md)** — Auto-scan feature specification
- **[API.md](API.md)** — Deliveroo data structure research

---

## License

Better Roo is open source. See the LICENSE file for details.
