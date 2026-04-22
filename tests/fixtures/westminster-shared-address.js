/**
 * Fictional Westminster addresses for testing shared address detection.
 * Whitehall Grill operates three brands from 10 Downing Street, SW1A 2AA.
 * Address strings differ across all three — sub-brands prepend "Whitehall Grill"
 * and spell out "downing street" — but postcode SW1A 2AA is the shared matching key.
 */
export const whitehallGrill = {
  id: '100001',
  drn_id: 'a1b2c3d4-e5f6-7890-ab12-cd34ef567890',
  name: 'Whitehall Grill',
  address1: '10 Downing St, Westminster, London, SW1A 2AA',
  href: '/menu/london/westminster/whitehall-grill',
};

export const bigBenBurger = {
  id: '100002',
  drn_id: 'b2c3d4e5-f6a7-8901-bc23-de45fg678901',
  name: 'Big Ben Burger',
  address1: 'Whitehall Grill 10 downing street, Westminster, London, SW1A 2AA',
  href: '/menu/london/westminster/big-ben-burger-at-whitehall-grill',
};

export const parliamentPizza = {
  id: '100003',
  drn_id: 'c3d4e5f6-a7b8-9012-cd34-ef56gh789012',
  name: 'Parliament Pizza',
  address1: 'Whitehall Grill 10 Downing Street, Westminster, London, SW1A 2AA',
  href: '/menu/london/westminster/parliament-pizza-at-whitehall-grill',
};

export const allThree = [whitehallGrill, bigBenBurger, parliamentPizza];
