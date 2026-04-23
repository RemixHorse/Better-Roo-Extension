# Better Roo

A Chrome and Firefox extension that replaces and enriches the UK Deliveroo restaurant listing with:

- FSA hygiene ratings on every card
- Shared address / ghost kitchen detection
- A fully custom card grid with sorting, filtering, and pinning
- A compact sortable table view
- Auto-scan to pre-fetch ratings and addresses in the background

---

## Features

### 🃏 Custom Card Grid

<table><tr>
<td width="40%" style="padding:0"> <img width="1233" height="831" alt="chrome_XBbaYP917y" src="https://github.com/user-attachments/assets/819add01-2d29-456e-940f-b0a0d1ed1d46" />
 </td>
<td valign="top">Deliveroo's listing is replaced with a clean, lightweight card grid built from scratch. Cards support sorting by rating, ETA, delivery fee, FSA score, distance, or name — without any page reload. Non-matching cards are hidden entirely when filters are applied, reflowing the grid naturally. Column count is configurable (2–5) from the extension menu. Cards load instantly from a local snapshot on repeat visits, with fresh data reconciled silently in the background.</td>
</tr></table>

### 🧪 FSA Hygiene Ratings

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="FSA badges on restaurant cards" src="https://github.com/user-attachments/assets/d49f510e-02e2-435e-90d9-d7e5b63d7cc3" /></td>
<td valign="top">Food Standards Agency ratings are fetched and displayed as a badge on every restaurant card and on the restaurant's menu page. Ratings are colour-coded from green (5/5) to red (0–1/5). The badge shows <code>FSA ?</code> for restaurants whose menu you haven't opened yet, and <code>FSA —</code> for restaurants with no FSA record (e.g. exempt or not yet inspected). Hover the badge to see when the rating was last issued.</td>
</tr></table>

### 📍 Shared Address Detection

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="Shared Address badge on a restaurant card" src="https://github.com/user-attachments/assets/0e120bb7-4449-4a73-9d2d-2a9013ef675f" /></td>
<td valign="top">Some restaurants are virtual brands — different names and menus operating from the same kitchen. A <strong>Shared Address</strong> badge appears on any restaurant that shares a physical address with another on the listing. Hover the badge to see which restaurants are co-located. Detection improves the more menus you browse, as address data is collected from menu page visits.</td>
</tr></table>

### 🔽 Filter Bar

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="Filter bar above restaurant listing" src="https://github.com/user-attachments/assets/9f08ee72-77ca-4169-9b25-23ee24cb1c5f" /></td>
<td valign="top">A persistent filter bar lets you narrow results by FSA score, Deliveroo rating, delivery time, and shared address status. Non-matching cards are hidden and the grid reflows. In table view, the same filters apply to the rows. Sort by any column directly from the filter bar in card view, or by clicking column headers in table view.</td>
</tr></table>

### 📋 Table View

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="Compact sortable table of restaurants" src="https://github.com/user-attachments/assets/750dbad5-949a-4b69-ba6b-9f1fe9e3e148" /></td>
<td valign="top">Switch to a compact, sortable table listing all restaurants with FSA score, Deliveroo rating, delivery time, delivery fee, distance, and shared address status at a glance. Click any column header to sort; click again to reverse; a third click clears the sort. Your view preference is saved between visits.</td>
</tr></table>

### 📌 Pin to Top

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="Pinned restaurant at top of card grid" src="" /></td>
<td valign="top">Pin favourite restaurants to the top of the listing in both card and table view. Pinned restaurants float above open ones, and closed restaurants always sink to the bottom. Pins persist across visits via local storage.</td>
</tr></table>

### 🔍 Auto-Scan

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="Auto-scan progress indicator in filter bar" src="" /></td>
<td valign="top">Enable auto-scan in the extension menu to automatically fetch addresses and FSA ratings for every unvisited restaurant on the listing. A progress counter appears in the filter bar as it works. Scans run at one restaurant every 3 seconds to avoid rate limiting — enable <strong>Scan Fast</strong> to drop this to 1 second if you're in a hurry (not recommended for prolonged use).</td>
</tr></table>

### Other

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="Extension popup showing toggles" src="https://github.com/user-attachments/assets/46d935ca-0b69-4d70-886d-e6c39bc17340" /></td>
<td valign="top">

- Blur card images if you'd rather order without the food photography
- All data is stored locally in your browser — nothing is ever sent anywhere

</td>
</tr></table>

---

## Installation

Better Roo is not on the Chrome Web Store. Install it by loading the built extension manually.

### Build it

**Prerequisites:** [Node.js](https://nodejs.org/) v18 or later

```bash
git clone https://github.com/RemixHorse/Better-Roo-Extension.git
cd better-roo
npm install
npm run build:chrome   # Chrome → dist-chrome/
npm run build:xpi      # Firefox → dist-firefox/ + better-roo.xpi
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist-chrome/` folder

The Better Roo icon will appear in your toolbar. Navigate to a Deliveroo restaurant listing to get started.

### Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `better-roo.xpi` file

### Updating

```bash
git pull
npm run build:chrome
```

Then click the refresh icon on the extension card at `chrome://extensions`.

---

## Development

```bash
npm run dev     # watch mode — rebuilds on file changes
npm test        # run the test suite
```

Source files are in `src/`. Vite handles bundling for both targets via `vite.config.js` and `vite.content.config.js`.

---

## Privacy

Better Roo makes no external requests on your behalf beyond:
- The [UK Food Standards Agency API](https://api.ratings.food.gov.uk) to fetch hygiene ratings
- Deliveroo itself, as you browse normally

All restaurant data, ratings, and address matches are stored locally in your browser. Nothing is collected, transmitted, or shared.

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Saves your filter, sort, and view preferences |
| `alarms` | Reserved for background refresh scheduling |
| `deliveroo.co.uk` | Reads listing and menu page data |
| `api.ratings.food.gov.uk` | Fetches FSA hygiene ratings |
