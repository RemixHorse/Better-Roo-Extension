import { getUserFlag, setUserFlag } from '../db.js';
import { timeAgo } from '../timeAgo.js';

let _restaurants = [];
let _sharedAddressResults = new Map();
let _fsaRatings = new Map();
let _pinFlags = new Map();
let _settings = { hygieneEnabled: true, sharedAddressEnabled: true, blurCardImages: false, cardColumns: 3 };

const GRID_SELECTOR = '[class*="HomeFeedGrid"]:not([class*="HomeFeedGrid-f"])';

// Natural sort directions per column (1 = asc, -1 = desc)
const SORT_DIRS = { name: 1, rating: -1, eta: 1, fee: 1, fsa: -1, distance: 1 };

// --- Public API ---

export async function initCardGrid(restaurants, sharedAddressResults, fsaRatings, pinFlags = null) {
  _restaurants = restaurants;
  _sharedAddressResults = sharedAddressResults;
  _fsaRatings = fsaRatings;

  const stored = await chrome.storage.sync.get({
    hygieneEnabled: true, sharedAddressEnabled: true, blurCardImages: false, cardColumns: 4,
  });
  _settings = stored;

  if (pinFlags !== null) {
    _pinFlags = pinFlags;
  } else {
    const entries = await Promise.all(
      restaurants.map(r => getUserFlag(r.id).then(f => [String(r.id), !!(f?.isPinned)]))
    );
    _pinFlags = new Map(entries);
  }

  injectStyles();
  document.getElementById('br-card-wrap')?.remove();

  const wrap = buildGrid();
  const deliverooGrid = document.querySelector(GRID_SELECTOR);
  deliverooGrid?.parentElement.insertBefore(wrap, deliverooGrid);

  applyCardSort(null, 1); // set initial order (pinned first, closed last)

  document.body.classList.toggle('br-no-fsa',      !_settings.hygieneEnabled);
  document.body.classList.toggle('br-no-shared',   !_settings.sharedAddressEnabled);
  document.body.classList.toggle('br-blur-images',  !!_settings.blurCardImages);
}

export function applyCardFilter(filteredRestaurants) {
  const matchIds = new Set(filteredRestaurants.map(r => String(r.id)));
  document.querySelectorAll('.br-card[data-br-id]').forEach(card => {
    card.classList.toggle('br-match', matchIds.has(card.dataset.brId));
  });
}

export function applyCardSort(col, dir) {
  const sorted = [..._restaurants];
  if (col) {
    sorted.sort((a, b) => {
      const va = sortVal(a, col);
      const vb = sortVal(b, col);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return dir * (va < vb ? -1 : va > vb ? 1 : 0);
    });
  }

  let pinnedIdx = 0, openIdx = 0, closedIdx = 0;
  for (const r of sorted) {
    const id = String(r.id);
    const card = document.querySelector(`.br-card[data-br-id="${id}"]`);
    if (!card) continue;
    const isClosed = !r.deliveryTimeMin || isNaN(parseInt(r.deliveryTimeMin));
    const isPinned = _pinFlags.get(id) ?? false;
    card.style.order = isPinned && !isClosed ? -10000 + pinnedIdx++
                     : isClosed              ?  10000 + closedIdx++
                     :                           openIdx++;
  }
}

export function refreshCard(id, restaurant, fsaRating, sharedResult) {
  const sid = String(id);
  if (restaurant) {
    const idx = _restaurants.findIndex(r => String(r.id) === sid);
    if (idx >= 0) _restaurants[idx] = { ..._restaurants[idx], ...restaurant };
  }
  if (fsaRating !== undefined) _fsaRatings.set(sid, fsaRating);
  if (sharedResult !== undefined) _sharedAddressResults.set(sid, sharedResult);

  const card = document.querySelector(`.br-card[data-br-id="${sid}"]`);
  if (!card) return;
  card.classList.add('br-scan-done');

  const r = _restaurants.find(r => String(r.id) === sid);

  const fsaBadge = card.querySelector('.br-fsa-badge');
  if (fsaBadge) updateFsaBadge(fsaBadge, _fsaRatings.get(sid), r);

  const badgeRow = card.querySelector('.br-badge-row');
  if (badgeRow) {
    badgeRow.querySelector('.br-shared-badge')?.remove();
    if (_settings.sharedAddressEnabled && sharedResult?.isSharedAddress) {
      badgeRow.appendChild(buildSharedBadge(sharedResult));
    }
  }
}

