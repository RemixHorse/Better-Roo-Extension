// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import {
  getPageType,
  validateListingSchema,
  validateDetailSchema,
  readListingRestaurants,
  readDetailRestaurant,
  readDetailFsaRating,
} from '../src/content/reader.js';

// Helper: set the __NEXT_DATA__ script tag content
function setNextData(data) {
  let el = document.getElementById('__NEXT_DATA__');
  if (!el) {
    el = document.createElement('script');
    el.id = '__NEXT_DATA__';
    el.type = 'application/json';
    document.head.appendChild(el);
  }
  el.textContent = data ? JSON.stringify(data) : '';
}

function clearNextData() {
  document.getElementById('__NEXT_DATA__')?.remove();
}

// Minimal valid listing __NEXT_DATA__
function makeListingData(overrides = {}) {
  return {
    props: {
      initialState: {
        home: {
          feed: {
            results: {
              data: [
                {
                  blocks: [
                    {
                      data: {
                        'partner-name.content': 'Wagamama',
                        'partner-rating.content': '4.4',
                        'partner-rating-count.content': '(500+)',
                        'distance-presentational.content': '0.6 mi',
                        'home-units-delivery-time.content': '15',
                        'partner-delivery-fee.content': '£0 delivery fee',
                        'partner-card.on-tap': {
                          action: {
                            parameters: {
                              restaurant_id: 71729,
                              partner_drn_id: 'uuid-1',
                              brand_drn_id: 'brand-uuid-1',
                              restaurant_href: '/menu/city/area/wagamama?foo=bar',
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              ],
              ...overrides,
            },
          },
        },
      },
    },
  };
}

// Minimal valid detail __NEXT_DATA__
function makeDetailData({ fsaBlock = true } = {}) {
  const layoutGroups = fsaBlock
    ? {
        actionId: 'layout-list-hygiene-rating',
        blocks: [
          {
            image: { url: 'https://ow.roocdn.com/assets/images/fsa/fhrs_5@3x.png', altText: 'rating is 5 out of 5' },
            lines: [{ spans: [{ text: 'Last updated: 18 Apr 2026' }] }],
          },
        ],
      }
    : {};

  return {
    props: {
      initialState: {
        menuPage: {
          menu: {
            metas: {
              root: {
                restaurant: {
                  id: 71729,
                  name: 'Wagamama - Sevenoaks',
                  uname: 'wagamama-sevenoaks',
                  drnId: 'uuid-1',
                  brandDrnId: 'brand-uuid-1',
                  location: {
                    address: {
                      address1: '138 High St., Royal Tunbridge Wells, TN13 1XE',
                      neighborhood: 'Sevenoaks',
                      city: 'royal-tunbridge-wells',
                    },
                  },
                },
              },
            },
            layoutGroups,
          },
        },
      },
    },
  };
}

function setPathname(path) {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, pathname: path },
  });
}

describe('getPageType', () => {
  it('returns listing for /restaurants/ paths', () => {
    setPathname('/restaurants/royal-tunbridge-wells/sevenoaks');
    expect(getPageType()).toBe('listing');
  });

  it('returns detail for /menu/ paths', () => {
    setPathname('/menu/royal-tunbridge-wells/sevenoaks/wagamama');
    expect(getPageType()).toBe('detail');
  });

  it('returns null for unrecognised paths', () => {
    setPathname('/account/profile');
    expect(getPageType()).toBe(null);
  });
});

describe('validateListingSchema', () => {
  afterEach(clearNextData);

  it('returns true for valid listing shape', () => {
    setNextData(makeListingData());
    expect(validateListingSchema()).toBe(true);
  });

  it('returns false when feed.results missing', () => {
    setNextData({ props: { initialState: { home: { feed: {} } } } });
    expect(validateListingSchema()).toBe(false);
  });

  it('returns false when __NEXT_DATA__ absent', () => {
    clearNextData();
    expect(validateListingSchema()).toBe(false);
  });
});

describe('validateDetailSchema', () => {
  afterEach(clearNextData);

  it('returns true for valid detail shape', () => {
    setNextData(makeDetailData());
    expect(validateDetailSchema()).toBe(true);
  });

  it('returns false when restaurant id missing', () => {
    setNextData({ props: { initialState: { menuPage: { menu: { metas: { root: { restaurant: {} } } } } } } });
    expect(validateDetailSchema()).toBe(false);
  });

  it('returns false when __NEXT_DATA__ absent', () => {
    clearNextData();
    expect(validateDetailSchema()).toBe(false);
  });
});

describe('readListingRestaurants', () => {
  afterEach(clearNextData);

  it('returns normalised restaurants', () => {
    setNextData(makeListingData());
    const results = readListingRestaurants();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 71729,
      name: 'Wagamama',
      drn_id: 'uuid-1',
      href: '/menu/city/area/wagamama',
      rating: '4.4',
      deliveryTimeMin: '15',
    });
  });

  it('deduplicates repeated restaurant blocks', () => {
    const data = makeListingData();
    data.props.initialState.home.feed.results.data[0].blocks.push(
      data.props.initialState.home.feed.results.data[0].blocks[0]
    );
    setNextData(data);
    expect(readListingRestaurants()).toHaveLength(1);
  });

  it('skips blocks without partner-name', () => {
    const data = makeListingData();
    data.props.initialState.home.feed.results.data[0].blocks.push({ data: { 'some-other-key': 'value' } });
    setNextData(data);
    expect(readListingRestaurants()).toHaveLength(1);
  });
});

describe('readDetailRestaurant', () => {
  afterEach(clearNextData);

  it('returns restaurant with address fields', () => {
    setNextData(makeDetailData());
    const r = readDetailRestaurant();
    expect(r).toMatchObject({
      id: 71729,
      name: 'Wagamama - Sevenoaks',
      postcode: 'TN13 1XE',
      neighborhood: 'Sevenoaks',
    });
  });
});

describe('readDetailFsaRating', () => {
  afterEach(clearNextData);

  it('extracts score and date from hygiene block', () => {
    setNextData(makeDetailData({ fsaBlock: true }));
    const result = readDetailFsaRating();
    expect(result.score).toBe(5);
    expect(result.ratingDate).toBe(new Date('18 Apr 2026').getTime());
  });

  it('returns null when hygiene block absent', () => {
    setNextData(makeDetailData({ fsaBlock: false }));
    expect(readDetailFsaRating()).toBeNull();
  });

  it('returns null when __NEXT_DATA__ absent', () => {
    clearNextData();
    expect(readDetailFsaRating()).toBeNull();
  });
});
