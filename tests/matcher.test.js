import { describe, it, expect } from 'vitest';
import { detectSharedAddresses } from '../src/content/matcher.js';
import { allThree, whitehallGrill, bigBenBurger, parliamentPizza } from './fixtures/westminster-shared-address.js';

/**
 * Fictional shared address cluster — Whitehall Grill, Westminster.
 * All three restaurants share postcode SW1A 2AA + street number 10,
 * despite different address string formats.
 */

// --- Parliament Street false-positive guard ---
// Same postcode, DIFFERENT street numbers → no match
const pizzaUno = {
  id: 'PU1', name: 'Pizza Uno',
  address1: '2 Parliament Street, Westminster, London, SW1A 2NH',
  href: '/menu/london/westminster/pizza-uno',
};
const hattusa = {
  id: 'HAT1', name: 'Hattusa',
  address1: '4 Parliament Street, Westminster, London, SW1A 2NH',
  href: '/menu/london/westminster/hattusa',
};
const stationElKervan = {
  id: 'ELK2', name: 'El Kervan',
  address1: '8 Parliament Street, Westminster, London, SW1A 2NH',
  href: '/menu/london/westminster/el-kervan',
};

// --- No address data ---
const noAddress = {
  id: 'NA1', name: 'No Address Place',
  address1: null,
  href: '/menu/somewhere/no-address',
};

describe('detectSharedAddresses — Whitehall Grill / Big Ben Burger / Parliament Pizza cluster', () => {
  it('flags all three as shared address', () => {
    const res = detectSharedAddresses(allThree);
    expect(res.get(whitehallGrill.id).isSharedAddress).toBe(true);
    expect(res.get(bigBenBurger.id).isSharedAddress).toBe(true);
    expect(res.get(parliamentPizza.id).isSharedAddress).toBe(true);
  });

  it('lists correct siblings for Whitehall Grill', () => {
    const siblings = detectSharedAddresses(allThree).get(whitehallGrill.id).siblingNames;
    expect(siblings).toContain('Big Ben Burger');
    expect(siblings).toContain('Parliament Pizza');
    expect(siblings).not.toContain('Whitehall Grill');
  });

  it('lists correct siblings for Big Ben Burger', () => {
    const siblings = detectSharedAddresses(allThree).get(bigBenBurger.id).siblingNames;
    expect(siblings).toContain('Whitehall Grill');
    expect(siblings).toContain('Parliament Pizza');
    expect(siblings).not.toContain('Big Ben Burger');
  });

  it('matches despite different address string formats', () => {
    expect(whitehallGrill.address1).not.toBe(bigBenBurger.address1);
    expect(detectSharedAddresses(allThree).get(whitehallGrill.id).isSharedAddress).toBe(true);
  });

  it('Whitehall Grill alone is not flagged', () => {
    const res = detectSharedAddresses([whitehallGrill]);
    expect(res.get(whitehallGrill.id).isSharedAddress).toBe(false);
    expect(res.get(whitehallGrill.id).siblingNames).toHaveLength(0);
  });
});

describe('detectSharedAddresses — Parliament Street false-positive guard', () => {
  it('does not flag restaurants sharing only a postcode with different street numbers', () => {
    const res = detectSharedAddresses([pizzaUno, hattusa, stationElKervan]);
    expect(res.get(pizzaUno.id).isSharedAddress).toBe(false);
    expect(res.get(hattusa.id).isSharedAddress).toBe(false);
    expect(res.get(stationElKervan.id).isSharedAddress).toBe(false);
  });
});

describe('detectSharedAddresses — edge cases', () => {
  it('restaurant with no address data is not flagged', () => {
    const res = detectSharedAddresses([...allThree, noAddress]);
    expect(res.get(noAddress.id).isSharedAddress).toBe(false);
    expect(res.get(noAddress.id).siblingNames).toHaveLength(0);
  });

  it('does not flag a restaurant at a unique address', () => {
    const unrelated = {
      id: '999999', name: 'Unique Place',
      address1: '1 Buckingham Palace Road, Westminster, London, SW1W 0PP',
      href: '/menu/london/westminster/unique-place',
    };
    const res = detectSharedAddresses([...allThree, unrelated]);
    expect(res.get('999999').isSharedAddress).toBe(false);
  });

  it('two restaurants at the same address are both flagged', () => {
    const a = { id: 'A1', name: 'Place A', address1: '6 Victoria Street, Westminster, London, SW1H 0NL', href: '/menu/a' };
    const b = { id: 'B1', name: 'Place B', address1: '6 Victoria Street, Westminster, London, SW1H 0NL', href: '/menu/b' };
    const res = detectSharedAddresses([a, b]);
    expect(res.get('A1').isSharedAddress).toBe(true);
    expect(res.get('B1').isSharedAddress).toBe(true);
    expect(res.get('A1').siblingNames).toContain('Place B');
    expect(res.get('B1').siblingNames).toContain('Place A');
  });
});