export function applyGridSettings(settings) {
  if (settings.cardColumns != null) {
    document.getElementById('br-card-grid')?.style.setProperty('--br-cols', settings.cardColumns);
  }
  document.body.classList.toggle('br-no-fsa',      !settings.hygieneEnabled);
  document.body.classList.toggle('br-no-shared',   !settings.sharedAddressEnabled);
  document.body.classList.toggle('br-blur-images',  !!settings.blurCardImages);
}

export function getPinFlags() {
  return _pinFlags;
}

export function reconcileCardGrid(restaurants, sharedAddressResults, fsaRatings) {
  const oldIds = new Set(_restaurants.map(r => String(r.id)));
  const newIds = new Set(restaurants.map(r => String(r.id)));

  _restaurants = restaurants;
  _sharedAddressResults = sharedAddressResults;
  _fsaRatings = fsaRatings;

  // 1. Update existing cards
  for (const r of restaurants) {
    const id = String(r.id);
    if (!oldIds.has(id)) continue;
    const card = document.querySelector(`.br-card[data-br-id="${id}"]`);
    if (!card) continue;

    const isClosed = !r.deliveryTimeMin || isNaN(parseInt(r.deliveryTimeMin));
    card.classList.toggle('br-card-closed', isClosed);

    const stats = card.querySelector('.br-card-stats');
    if (stats) {
      stats.innerHTML = '';
      if (r.rating) stats.appendChild(stat(`★ ${r.rating}`));
      if (!isClosed && r.deliveryTimeMin) stats.appendChild(stat(`${r.deliveryTimeMin} min`));
      if (isClosed) stats.appendChild(stat('Closed', 'br-stat-closed'));
      if (r.deliveryFee) stats.appendChild(stat(r.deliveryFee));
      if (r.distance) stats.appendChild(stat(r.distance));
    }

    const fsaBadge = card.querySelector('.br-fsa-badge');
    if (fsaBadge) updateFsaBadge(fsaBadge, fsaRatings.get(id), r);

    const badgeRow = card.querySelector('.br-badge-row');
    if (badgeRow) {
      badgeRow.querySelector('.br-shared-badge')?.remove();
      const sharedResult = sharedAddressResults.get(id);
      if (_settings.sharedAddressEnabled && sharedResult?.isSharedAddress) {
        badgeRow.appendChild(buildSharedBadge(sharedResult));
      }
    }
  }

  // 2. Add new cards
  const grid = document.getElementById('br-card-grid');
  if (grid) {
    for (const r of restaurants) {
      if (!oldIds.has(String(r.id))) grid.appendChild(buildCard(r));
    }
  }

  // 3. Remove stale cards
  for (const id of oldIds) {
    if (!newIds.has(id)) {
      document.querySelector(`.br-card[data-br-id="${id}"]`)?.remove();
    }
  }
}

// --- Build ---

function buildGrid() {
  const wrap = document.createElement('div');
  wrap.id = 'br-card-wrap';

  const grid = document.createElement('div');
  grid.id = 'br-card-grid';
  grid.style.setProperty('--br-cols', _settings.cardColumns);

  for (const r of _restaurants) {
    grid.appendChild(buildCard(r));
  }

  wrap.appendChild(grid);
  return wrap;
}

