let _timeoutId = null;
let _running = false;
let _scannedCount = 0;
let _totalCount = 0;
let _currentName = null;

/**
 * Builds an ordered scan queue from listing + cached restaurant data.
 * P1: listing restaurants with address1 but no FSA result yet
 * P2: listing restaurants without address1
 * P3: DB-cached restaurants (not in listing) without address1
 */
export function buildQueue(listingRestaurants, allCached, fsaRatings) {
  const listingIds = new Set(listingRestaurants.map(r => r.id));
  const p1 = [], p2 = [], p3 = [];

  for (const r of listingRestaurants) {
    if (r.address1) {
      if (fsaRatings.get(r.id) === undefined) p1.push(r);
    } else {
      p2.push(r);
    }
  }

  for (const r of allCached) {
    if (!listingIds.has(r.id) && !r.address1) p3.push(r);
  }

  return [...p1, ...p2, ...p3];
}

export function startScanner({ queue, intervalMs = 3000, onBeforeTick, onTick, onComplete }) {
  stopScanner();
  if (queue.length === 0) { onComplete?.(); return; }

  _running = true;
  _scannedCount = 0;
  _totalCount = queue.length;
  _currentName = null;

  const remaining = [...queue];

  async function tick() {
    if (!_running) return;
    if (remaining.length === 0) {
      _running = false;
      _currentName = null;
      onComplete?.();
      return;
    }

    const item = remaining.shift();
    _currentName = item.name;
    onBeforeTick?.(item);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'SCAN_NEXT',
        restaurantId: item.id,
        href: item.href,
        name: item.name,
        address1: item.address1 ?? null,
      });
      _scannedCount++;
      onTick?.(result);
    } catch {
      _scannedCount++;
    }

    if (!_running) return;

    _currentName = remaining[0]?.name ?? null;

    if (remaining.length === 0) {
      _running = false;
      _currentName = null;
      onComplete?.();
    } else {
      _timeoutId = setTimeout(tick, intervalMs);
    }
  }

  tick();
}

export function stopScanner() {
  if (_timeoutId !== null) {
    clearTimeout(_timeoutId);
    _timeoutId = null;
  }
  _running = false;
  _currentName = null;
}

export function getScannerState() {
  return { running: _running, scannedCount: _scannedCount, totalCount: _totalCount, currentName: _currentName };
}
