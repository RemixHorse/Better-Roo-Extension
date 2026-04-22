const DB_NAME = 'better-roo';
const DB_VERSION = 1;

let _db = null;

function openDb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('restaurants')) {
        db.createObjectStore('restaurants', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('fsa_cache')) {
        db.createObjectStore('fsa_cache', { keyPath: 'restaurantId' });
      }
      if (!db.objectStoreNames.contains('user_flags')) {
        db.createObjectStore('user_flags', { keyPath: 'restaurantId' });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export function upsertRestaurant(r) {
  return tx('restaurants', 'readwrite', s => s.put({ ...r, lastSeen: Date.now() }));
}

export function getRestaurant(id) {
  return tx('restaurants', 'readonly', s => s.get(id));
}

export function getAllRestaurants() {
  return openDb().then(db => new Promise((resolve, reject) => {
    const req = db.transaction('restaurants', 'readonly').objectStore('restaurants').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export function upsertFsaCache(entry) {
  return tx('fsa_cache', 'readwrite', s => s.put({ ...entry, cachedAt: Date.now() }));
}

export function getFsaCache(restaurantId) {
  return tx('fsa_cache', 'readonly', s => s.get(restaurantId));
}

export function getUserFlag(restaurantId) {
  return tx('user_flags', 'readonly', s => s.get(restaurantId));
}

export function setUserFlag(restaurantId, patch) {
  return tx('user_flags', 'readwrite', s => s.put({ restaurantId, ...patch }));
}

export function clearAll() {
  return openDb().then(db => Promise.all(
    ['restaurants', 'fsa_cache', 'user_flags'].map(name =>
      new Promise((resolve, reject) => {
        const req = db.transaction(name, 'readwrite').objectStore(name).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
    )
  ));
}
