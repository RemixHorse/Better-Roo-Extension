const MINUTE = 60_000;
const HOUR   = 60 * MINUTE;
const DAY    = 24 * HOUR;
const WEEK   = 7 * DAY;
const MONTH  = 30 * DAY;
const YEAR   = 365 * DAY;

/**
 * Returns a human-readable relative time string for a Unix timestamp (ms).
 * e.g. "3 months ago", "1 year ago", "2 weeks ago"
 * Returns null if ts is null/undefined/NaN.
 */
export function timeAgo(ts) {
  if (!ts || isNaN(ts)) return null;
  const diff = Date.now() - ts;
  if (diff < 0)     return 'just now';
  if (diff < HOUR)  return `${Math.floor(diff / MINUTE)} minute${plural(diff, MINUTE)} ago`;
  if (diff < DAY)   return `${Math.floor(diff / HOUR)} hour${plural(diff, HOUR)} ago`;
  if (diff < WEEK)  return `${Math.floor(diff / DAY)} day${plural(diff, DAY)} ago`;
  if (diff < MONTH) return `${Math.floor(diff / WEEK)} week${plural(diff, WEEK)} ago`;
  if (diff < YEAR)  return `${Math.floor(diff / MONTH)} month${plural(diff, MONTH)} ago`;
  return `${Math.floor(diff / YEAR)} year${plural(diff, YEAR)} ago`;
}

function plural(diff, unit) {
  return Math.floor(diff / unit) === 1 ? '' : 's';
}
