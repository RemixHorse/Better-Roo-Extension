import { applyCardVisibility } from './cardBadge.js';
import { renderTable, destroyTable } from './table.js';
import { showInfoModal } from './modal.js';

// Module-level state — set by injectFilterBar() on each listing page load
let _restaurants = [];
let _sharedAddressResults = new Map();
let _fsaRatings = new Map();

const _filters = {
  minFsaScore: 0,
  minRating: 0,
  addressMode: 'all',  // 'all' | 'shared' | 'unique'
  maxDeliveryTime: 0,  // 0 = any
};

let _viewMode = 'card'; // 'card' | 'table'

// --- Public API ---

export async function injectFilterBar(restaurants, sharedAddressResults, fsaRatings) {
  _restaurants = restaurants;
  _sharedAddressResults = sharedAddressResults;
  _fsaRatings = fsaRatings;

  const grid = await waitForElement('[class*="HomeFeedGrid"]', 3000);
  if (!grid) return;

  document.getElementById('better-roo-bar')?.remove();
  injectStyles();

  const bar = buildBar();
  grid.parentElement.insertBefore(bar, grid);

  const { tableViewDefault } = await chrome.storage.sync.get({ tableViewDefault: false });
  _viewMode = tableViewDefault ? 'table' : 'card';

  updateToggleLabel();
  applyFiltersAndRender();
}

export function getFilters() { return { ..._filters }; }

export function setFilter(key, val) {
  _filters[key] = val;
  applyFiltersAndRender();
}

export function applyFiltersAndRender() {
  const filtered = _restaurants.filter(r => {
    // FSA score — only exclude if we have a confirmed score that fails the minimum
    if (_filters.minFsaScore > 0) {
      const fsa = _fsaRatings.get(r.id);
      if (fsa?.score != null && fsa.score < _filters.minFsaScore) return false;
    }

    // Deliveroo rating
    if (_filters.minRating > 0) {
      const rating = parseFloat(r.rating);
      if (!isNaN(rating) && rating < _filters.minRating) return false;
    }

    // Shared address mode
    const shared = _sharedAddressResults.get(r.id);
    const isShared = shared?.isSharedAddress ?? false;
    if (_filters.addressMode === 'shared' && !isShared) return false;
    if (_filters.addressMode === 'unique' && isShared) return false;

    // Max delivery time
    if (_filters.maxDeliveryTime > 0) {
      const mins = parseInt(r.deliveryTimeMin);
      if (!isNaN(mins) && mins > _filters.maxDeliveryTime) return false;
    }

    return true;
  });

  CHIP_DEFS.forEach(def => updateChip(def));

  if (_viewMode === 'table') {
    renderTable(filtered, _sharedAddressResults, _fsaRatings);
  } else {
    destroyTable();
    applyCardVisibility(filtered);
  }
}

// --- Bar construction ---

const CHIP_DEFS = [
  {
    id: 'br-chip-fsa',
    label: 'FSA',
    filterKey: 'minFsaScore',
    parse: parseFloat,
    options: [['0', 'Any'], ['1', '1+'], ['2', '2+'], ['3', '3+'], ['4', '4+'], ['5', '5 only']],
  },
  {
    id: 'br-chip-rating',
    label: 'Rating',
    filterKey: 'minRating',
    parse: parseFloat,
    options: [['0', 'Any'], ['3', '3+'], ['4', '4+'], ['4.5', '4.5+']],
  },
  {
    id: 'br-chip-address',
    label: 'Address',
    filterKey: 'addressMode',
    parse: v => v,
    options: [['all', 'Show all'], ['shared', 'Shared only'], ['unique', 'Unique only']],
  },
  {
    id: 'br-chip-delivery',
    label: 'Delivery',
    filterKey: 'maxDeliveryTime',
    parse: parseInt,
    options: [['0', 'Any'], ['15', '≤15 min'], ['20', '≤20 min'], ['30', '≤30 min'], ['45', '≤45 min']],
  },
];

let _openChipPopover = null;

document.addEventListener('click', () => closeChipPopover());

function closeChipPopover() {
  if (_openChipPopover) {
    _openChipPopover.classList.remove('br-chip-popover--open');
    _openChipPopover = null;
  }
}

function buildBar() {
  const bar = document.createElement('div');
  bar.id = 'better-roo-bar';

  const { version } = chrome.runtime.getManifest();
  const label = document.createElement('span');
  label.className = 'br-bar-label';
  label.textContent = `Better Roo v${version}`;

  const help = document.createElement('button');
  help.className = 'br-bar-help';
  help.textContent = '?';
  help.title = 'About Better Roo';
  help.addEventListener('click', e => { e.stopPropagation(); showInfoModal(); });

  const chips = document.createElement('div');
  chips.className = 'br-chips';

  for (const def of CHIP_DEFS) {
    chips.appendChild(buildChip(def));
  }

  const toggle = document.createElement('button');
  toggle.id = 'br-view-toggle';
  toggle.addEventListener('click', () => {
    _viewMode = _viewMode === 'card' ? 'table' : 'card';
    chrome.storage.sync.set({ tableViewDefault: _viewMode === 'table' });
    updateToggleLabel();
    applyFiltersAndRender();
  });

  bar.appendChild(label);
  bar.appendChild(help);
  bar.appendChild(chips);
  bar.appendChild(toggle);
  return bar;
}