function buildCard(r) {
  const id = String(r.id);
  const isClosed = !r.deliveryTimeMin || isNaN(parseInt(r.deliveryTimeMin));
  const isPinned = _pinFlags.get(id) ?? false;
  const fsa = _fsaRatings.get(id);
  const shared = _sharedAddressResults.get(id);

  const card = document.createElement('div');
  card.className = 'br-card br-match' + (isClosed ? ' br-card-closed' : '') + (isPinned ? ' br-card-pinned' : '');
  card.dataset.brId = id;

  // Image + overlay
  const img = document.createElement('div');
  img.className = 'br-card-img';

  const bg = document.createElement('div');
  bg.className = 'br-card-bg';
  if (r.imageUrl) bg.style.backgroundImage = `url(${r.imageUrl})`;
  img.appendChild(bg);

  const overlay = document.createElement('div');
  overlay.className = 'br-card-overlay';

  const badgeRow = document.createElement('div');
  badgeRow.className = 'br-badge-row';

  if (_settings.hygieneEnabled) {
    const fsaBadge = document.createElement('div');
    fsaBadge.className = 'br-fsa-badge';
    updateFsaBadge(fsaBadge, fsa, r);
    badgeRow.appendChild(fsaBadge);
  }

  if (_settings.sharedAddressEnabled && shared?.isSharedAddress) {
    badgeRow.appendChild(buildSharedBadge(shared));
  }

  overlay.appendChild(badgeRow);
  img.appendChild(overlay);

  // Pin button
  const pinBtn = document.createElement('button');
  pinBtn.className = 'br-pin-btn' + (isPinned ? ' br-pin-btn--active' : '');
  pinBtn.textContent = '📌';
  pinBtn.title = isPinned ? 'Unpin' : 'Pin to top';
  pinBtn.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    const nowPinned = !card.classList.contains('br-card-pinned');
    await setUserFlag(id, { isPinned: nowPinned });
    _pinFlags.set(id, nowPinned);
    card.classList.toggle('br-card-pinned', nowPinned);
    pinBtn.classList.toggle('br-pin-btn--active', nowPinned);
    pinBtn.title = nowPinned ? 'Unpin' : 'Pin to top';
    // Re-run current sort to update order values
    const currentSortChip = document.querySelector('.br-chip-sort .br-chip-option--active');
    const col = currentSortChip?.dataset.value ?? '';
    applyCardSort(col || null, SORT_DIRS[col] ?? 1);
  });
  img.appendChild(pinBtn);

  // Card link wraps image + body
  const link = document.createElement('a');
  link.className = 'br-card-link';
  link.href = r.href ?? '#';
  link.appendChild(img);

  // Body
  const body = document.createElement('div');
  body.className = 'br-card-body';

  const name = document.createElement('div');
  name.className = 'br-card-name';
  name.textContent = r.name ?? '';
  body.appendChild(name);

  const stats = document.createElement('div');
  stats.className = 'br-card-stats';
  if (r.rating)         stats.appendChild(stat(`★ ${r.rating}`));
  if (!isClosed && r.deliveryTimeMin) stats.appendChild(stat(`${r.deliveryTimeMin} min`));
  if (isClosed)         stats.appendChild(stat('Closed', 'br-stat-closed'));
  if (r.deliveryFee)    stats.appendChild(stat(r.deliveryFee));
  if (r.distance)       stats.appendChild(stat(r.distance));
  body.appendChild(stats);

  link.appendChild(body);
  card.appendChild(link);
  return card;
}

function stat(text, extraClass = '') {
  const s = document.createElement('span');
  s.className = 'br-card-stat' + (extraClass ? ` ${extraClass}` : '');
  s.textContent = text;
  return s;
}

function buildSharedBadge(shared) {
  const badge = document.createElement('div');
  badge.className = 'br-shared-badge';
  badge.textContent = 'Shared';
  badge.title = `Also here: ${shared.siblingNames.join(', ')}`;
  return badge;
}

function updateFsaBadge(el, fsa, r) {
  el.className = 'br-fsa-badge';
  if (fsa?.score != null) {
    el.textContent = `FSA ${fsa.score}/5`;
    const { bg, text } = fsaScoreColor(fsa.score);
    el.style.backgroundColor = bg;
    el.style.color = text;
    el.title = fsa.ratingDate ? `Last inspected: ${timeAgo(fsa.ratingDate)}` : '';
  } else if (r?.address1) {
    el.textContent = 'FSA —';
    el.style.backgroundColor = '#F5F5F5';
    el.style.color = '#888';
    el.title = 'No FSA rating found for this restaurant';
  } else {
    el.textContent = 'FSA ?';
    el.style.backgroundColor = 'rgba(0,0,0,0.35)';
    el.style.color = '#fff';
    el.title = 'Open this menu to load its FSA rating';
  }
}

