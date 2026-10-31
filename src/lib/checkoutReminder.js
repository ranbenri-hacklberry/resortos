/**
 * Permanent checkout-reminder mechanism (Ran 2026-10-21).
 * Pure logic only: skip rules, late checkout, phone normalisation, template, dedupe key, reports.
 * Late-checkout semantics mirror the cloud guest page (GuestInStay.jsx effectiveCheckoutDate).
 */
import { guestStayUrl } from './guestStayUrl.js';

export const DEFAULT_CHECKOUT_TIME = '11:00';
const STAFF_UNIT_IDS = new Set(['k678', 'k679']);

export function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isNextDayLate(stay) {
  const v = String(stay?.late_until || '');
  return v === 'next' || /\+1$/.test(v);
}

/** Actual departure day (late checkout to next day moves it). */
export function effectiveDepartureDate(booking) {
  const out = booking?.check_out_date;
  if (!out) return null;
  return isNextDayLate(booking?.stay) ? addDaysIso(out, 1) : out;
}

export const SATURDAY_CHECKOUT_TIME = '13:00';
export const MOTZASH = 'מוצ״ש';

export function isSaturdayIso(iso) {
  return Boolean(iso) && new Date(`${iso}T12:00:00Z`).getUTCDay() === 6;
}

/** Ran 2026-10-31: Saturday departure 13:00, other days 11:00. */
export function defaultCheckoutTimeFor(dateIso) {
  return isSaturdayIso(dateIso) ? SATURDAY_CHECKOUT_TIME : DEFAULT_CHECKOUT_TIME;
}

/** Agreed departure on the booking (stay overlay or Kinorot note out:motzash / out:HH:MM ≠ form default 15:00). */
export function bookingCheckoutOverride(booking) {
  const stay = booking?.stay || {};
  const raw = String(stay.checkout_time || stay.late_until || '').replace('+1', '').trim();
  const notes = String(booking?.special_requests || '');
  if (/out:\s*(motzash|מוצ)/i.test(notes) || /motzash|מוצ/i.test(raw)) return MOTZASH;
  if (/^\d{1,2}:\d{2}$/.test(raw) && raw.padStart(5, '0') !== DEFAULT_CHECKOUT_TIME) return raw.padStart(5, '0');
  const m = notes.match(/out:\s*(\d{1,2}:\d{2})/i);
  if (m && m[1].padStart(5, '0') !== '15:00') return m[1].padStart(5, '0');
  return null;
}

export function checkoutTimeFor(booking, fallback) {
  const stay = booking?.stay || {};
  const ov = bookingCheckoutOverride(booking);
  if (ov) return ov;
  const raw = String(stay.checkout_time || stay.late_until || '').replace('+1', '').trim();
  if (/^\d{1,2}:\d{2}$/.test(raw) && raw.padStart(5, '0') !== DEFAULT_CHECKOUT_TIME) return raw.padStart(5, '0');
  return fallback || defaultCheckoutTimeFor(effectiveDepartureDate(booking));
}

/** Israeli mobile → 9725XXXXXXXX, else null. */
export function normalizeIsraeliMobile(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00972')) d = d.slice(2);
  if (d.startsWith('9720')) d = '972' + d.slice(4);
  if (d.startsWith('05') && d.length === 10) d = '972' + d.slice(1);
  if (!/^9725\d{8}$/.test(d)) return null;
  if (/^9725\d0{7}$/.test(d) || /^972500000000$/.test(d)) return null; // placeholders (לא זמין)
  return d;
}

export function firstName(guestName) {
  const t = String(guestName || '').trim().split(/\s+/)[0] || '';
  if (!t || /^(לא|אורח|guest|-)$/i.test(t)) return '';
  return t;
}

export function dedupeKey(bookingId, date) {
  return `checkout_reminder:${bookingId}:${date}`;
}

/**
 * Unit name for SMS/WhatsApp text: no '·' separator, no doubled 'בקתה'.
 * 'טוסקנה · 2' → 'טוסקנה 2', 'מול הנוף · בקתה 5' → 'מול הנוף 5', 'בקתות מאיה · בקתה 1' → 'בקתות מאיה 1'.
 */
