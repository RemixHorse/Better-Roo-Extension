import { parseDetailRestaurant, parseDetailFsaRating } from '../shared/pageParser.js';

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
  return parseDetailRestaurant(getNextData());
}

export function readDetailFsaRating() {
  return parseDetailFsaRating(getNextData());
}
