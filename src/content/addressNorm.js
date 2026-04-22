const UK_POSTCODE_RE = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i;

const ABBREVIATIONS = {
  st: 'street', rd: 'road', ave: 'avenue', av: 'avenue',
  ln: 'lane', dr: 'drive', ct: 'court', pl: 'place',
  sq: 'square', blvd: 'boulevard', gdns: 'gardens', gdn: 'garden',
  cres: 'crescent', cl: 'close', hse: 'house', bldg: 'building',
};

export function extractPostcode(address1) {
  if (!address1) return null;
  const tokens = address1.trim().split(/\s+/);
  // postcode spans last two tokens (e.g. "TN13 1AA")
  for (let len = 2; len >= 1; len--) {
    const candidate = tokens.slice(-len).join(' ');
    if (UK_POSTCODE_RE.test(candidate)) {
      const upper = candidate.toUpperCase().replace(/\s+/, '');
      return upper.slice(0, -3) + ' ' + upper.slice(-3);
    }
  }
  return null;
}

export function extractStreetNumber(address1) {
  if (!address1) return null;
  const first = address1.trim().split(/\s+/)[0];
  // handle ranges like "146/148" or "146-148" → take first number
  const match = first.match(/^(\d+)/);
  return match ? match[1] : null;
}

export function normalise(address1) {
  if (!address1) return '';
  return address1
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .split(/\s+/)
    .map(t => ABBREVIATIONS[t] ?? t)
    .join(' ')
    .trim();
}
