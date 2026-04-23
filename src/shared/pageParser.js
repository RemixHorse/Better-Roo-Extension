import { extractPostcode } from '../content/addressNorm.js';

/**
 * Parses a restaurant record from a __NEXT_DATA__ object (detail page shape).
 * Accepts an already-parsed JS object — does not read from the DOM.
 */
export function parseDetailRestaurant(nextData) {
  const r = nextData.props.initialState.menuPage.menu.metas.root.restaurant;
  const addr = r.location?.address ?? {};
  return {
    id: r.id,
    drn_id: r.drnId ?? null,
    brand_drn_id: r.brandDrnId ?? null,
    name: r.name,
    uname: r.uname ?? null,
    address1: addr.address1 ?? null,
    postcode: extractPostcode(addr.address1),
    neighborhood: addr.neighborhood ?? null,
    city: addr.city ?? null,
  };
}

/**
 * Parses the FSA hygiene rating from a __NEXT_DATA__ object (detail page shape).
 * Returns { score, ratingDate } or null if no hygiene block is present.
 */
export function parseDetailFsaRating(nextData) {
  const layoutGroups = nextData?.props?.initialState?.menuPage?.menu?.layoutGroups;
  if (!layoutGroups) return null;

  const block = findHygieneBlock(layoutGroups);
  if (!block) return null;

  const firstBlock = block.blocks?.[0];
  if (!firstBlock) return null;

  const imageUrl = firstBlock.image?.url ?? '';
  const scoreMatch = imageUrl.match(/fhrs_(\d+)@/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

  let ratingDate = null;
  for (const line of (firstBlock.lines || [])) {
    for (const span of (line.spans || [])) {
      const m = span.text?.match(/Last updated:\s*(.+)/i);
      if (m) { ratingDate = new Date(m[1].trim()).getTime() || null; break; }
    }
    if (ratingDate) break;
  }

  return { score, ratingDate };
}

function findHygieneBlock(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.actionId === 'layout-list-hygiene-rating') return obj;
  for (const v of Object.values(obj)) {
    const found = findHygieneBlock(v);
    if (found) return found;
  }
  return null;
}
