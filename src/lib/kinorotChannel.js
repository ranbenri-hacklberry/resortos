/** Booking.com guests arrive through Kinorot with @guest.booking.com mail. */
export function isBookingComEmail(email) {
  return /@guest\.booking\.com\b/i.test(String(email || ''));
}

export function isBookingComText(text) {
  return /booking\.com|בוקינג(?:\.קום)?/i.test(String(text || ''));
}

export function isBookingComBooking(booking) {
  if (!booking) return false;
  const channel = String(booking.channel_source || '').toLowerCase();
  if (channel === 'booking_com' || channel === 'booking.com' || channel === 'booking') return true;
  if (isBookingComEmail(booking.guest_email)) return true;
  if (isBookingComText(booking.special_requests)) return true;
  return false;
}

/**
 * Kinorot resid: Airbnb external ids are long; Booking.com uses the guest.booking.com email.
 * Direct Kinorot stays stay "kinorot".
 */
export function channelFromKinorotGuest({ resid, email, notes } = {}) {
  if (isBookingComEmail(email) || isBookingComText(notes)) return 'booking_com';
  if (String(resid || '').length > 10) return 'airbnb';
  return 'kinorot';
}
