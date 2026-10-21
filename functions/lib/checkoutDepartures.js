/**
 * Cloud side of the checkout-reminder mechanism: read-only departures overlay.
 * GET /api/checkout/departures?date=YYYY-MM-DD&tokens=a,b,c  (header x-resortos-departures-key)
 * The cloud never SENDS reminders — Studio's launchd job is the only sender (no double-send).
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function departuresAuthorized(request, env) {
  const key = String(env?.CHECKOUT_DEPARTURES_KEY || '').trim();
  if (!key) return false;
  const got = String(request.headers.get('x-resortos-departures-key') || '');
  if (got.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i += 1) diff |= key.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export function parseDeparturesQuery(url, tokenRe) {
  const u = new URL(url);
  const date = String(u.searchParams.get('date') || '');
  if (!DATE_RE.test(date)) return { error: 'DATE_REQUIRED' };
  const tokens = String(u.searchParams.get('tokens') || '').split(',').map((t) => t.trim())
    .filter((t) => tokenRe.test(t)).slice(0, 200);
  return { date, tokens };
}

function prevDay(iso) {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10);
}

/** Minimal fields Studio needs; rows departing on date or the day before (late +1). */
export function departureRow(row, date) {
  if (!row || ![date, prevDay(date)].includes(row.check_out_date)) return null;
  const s = row.stay || {};
  return {
    id: row.id,
    checkout_token: row.checkout_token,
    unit_id: row.unit_id,
    check_out_date: row.check_out_date,
    booking_status: row.booking_status,
    checked_out_at: row.checked_out_at || s.self_checked_out_at || null,
    checkout_status: row.checkout_status || s.checkout_status || null,
    guest_phone: row.guest_phone || null,
    stay: {
      late_until: s.late_until || null,
      checkout_time: s.checkout_time || null,
      self_checked_out_at: s.self_checked_out_at || null,
      auto_checked_out_at: s.auto_checked_out_at || null,
      manager_checked_out_at: s.manager_checked_out_at || null,
      guest_checked_in_at: s.guest_checked_in_at || null,
      wifi_presence_status: s.wifi_presence_status || null,
      wifi_disconnected_at: s.wifi_disconnected_at || null
    }
  };
}
