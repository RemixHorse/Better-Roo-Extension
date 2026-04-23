import {
  getPageType,
  validateListingSchema,
  validateDetailSchema,
  readListingRestaurants,
  readDetailRestaurant,
  readDetailFsaRating,
} from './reader.js';
import {
  upsertRestaurant,
  getAllRestaurants,
  upsertFsaCache,
  clearAll,
} from './db.js';
import { detectSharedAddresses } from './matcher.js';
import { getFsaRatings } from './fsa.js';
import { injectFilterBar, updateScanStatus, updateFilterBarData, applyFiltersAndRender } from './ui/filterBar.js';
import { initCardGrid, refreshCard, applyGridSettings, reconcileCardGrid, getPinFlags } from './ui/cardGrid.js';
import { getGeohash, loadSnapshot, saveSnapshot, clearAllSnapshots } from './listingSnapshot.js';
import { injectDetailBadge } from './ui/detailBadge.js';
import { showSchemaBanner } from './ui/schemaBanner.js';
import { showTableSkeleton, refreshTableRow, markTableRowScanState } from './ui/table.js';
import { buildQueue, startScanner, stopScanner, getScannerState } from './scanner.js';

console.debug('[Better Roo] content script loaded')

// Module-level listing state — kept alive so scanner onTick callbacks can update it
let _listingRestaurants = [];
let _cachedOnly = [];
let _sharedAddressResults = new Map();
let _fsaRatings = new Map();
let _autoScanEnabled = false;
let _scanFast = false;

// --- Message handler ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SETTINGS_CHANGED') {
    applySettingsToCards(msg.settings);
    _scanFast = !!msg.settings.scanFast;
    const wasEnabled = _autoScanEnabled;
    _autoScanEnabled = !!msg.settings.autoScanEnabled;
    if (_autoScanEnabled && !wasEnabled && _listingRestaurants.length > 0) {
      launchScanner();
    } else if (!_autoScanEnabled && wasEnabled) {
      stopScanner();
      updateScanStatus(0, 0, null);
    }
  }
  if (msg.type === 'CLEAR_DATA') {
    stopScanner();
    updateScanStatus(0, 0, null);
    clearAllSnapshots();
    clearAll().then(() => {
      // Remove completion tints from all cards and rows
      document.querySelectorAll('[data-br-id].br-scan-done').forEach(el => el.classList.remove('br-scan-done'));
      document.querySelectorAll('#better-roo-table tr.br-scan-done').forEach(el => el.classList.remove('br-scan-done'));
      if (_autoScanEnabled && _listingRestaurants.length > 0) {
        _fsaRatings = new Map(); // reset in-memory ratings so queue rebuilds correctly
        launchScanner();
      }
    });
  }
});

// --- SPA navigation wiring ---

function patchHistory() {
  const orig = history.pushState.bind(history);
  history.pushState = function (...args) {
    orig(...args);
    onRouteChange(location.pathname);
  };
  window.addEventListener('popstate', () => onRouteChange(location.pathname));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    patchHistory();
    onRouteChange(location.pathname);
  });
} else {
  patchHistory();
  onRouteChange(location.pathname);
}

// --- Router ---

function onRouteChange(path) {
  if (path.startsWith('/restaurants/')) {
    handleListingPage();
  } else if (path.startsWith('/menu/')) {
    handleDetailPage();
  }
}

// --- Listing page ---

async function handleListingPage() {
  if (!validateListingSchema()) {
    showSchemaBanner();
    return;
  }

  stopScanner();

  // --- Pass 1: paint from localStorage snapshot if available ---
  const geohash = getGeohash();
  const snapshot = geohash ? loadSnapshot(geohash) : null;
  let snapshotUsed = false;

  if (snapshot) {
    const snapFsa = new Map(Object.entries(snapshot.fsaRatings));
    const snapShared = new Map(Object.entries(snapshot.sharedAddressResults));
    const snapPins = new Map(
      snapshot.restaurants.map(r => [String(r.id), snapshot.pinFlags[String(r.id)] ?? false])
    );
    await initCardGrid(snapshot.restaurants, snapShared, snapFsa, snapPins);
    injectFilterBar(snapshot.restaurants, snapShared, snapFsa);
    snapshotUsed = true;
  } else {
    // No snapshot — show skeleton while loading
    showTableSkeleton();
  }

  // --- Pass 2: fresh data from DOM + IDB (always runs) ---
  const fresh = readListingRestaurants();

  // Merge with any DB-cached address data from prior detail-page visits BEFORE upserting,
  // so listing-level fields don't overwrite address1/postcode written by handleDetailPage.
  const allCached = await getAllRestaurants();
  const cachedById = new Map(allCached.map(r => [r.id, r]));
  const enriched = fresh.map(r => ({ ...cachedById.get(r.id), ...r }));
  await Promise.all(enriched.map(r => upsertRestaurant(r)));

  // Include all DB-cached restaurants as potential siblings so previously-visited
  // restaurants (e.g. currently closed brands) still contribute to address matching.
  const enrichedIds = new Set(enriched.map(r => r.id));
  const cachedOnly = allCached.filter(r => !enrichedIds.has(r.id));
  const sharedAddressResults = detectSharedAddresses([...enriched, ...cachedOnly]);

  // Fetch FSA ratings — cache-first, background worker for misses
  const fsaRatings = await getFsaRatings(enriched);

  // Store state for scanner callbacks
  _listingRestaurants = enriched;
  _cachedOnly = cachedOnly;
  _sharedAddressResults = sharedAddressResults;
  _fsaRatings = fsaRatings;

  // Cache stats for popup
  const allForStats = await getAllRestaurants();
  chrome.storage.local.set({ brStats: { restaurantCount: allForStats.length, lastUpdated: Date.now() } });

  if (snapshotUsed) {
    reconcileCardGrid(enriched, sharedAddressResults, fsaRatings);
    updateFilterBarData({ restaurants: enriched, sharedAddressResults, fsaRatings });
    applyFiltersAndRender();
  } else {
    await initCardGrid(enriched, sharedAddressResults, fsaRatings);
    injectFilterBar(enriched, sharedAddressResults, fsaRatings);
  }

  // Save snapshot for next visit
  if (geohash) {
    saveSnapshot(geohash, enriched, fsaRatings, sharedAddressResults, getPinFlags());
  }

  const { autoScanEnabled, scanFast } = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  _autoScanEnabled = !!autoScanEnabled;
  _scanFast = !!scanFast;
  if (_autoScanEnabled) launchScanner();
}

