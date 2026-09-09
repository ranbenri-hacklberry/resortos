import { json, errorJson, fetchPostgrest, getPostgrestConfig, isLocalPostgrestUrl } from './_db.js';
import { loadCalendarReplica } from '../lib/calendarReplica.js';
import { UNIT_DISPLAY_NAMES, UNIT_PROPERTY } from '../lib/unitNames.js';

function shiftIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function overlapsWindow(range, from, to) {
  if (from && range.checkOut <= from) return false;
  if (to && range.checkIn >= to) return false;
  return true;
}

function toBlockedRange(row) {
  const status = String(row?.booking_status || row?.status || '').toUpperCase();
  if (status === 'CANCELED' || status === 'CANCELLED' || status === 'CHECKED_OUT') return null;
  const unitId = row.unit_id || row.unitId;
  const checkIn = row.check_in_date || row.checkIn;
  const checkOut = row.check_out_date || row.checkOut;
  if (!unitId || !checkIn || !checkOut) return null;
  return { unitId, checkIn, checkOut, status: row.booking_status || row.status };
}

async function rangesFromReplica(env) {
  const packed = await loadCalendarReplica(env);
  if (!packed) return null;
  if (Array.isArray(packed.blocked) && packed.blocked.length) {
    return packed.blocked.map(toBlockedRange).filter(Boolean);
  }
  const byTail = packed.byTail && typeof packed.byTail === 'object' ? packed.byTail : {};
  const seen = new Set();
  const list = [];
  for (const rows of Object.values(byTail)) {
    for (const row of rows || []) {
      const range = toBlockedRange(row);
      if (!range) continue;
      const key = `${range.unitId}|${range.checkIn}|${range.checkOut}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(range);
    }
  }
  return list;
}

async function rangesFromPostgrest(env, { unitId, from, to }) {
  const { baseUrl, tenantId } = getPostgrestConfig(env);
  if (isLocalPostgrestUrl(baseUrl)) return null;

  let query = `/hotelos_bookings?tenant_id=eq.${tenantId}&deleted_at=is.null&booking_status=not.in.(CANCELED,CHECKED_OUT)`;
  if (unitId) query += `&unit_id=eq.${encodeURIComponent(unitId)}`;
  if (from) query += `&check_out_date=gt.${encodeURIComponent(from)}`;
  if (to) query += `&check_in_date=lt.${encodeURIComponent(to)}`;
  query += '&select=unit_id,check_in_date,check_out_date,booking_status';

  const res = await fetchPostgrest(query, { method: 'GET' }, env);
  if (!res || !res.ok) return null;
  const rows = await res.json().catch(() => []);
  return (rows || []).map(toBlockedRange).filter(Boolean);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'GET') return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');

  const url = new URL(request.url);
  const unitId = url.searchParams.get('unit_id') || url.searchParams.get('unitId') || '';
  const propertyId = url.searchParams.get('property_id') || url.searchParams.get('propertyId') || '';
  const date = url.searchParams.get('date') || '';
  const from = url.searchParams.get('from') || date || new Date().toISOString().split('T')[0];
  const to = url.searchParams.get('to') || (date ? shiftIso(date, 1) : null);

  let ranges = await rangesFromReplica(env);
  if (!ranges) ranges = await rangesFromPostgrest(env, { unitId, from, to });
  if (!ranges) {
    return errorJson(
      'זמנית לא ניתן לאמת זמינות מול היומן. אנא פנו ישירות בוואטסאפ של המתחם לבדיקה מהירה.',
      503,
      'CALENDAR_SYNC_TEMPORARY_UNAVAILABLE'
    );
  }

  const filtered = ranges.filter((range) => {
    if (unitId && range.unitId !== unitId) return false;
    if (propertyId && UNIT_PROPERTY[range.unitId] !== propertyId) return false;
    return overlapsWindow(range, from, to);
  });

  const payload = {
    success: true,
    unitId: unitId || 'all',
    propertyId: propertyId || null,
    from,
    to: to || null,
    blockedRanges: filtered
  };

  if (unitId) {
    payload.unitName = UNIT_DISPLAY_NAMES[unitId] || unitId;
    payload.available = filtered.length === 0;
  }

  return json(payload, 200, {
    'Cache-Control': 'no-store, must-revalidate'
  });
}
