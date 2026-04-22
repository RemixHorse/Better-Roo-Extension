import { describe, it, expect } from 'vitest';
import { timeAgo } from '../src/content/timeAgo.js';

const now = Date.now();
const mins  = n => now - n * 60_000;
const hours = n => now - n * 3_600_000;
const days  = n => now - n * 86_400_000;
const weeks = n => now - n * 7 * 86_400_000;
const months = n => now - n * 30 * 86_400_000;
const years  = n => now - n * 365 * 86_400_000;

describe('timeAgo', () => {
  it('returns null for null input', () => expect(timeAgo(null)).toBeNull());
  it('returns null for NaN', () => expect(timeAgo(NaN)).toBeNull());

  it('formats minutes', () => expect(timeAgo(mins(5))).toBe('5 minutes ago'));
  it('singularises 1 minute', () => expect(timeAgo(mins(1))).toBe('1 minute ago'));

  it('formats hours', () => expect(timeAgo(hours(3))).toBe('3 hours ago'));
  it('singularises 1 hour', () => expect(timeAgo(hours(1))).toBe('1 hour ago'));

  it('formats days', () => expect(timeAgo(days(4))).toBe('4 days ago'));
  it('formats weeks', () => expect(timeAgo(weeks(2))).toBe('2 weeks ago'));
  it('formats months', () => expect(timeAgo(months(4))).toBe('4 months ago'));
  it('singularises 1 month', () => expect(timeAgo(months(1))).toBe('1 month ago'));

  it('formats years', () => expect(timeAgo(years(2))).toBe('2 years ago'));
  it('singularises 1 year', () => expect(timeAgo(years(1))).toBe('1 year ago'));
});
