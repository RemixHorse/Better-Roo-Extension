/**
 * Real data captured from deliveroo.co.uk on 2026-04-21.
 * Galitos Sevenoaks operates two brands from the same address.
 * Address strings differ across all three — the sub-brands prepend "The Galitos"
 * and spell out "high street" — but postcode TN131XJ is the shared matching key.
 */
export const galitos = {
  id: '770203',
  drn_id: 'b442858e-7059-43de-ab61-b4d192e94ebf',
  name: 'Galitos',
  address1: '145a High St, Royal Tunbridge Wells, TN131XJ',
  href: '/menu/Royal Tunbridge Wells/sevenoaks/galitos-piri-piri-sevenoakes',
};

export const bangtan = {
  id: '782277',
  drn_id: 'f2756c2d-eeb9-489c-b614-4352b5ef2b44',
  name: 'Bangtan - Korean Fried Chicken',
  address1: 'The Galitos 145A high street, Royal Tunbridge Wells, TN131XJ',
  href: '/menu/Royal Tunbridge Wells/sevenoaks/bangtan-korean-fried-chicken-at-galitos-sevenoaks',
};

export const sobeBurger = {
  id: '782300',
  drn_id: 'bc66c2c3-034b-43f3-8513-3d0c98e14767',
  name: 'SoBe Burger',
  address1: 'The Galitos 145A high street, Royal Tunbridge Wells, TN131XJ',
  href: '/menu/Royal Tunbridge Wells/sevenoaks/sobe-burger-at-galitos-sevenoaks',
};

export const allThree = [galitos, bangtan, sobeBurger];
