import { getUserFlag, setUserFlag } from '../db.js';
import { showInfoModal } from './modal.js';

let _hrefToRestaurant = new Map(); // normalizedPath → restaurant object
let _sharedAddressResults = new Map();
let _fsaRatings = new Map();
let _settings = { hygieneEnabled: true, sharedAddressEnabled: true };
let _observer = null;
let _filteredIds = null; // null = show all; Set<string> = active filter

// --- Public API ---

export async function initCardBadges(restaurants, sharedAddressResults, fsaRatings) {
  _sharedAddressResults = sharedAddressResults;
  _fsaRatings = fsaRatings;
  _hrefToRestaurant = new Map(
    restaurants.filter(r => r.href).map(r => [normalizePath(r.href), r])
  );

  const stored = await chrome.storage.sync.get({ hygieneEnabled: true, sharedAddressEnabled: true, hidePromotionalGroups: true, blurCardImages: false });
  _settings = stored;

  document.body.classList.toggle('br-no-fsa',      !_settings.hygieneEnabled);
  document.body.classList.toggle('br-no-shared',   !_settings.sharedAddressEnabled);
  document.body.classList.toggle('br-hide-promo',   !!_settings.hidePromotionalGroups);
  document.body.classList.toggle('br-blur-images',  !!_settings.blurCardImages);

  injectBadgeStyles();
  badgeAllVisible();
  startObserver();
}

export function applyCardVisibility(filteredRestaurants) {
  _filteredIds = new Set(filteredRestaurants.map(r => String(r.id)));
  document.querySelectorAll('[data-br-id]').forEach(el => {
    el.classList.toggle('br-card-dimmed', !_filteredIds.has(el.dataset.brId));
  });
}

export function reorderPinnedCards() {
  const grid = document.querySelector('[class*="HomeFeedGrid"]:not([class*="HomeFeedGrid-f"])');
  if (!grid) return;
  // Move each grid row that contains a pinned card to the front
  document.querySelectorAll('[data-br-pinned="true"]').forEach(cardRoot => {
    const row = cardRoot.closest('li');
    if (row && row.parentElement === grid) grid.insertBefore(row, grid.firstChild);
  });
}

// --- Badging ---

function badgeAllVisible() {
  document.querySelectorAll('a[href*="/menu/"]:not([data-br-badged])').forEach(badgeCard);
}

function badgeCard(anchor) {
  if (anchor.dataset.brBadged) return;

  const path = normalizePath(new URL(anchor.href).pathname);
  const restaurant = _hrefToRestaurant.get(path);
  if (!restaurant) return;

  const id = String(restaurant.id);

  // Tag the card root for badge injection and visibility dimming
  const root = anchor.closest('[class*="HomeFeedUIRooBlock"]') ?? anchor.parentElement;
  root.dataset.brId = id;
  if (_filteredIds !== null) {
    root.classList.toggle('br-card-dimmed', !_filteredIds.has(id));
  }

  // Find the image wrapper — if not ready yet, leave brBadged unset so the observer retries
  const imgDiv = anchor.querySelector('[style*="background-image"]');
  const imgWrapper = imgDiv?.parentElement;
  if (!imgWrapper) return;

  anchor.dataset.brBadged = '1';

  imgWrapper.style.position = 'relative';
  imgWrapper.style.overflow = 'hidden';
  imgWrapper.style.isolation = 'isolate';

  // Shared bottom-left row for FSA + shared address pills
  const badgeRow = document.createElement('div');
  badgeRow.className = 'br-badge-row';
  imgWrapper.appendChild(badgeRow);

  // FSA badge
  if (_settings.hygieneEnabled) {
    const fsa = _fsaRatings.get(id);
    const fsaBadge = document.createElement('div');
    fsaBadge.className = 'br-fsa-badge';

    if (fsa?.score != null) {
      fsaBadge.textContent = `FSA ${fsa.score}/5`;
      const { bg, text } = fsaScoreColor(fsa.score);
      fsaBadge.style.backgroundColor = bg;
      fsaBadge.style.color = text;
    } else if (restaurant.address1) {
      fsaBadge.textContent = 'FSA —';
      fsaBadge.style.backgroundColor = '#F5F5F5';
      fsaBadge.style.color = '#888';
      fsaBadge.title = 'No FSA rating found for this restaurant';
    } else {
      fsaBadge.textContent = 'FSA ?';
      fsaBadge.style.backgroundColor = '#F5F5F5';
      fsaBadge.style.color = '#424242';
      fsaBadge.title = 'Open this menu to load its FSA rating';
      fsaBadge.classList.add('br-fsa-badge--unknown');
      fsaBadge.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        showInfoModal();
      });
    }

    badgeRow.appendChild(fsaBadge);
  }

  // Shared address badge
  if (_settings.sharedAddressEnabled) {
    const shared = _sharedAddressResults.get(id);
    if (shared?.isSharedAddress) {
      const sharedBadge = document.createElement('div');
      sharedBadge.className = 'br-shared-badge';
      sharedBadge.textContent = 'Shared Address';
      sharedBadge.title = `Also here: ${shared.siblingNames.join(', ')}`;
      sharedBadge.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
      badgeRow.appendChild(sharedBadge);
    }
  }

  // Pin button
  getUserFlag(id).then(flag => {
    const isPinned = !!flag?.isPinned;
    if (isPinned) root.dataset.brPinned = 'true';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'br-pin-btn' + (isPinned ? ' br-pin-btn--active' : '');
    pinBtn.textContent = '📌';
    pinBtn.title = isPinned ? 'Unpin' : 'Pin to top';
    pinBtn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      const nowPinned = !root.dataset.brPinned;
      await setUserFlag(id, { isPinned: nowPinned });
      root.dataset.brPinned = nowPinned ? 'true' : '';
      pinBtn.classList.toggle('br-pin-btn--active', nowPinned);
      pinBtn.title = nowPinned ? 'Unpin' : 'Pin to top';
      reorderPinnedCards();
    });
    imgWrapper.appendChild(pinBtn);
  });
}

