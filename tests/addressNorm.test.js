import { describe, it, expect } from 'vitest';
import { extractPostcode, extractStreetNumber, normalise } from '../src/content/addressNorm.js';

describe('extractPostcode', () => {
  it('extracts a standard postcode', () => {
    expect(extractPostcode('12 High Street TN13 1AA')).toBe('TN13 1AA');
  });

  it('extracts a compact postcode (no space)', () => {
    expect(extractPostcode('5 London Road TN131AA')).toBe('TN13 1AA');
  });

  it('handles range-format address', () => {
    expect(extractPostcode('146/148 Station Road TW9 3AZ')).toBe('TW9 3AZ');
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
    expect(extractStreetNumber('42 Baker Street TN1 1AA')).toBe('42');
  });

  it('extracts first number from a range (slash)', () => {
    expect(extractStreetNumber('146/148 Station Road TW9 3AZ')).toBe('146');
  });

  it('extracts first number from a range (dash)', () => {
    expect(extractStreetNumber('146-148 Station Road TW9 3AZ')).toBe('146');
  });

  it('extracts number from lettered address', () => {
    expect(extractStreetNumber('145a High Street TN13 1AA')).toBe('145');
  });

  it('returns null when address starts with a word', () => {
    expect(extractStreetNumber('Unit 3 Retail Park TN1 2BB')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(extractStreetNumber(null)).toBeNull();
  });
});

describe('normalise', () => {
  it('lowercases and expands abbreviations', () => {
    expect(normalise('12 High St TN13 1AA')).toBe('12 high street tn13 1aa');
  });

  it('expands Rd to road', () => {
    expect(normalise('5 London Rd')).toBe('5 london road');
  });

  it('expands Ave to avenue', () => {
    expect(normalise('10 Park Ave')).toBe('10 park avenue');
  });

  it('strips punctuation', () => {
    expect(normalise('12, High St.')).toBe('12 high street');
  });

  it('returns empty string for null input', () => {
    expect(normalise(null)).toBe('');
  });

  it('collapses multiple spaces', () => {
    expect(normalise('12   High   St')).toBe('12 high street');
  });
});
