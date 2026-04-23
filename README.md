# Better Roo

A Chrome and Firefox extension that replaces and enriches the UK Deliveroo restaurant listing with:

- FSA hygiene ratings on every card
- Shared address / ghost kitchen detection
- A fully custom card grid with sorting, filtering, and pinning
- A compact sortable table view
- Auto-scan to pre-fetch ratings and addresses in the background

---

> This was built as a learning case for agentic coding, i'm not the biggest fan, but it's worth keeping up with the developer landscape. not a single character in this codebase was written by a human.

> It is however, fully working, tested and quite useful, at least for me (i don't like ghost kitchens!)

** Any brands mentioned or visible in images below have no relation to this project, and are only for illustration purposes **

## Features

### 🃏 Custom Card Grid

<table><tr>
<td width="40%" style="padding:0"> <img width="1233" height="831" alt="chrome_XBbaYP917y" src="https://github.com/user-attachments/assets/819add01-2d29-456e-940f-b0a0d1ed1d46" />
 </td>
<td valign="top">Deliveroo's listing is replaced with a clean, lightweight card grid built from scratch. Cards support sorting by rating, ETA, delivery fee, FSA score, distance, or name — without any page reload. Non-matching cards are hidden entirely when filters are applied, reflowing the grid naturally. Column count is configurable (2–5) from the extension menu. Cards load instantly from a local snapshot on repeat visits, with fresh data reconciled silently in the background.</td>
</tr></table>

### 🧪 FSA Hygiene Ratings

<table><tr>
<td width="40%" style="padding:0"> <img width="301" height="234" alt="chrome_1FFeHXealO" src="https://github.com/user-attachments/assets/91ef2ad0-2697-4b43-b655-581a8d8dc5f6" />
 </td>
<td valign="top">Food Standards Agency ratings are fetched and displayed as a badge on every restaurant card and on the restaurant's menu page. Ratings are colour-coded from green (5/5) to red (0–1/5). The badge shows <code>FSA ?</code> for restaurants whose menu you haven't opened yet, and <code>FSA —</code> for restaurants with no FSA record (e.g. exempt or not yet inspected). Hover the badge to see when the rating was last issued.</td>
</tr></table>

### 📍 Shared Address Detection / 'Ghost kitchens'

<table><tr>
<td width="40%" style="padding:0"> <img width="302" height="260" alt="TXuUFrEOdC" src="https://github.com/user-attachments/assets/af34f70d-53b5-4791-b364-6ce12fb1372b" />
 </td>
<td valign="top">Some restaurants are virtual brands — different names and menus operating from the same kitchen. A <strong>Shared Address</strong> badge appears on any restaurant that shares a physical address with another on the listing. Hover the badge to see which restaurants are co-located. <br> Bear in mind there are legitimate cases where independent restraunts share an address, eg food courts or malls</td>
</tr></table>

### 🔽 Filter Bar

<table><tr>
<td width="40%" style="padding:0"> <img width="1208" height="656" alt="chrome_jQpRMlxbXN" src="https://github.com/user-attachments/assets/41ce0193-2717-4d8b-942b-c9305649b896" />
 </td>
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
<td width="40%" style="padding:0"> <img width="934" height="282" alt="idyINVwtGq" src="https://github.com/user-attachments/assets/57950766-2218-459a-9d3c-f3140e13aa01" />
 </td>
<td valign="top">Enable auto-scan in the extension menu to automatically fetch addresses and FSA ratings for every unvisited restaurant on the listing. A progress counter appears in the filter bar as it works. Scans run at one restaurant every 3 seconds to avoid rate limiting — enable <strong>Scan Fast</strong> to drop this to 1 second if you're in a hurry (not recommended for prolonged use).</td>
</tr></table>

### Other

<table><tr>
<td width="40%" style="padding:0"> <img width="298" height="601" alt="fuAkTtSwFC" src="https://github.com/user-attachments/assets/45246012-9bf1-447d-87c6-9b2da199a26b" />
 </td>
<td valign="top">

- Blur card images if you'd rather order without the food photography
- All data is stored locally in your browser — nothing is ever sent anywhere

</td>
</tr></table>

---

## Installation

Better Roo is not on the Chrome Web Store (yet). Install it by loading the built extension manually.

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
