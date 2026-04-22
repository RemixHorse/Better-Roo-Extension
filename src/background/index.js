console.debug('[Better Roo] service worker started');

const FSA_API = 'https://api.ratings.food.gov.uk';
const FSA_HEADERS = { 'Accept': 'application/json; version=2', 'x-api-version': '2' };

const DEFAULT_SETTINGS = {
  hygieneEnabled: true,
  sharedAddressEnabled: true,
  tableViewDefault: false,
  hidePromotionalGroups: true,
  blurCardImages: false,
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FSA_LOOKUP') {
    handleFsaLookup(msg.restaurants).then(sendResponse);
    return true; // async response
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

async function handleFsaLookup(restaurants) {
  const results = await Promise.all(restaurants.map(lookupOne));
  return results;
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

    // Pick best match: prefer same street number, fall back to first result
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

function parseRatingValue(value) {
  if (value == null) return null;
  const n = parseInt(value, 10);
  if (!isNaN(n) && n >= 0 && n <= 5) return n;
  return null; // "Exempt", "AwaitingInspection", etc.
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
