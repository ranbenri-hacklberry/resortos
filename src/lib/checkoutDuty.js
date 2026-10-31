import { israelToday } from './cabinAccess';
import { findOverlappingBooking } from './bookingOverlap';

export const CHECKOUT_HOUR = 11;
export const CHECKIN_HOUR = 15;
const ROLL_KEY = 'resortos-rolled-open-checkouts-v1';

export function israelHour(now = new Date()) {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(now);
  return Number(hourStr);
}

/** 0.25 morning · 0.5 turnover 11–15 · 0.75 after check-in. RTL: from the right of the day cell. */
export function nowLineQuarter(now = new Date()) {
  const hour = israelHour(now);
  if (!Number.isFinite(hour) || hour < CHECKOUT_HOUR) return 0.25;
  if (hour < CHECKIN_HOUR) return 0.5;
  return 0.75;
}

export function nowLineTitle(now = new Date()) {
  const hour = israelHour(now);
  if (!Number.isFinite(hour) || hour < CHECKOUT_HOUR) return 'לפני צ׳ק-אאוט 11:00';
  if (hour < CHECKIN_HOUR) return 'בין צ׳ק-אאוט לצ׳ק-אין (11:00–15:00)';
  return 'אחרי צ׳ק-אין 15:00';
}

export function isOpenStay(booking) {
  return Boolean(
    booking &&
    !booking.deleted_at &&
    booking.booking_status !== 'CANCELED' &&
    booking.booking_status !== 'CHECKED_OUT' &&
    booking.check_in_date &&
    booking.check_out_date
  );
}

export function listOverdueCheckouts(bookings, now = new Date()) {
  const today = israelToday(now);
  const hour = israelHour(now);
  if (!Number.isFinite(hour) || hour < CHECKOUT_HOUR) return [];
  return (bookings || []).filter((booking) => {
    if (!isOpenStay(booking)) return false;
    return booking.check_out_date <= today;
  });
}

// applyAutoCheckout removed (Ran 2026-10-31): nothing marks a stay CHECKED_OUT by the clock.

// Kinorot bookings are never rolled forward: the Kinorot sync closes past stays (Ran 2026-10-31).
export function isKinorotBooking(booking) {
  const id = String(booking?.id || '');
  const source = String(booking?.source || '').toLowerCase();
  return id.startsWith('kin_') || source.startsWith('kin') || /(^|\s)kinorot:/.test(String(booking?.special_requests || ''));
}

export function bookingsNeedingCheckoutRollForward(bookings, today = israelToday()) {
  return (bookings || []).filter((booking) => (
    isOpenStay(booking) && booking.check_out_date < today && !isKinorotBooking(booking)
  ));
}

export function nextCheckoutDate(booking) {
  const [year, month, day] = String(booking.check_out_date).split('-').map(Number);
  const next = new Date(year, (month || 1) - 1, (day || 1) + 1);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const d = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function canExtendStay(bookings, booking) {
  if (!isOpenStay(booking)) return { ok: false, reason: 'ההזמנה כבר סגורה.' };
  const checkOut = nextCheckoutDate(booking);
  const conflict = findOverlappingBooking(
    bookings,
    booking.unit_id,
    booking.check_in_date,
    checkOut,
    booking.id
  );
  if (conflict) {
    return { ok: false, reason: 'אי אפשר להאריך — היחידה תפוסה בהזמנה הבאה.' };
  }
  return { ok: true, checkOut };
}

export function checkoutDutyRollKey() {
  return ROLL_KEY;
}

const DISMISS_PREFIX = 'resortos-duty-dismissed-';

export function checkoutDutyDismissKey(today = israelToday()) {
  return `${DISMISS_PREFIX}${today}`;
}

export function isCheckoutDutyDismissedToday(today = israelToday()) {
  try {
    return localStorage.getItem(checkoutDutyDismissKey(today)) === '1';
  } catch {
    return false;
  }
}

export function setCheckoutDutyDismissedToday(dismissed, today = israelToday()) {
  try {
    const key = checkoutDutyDismissKey(today);
    if (dismissed) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* ignore quota / private mode */
  }
}
