const TTL = 24 * 60 * 60 * 1000;
const PREFIX = 'br-listing-';

export function getGeohash() {
  return new URLSearchParams(window.location.search).get('geohash') ?? null;
}

export function saveSnapshot(geohash, restaurants, fsaRatings, sharedAddressResults, pinFlags) {
  const snapshot = {
    geohash,
    savedAt: Date.now(),
    restaurants: restaurants.map(r => ({
      id: r.id, name: r.name, href: r.href, imageUrl: r.imageUrl ?? null,
      rating: r.rating ?? null, ratingCount: r.ratingCount ?? null,
      deliveryTimeMin: r.deliveryTimeMin ?? null, deliveryTimeLabel: r.deliveryTimeLabel ?? null,
      deliveryFee: r.deliveryFee ?? null, distance: r.distance ?? null,
      address1: r.address1 ?? null,
    })),
    fsaRatings: Object.fromEntries(fsaRatings),
    sharedAddressResults: Object.fromEntries(
      [...sharedAddressResults].map(([id, v]) => [id, { isSharedAddress: v.isSharedAddress, siblingNames: v.siblingNames }])
    ),
    pinFlags: Object.fromEntries([...pinFlags].filter(([, v]) => v)),
  };
  try {
    localStorage.setItem(PREFIX + geohash, JSON.stringify(snapshot));
  } catch {
    // QuotaExceededError — silently ignore
  }
}

export function loadSnapshot(geohash) {
  try {
    const raw = localStorage.getItem(PREFIX + geohash);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (snap.geohash !== geohash) return null;
    if (Date.now() - snap.savedAt > TTL) return null;
    return snap;
  } catch {
    return null;
  }
}

export function clearAllSnapshots() {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}
