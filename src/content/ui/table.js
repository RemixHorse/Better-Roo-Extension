import { getUserFlag, setUserFlag } from '../db.js';
import { timeAgo } from '../timeAgo.js';
import { getFilters, setFilter } from './filterBar.js';

let _restaurants = [];
let _sharedAddressResults = new Map();
let _fsaRatings = new Map();
let _sortCol = null;  // column key
let _sortDir = 1;     // 1 = asc, -1 = desc
let _openPopover = null; // currently visible popover element
let _stickyTop = 0;   // px offset for sticky header, set from Deliveroo's own sticky header

const GRID_SELECTOR = '[class*="HomeFeedGrid"]:not([class*="HomeFeedGrid-f"])';

// Close open popover on any outside click
document.addEventListener('click', () => closePopover());

// --- Public API ---

export async function renderTable(restaurants, sharedAddressResults, fsaRatings) {
  _restaurants = restaurants;
  _sharedAddressResults = sharedAddressResults;
  _fsaRatings = fsaRatings;

  _stickyTop = document.querySelector('[data-sticky-header]')?.offsetHeight ?? 0;

  hideGrid();
  injectStyles();

  document.getElementById('better-roo-table-wrap')?.remove();

  const pinFlags = await loadPinFlags(restaurants);
  const wrap = buildTable(pinFlags);
  const grid = document.querySelector(GRID_SELECTOR);
  grid?.parentElement.insertBefore(wrap, grid);
}

export function destroyTable() {
  closePopover();
  document.getElementById('better-roo-table-wrap')?.remove();
  showGrid();
}

// --- Build ---

async function loadPinFlags(restaurants) {
  const entries = await Promise.all(
    restaurants.map(r => getUserFlag(r.id).then(f => [r.id, !!(f?.isPinned)]))
  );
  return new Map(entries);
}

const COLS = [
  { key: 'pin',      label: '📌',           sortable: false },
  { key: 'name',     label: 'Name',          sortable: true  },
  { key: 'distance', label: 'Distance',      sortable: true  },
  { key: 'eta',      label: 'ETA',           sortable: true  },
  { key: 'fee',      label: 'Delivery fee',  sortable: true  },
  { key: 'rating',   label: 'Deliveroo ★',   sortable: true  },
  { key: 'fsa',      label: 'FSA',           sortable: true  },
  { key: 'address',  label: 'Address',        sortable: false },
];

const FILTER_DEFS = {
  eta: {
    key: 'maxDeliveryTime', parse: parseInt,
    options: [['0', 'Any'], ['15', '15 min'], ['20', '20 min'], ['30', '30 min'], ['45', '45 min']],
  },
  rating: {
    key: 'minRating', parse: parseFloat,
    options: [['0', 'Any'], ['3', '3+'], ['4', '4+'], ['4.5', '4.5+']],
  },
  fsa: {
    key: 'minFsaScore', parse: parseFloat,
    options: [['0', 'Any'], ['1', '1+'], ['2', '2+'], ['3', '3+'], ['4', '4+'], ['5', '5 only']],
  },
  address: {
    key: 'addressMode', parse: v => v,
    options: [['all', 'Show all'], ['shared', 'Shared only'], ['unique', 'Unique only']],
  },
};

function buildTable(pinFlags) {
  const wrap = document.createElement('div');
  wrap.id = 'better-roo-table-wrap';

  const table = document.createElement('table');
  table.id = 'better-roo-table';
  table.appendChild(buildThead());
  table.appendChild(buildTbody(pinFlags));

  wrap.appendChild(table);
  return wrap;
}