function startObserver() {
  if (_observer) _observer.disconnect();
  const grid = document.querySelector('[class*="HomeFeedGrid"]');
  if (!grid) return;
  _observer = new MutationObserver(() => {
    document.querySelectorAll('a[href*="/menu/"]:not([data-br-badged])').forEach(badgeCard);
  });
  _observer.observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
}

// --- Styles ---

function injectBadgeStyles() {
  if (document.getElementById('better-roo-badge-styles')) return;
  const style = document.createElement('style');
  style.id = 'better-roo-badge-styles';
  style.textContent = `
    .br-badge-row {
      position: absolute;
      bottom: 8px;
      left: 8px;
      display: flex;
      gap: 6px;
      align-items: center;
      z-index: 10;
    }
    .br-fsa-badge, .br-shared-badge {
      font-size: 12px;
      font-weight: 700;
      padding: 5px 10px;
      border-radius: 9999px;
      font-family: sans-serif;
      pointer-events: none;
      box-shadow: 0 1px 4px rgba(0,0,0,0.2);
      letter-spacing: 0.2px;
    }
    .br-shared-badge {
      background-color: #FFD54F;
      color: #7F4900;
      pointer-events: auto;
      cursor: default;
    }
    body.br-blur-images [data-br-id] [style*="background-image"] {
      filter: blur(6px);
      transform: scale(1.08);
    }
    .br-pin-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      background: rgba(0,0,0,0.55);
      border: none;
      border-radius: 50%;
      width: 26px;
      height: 26px;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      opacity: 0;
      transition: opacity 0.15s;
      padding: 0;
    }
    [data-br-id]:hover .br-pin-btn {
      opacity: 1;
    }
    .br-pin-btn--active {
      opacity: 1 !important;
      background: rgba(0, 204, 188, 0.85);
    }
    body.br-no-fsa    .br-fsa-badge    { display: none; }
    body.br-no-shared .br-shared-badge { display: none; }
    .br-fsa-badge--unknown { cursor: pointer; pointer-events: auto; }
    .br-fsa-badge--unknown:hover { background: #e0e0e0 !important; }
    .br-card-dimmed { opacity: 0.25; pointer-events: none; transition: opacity 0.2s; }
    body.br-hide-promo [class*="HomeFeedGrid"] > [class*="HomeFeedGrid"]:has([class*="Carousel"]) { display: none !important; }
  `;
  document.head.appendChild(style);
}

// --- Helpers ---

function normalizePath(path) {
  try { return decodeURIComponent(path).toLowerCase().replace(/\/$/, ''); }
  catch { return path.toLowerCase(); }
}

function fsaScoreColor(score) {
  if (score >= 5) return { bg: '#81C784', text: '#1B5E20' }; // green  — excellent
  if (score >= 4) return { bg: '#4DB6AC', text: '#004D40' }; // teal   — good
  if (score >= 3) return { bg: '#FFD54F', text: '#7F4900' }; // amber  — acceptable
  if (score >= 2) return { bg: '#FFB74D', text: '#7A2E00' }; // orange — improvement needed
  return           { bg: '#E57373', text: '#7F0000' };        // red    — urgent / 0–1
}