export function smsUnitName(name) {
  let s = String(name || '').replace(/^[\u2460-\u24FF]\d+\s*/, '').trim();
  s = s.replace(/\s*·\s*בקתה\s+/g, ' ').replace(/\s*·\s*/g, ' ');
  s = s.replace(/^בקתה\s+(בקתות\s)/, '$1');
  return s.replace(/\s+/g, ' ').trim();
}

/** 'מ' + unit, without doubling an existing 'מ'/'מה' preposition. */
export function fromUnit(name) {
  const s = smsUnitName(name);
  if (!s) return 'מהבקתה';
  return `מ${s}`;
}

export function buildCheckoutReminder({ guestName, unitName, checkoutTime, stayUrl } = {}) {
  const name = firstName(guestName);
  const lines = [
    `בוקר טוב${name ? ` ${name}` : ''}! היום יום העזיבה ${fromUnit(unitName)}. העזיבה ${checkoutTime === MOTZASH ? 'במוצ״ש' : `עד ${checkoutTime || DEFAULT_CHECKOUT_TIME}`}.`
  ];
  if (stayUrl) lines.push(`אפשר לסמן צ׳ק-אאוט או לבקש צ׳ק-אאוט מאוחר בדף האירוח: ${stayUrl}.`);
  lines.push('תודה שהתארחתם!');
  return lines.join(' ');
}

const BLOCK_RE = /לא זמין|מתחם סגור|חסימה|חסום|תחזוקה|תפוס[הים]?|תפוסות|maintenance|blocked?|out of order/i;
const SIESTA_RE = /siesta|סיאסטה/i;

function wifiQuietlyLeft(booking, now) {
  const wifi = String(booking?.wifi_presence_status || booking?.stay?.wifi_presence_status || '');
  if (wifi !== 'disconnected') return false;
  const since = booking?.stay?.wifi_disconnected_at || booking?.metadata?.wifi_disconnected_at;
  if (!since) return true;
  const ms = now.getTime() - new Date(since).getTime();
  return Number.isFinite(ms) && ms >= 30 * 60 * 1000;
}

/**
 * Real departure evidence. Kinorot sync sets booking_status=CHECKED_OUT as soon as
 * check_out_date <= today, so on the departure day itself (check_out_date === date)
 * that status alone is NOT evidence. Pass { date } for the day being evaluated;
 * for earlier check-out dates (e.g. next-day late checkout) CHECKED_OUT still counts.
 */
export function isCheckedOut(booking, { date = null } = {}) {
  const s = booking?.stay || {};
  const statusCounts = booking?.booking_status === 'CHECKED_OUT'
    && !(date && booking?.check_out_date && booking.check_out_date >= date);
  return Boolean(
    statusCounts
    || booking?.checked_out_at
    || s.self_checked_out_at || s.auto_checked_out_at || s.manager_checked_out_at
    || ['self_departed', 'auto_departed'].includes(booking?.checkout_status)
    || ['self_departed', 'auto_departed'].includes(s.checkout_status)
  );
}

/** Non-guest rows: never reminded, never reported. Returns reason or null. */
export function nonGuestReason(booking, unit) {
  const status = String(booking?.booking_status || '').toUpperCase();
  if (status === 'CANCELED' || status === 'CANCELLED') return 'בוטלה';
  const hay = `${booking?.guest_name || ''} ${booking?.channel_source || ''} ${unit?.name || ''} ${booking?.special_requests || ''}`;
  if (SIESTA_RE.test(hay)) return 'סיאסטה';
  if (/מגורי צוות/.test(hay) || STAFF_UNIT_IDS.has(booking?.unit_id) || unit?.usage === 'STAFF_ACCOMMODATION') return 'מגורי צוות';
  if (status === 'BLOCKED' || BLOCK_RE.test(String(booking?.guest_name || ''))) return 'חסימה / לא זמין';
  return null;
}

/**
 * Classify one booking for date D. Returns null when it does not depart on D at all.
 * { booking, date, send:boolean, reason, phone, checkoutTime, late }
 */
