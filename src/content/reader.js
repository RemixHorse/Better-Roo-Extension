import { extractPostcode } from './addressNorm.js';

function getNextData() {
  const el = document.getElementById('__NEXT_DATA__');
  if (!el) return null;
  try { return JSON.parse(el.textContent); } catch { return null; }
}

export function getPageType() {
  const p = window.location.pathname;
  if (p.startsWith('/restaurants/')) return 'listing';
  if (p.startsWith('/menu/')) return 'detail';
  return null;
}

export function validateListingSchema() {
  return !!getNextData()?.props?.initialState?.home?.feed?.results?.data;
}

export function validateDetailSchema() {
  return !!getNextData()?.props?.initialState?.menuPage?.menu?.metas?.root?.restaurant?.id;
}

export function readListingRestaurants() {
  const feed = getNextData().props.initialState.home.feed.results;
  const seen = new Set();
  const restaurants = [];

  for (const section of feed.data) {
    for (const block of (section.blocks || [])) {
      const d = block.data;
      if (!d?.['partner-name.content']) continue;
      const params = d['partner-card.on-tap']?.action?.parameters || {};
      const id = params.restaurant_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      restaurants.push({
        id,
        drn_id: params.partner_drn_id ?? null,
        brand_drn_id: params.brand_drn_id ?? null,
        name: d['partner-name.content']?.trim(),
        href: params.restaurant_href?.split('?')[0] ?? null,
        rating: d['partner-rating.content'] ?? null,
        ratingCount: d['partner-rating-count.content'] ?? null,
        distance: d['distance-presentational.content'] ?? null,
        deliveryTimeMin: d['home-units-delivery-time.content'] ?? null,
        deliveryTimeLabel: d['home-units-delivery-time-label.content'] ?? null,
        deliveryFee: d['partner-delivery-fee.content'] ?? null,
      });
    }
  }

  return restaurants;
}

export function readDetailRestaurant() {
  const r = getNextData().props.initialState.menuPage.menu.metas.root.restaurant;
  const loc = r.location ?? {};
  const addr = loc.address ?? {};

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

export function readDetailFsaRating() {
  const layoutGroups = getNextData()?.props?.initialState?.menuPage?.menu?.layoutGroups;
  if (!layoutGroups) return null;

  const block = findHygieneBlock(layoutGroups);
  if (!block) return null;

  const firstBlock = block.blocks?.[0];
  if (!firstBlock) return null;

  const imageUrl = firstBlock.image?.url ?? '';
  const scoreMatch = imageUrl.match(/fhrs_(\d+)@/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

  // walk lines/spans looking for "Last updated: ..." text
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
