// @ts-nocheck — mirror of src/lib/shabbatTime.js
/** Approximate Shabbat entry (candle lighting) for northern Israel: sunset − 20 min, Asia/Jerusalem.
 *  NOAA sunset approximation (±2 min). Display as "בערך". */
export function sunsetUtcMinutes(date, lat = 32.98, lon = 35.75) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const n = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
  const g = (2 * Math.PI / 365) * (n - 1 + 0.5);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const r = Math.PI / 180;
  const ha = Math.acos(Math.cos(90.833 * r) / (Math.cos(lat * r) * Math.cos(decl)) - Math.tan(lat * r) * Math.tan(decl)) / r;
  return 720 - 4 * (lon - ha) - eq;
}

function ilWeekday(now) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(now);
}

export function isFridayIL(now = new Date()) {
  return ilWeekday(now) === 'Fri';
}

/** 'HH:MM' Shabbat entry for the coming (or current) Friday, Israel time. */
export function shabbatEntryHHMM(now = new Date()) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dow = days.indexOf(ilWeekday(now));
  const fri = new Date(now.getTime() + (dow === 6 ? -1 : (5 - dow)) * 86400000);
  const utcMin = sunsetUtcMinutes(fri) - 20;
  const base = Date.UTC(fri.getUTCFullYear(), fri.getUTCMonth(), fri.getUTCDate()) + Math.round(utcMin) * 60000;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(base));
}
