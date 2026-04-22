import { getFsaCache, upsertFsaCache } from './db.js';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Returns a map of restaurantId → { score, ratingDate } for the given restaurants.
 * Hits IndexedDB cache first; sends uncached entries to the background service worker.
 *
 * @param {Array<{id, name, address1}>} restaurants
 * @returns {Promise<Map<string, {score: number|null, ratingDate: string|null}>>}
 */
export async function getFsaRatings(restaurants) {
  const resultMap = new Map();
  const misses = [];
  const now = Date.now();

  await Promise.all(restaurants.map(async r => {
    const cached = await getFsaCache(r.id);
    if (cached && cached.score !== null && (now - cached.cachedAt) < CACHE_TTL_MS) {
      resultMap.set(r.id, { score: cached.score, ratingDate: cached.ratingDate });
    } else if (r.address1) {
      // Only attempt lookup if we have an address to search with
      misses.push(r);
    }
  }));

  if (misses.length === 0) return resultMap;

  try {
    const results = await chrome.runtime.sendMessage({
      type: 'FSA_LOOKUP',
      restaurants: misses.map(r => ({ id: r.id, name: r.name, address1: r.address1 })),
    });

    await Promise.all(results.map(async ({ id, score, ratingDate }) => {
      if (score !== null) {
        await upsertFsaCache({ restaurantId: id, score, ratingDate });
      }
      resultMap.set(id, { score, ratingDate });
    }));
  } catch (err) {
    console.warn('[Better Roo] FSA lookup failed:', err);
    misses.forEach(r => resultMap.set(r.id, { score: null, ratingDate: null }));
  }

  return resultMap;
}