function buildThead() {
  const thead = document.createElement('thead');
  const filters = getFilters();
  const tr = document.createElement('tr');

  for (const col of COLS) {
    const th = document.createElement('th');
    th.dataset.col = col.key;
    if (_stickyTop) th.style.top = `${_stickyTop}px`;

    const inner = document.createElement('div');
    inner.className = 'br-th-inner';

    // Label
    const label = document.createElement('span');
    label.className = 'br-th-label';
    label.textContent = col.label;
    inner.appendChild(label);

    // Sort indicator
    if (col.sortable) {
      th.classList.add('sortable');
      if (_sortCol === col.key) {
        const sortIcon = document.createElement('span');
        sortIcon.className = 'br-th-sort';
        sortIcon.textContent = _sortDir === 1 ? '↑' : '↓';
        inner.appendChild(sortIcon);
      }
      th.addEventListener('click', () => handleSort(col.key));
    }

    // Filter icon + popover
    const def = FILTER_DEFS[col.key];
    if (def) {
      const currentVal = String(filters[def.key]);
      const isActive = currentVal !== def.options[0][0]; // non-default = active

      const filterIcon = document.createElement('span');
      filterIcon.className = 'br-th-filter' + (isActive ? ' br-th-filter--active' : '');
      filterIcon.title = 'Filter';
      filterIcon.innerHTML = funnelSvg();

      const popover = document.createElement('div');
      popover.className = 'br-th-popover';

      for (const [val, lbl] of def.options) {
        const item = document.createElement('div');
        item.className = 'br-th-popover-item' + (currentVal === val ? ' br-th-popover-item--active' : '');
        item.textContent = lbl;
        item.addEventListener('click', e => {
          e.stopPropagation();
          setFilter(def.key, def.parse(val));
          closePopover();
        });
        popover.appendChild(item);
      }

      filterIcon.appendChild(popover);
      filterIcon.addEventListener('click', e => {
        e.stopPropagation();
        if (_openPopover === popover) {
          closePopover();
        } else {
          closePopover();
          popover.classList.add('br-th-popover--open');
          _openPopover = popover;
        }
      });

      inner.appendChild(filterIcon);
    }

    th.appendChild(inner);
    tr.appendChild(th);
  }

  thead.appendChild(tr);
  return thead;
}

function closePopover() {
  if (_openPopover) {
    _openPopover.classList.remove('br-th-popover--open');
    _openPopover = null;
  }
}

function funnelSvg() {
  return `<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
    <path d="M0.5 1.5h9L6 5.5V9L4 8V5.5L0.5 1.5z"/>
  </svg>`;
}

function isClosed(r) {
  return r.deliveryTimeMin == null;
}

function buildTbody(pinFlags) {
  const rows = _restaurants.map(r => ({
    r,
    pinned: pinFlags.get(r.id) ?? false,
    closed: isClosed(r),
    shared: _sharedAddressResults.get(r.id),
    fsa: _fsaRatings.get(r.id),
  }));

  if (_sortCol) {
    rows.sort((a, b) => {
      const va = sortVal(a, _sortCol);
      const vb = sortVal(b, _sortCol);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * _sortDir;
    });
  }

  const pinned = rows.filter(x => x.pinned);
  const open   = rows.filter(x => !x.pinned && !x.closed);
  const closed = rows.filter(x => !x.pinned && x.closed);

  const tbody = document.createElement('tbody');
  pinned.forEach(x => tbody.appendChild(buildRow(x, pinFlags)));

  if (pinned.length && (open.length || closed.length)) {
    tbody.appendChild(makeDivider());
  }

  open.forEach(x => tbody.appendChild(buildRow(x, pinFlags)));

  closed.forEach(x => tbody.appendChild(buildRow(x, pinFlags)));

  return tbody;
}

function makeDivider() {
  const tr = document.createElement('tr');
  tr.className = 'br-divider';
  tr.innerHTML = `<td colspan="${COLS.length}"></td>`;
  return tr;
}


export function markTableRowScanState(_id, _state) {
  // Visual states (queued/scanning) removed — completion is shown via refreshTableRow
}

export function refreshTableRow(id, restaurant, fsaRating, sharedResult) {
  const sid = String(id);
  const idx = _restaurants.findIndex(r => String(r.id) === sid);
  if (idx >= 0 && restaurant) _restaurants[idx] = { ..._restaurants[idx], ...restaurant };
  _fsaRatings.set(sid, fsaRating);
  _sharedAddressResults.set(sid, sharedResult);

  const tr = document.querySelector(`#better-roo-table tr[data-br-id="${sid}"]`);
  if (!tr) return;
  tr.classList.remove('br-queued', 'br-scanning');
  tr.classList.add('br-scan-done', 'br-scan-live');

  const fsaTd = tr.cells[6];
  if (fsaTd) {
    fsaTd.innerHTML = '';
    const pill = document.createElement('span');
    pill.className = 'br-tbl-fsa-pill';
    if (fsaRating?.score != null) {
      pill.textContent = `${fsaRating.score}/5`;
      const { bg, text } = fsaScoreColor(fsaRating.score);
      pill.style.backgroundColor = bg;
      pill.style.color = text;
      if (fsaRating.ratingDate) pill.title = `Last inspected: ${timeAgo(fsaRating.ratingDate)}`;
    } else {
      pill.textContent = '?';
      pill.classList.add('br-tbl-fsa-unknown');
    }
    fsaTd.appendChild(pill);
  }

  const addressTd = tr.cells[7];
  if (addressTd) {
    addressTd.innerHTML = '';
    if (sharedResult?.isSharedAddress) {
      const pill = document.createElement('span');
      pill.className = 'br-tbl-shared';
      pill.textContent = 'Shared';
      pill.title = `Also here: ${sharedResult.siblingNames.join(', ')}`;
      addressTd.appendChild(pill);
    }
  }
}