function buildChip(def) {
  const chip = document.createElement('button');
  chip.id = def.id;
  chip.className = 'br-chip';

  const labelEl = document.createElement('span');
  labelEl.className = 'br-chip-label';
  labelEl.textContent = def.label;

  const valueEl = document.createElement('span');
  valueEl.className = 'br-chip-value';

  const chevron = document.createElement('span');
  chevron.className = 'br-chip-chevron';
  chevron.innerHTML = `<svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor"><path d="M0 0l5 6 5-6z"/></svg>`;

  const popover = document.createElement('div');
  popover.className = 'br-chip-popover';

  for (const [val, lbl] of def.options) {
    const opt = document.createElement('div');
    opt.className = 'br-chip-option';
    opt.dataset.value = val;
    opt.textContent = lbl;
    opt.addEventListener('click', e => {
      e.stopPropagation();
      _filters[def.filterKey] = def.parse(val);
      updateChip(def);
      closeChipPopover();
      applyFiltersAndRender();
    });
    popover.appendChild(opt);
  }

  chip.appendChild(labelEl);
  chip.appendChild(valueEl);
  chip.appendChild(chevron);
  chip.appendChild(popover);

  chip.addEventListener('click', e => {
    e.stopPropagation();
    if (_openChipPopover === popover) {
      closeChipPopover();
    } else {
      closeChipPopover();
      popover.classList.add('br-chip-popover--open');
      _openChipPopover = popover;
    }
  });

  updateChip(def);
  return chip;
}

function updateChip(def) {
  const chip = document.getElementById(def.id);
  if (!chip) return;
  const currentVal = String(_filters[def.filterKey]);
  const currentOpt = def.options.find(([v]) => v === currentVal) ?? def.options[0];
  const isActive = currentVal !== def.options[0][0];

  chip.querySelector('.br-chip-value').textContent = isActive ? `: ${currentOpt[1]}` : '';
  chip.classList.toggle('br-chip--active', isActive);

  chip.querySelectorAll('.br-chip-option').forEach(el => {
    el.classList.toggle('br-chip-option--active', el.dataset.value === currentVal);
  });
}


function updateToggleLabel() {
  const btn = document.getElementById('br-view-toggle');
  if (!btn) return;
  btn.textContent = _viewMode === 'card' ? '⊞ Table view' : '▦ Card view';
}

// --- Styles ---

function injectStyles() {
  if (document.getElementById('better-roo-styles')) return;
  const style = document.createElement('style');
  style.id = 'better-roo-styles';
  style.textContent = `
    #better-roo-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      background: linear-gradient(to right, #00CCBC, #00CC9A);
      box-shadow: 0 -2px 12px rgba(0,0,0,0.15);
      padding: 10px 20px;
      font-family: sans-serif;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    body { padding-bottom: 64px; }
    .br-bar-label {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
      white-space: nowrap;
      flex-shrink: 0;
      letter-spacing: -0.3px;
    }
    .br-bar-help {
      flex-shrink: 0;
      padding: 6px 11px;
      border: 1.5px solid rgba(255,255,255,0.5);
      border-radius: 999px;
      background: rgba(255,255,255,0.15);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      line-height: 1;
      font-family: sans-serif;
      box-shadow: 0 2px 6px rgba(0,0,0,0.18);
      transition: background 0.15s, border-color 0.15s;
    }
    .br-bar-help:hover {
      background: rgba(255,255,255,0.25);
      border-color: rgba(255,255,255,0.8);
    }
    .br-chips {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-left: auto;
    }
    .br-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border: 1.5px solid rgba(255,255,255,0.5);
      border-radius: 999px;
      background: rgba(255,255,255,0.15);
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      cursor: pointer;
      white-space: nowrap;
      position: relative;
      transition: background 0.15s, border-color 0.15s;
      font-family: sans-serif;
      box-shadow: 0 2px 6px rgba(0,0,0,0.18);
    }
    .br-chip:hover {
      background: rgba(255,255,255,0.25);
      border-color: rgba(255,255,255,0.8);
    }
    .br-chip--active {
      background: #fff;
      border-color: #fff;
      color: #00CCBC;
    }
    .br-chip-label { font-weight: 700; }
    .br-chip-value { font-weight: 500; }
    .br-chip-chevron {
      display: flex;
      align-items: center;
      opacity: 0.7;
      margin-left: 1px;
    }
    .br-chip--active .br-chip-chevron { opacity: 1; }
    .br-chip-popover {
      display: none;
      position: absolute;
      bottom: calc(100% + 8px);
      right: 0;
      left: auto;
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.12);
      min-width: 140px;
      z-index: 1001;
      overflow: hidden;
    }
    .br-chip-popover--open { display: block; }
    .br-chip-option {
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      color: #444;
      cursor: pointer;
      font-family: sans-serif;
    }
    .br-chip-option:hover { background: #f5f5f5; }
    .br-chip-option--active { color: #00CCBC; }
    #br-view-toggle {
      flex-shrink: 0;
      padding: 6px 12px;
      border: 1.5px solid rgba(255,255,255,0.5);
      border-radius: 999px;
      background: rgba(255,255,255,0.15);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      white-space: nowrap;
      line-height: 1;
      font-family: sans-serif;
      box-shadow: 0 2px 6px rgba(0,0,0,0.18);
      transition: background 0.15s, border-color 0.15s;
    }
    #br-view-toggle:hover {
      background: rgba(255,255,255,0.25);
      border-color: rgba(255,255,255,0.8);
    }
  `;
  document.head.appendChild(style);
}

// --- Helpers ---

function waitForElement(selector, timeoutMs) {
  const el = document.querySelector(selector);
  if (el) return Promise.resolve(el);
  return new Promise(resolve => {
    const obs = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) { obs.disconnect(); resolve(found); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
  });
}
