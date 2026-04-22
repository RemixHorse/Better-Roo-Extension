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
import { injectFilterBar } from './ui/filterBar.js';
import { initCardBadges } from './ui/cardBadge.js';
import { injectDetailBadge } from './ui/detailBadge.js';
import { showSchemaBanner } from './ui/schemaBanner.js';
import { showTableSkeleton } from './ui/table.js';

console.debug('[Better Roo] content script loaded')

// --- Message handler ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SETTINGS_CHANGED') {
    applySettingsToCards(msg.settings);
  }
  if (msg.type === 'CLEAR_DATA') {
    clearAll();
  }
});;

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

  // Fire skeleton immediately — runs concurrently with data loading below
  showTableSkeleton();

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

  // Cache stats for popup
  const allForStats = await getAllRestaurants();
  chrome.storage.local.set({ brStats: { restaurantCount: allForStats.length, lastUpdated: Date.now() } });

  injectFilterBar(enriched, sharedAddressResults, fsaRatings);
  initCardBadges(enriched, sharedAddressResults, fsaRatings);
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
  document.body.classList.toggle('br-no-fsa',     !settings.hygieneEnabled);
  document.body.classList.toggle('br-no-shared',  !settings.sharedAddressEnabled);
  document.body.classList.toggle('br-hide-promo',  !!settings.hidePromotionalGroups);
  document.body.classList.toggle('br-blur-images', !!settings.blurCardImages);
}

