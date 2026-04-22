import { extractPostcode } from './addressNorm.js';

/**
 * @typedef {{ isSharedAddress: boolean, siblingNames: string[] }} AddressResult
 *
 * @param {Array<{id: string, name: string, address1: string}>} restaurants
 * @returns {Map<string, AddressResult>}
 */
export function detectSharedAddresses(restaurants) {
  const parsed = restaurants.map(r => ({
    ...r,
    _postcode:     extractPostcode(r.address1),
    _streetNumber: extractStreetNumberAnywhere(r.address1),
  }));

  // Group by normalised (postcode, streetNumber) key
  const groups = new Map();
  for (const r of parsed) {
    if (!r._postcode || !r._streetNumber) continue;
    const key = `${r._postcode}|${r._streetNumber}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const results = new Map();
  for (const r of parsed) {
    if (!r._postcode || !r._streetNumber) {
      results.set(r.id, { isSharedAddress: false, siblingNames: [] });
      continue;
    }
    const key = `${r._postcode}|${r._streetNumber}`;
    const siblings = (groups.get(key) ?? [])
      .filter(o => o.id !== r.id)
      .map(o => o.name);
    results.set(r.id, { isSharedAddress: siblings.length > 0, siblingNames: siblings });
  }

  return results;
}

// First numeric token anywhere in the address string
function extractStreetNumberAnywhere(address1) {
  if (!address1) return null;
  const match = address1.match(/\b(\d+)[a-zA-Z]?\b/);
  return match ? match[1] : null;
}
