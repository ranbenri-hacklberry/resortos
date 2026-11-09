import { isUnavailableHoldText } from '../src/lib/unavailableHold.js';

function ymd(value) {
  return String(value || '').slice(0, 10);
}

function normName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function guestChanged(prev, next) {
  const a = normName(prev);
  const b = normName(next);
  if (!a || !b || a === 'אורח' || b === 'אורח') return false;
  if (a === b) return false;
  if (a.includes(b) || b.includes(a)) return false;
  return true;
}

function slim(row) {
  return {
    id: row.id,
    unit_id: row.unit_id,
    guest_name: row.guest_name || 'אורח',
    check_in_date: ymd(row.check_in_date),
    check_out_date: ymd(row.check_out_date),
    total_price_agorot: row.total_price_agorot == null ? null : Number(row.total_price_agorot) || 0,
    booking_status: row.booking_status || null
  };
}

export function isLiveKinRow(row) {
  return Boolean(row)
    && !row.deleted_at
    && String(row.booking_status || '') !== 'CANCELED';
}

export function summarizeKinorotDiff({ incoming = [], existing = [], today }) {
  const byId = new Map((existing || []).map((row) => [row.id, row]));
  const incomingIds = new Set((incoming || []).map((row) => row.id));
  const created = [];
  const updated = [];

  for (const row of incoming || []) {
    const prev = byId.get(row.id);
    if (!isLiveKinRow(prev)) {
      created.push(slim(row));
      continue;
    }
    const fields = [];
    if (ymd(prev.check_in_date) !== ymd(row.check_in_date)) {
      fields.push({ field: 'check_in', from: ymd(prev.check_in_date), to: ymd(row.check_in_date) });
    }
    if (ymd(prev.check_out_date) !== ymd(row.check_out_date)) {
      fields.push({ field: 'check_out', from: ymd(prev.check_out_date), to: ymd(row.check_out_date) });
    }
    if (String(prev.unit_id || '') !== String(row.unit_id || '')) {
      fields.push({ field: 'unit', from: prev.unit_id, to: row.unit_id });
    }
    if (guestChanged(prev.guest_name, row.guest_name)) {
      fields.push({ field: 'guest', from: prev.guest_name, to: row.guest_name });
    }
    const prevPrice = prev.total_price_agorot == null ? null : Number(prev.total_price_agorot) || 0;
    const nextPrice = row.total_price_agorot == null ? null : Number(row.total_price_agorot) || 0;
    if (prevPrice != null && nextPrice != null && prevPrice !== nextPrice) {
      fields.push({ field: 'price', from: prevPrice, to: nextPrice });
    }
    const prevStatus = String(prev.booking_status || '');
    const nextStatus = String(row.booking_status || '');
    if (prevStatus && nextStatus && prevStatus !== nextStatus) {
      fields.push({ field: 'status', from: prevStatus, to: nextStatus });
    }
    if (fields.length) updated.push({ ...slim(row), fields });
  }

  const removed = (existing || []).filter((row) => (
    isLiveKinRow(row)
    && !incomingIds.has(row.id)
    && (!today || ymd(row.check_out_date) >= today)
  )).map(slim);

  return {
    created,
    updated,
    removed,
    total: created.length + updated.length + removed.length
  };
}

export function kinorotChangeCount(changes) {
  if (!changes) return 0;
  return (changes.created?.length || 0)
    + (changes.updated?.length || 0)
    + (changes.removed?.length || 0);
}

/** Check if a stay window includes the given Israel date (check_in <= day <= check_out). */
export function isStayIncludingDay(checkIn, checkOut, day) {
  const d = ymd(day);
  const cin = ymd(checkIn);
  const cout = ymd(checkOut);
  if (!d || !cin || !cout) return false;
  return cin <= d && d <= cout;
}

/** Detect self-made staff operational hold/status names created in ResortOS (not genuine guests from Kinorot). */
export function isStaffHoldName(name) {
  const norm = normName(name);
  if (!norm) return false;
  return isUnavailableHoldText(norm)
    || /^(לא נקי|לא זמין|חסום|סגור|תקלה|מגורי צוות|צוות|אחזקה|לניקוי|שיפוץ|שיפוצים|טיפול)/i.test(norm);
}

function stayBeforeChange(row) {
  const prev = {
    check_in_date: row?.check_in_date,
    check_out_date: row?.check_out_date
  };
  for (const item of row?.fields || []) {
    if (item?.field === 'check_in') prev.check_in_date = item.from;
    if (item?.field === 'check_out') prev.check_out_date = item.from;
  }
  return prev;
}

/**
 * Filter diff changes to only those affecting TODAY (check_in <= today <= check_out).
 * Excludes past stays (check_out < today), future bookings (check_in > today), and staff holds (e.g. "לא נקי").
 */
export function filterKinorotChangesForToday(changes, today) {
  if (!changes || !today) return { created: [], updated: [], removed: [], total: 0 };
  const d = ymd(today);

  const isEligibleStay = (row) => {
    if (!row) return false;
    if (isStaffHoldName(row.guest_name)) return false;
    return isStayIncludingDay(row.check_in_date, row.check_out_date, d);
  };

  const isEligibleUpdate = (row) => {
    if (!row) return false;
    if (isStaffHoldName(row.guest_name)) return false;
    // Current stay includes today
    if (isStayIncludingDay(row.check_in_date, row.check_out_date, d)) return true;
    // Or stay before change included today (e.g. moved onto or off today)
    const prev = stayBeforeChange(row);
    return isStayIncludingDay(prev.check_in_date, prev.check_out_date, d);
  };

  const created = (changes.created || []).filter(isEligibleStay);
  const updated = (changes.updated || []).filter(isEligibleUpdate);
  const removed = (changes.removed || []).filter(isEligibleStay);

  return {
    created,
    updated,
    removed,
    total: created.length + updated.length + removed.length
  };
}