export function classifyForDate(booking, date, { now = new Date(), unit = null, alreadySent = false, checkoutTime = DEFAULT_CHECKOUT_TIME } = {}) {
  const dep = effectiveDepartureDate(booking);
  const late = isNextDayLate(booking?.stay);
  const base = { booking, date, late, checkoutTime: checkoutTimeFor(booking, checkoutTime === DEFAULT_CHECKOUT_TIME ? undefined : checkoutTime), phone: null };
  if (booking?.check_out_date === date && late) {
    const r = nonGuestReason(booking, unit);
    if (r) return { ...base, send: false, reason: r, nonGuest: true };
    return { ...base, send: false, reason: `צ׳ק-אאוט מאוחר – יקבל ב־${dep}`, deferred: true };
  }
  if (dep !== date) return null;
  const ng = nonGuestReason(booking, unit);
  if (ng) return { ...base, send: false, reason: ng, nonGuest: true };
  if (isCheckedOut(booking, { date })) return { ...base, send: false, reason: 'כבר עזב' };
  // SMS targeting unchanged (Ran 2026-10-22): legacy CHECKED_OUT still skips the SMS,
  // but it is not shown as a real departure.
  if (isCheckedOut(booking)) return { ...base, send: false, reason: 'לא נשלח – מסומן CHECKED_OUT בקינרות (עזיבה לא אומתה)', legacyCheckedOut: true };
  if (wifiQuietlyLeft(booking, now)) return { ...base, send: false, reason: 'עזב בשקט (WiFi)' };
  const phone = normalizeIsraeliMobile(booking?.guest_phone);
  if (!phone) return { ...base, send: false, reason: booking?.guest_phone ? 'טלפון לא תקין' : 'אין טלפון' };
  if (alreadySent) return { ...base, phone, send: false, reason: 'כבר נשלח היום' };
  return { ...base, phone, send: true, reason: null };
}

export function messageFor(item, unitName) {
  const token = item.booking?.checkout_token;
  return buildCheckoutReminder({
    guestName: item.booking?.guest_name,
    unitName,
    checkoutTime: item.checkoutTime,
    stayUrl: token ? guestStayUrl(token) : ''
  });
}

function maskPhone(p) {
  const s = String(p || '');
  return s ? `${s.slice(0, 5)}…${s.slice(-2)}` : '-';
}

export function formatPlan(date, items, unitNameOf, { dryRun = true } = {}) {
  const send = items.filter((i) => i.send);
  const cancelled = items.filter((i) => !i.send && i.reason === 'בוטלה');
  const skip = items.filter((i) => !i.send && i.reason !== 'בוטלה');
  const out = [`🧳 עזיבות ${date}${dryRun ? ' (הרצה יבשה – לא נשלח SMS)' : ''}`];
  out.push(`יקבלו SMS ב־08:30: ${send.length}`);
  for (const i of send) out.push(`• ${unitNameOf(i.booking.unit_id)} – ${i.booking.guest_name || 'ללא שם'} (${maskPhone(i.phone)}) עד ${i.checkoutTime}`);
  if (skip.length) out.push(`ידלגו: ${skip.length}`);
  for (const i of skip) out.push(`• ${unitNameOf(i.booking.unit_id)} – ${i.booking.guest_name || 'ללא שם'}: ${i.reason}`);
  if (cancelled.length) out.push(`(${cancelled.length} הזמנות מבוטלות לא נכללו)`);
  return out.join('\n');
}

export function formatReport(date, items, unitNameOf) {
  const guests = items.filter((i) => !i.nonGuest && !i.deferred);
  const out = guests.filter((i) => isCheckedOut(i.booking, { date }));
  const stay = guests.filter((i) => !isCheckedOut(i.booking, { date }));
  const lines = [`🧹 מצב עזיבות ${date} (11:30)`, `עזבו: ${out.length}`];
  for (const i of out) lines.push(`✅ ${unitNameOf(i.booking.unit_id)} – ${i.booking.guest_name || 'ללא שם'}`);
  lines.push(`עוד לא עזבו: ${stay.length}`);
  for (const i of stay) lines.push(`⏳ ${unitNameOf(i.booking.unit_id)} – ${i.booking.guest_name || 'ללא שם'}${i.late ? ` (מאוחר עד ${i.checkoutTime})` : ''}`);
  return lines.join('\n');
}