function buildRow({ r, pinned, closed, shared, fsa }, pinFlags) {
  const tr = document.createElement('tr');
  tr.dataset.brId = String(r.id);
  if (pinned) tr.classList.add('br-pinned');
  if (closed) tr.classList.add('br-closed');
  if (r.address1) tr.classList.add('br-scan-done');

  // Pin toggle
  const pinTd = document.createElement('td');
  const pinBtn = document.createElement('button');
  pinBtn.className = 'br-tbl-pin' + (pinned ? ' br-tbl-pin--active' : '');
  pinBtn.textContent = '📌';
  pinBtn.title = pinned ? 'Unpin' : 'Pin to top';
  pinBtn.addEventListener('click', async () => {
    const nowPinned = !pinFlags.get(r.id);
    await setUserFlag(r.id, { isPinned: nowPinned });
    pinFlags.set(r.id, nowPinned);
    document.querySelector('#better-roo-table tbody')?.replaceWith(buildTbody(pinFlags));
  });
  pinTd.appendChild(pinBtn);
  tr.appendChild(pinTd);

  // Name (linked)
  const nameTd = document.createElement('td');
  if (r.href) {
    const a = document.createElement('a');
    a.href = r.href;
    a.textContent = r.name;
    a.className = 'br-tbl-link';
    nameTd.appendChild(a);
  } else {
    nameTd.textContent = r.name;
  }
  tr.appendChild(nameTd);

  // Distance
  tr.appendChild(cell(r.distance ?? '—'));

  // ETA
  const etaTd = document.createElement('td');
  const etaDisplay = formatEta(r);
  if (etaDisplay) {
    etaTd.textContent = etaDisplay;
  } else {
    const closedSpan = document.createElement('span');
    closedSpan.className = 'br-tbl-closed-label';
    closedSpan.textContent = 'Closed';
    etaTd.appendChild(closedSpan);
  }
  tr.appendChild(etaTd);

  // Delivery fee
  tr.appendChild(cell(r.deliveryFee ? r.deliveryFee.replace(/\s*delivery fee\s*/i, ' ').trim() || '—' : '—'));

  // Deliveroo rating
  const ratingTd = document.createElement('td');
  if (r.rating != null) {
    ratingTd.textContent = r.rating;
    if (r.ratingCount) {
      const cnt = document.createElement('span');
      cnt.className = 'br-tbl-sub';
      cnt.textContent = ` (${r.ratingCount})`;
      ratingTd.appendChild(cnt);
    }
  } else {
    ratingTd.textContent = '—';
  }
  tr.appendChild(ratingTd);

  // FSA score
  const fsaTd = document.createElement('td');
  const pill = document.createElement('span');
  pill.className = 'br-tbl-fsa-pill';
  if (fsa?.score != null) {
    pill.textContent = `${fsa.score}/5`;
    const { bg, text } = fsaScoreColor(fsa.score);
    pill.style.backgroundColor = bg;
    pill.style.color = text;
    if (fsa.ratingDate) pill.title = `Last inspected: ${timeAgo(fsa.ratingDate)}`;
  } else {
    pill.textContent = '?';
    pill.classList.add('br-tbl-fsa-unknown');
  }
  fsaTd.appendChild(pill);
  tr.appendChild(fsaTd);

  // Shared address
  const addressTd = document.createElement('td');
  if (shared?.isSharedAddress) {
    const pill = document.createElement('span');
    pill.className = 'br-tbl-shared';
    pill.textContent = 'Shared';
    pill.title = `Also here: ${shared.siblingNames.join(', ')}`;
    addressTd.appendChild(pill);
  }
  tr.appendChild(addressTd);

  return tr;
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function sortVal({ r, fsa }, col) {
  switch (col) {
    case 'name':     return r.name?.toLowerCase() ?? null;
    case 'distance': return parseFloat(r.distance) || null;
    case 'eta':      return parseInt(r.deliveryTimeMin) || null;
    case 'fee': {
      const n = parseFloat((r.deliveryFee ?? '').replace(/[^0-9.]/g, ''));
      return isNaN(n) ? null : n;
    }
    case 'rating':   return parseFloat(r.rating) || null;
    case 'fsa':      return fsa?.score ?? null;
    default:         return null;
  }
}

function handleSort(col) {
  closePopover();
  if (_sortCol === col) {
    if (_sortDir === 1) {
      _sortDir = -1;
    } else {
      _sortCol = null;
      _sortDir = 1;
    }
  } else {
    _sortCol = col;
    _sortDir = 1;
  }

  const table = document.getElementById('better-roo-table');
  if (!table) return;
  table.querySelector('thead').replaceWith(buildThead());
  loadPinFlags(_restaurants).then(pinFlags => {
    table.querySelector('tbody').replaceWith(buildTbody(pinFlags));
  });
}

// --- Skeleton ---

const SESSION_TABLE_KEY = 'br-table-mode';

export async function showTableSkeleton() {
  // Synchronously hide the grid before the first await.
  // At document_end, this runs before React hydrates so the grid never flashes.
  if (sessionStorage.getItem(SESSION_TABLE_KEY) === '1') {
    hideGrid();
  }

  const { tableViewDefault } = await chrome.storage.sync.get({ tableViewDefault: false });

  if (!tableViewDefault) {
    sessionStorage.removeItem(SESSION_TABLE_KEY);
    showGrid();
    return;
  }

  sessionStorage.setItem(SESSION_TABLE_KEY, '1');
  hideGrid(); // ensure hidden even on first visit in table mode

  const grid = await waitForGrid();
  if (!grid) { showGrid(); return; }
  if (document.getElementById('better-roo-table-wrap')) return;

  injectStyles();

  const wrap = document.createElement('div');
  wrap.id = 'better-roo-table-wrap';

  const table = document.createElement('table');
  table.id = 'better-roo-table';

  // Minimal header — same columns, no sort/filter chrome
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const col of COLS) {
    const th = document.createElement('th');
    th.textContent = col.label;
    if (_stickyTop) th.style.top = `${_stickyTop}px`;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);

  // Spinner row
  const tbody = document.createElement('tbody');
  const spinRow = document.createElement('tr');
  const spinTd = document.createElement('td');
  spinTd.colSpan = COLS.length;
  spinTd.className = 'br-spinner-cell';
  const spinner = document.createElement('span');
  spinner.className = 'br-spinner';
  spinTd.appendChild(spinner);
  spinRow.appendChild(spinTd);
  tbody.appendChild(spinRow);
  table.appendChild(tbody);

  wrap.appendChild(table);
  grid.parentElement.insertBefore(wrap, grid);
}

