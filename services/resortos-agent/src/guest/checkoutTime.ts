/**
 * Checkout-time rule (Ran 2026-10-31): Saturday check-out is 13:00, every other day 11:00.
 * A booking that agreed a later departure (Kinorot note `out:motzash` / explicit `out:HH:MM`
 * other than the Kinorot form default 15:00, or stay.checkout_time / stay.late_until) overrides.
 */
export const WEEKDAY_CHECKOUT = '11:00';
export const SATURDAY_CHECKOUT = '13:00';
export const MOTZASH = 'מוצ״ש';

export function israelDateIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

export function isSaturdayIso(iso: string): boolean {
  return new Date(`${iso}T12:00:00Z`).getUTCDay() === 6;
}

/** Default time for a departure on `dateIso` (defaults to today in Israel). */
export function defaultCheckoutTime(dateIso: string = israelDateIso()): string {
  return isSaturdayIso(dateIso) ? SATURDAY_CHECKOUT : WEEKDAY_CHECKOUT;
}

type BookingLike = { check_out_date?: string | null; special_requests?: string | null; stay?: any } | null | undefined;

/** Per-booking agreed departure, or null. */
export function bookingCheckoutOverride(b: BookingLike): string | null {
  const stay = b?.stay || {};
  const raw = String(stay.checkout_time || stay.late_until || '').replace('+1', '').trim();
  const notes = String(b?.special_requests || '');
  if (/out:\s*(motzash|מוצ)/i.test(notes) || /motzash|מוצ/i.test(raw)) return MOTZASH;
  if (/^\d{1,2}:\d{2}$/.test(raw) && raw.padStart(5, '0') !== WEEKDAY_CHECKOUT) return raw.padStart(5, '0');
  const m = notes.match(/out:\s*(\d{1,2}:\d{2})/i);
  if (m && m[1].padStart(5, '0') !== '15:00') return m[1].padStart(5, '0');
  return null;
}

export function checkoutTimeForBooking(b: BookingLike, todayIso: string = israelDateIso()): string {
  return bookingCheckoutOverride(b) || defaultCheckoutTime(b?.check_out_date || todayIso);
}
