# Better Roo

A Chrome extension that enriches Deliveroo eg (Visible food standard ratings in search, shared address detection, filters and table views)

When you first install the extension the FSA and shared address badges will not display until you have opened that restraunts menu, because deliveroo doesn't expose the address untill you get to that page.
Once you've visited it once it's cached.

---
🤖 Generated with [Claude Code](https://claude.ai/claude-code)

## Features

### 🧪 FSA Hygiene Ratings

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="FSA badges on restaurant cards" src="https://github.com/user-attachments/assets/d49f510e-02e2-435e-90d9-d7e5b63d7cc3" /></td>
<td valign="top">Food Standards Agency ratings are fetched and displayed as a badge on every restaurant card and on the restaurant's menu page. Ratings are colour-coded from green (5/5) to red (0–1/5). The badge shows <code>FSA ?</code> for restaurants whose menu you haven't opened yet, and <code>FSA —</code> for restaurants that have no FSA record (e.g. exempt or not yet inspected).</td>
</tr></table>

### 📍 Shared Address Detection

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="Shared Address badge on a restaurant card" src="https://github.com/user-attachments/assets/0e120bb7-4449-4a73-9d2d-2a9013ef675f" /></td>
<td valign="top">Some restaurants are virtual brands — different names and menus operating from the same kitchen. A <strong>Shared Address</strong> badge appears on any restaurant that shares a physical address with another restaurant on the listing. Hover the badge to see which restaurants are co-located. Detection improves the more menus you browse, as address data is collected from menu page visits.</td>
</tr></table>

### 🔽 Filter Bar

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="Filter bar above restaurant listing" src="https://github.com/user-attachments/assets/9f08ee72-77ca-4169-9b25-23ee24cb1c5f" /></td>
<td valign="top">A persistent filter bar lets you narrow results by FSA score, Deliveroo rating, delivery time, and shared address status. In card view, non-matching restaurants are dimmed rather than hidden so you keep the full picture.</td>
</tr></table>

### 📋 Table View

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="Compact sortable table of restaurants" src="https://github.com/user-attachments/assets/750dbad5-949a-4b69-ba6b-9f1fe9e3e148" /></td>
<td valign="top">Switch to a compact, sortable table listing all restaurants with FSA score, rating, delivery time, delivery fee, and shared address status at a glance. Your view preference is remembered between visits.</td>
</tr></table>

### 📌 Pin to Top

Only working for table view. Pin favourite restaurants to the top of the listing. Pins persist across visits.

### Other

<table><tr>
<td width="40%" style="padding:0"><img width="100%" alt="Extension popup showing toggles" src="https://github.com/user-attachments/assets/46d935ca-0b69-4d70-886d-e6c39bc17340" /></td>
<td valign="top">

- Hide Deliveroo's promotional carousels (Featured, Top-Rated, etc.)
- Blur card images if you'd rather order without the food photography
- All data is stored locally in your browser — nothing is ever sent anywhere

</td>
</tr></table>

## Installation

Better Roo is not on the Chrome Web Store. Install it by loading the built extension manually.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- Google Chrome

### Build

```bash
git clone https://github.com/your-username/better-roo.git
cd better-roo
npm install
npm run build
```

This produces a `dist/` folder containing the built extension.

### Load in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the `dist/` folder from this repository

The Better Roo icon will appear in your Chrome toolbar. Navigate to a Deliveroo restaurant listing to get started.

### Updating

After pulling new changes, rebuild and click the refresh icon on the extension card at `chrome://extensions`.

```bash
git pull
npm run build
```

## Development

```bash
npm run dev     # watch mode — rebuilds on file changes
npm test        # run the test suite
```

The extension uses Vite for bundling. Source files are in `src/`.

## Privacy

Better Roo makes no external requests on your behalf beyond:
- The [UK Food Standards Agency API](https://api.ratings.food.gov.uk) to fetch hygiene ratings
- Deliveroo itself, as you browse normally

All restaurant data, ratings, and address matches are stored locally in your browser's IndexedDB. Nothing is collected, transmitted, or shared.

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Saves your filter and view preferences |
| `alarms` | Schedules background FSA rating refreshes |
| `deliveroo.co.uk` | Reads listing and menu page data |
| `api.ratings.food.gov.uk` | Fetches FSA hygiene ratings |
