import { describe, it, expect } from 'vitest';
import { detectSharedAddresses } from '../src/content/matcher.js';
import { allThree, galitos, bangtan, sobeBurger } from './fixtures/sevenoaks-shared-address.js';

/**
 * Real-world shared address cluster — Galitos Sevenoaks (2026-04-21).
 * All three restaurants share postcode TN131XJ + street number 145,
 * despite different address string formats.
 */

// --- Station Parade false-positive guard ---
// Same postcode, DIFFERENT street numbers → no match
const pizzaUno = {
  id: 'PU1', name: 'Pizza Uno',
  address1: '2 Station Parade, London, TW9 3PZ',
  href: '/menu/london/richmond/pizza-uno',
};
const hattusa = {
  id: 'HAT1', name: 'Hattusa',
  address1: '4 Station Parade, London, TW9 3PZ',
  href: '/menu/london/richmond/hattusa',
};
const stationElKervan = {
  id: 'ELK2', name: 'El Kervan Station',
  address1: '8 Station Parade, London, TW9 3PZ',
  href: '/menu/london/richmond/el-kervan',
};

// --- No address data ---
const noAddress = {
  id: 'NA1', name: 'No Address Place',
  address1: null,
  href: '/menu/somewhere/no-address',
};

describe('detectSharedAddresses — Galitos / Bangtan / SoBe cluster', () => {
  it('flags all three as shared address', () => {
    const res = detectSharedAddresses(allThree);
    expect(res.get(galitos.id).isSharedAddress).toBe(true);
    expect(res.get(bangtan.id).isSharedAddress).toBe(true);
    expect(res.get(sobeBurger.id).isSharedAddress).toBe(true);
  });

  it('lists correct siblings for Galitos', () => {
    const siblings = detectSharedAddresses(allThree).get(galitos.id).siblingNames;
    expect(siblings).toContain('Bangtan - Korean Fried Chicken');
    expect(siblings).toContain('SoBe Burger');
    expect(siblings).not.toContain('Galitos');
  });

  it('lists correct siblings for Bangtan', () => {
    const siblings = detectSharedAddresses(allThree).get(bangtan.id).siblingNames;
    expect(siblings).toContain('Galitos');
    expect(siblings).toContain('SoBe Burger');
    expect(siblings).not.toContain('Bangtan - Korean Fried Chicken');
  });

  it('matches despite different address string formats', () => {
    expect(galitos.address1).not.toBe(bangtan.address1);
    expect(detectSharedAddresses(allThree).get(galitos.id).isSharedAddress).toBe(true);
  });

  it('Galitos alone is not flagged', () => {
    const res = detectSharedAddresses([galitos]);
    expect(res.get(galitos.id).isSharedAddress).toBe(false);
    expect(res.get(galitos.id).siblingNames).toHaveLength(0);
  });
});

describe('detectSharedAddresses — Station Parade false-positive guard', () => {
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
      address1: '10 Market Place, London, W1A 1AA',
      href: '/menu/london/somewhere/unique-place',
    };
    const res = detectSharedAddresses([...allThree, unrelated]);
    expect(res.get('999999').isSharedAddress).toBe(false);
  });

  it('two restaurants at the same address are both flagged', () => {
    const a = { id: 'A1', name: 'Place A', address1: '6 London Road, Sevenoaks, TN13 1AH', href: '/menu/a' };
    const b = { id: 'B1', name: 'Place B', address1: '6 London Road, Sevenoaks, TN13 1AH', href: '/menu/b' };
    const res = detectSharedAddresses([a, b]);
    expect(res.get('A1').isSharedAddress).toBe(true);
    expect(res.get('B1').isSharedAddress).toBe(true);
    expect(res.get('A1').siblingNames).toContain('Place B');
    expect(res.get('B1').siblingNames).toContain('Place A');
  });
});
