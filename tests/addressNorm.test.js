import { describe, it, expect } from 'vitest';
import { extractPostcode, extractStreetNumber, normalise } from '../src/content/addressNorm.js';

describe('extractPostcode', () => {
  it('extracts a standard postcode', () => {
    expect(extractPostcode('12 Whitehall SW1A 1AA')).toBe('SW1A 1AA');
  });

  it('extracts a compact postcode (no space)', () => {
    expect(extractPostcode('5 Victoria Street SW1H0NL')).toBe('SW1H 0NL');
  });

  it('handles range-format address', () => {
    expect(extractPostcode('146/148 Victoria Street SW1E 5JL')).toBe('SW1E 5JL');
  });

  it('returns null when no postcode present', () => {
    expect(extractPostcode('Some restaurant name')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(extractPostcode(null)).toBeNull();
  });
});

describe('extractStreetNumber', () => {
  it('extracts a plain number', () => {
    expect(extractStreetNumber('42 Buckingham Gate SW1E 6AJ')).toBe('42');
  });

  it('extracts first number from a range (slash)', () => {
    expect(extractStreetNumber('146/148 Victoria Street SW1E 5JL')).toBe('146');
  });

  it('extracts first number from a range (dash)', () => {
    expect(extractStreetNumber('146-148 Victoria Street SW1E 5JL')).toBe('146');
  });

  it('extracts number from lettered address', () => {
    expect(extractStreetNumber('10a Downing Street SW1A 2AA')).toBe('10');
  });

  it('returns null when address starts with a word', () => {
    expect(extractStreetNumber('Unit 3 Parliament Square SW1P 3BD')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(extractStreetNumber(null)).toBeNull();
  });
});

describe('normalise', () => {
  it('lowercases and expands abbreviations', () => {
    expect(normalise('12 Whitehall St SW1A 1AA')).toBe('12 whitehall street sw1a 1aa');
  });

  it('expands Rd to road', () => {
    expect(normalise('5 Millbank Rd')).toBe('5 millbank road');
  });

  it('expands Ave to avenue', () => {
    expect(normalise('10 Birdcage Ave')).toBe('10 birdcage avenue');
  });

  it('strips punctuation', () => {
    expect(normalise('12, Whitehall St.')).toBe('12 whitehall street');
  });

  it('returns empty string for null input', () => {
    expect(normalise(null)).toBe('');
  });

  it('collapses multiple spaces', () => {
    expect(normalise('12   Whitehall   St')).toBe('12 whitehall street');
  });
});
