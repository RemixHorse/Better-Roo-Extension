console.debug('[Better Roo] service worker started');

import { parseDetailRestaurant, parseDetailFsaRating } from '../shared/pageParser.js';

const FSA_API = 'https://api.ratings.food.gov.uk';
const FSA_HEADERS = { 'Accept': 'application/json; version=2', 'x-api-version': '2' };

const DEFAULT_SETTINGS = {
  hygieneEnabled: true,
  sharedAddressEnabled: true,
  tableViewDefault: false,
  blurCardImages: false,
  autoScanEnabled: true,
  scanFast: false,
  cardColumns: 4,
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FSA_LOOKUP') {
    handleFsaLookup(msg.restaurants).then(sendResponse);
    return true;
  }
  if (msg.type === 'SCAN_NEXT') {
    handleScanNext(msg).then(sendResponse);
    return true;
  }
  if (msg.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(DEFAULT_SETTINGS).then(sendResponse);
    return true;
  }
  if (msg.type === 'SET_SETTINGS') {
    chrome.storage.sync.get(DEFAULT_SETTINGS).then(current => {
      const merged = { ...current, ...msg.patch };
      chrome.storage.sync.set(merged).then(() => sendResponse(merged));
    });
    return true;
  }
});

// --- FSA lookup (existing) ---

async function handleFsaLookup(restaurants) {
  return Promise.all(restaurants.map(lookupOne));
}

async function lookupOne({ id, name, address1 }) {
  const postcode = extractPostcode(address1);
  if (!postcode) return { id, score: null, ratingDate: null };

  try {
    const url = `${FSA_API}/Establishments?name=${encodeURIComponent(name)}&address=${encodeURIComponent(postcode)}&pageSize=5`;
    const res = await fetch(url, { headers: FSA_HEADERS });
    if (!res.ok) return { id, score: null, ratingDate: null };

    const data = await res.json();
    const establishments = data.establishments ?? [];
    if (establishments.length === 0) return { id, score: null, ratingDate: null };

    const streetNum = extractStreetNumber(address1);
    const best = streetNum
      ? (establishments.find(e => e.AddressLine1?.includes(streetNum)) ?? establishments[0])
      : establishments[0];

    return {
      id,
      score: parseRatingValue(best.RatingValue),
      ratingDate: best.RatingDate ? new Date(best.RatingDate).getTime() : null,
    };
  } catch {
    return { id, score: null, ratingDate: null };
  }
}

// --- Auto-scan: fetch a single restaurant page and extract its data ---

async function handleScanNext({ restaurantId, href, name, address1 }) {
  // Restaurant already has an address — FSA lookup only
  if (address1) {
    const { score, ratingDate } = await lookupOne({ id: restaurantId, name, address1 });
    return { restaurantId, address1, score, ratingDate, skipped: false };
  }

  // No address — fetch the Deliveroo menu page to get it
  const pageData = await fetchRestaurantPage(href);
  if (!pageData) {
    return { restaurantId, address1: null, score: null, ratingDate: null, skipped: true };
  }

  const { restaurant, fsaRating } = pageData;

  // If the page had no embedded FSA rating, attempt an API lookup now we have the address
  let score = fsaRating?.score ?? null;
  let ratingDate = fsaRating?.ratingDate ?? null;
  if (score === null && restaurant.address1) {
    const apiResult = await lookupOne({ id: restaurantId, name: restaurant.name, address1: restaurant.address1 });
    score = apiResult.score;
    ratingDate = apiResult.ratingDate;
  }

  return { restaurantId, restaurant, address1: restaurant.address1, score, ratingDate, skipped: false };
}

async function fetchRestaurantPage(href) {
  try {
    const res = await fetch(`https://deliveroo.co.uk${href}`);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/__NEXT_DATA__[^>]*>([^<]+)<\/script>/);
    if (!match) return null;
    const nextData = JSON.parse(match[1]);
    return {
      restaurant: parseDetailRestaurant(nextData),
      fsaRating:  parseDetailFsaRating(nextData),
    };
  } catch {
    return null;
  }
}

// --- Helpers ---

function parseRatingValue(value) {
  if (value == null) return null;
  const n = parseInt(value, 10);
  if (!isNaN(n) && n >= 0 && n <= 5) return n;
  return null;
}

function extractPostcode(address1) {
  if (!address1) return null;
  const tokens = address1.trim().split(/\s+/);
  for (let len = 2; len >= 1; len--) {
    const candidate = tokens.slice(-len).join(' ');
    if (/^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i.test(candidate)) {
      return candidate.toUpperCase();
    }
  }
  return null;
}

function extractStreetNumber(address1) {
  if (!address1) return null;
  const match = address1.match(/\b(\d+)/);
  return match ? match[1] : null;
}
