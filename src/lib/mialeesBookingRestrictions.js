/**
 * Lightweight stay restrictions evaluator for the public booking engine
 * No DB or PMS dependencies — pure client calculation in 0ms.
 */

export function stayNights(checkIn, checkOut) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function inRange(date, start, end) {
  return Boolean(date && start && end && date >= start && date <= end);
}

function stayOverlapsRestriction(checkIn, checkOut, start, end) {
  return Boolean(checkIn && checkOut && start && end && start < checkOut && end >= checkIn);
}

function heDate(iso) {
  const [y, m, d] = String(iso || '').split('-');
  if (!d) return iso || '';
  return `${d}/${m}/${y}`;
}

export function matchingRestrictions(restrictions, { propertyId, checkIn, checkOut }) {
  return (restrictions || []).filter((row) => {
    if (row?.is_active === false) return false;
    if (row.property_id && propertyId && row.property_id !== propertyId) return false;
    if (row.property_id && !propertyId) return false;
    return stayOverlapsRestriction(checkIn, checkOut, row.start_date, row.end_date);
  });
}

export function evaluateStayRestrictions({ restrictions, propertyId, checkIn, checkOut }) {
  const nights = stayNights(checkIn, checkOut);
  const hits = matchingRestrictions(restrictions, { propertyId, checkIn, checkOut });
  const minRule = hits.reduce((best, row) => (
    !best || Number(row.min_nights) > Number(best.min_nights) ? row : best
  ), null);
  const minNights = Math.max(1, Number(minRule?.min_nights) || 1);
  const cta = hits.filter((row) => row.closed_to_arrival && inRange(checkIn, row.start_date, row.end_date));
  const ctd = hits.filter((row) => row.closed_to_departure && inRange(checkOut, row.start_date, row.end_date));
  const multiplier = hits.reduce((max, row) => Math.max(max, Number(row.price_multiplier) || 1), 1);
  const ok = nights >= minNights && cta.length === 0 && ctd.length === 0 && nights > 0;
  return {
    ok,
    nights,
    minNights,
    minRule,
    cta,
    ctd,
    multiplier,
    hits,
    checkIn,
    checkOut
  };
}

export function restrictionAlert(result) {
  if (!result) return null;
  if (result.nights <= 0) return 'תאריך יציאה חייב להיות אחרי תאריך כניסה.';
  if (result.cta.length) {
    return `אין צ׳ק-אין ב־${heDate(result.checkIn)} (${result.cta[0].name}).`;
  }
  if (result.ctd.length) {
    return `אין צ׳ק-אאוט ב־${heDate(result.checkOut)} (${result.ctd[0].name}).`;
  }
  if (result.nights < result.minNights) {
    const label = result.minRule?.name ? ` (${result.minRule.name})` : '';
    return `מינימום ${result.minNights} לילות לתקופה הזו${label}.`;
  }
  return null;
}
