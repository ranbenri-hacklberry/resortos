/**
 * Writes a 'צ׳ק-אאוט' entry into the room's יומן (unit_operations.sop_progress.roomLog,
 * the same store the Priority card's יומן tab reads). No schema change.
 * Covers every checkout path: direct hook on guest self-checkout + a poller that picks up
 * board/manager/Kinorot-sync CHECKED_OUT rows. Dedupe: entry id `checkout:<bookingId>`.
 */
import { studioRest } from './guestComms.js';
import { appendRoomLog, buildCheckoutLogEvent, hasCheckoutLog } from '../src/lib/roomLog.js';
import { nonGuestReason } from '../src/lib/checkoutReminder.js';

const PLACEHOLDER_RE = /^(תפוס|לא זמין|חסום|occupied|blocked)$/i;

function israelDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}
function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

export async function logCheckoutToRoom(booking, { source, rest = studioRest } = {}) {
  if (!booking?.id || !booking?.unit_id) return { skipped: 'no booking/unit' };
  if (/siesta|סיאסטה/i.test(`${booking.guest_name || ''} ${booking.channel_source || ''}`)) return { skipped: 'siesta' };
  const ng = nonGuestReason({ ...booking, booking_status: '' }, null);
  if (ng || PLACEHOLDER_RE.test(String(booking.guest_name || '').trim())) return { skipped: `non-guest${ng ? `: ${ng}` : ''}` };
  const ev = buildCheckoutLogEvent(booking, { source });
  if (!ev) return { skipped: 'no event' };
  const rows = await rest(`unit_operations?id=eq.${encodeURIComponent(booking.unit_id)}&select=id,sop_progress`);
  const unit = Array.isArray(rows) ? rows[0] : null;
  if (!unit) return { skipped: 'no unit row' };
  if (hasCheckoutLog(unit.sop_progress, booking.id)) return { skipped: 'exists' };
  const sop = appendRoomLog(unit.sop_progress, [ev]);
  await rest(`unit_operations?id=eq.${encodeURIComponent(booking.unit_id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sop_progress: sop }),
    prefer: 'return=minimal'
  });
  return { logged: true, event: ev };
}

const COLS = 'id,unit_id,guest_name,channel_source,special_requests,booking_status,check_out_date,checkout_status,checked_out_at,updated_at,stay';

/** Recent CHECKED_OUT bookings (checkout date yesterday/today/tomorrow) → room log. */
export async function syncCheckoutRoomLogs({ now = new Date(), rest = studioRest } = {}) {
  const today = israelDate(now);
  const rows = await rest(
    `hotelos_bookings?deleted_at=is.null&booking_status=eq.CHECKED_OUT`
    + `&check_out_date=gte.${addDays(today, -1)}&check_out_date=lte.${addDays(today, 1)}&select=${COLS}&limit=200`
  );
  const out = [];
  for (const b of Array.isArray(rows) ? rows : []) {
    try { out.push({ id: b.id, ...(await logCheckoutToRoom(b, { rest })) }); }
    catch (err) { out.push({ id: b.id, error: err.message }); }
  }
  return out;
}

export function startCheckoutRoomLogPoller(intervalMs = 2 * 60 * 1000) {
  const tick = () => syncCheckoutRoomLogs()
    .then((r) => { const n = r.filter((x) => x.logged).length; if (n) console.log(`[checkout room-log] logged ${n}`); })
    .catch((err) => console.warn('[checkout room-log]', err.message));
  setTimeout(tick, 15000);
  return setInterval(tick, intervalMs);
}