// --- Sort helpers ---

function sortVal(r, col) {
  switch (col) {
    case 'name':     return r.name?.toLowerCase() ?? null;
    case 'rating':   { const n = parseFloat(r.rating); return isNaN(n) ? null : n; }
    case 'eta':      { const n = parseInt(r.deliveryTimeMin); return isNaN(n) ? null : n; }
    case 'fee':      { const n = parseFloat(String(r.deliveryFee ?? '').replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; }
    case 'fsa':      { const f = _fsaRatings.get(String(r.id)); return f?.score ?? null; }
    case 'distance': { const n = parseFloat(String(r.distance ?? '').replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; }
    default: return null;
  }
}

// --- Styles ---

function injectStyles() {
  if (document.getElementById('br-card-grid-styles')) return;
  const style = document.createElement('style');
  style.id = 'br-card-grid-styles';
  style.textContent = `
    #br-card-wrap {
      padding: 16px 16px 80px;
    }
    #br-card-grid {
      display: grid;
      grid-template-columns: repeat(var(--br-cols, 3), 1fr);
      gap: 16px;
    }
    .br-card {
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.1);
      transition: box-shadow 0.15s, transform 0.15s;
      position: relative;
    }
    .br-card:not(.br-match) { display: none; }
    .br-card:hover {
      box-shadow: 0 6px 20px rgba(0,0,0,0.14);
      transform: translateY(-2px);
    }
    .br-card-closed { opacity: 0.55; }
    .br-card-closed:hover { opacity: 0.72; }
    .br-card.br-scan-done { background: rgba(0,204,188,0.06); }
    .br-card-link { display: block; text-decoration: none; color: inherit; }
    .br-card-img {
      position: relative;
      width: 100%;
      padding-top: 56.25%;
      overflow: hidden;
      background-color: #e8e8e8;
    }
    .br-card-bg {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center;
    }
    body.br-blur-images .br-card-bg {
      filter: blur(6px);
      transform: scale(1.12);
    }
    .br-card-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 8px;
      background: linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 50%);
    }
    .br-badge-row { display: flex; gap: 5px; flex-wrap: wrap; }
    .br-fsa-badge, .br-shared-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 9999px;
      font-family: sans-serif;
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
      letter-spacing: 0.2px;
    }
    .br-shared-badge {
      background-color: #FFD54F;
      color: #7F4900;
    }
    .br-pin-btn {
      position: absolute;
      top: 6px;
      right: 6px;
      background: rgba(0,0,0,0.45);
      border: none;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.15s;
      padding: 0;
      z-index: 2;
    }
    .br-card:hover .br-pin-btn { opacity: 1; }
    .br-pin-btn--active { opacity: 1 !important; background: rgba(0,204,188,0.85); }
    .br-card-body { padding: 10px 12px 12px; }
    .br-card-name {
      font-size: 14px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: sans-serif;
    }
    .br-card-stats { display: flex; gap: 8px; flex-wrap: wrap; }
    .br-card-stat { font-size: 12px; color: #666; font-family: sans-serif; }
    .br-stat-closed { color: #e57373; font-weight: 600; }
    body.br-no-fsa .br-fsa-badge { display: none; }
    body.br-no-shared .br-shared-badge { display: none; }
  `;
  document.head.appendChild(style);
}

// --- Colour helpers ---

function fsaScoreColor(score) {
  if (score >= 5) return { bg: '#81C784', text: '#1B5E20' };
  if (score >= 4) return { bg: '#4DB6AC', text: '#004D40' };
  if (score >= 3) return { bg: '#FFD54F', text: '#7F4900' };
  if (score >= 2) return { bg: '#FFB74D', text: '#7A2E00' };
  return           { bg: '#E57373', text: '#7F0000' };
}