async function launchScanner() {
  const allCached = await getAllRestaurants();
  const queue = buildQueue(_listingRestaurants, allCached, _fsaRatings);
  if (queue.length === 0) return;

  startScanner({ queue, intervalMs: _scanFast ? 1000 : 3000, onTick: onScanTick, onComplete: onScanComplete });
  updateScanStatus(0, queue.length, queue[0]?.name ?? null);
}

async function onScanTick(result) {
  const { restaurantId, restaurant, address1, score, ratingDate, skipped } = result;

  if (!skipped) {
    // Update restaurant if new data arrived
    if (restaurant) {
      await upsertRestaurant(restaurant);
      const idx = _listingRestaurants.findIndex(r => r.id === restaurantId);
      if (idx >= 0) {
        _listingRestaurants[idx] = { ..._listingRestaurants[idx], ...restaurant };
      }
    } else if (address1) {
      const idx = _listingRestaurants.findIndex(r => r.id === restaurantId);
      if (idx >= 0) {
        _listingRestaurants[idx] = { ..._listingRestaurants[idx], address1 };
      }
    }

    // Update FSA cache
    if (score !== null) {
      await upsertFsaCache({ restaurantId, score, ratingDate });
      _fsaRatings.set(restaurantId, { score, ratingDate });
    } else {
      // Ensure map has entry even for misses so queue won't re-add this restaurant
      if (!_fsaRatings.has(restaurantId)) _fsaRatings.set(restaurantId, { score: null, ratingDate: null });
    }

    // Re-run shared address detection over the full updated set
    const prevShared = _sharedAddressResults;
    _sharedAddressResults = detectSharedAddresses([..._listingRestaurants, ..._cachedOnly]);

    // Update filterBar internal state for next filter apply
    updateFilterBarData({ restaurants: _listingRestaurants, sharedAddressResults: _sharedAddressResults, fsaRatings: _fsaRatings });

    // Refresh badge for the scanned restaurant
    const r = _listingRestaurants.find(r => r.id === restaurantId);
    const fsaRating = _fsaRatings.get(restaurantId) ?? null;
    const sharedResult = _sharedAddressResults.get(restaurantId) ?? { isSharedAddress: false, siblingNames: [] };
    refreshCard(restaurantId, r, fsaRating, sharedResult);
    refreshTableRow(restaurantId, r, fsaRating, sharedResult);

    // Refresh any restaurant whose shared-address status changed
    for (const [id, newShared] of _sharedAddressResults) {
      if (id === restaurantId) continue;
      const old = prevShared.get(id);
      if (old?.isSharedAddress !== newShared.isSharedAddress ||
          JSON.stringify(old?.siblingNames) !== JSON.stringify(newShared.siblingNames)) {
        const sibling = _listingRestaurants.find(r => r.id === id);
        if (sibling) {
          refreshCard(id, sibling, _fsaRatings.get(id) ?? null, newShared);
          refreshTableRow(id, sibling, _fsaRatings.get(id) ?? null, newShared);
        }
      }
    }
  }

  const { scannedCount, totalCount, currentName } = getScannerState();
  updateScanStatus(scannedCount, totalCount, currentName);
  chrome.storage.local.set({
    brScanStats: { scanning: true, scannedCount, totalCount, lastScannedAt: Date.now(), currentName },
  });
}

function onScanComplete() {
  const { scannedCount, totalCount } = getScannerState();
  updateScanStatus(scannedCount, totalCount, null);
  chrome.storage.local.set({
    brScanStats: { scanning: false, scannedCount, totalCount, lastScannedAt: Date.now(), currentName: null },
  });
}

// --- Detail page ---

async function handleDetailPage() {
  if (!validateDetailSchema()) {
    showSchemaBanner();
    return;
  }

  const restaurant = readDetailRestaurant();
  await upsertRestaurant(restaurant);

  const fsaRating = readDetailFsaRating();
  if (fsaRating) {
    await upsertFsaCache({ restaurantId: restaurant.id, ...fsaRating });
  }

  injectDetailBadge(restaurant, fsaRating);
}

// --- Settings application ---

function applySettingsToCards(settings) {
  applyGridSettings(settings);
}

