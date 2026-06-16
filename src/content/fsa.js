import { getFsaCache, upsertFsaCache } from './db.js';

const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const FAILED_TTL_MS = 24 * 60 * 60 * 1000;      // 24 hours for failed lookups

/**
 * Returns FSA ratings from cache (including stale entries) and identifies expired entries
 * that need background refresh.
 *
 * - Valid cache entries are returned as-is.
 * - Expired entries still return their stale score (so badges never go blank)
 *   and are added to the `expired` array for the scanner to refresh.
 * - Restaurants with no cache entry and an address1 are sent for immediate batch lookup
 *   (first-visit scenario — small list, not a burst).
 *
 * @param {Array<{id, name, address1}>} restaurants
 * @returns {Promise<{ratings: Map<string, {score: number|null, ratingDate: number|null}>, expired: Array}>}
 */
export async function getFsaRatings(restaurants) {
  const ratings = new Map();
  const misses = [];    // no cache at all — first-time lookup needed
  const expired = [];   // have stale cache — scanner should refresh
  const now = Date.now();

  await Promise.all(restaurants.map(async r => {
    const cached = await getFsaCache(r.id);

    if (!cached) {
      // No cache entry at all — needs first lookup
      if (r.address1) misses.push(r);
      return;
    }

    const ttl = cached.failed ? FAILED_TTL_MS : CACHE_TTL_MS;
    const isExpired = (now - cached.cachedAt) >= ttl;

    if (!isExpired) {
      // Valid cache — use it
      if (cached.score !== null) {
        ratings.set(r.id, { score: cached.score, ratingDate: cached.ratingDate });
      } else if (!cached.failed) {
        // Confirmed no-record (noRecord: true) — show "—"
        ratings.set(r.id, { score: null, ratingDate: null });
      }
      // failed entries within 24h: don't add to ratings map (shows "?" until retry)
      return;
    }

    // Expired — return stale value so badges don't go blank, but queue for refresh
    if (cached.score !== null) {
      ratings.set(r.id, { score: cached.score, ratingDate: cached.ratingDate });
    } else if (!cached.failed) {
      ratings.set(r.id, { score: null, ratingDate: null });
    }
    if (r.address1) expired.push(r);
  }));

  // First-time lookups — batch call (only truly new restaurants, not expired ones)
  if (misses.length > 0) {
    try {
      const results = await chrome.runtime.sendMessage({
        type: 'FSA_LOOKUP',
        restaurants: misses.map(r => ({ id: r.id, name: r.name, address1: r.address1 })),
      });

      await Promise.all(results.map(async ({ id, score, ratingDate, noRecord, failed }) => {
        await upsertFsaCache({ restaurantId: id, score, ratingDate, noRecord: !!noRecord, failed: !!failed });
        if (!failed || score !== null) {
          ratings.set(id, { score, ratingDate });
        }
      }));
    } catch (err) {
      console.warn('[Better Roo] FSA lookup failed:', err);
      // Mark all as failed with 24h TTL
      await Promise.all(misses.map(async r => {
        await upsertFsaCache({ restaurantId: r.id, score: null, ratingDate: null, noRecord: false, failed: true });
      }));
      misses.forEach(r => ratings.set(r.id, { score: null, ratingDate: null }));
    }
  }

  return { ratings, expired };
}