// --- Grid show/hide ---

function waitForGrid() {
  const el = document.querySelector(GRID_SELECTOR);
  if (el) return Promise.resolve(el);
  return new Promise(resolve => {
    const obs = new MutationObserver(() => {
      const found = document.querySelector(GRID_SELECTOR);
      if (found) { obs.disconnect(); resolve(found); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, 5000);
  });
}

function hideGrid() {
  const grid = document.querySelector(GRID_SELECTOR);
  if (grid) grid.style.display = 'none';
}

function showGrid() {
  const grid = document.querySelector(GRID_SELECTOR);
  if (grid) grid.style.display = '';
}

// --- Helpers ---

function formatEta(r) {
  const eta = r.deliveryTimeMin;
  if (eta == null) return null;
  if (eta === 'Around') return `~${r.deliveryTimeLabel}`;
  if (eta === 'Tomorrow') return 'Tomorrow';
  if (isNaN(parseInt(eta))) return String(eta);
  return `${eta} min`;
}

function fsaScoreColor(score) {
  if (score >= 5) return { bg: '#81C784', text: '#1B5E20' };
  if (score >= 4) return { bg: '#4DB6AC', text: '#004D40' };
  if (score >= 3) return { bg: '#FFD54F', text: '#7F4900' };
  if (score >= 2) return { bg: '#FFB74D', text: '#7A2E00' };
  return           { bg: '#E57373', text: '#7F0000' };
}

function injectStyles() {
  if (document.getElementById('better-roo-table-styles')) return;
  const style = document.createElement('style');
  style.id = 'better-roo-table-styles';
  style.textContent = `
    #better-roo-table-wrap {
      padding: 0 16px 24px;
    }
    #better-roo-table {
      width: 100%;
      border-collapse: collapse;
      font-family: sans-serif;
      font-size: 13px;
      color: #222;
    }
    #better-roo-table thead th {
      text-align: left;
      padding: 8px 10px;
      border-bottom: 2px solid #e8e8e8;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #666;
      white-space: nowrap;
      user-select: none;
      position: sticky;
      top: 0;
      background: #fff;
      z-index: 100;
      border-top: 1px solid #e8e8e8;
    }
    #better-roo-table thead th.sortable { cursor: pointer; }
    #better-roo-table thead th.sortable:hover .br-th-label { color: #00CCBC; }
    .br-th-inner {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .br-th-sort {
      color: #00CCBC;
      font-size: 11px;
    }
    .br-th-filter {
      color: #ccc;
      cursor: pointer;
      display: flex;
      align-items: center;
      position: relative;
      padding: 1px;
      border-radius: 3px;
      transition: color 0.1s;
    }
    .br-th-filter:hover { color: #999; }
    .br-th-filter--active { color: #00CCBC; }
    .br-th-filter--active:hover { color: #00a89a; }
    .br-th-popover {
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      min-width: 130px;
      z-index: 200;
      overflow: hidden;
    }
    .br-th-popover--open { display: block; }
    .br-th-popover-item {
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      color: #444;
      cursor: pointer;
      text-transform: none;
      letter-spacing: 0;
    }
    .br-th-popover-item:hover { background: #f5f5f5; color: #222; }
    .br-th-popover-item--active { color: #00CCBC; }
    #better-roo-table tbody tr {
      border-bottom: 1px solid #f0f0f0;
    }
    #better-roo-table tbody tr:hover { background: #f9f9f9; }
    #better-roo-table tbody tr.br-pinned:hover { background: #f9f9f9; }
    #better-roo-table tbody tr.br-divider td {
      padding: 0;
      height: 3px;
      background: linear-gradient(to right, rgba(0, 204, 188, 0.7), rgba(0, 204, 188, 0.15));
      border: none;
    }
    .br-tbl-closed-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #aaa;
    }
    #better-roo-table tbody tr.br-closed {
      opacity: 0.45;
    }
    #better-roo-table tbody tr.br-closed:hover {
      opacity: 0.65;
      background: #f9f9f9;
    }
    #better-roo-table td {
      padding: 9px 10px;
      vertical-align: middle;
    }
    .br-tbl-link {
      color: inherit;
      text-decoration: none;
      font-weight: 600;
    }
    #better-roo-table tbody tr:not(.br-scan-done) .br-tbl-link {
      color: var(--color-foreground-neutral-normal-on-elevation-base, #888);
    }
#better-roo-table tbody tr.br-closed .br-tbl-link {
      color: #666;
    }
    .br-tbl-link:hover { color: #00CCBC; text-decoration: underline; }
    .br-tbl-sub { color: #999; font-size: 11px; }
    .br-tbl-pin {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      opacity: 0.2;
      padding: 0;
      transition: opacity 0.15s;
    }
    #better-roo-table tr:hover .br-tbl-pin,
    .br-tbl-pin--active { opacity: 1; }
    .br-tbl-fsa-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
    }
    .br-tbl-fsa-unknown { background: #F5F5F5; color: #999; }
    .br-tbl-shared {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      background-color: #FFD54F;
      color: #7F4900;
      cursor: default;
    }
    #better-roo-table tbody tr.br-scan-done {
      background-color: rgba(0, 204, 188, 0.11);
    }
    #better-roo-table tbody tr.br-scan-live {
      transition: background-color 0.4s linear;
    }
    #better-roo-table tbody tr.br-scan-done:hover {
      background-color: rgba(0, 204, 188, 0.2);
    }
    .br-spinner-cell {
      padding: 48px 10px;
      text-align: center;
      border-bottom: none;
    }
    .br-spinner {
      display: inline-block;
      width: 28px;
      height: 28px;
      border: 3px solid #e8e8e8;
      border-top-color: #00CCBC;
      border-radius: 50%;
      animation: br-spin 0.7s linear infinite;
    }
    @keyframes br-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
