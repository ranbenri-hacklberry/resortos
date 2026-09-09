import { isFullyPaid } from './bookingPaid.js';
import { israelToday } from './cabinAccess.js';
import { shiftYmd, stayYmd } from './calendarOccupancy.js';
import { stayHoursFromBooking } from './kinorotStayHours.js';

function normalizeClock(raw, fallback = '15:00') {
  const value = String(raw || '').trim();
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function israelOffsetMs(at) {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    timeZoneName: 'shortOffset'
  }).formatToParts(at).find((part) => part.type === 'timeZoneName')?.value || '';
  const match = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 3 * 3600000;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0)) * 60000;
}

export function israelDateTime(ymd, hhmm = '15:00') {
  const day = stayYmd(ymd);
  const clock = normalizeClock(hhmm);
  if (!day) return null;
  const utcGuess = Date.parse(`${day}T${clock}:00Z`);
  if (!Number.isFinite(utcGuess)) return null;
  return new Date(utcGuess - israelOffsetMs(new Date(utcGuess)));
}

export function guestCheckinAt(booking) {
  const cin = stayYmd(booking?.check_in_date);
  if (!cin) return null;
  return israelDateTime(cin, stayHoursFromBooking(booking).checkin || '15:00');
}

export function checkinHourReached(booking, now = new Date()) {
  const start = guestCheckinAt(booking);
  return Boolean(start && now >= start);
}

/** Arrival day, after the unit's check-in hour — guest should be treated as in the room. */
export function isArrivalAfterCheckin(booking, today = israelToday(), now = new Date()) {
  if (!booking || booking.deleted_at) return false;
  if (booking.booking_status === 'CANCELED' || booking.booking_status === 'CHECKED_OUT') return false;
  const cin = stayYmd(booking.check_in_date);
  const cout = stayYmd(booking.check_out_date);
  if (!cin || !cout) return false;
  if (cin !== today || cout <= today) return false;
  return checkinHourReached(booking, now);
}

export function isPaidForGuestCheckin(booking) {
  if (!booking) return false;
  if (isFullyPaid(booking)) return true;
  if (booking.stay?.hyp?.paid || booking.stay?.balance_paid || booking.balance_paid) return true;
  return false;
}

export function shouldAutoGuestCheckin(booking, now = new Date()) {
  if (!booking || booking.deleted_at) return false;
  if (booking.booking_status === 'CANCELED' || booking.booking_status === 'CHECKED_OUT') return false;
  if (booking.stay?.self_checked_out_at) return false;
  if (booking.booking_status === 'CHECKED_IN' && booking.stay?.guest_checked_in_at) return false;
  if (!isPaidForGuestCheckin(booking)) return false;
  const start = guestCheckinAt(booking);
  if (!start || now < start) return false;
  const cout = stayYmd(booking.check_out_date);
  if (cout && israelToday(now) > cout) return false;
  return true;
}

export function applyPaidArrivalCheckin(booking, now = new Date()) {
  if (!shouldAutoGuestCheckin(booking, now)) return null;
  const stay = booking.stay && typeof booking.stay === 'object' ? { ...booking.stay } : {};
  stay.guest_checked_in_at = stay.guest_checked_in_at || now.toISOString();
  return {
    ...booking,
    booking_status: 'CHECKED_IN',
    stay,
    updated_at: now.toISOString()
  };
}

export function isInHouse(booking, today = israelToday()) {
  if (!booking || booking.deleted_at || booking.booking_status === 'CANCELED') return false;
  if (booking.booking_status === 'CHECKED_OUT') return false;
  if (!booking.check_in_date || !booking.check_out_date) return false;
  return today >= booking.check_in_date && today <= booking.check_out_date;
}

export function stayLinkExpired(booking, now = new Date()) {
  if (!booking || booking.deleted_at || booking.booking_status === 'CANCELED') return true;
  const today = israelToday(now);
  const cout = stayYmd(booking.check_out_date);
  if (cout) return today > shiftYmd(cout, 1);
  const cin = stayYmd(booking.check_in_date);
  if (cin) return today > shiftYmd(cin, 2);
  if (!booking.expires_at) return false;
  const expiresAt = new Date(booking.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt < now.getTime();
}

export function stayExpiresAt(booking, now = new Date()) {
  const cout = stayYmd(booking?.check_out_date);
  const last = cout || stayYmd(booking?.check_in_date);
  if (!last) {
    return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  }
  const end = israelDateTime(shiftYmd(last, 2), '23:59') || new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  return end.toISOString();
}

export function kvTtlSeconds(booking) {
  const until = new Date(stayExpiresAt(booking)).getTime();
  const seconds = Math.ceil((until - Date.now()) / 1000);
  return Math.max(90 * 24 * 3600, Math.max(60, seconds));
}

export function stayPhase(booking, now = new Date()) {
  const start = guestCheckinAt(booking);
  if (!start) return 'pre';
  const cout = stayYmd(booking.check_out_date) || stayYmd(booking.check_in_date);
  const outHour = stayHoursFromBooking(booking).checkout;
  const checkOut = israelDateTime(cout, outHour && outHour !== 'motzash' ? outHour : '11:00');
  if (now < start) return 'pre';
  if (checkOut && now < checkOut) return 'stay';
  return 'post';
}
