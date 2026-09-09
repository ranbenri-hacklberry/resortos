const HOLD_RE = /שיפוץ|סגור/;

export function unavailableHoldLabel(text) {
  const value = String(text || '');
  if (value.includes('שיפוץ')) return 'שיפוץ';
  if (value.includes('סגור')) return 'סגור';
  return '';
}

export function isUnavailableHoldText(value) {
  return HOLD_RE.test(String(value || ''));
}

export function isKinorotSourced(booking) {
  const id = String(booking?.id || '');
  const channel = String(booking?.channel_source || '');
  const extra = String(booking?.special_requests || '');
  return id.startsWith('kin_')
    || extra.includes('kinorot:')
    || /kinorot|resview|כינור/i.test(channel);
}

function holdHay(booking) {
  return [booking?.guest_name, booking?.special_requests].filter(Boolean).join(' ');
}

export function isUnavailableHoldBooking(booking) {
  if (!booking || booking.deleted_at || booking.booking_status === 'CANCELED') return false;
  return Boolean(unavailableHoldLabel(holdHay(booking)));
}

function overlapsRange(booking, rangeStart, rangeEnd) {
  const cin = String(booking?.check_in_date || '');
  const cout = String(booking?.check_out_date || '');
  if (!cin || !cout || !rangeStart || !rangeEnd) return false;
  return cin < rangeEnd && cout > rangeStart;
}

/** Drop closed/renovation-only cabins from the board so real stays pack tighter. */
export function hideClosedOrRenovationUnit(unit, bookings, { today, rangeStart, rangeEnd } = {}) {
  const mine = (bookings || []).filter((booking) => (
    booking?.unit_id === unit?.id
    && !booking.deleted_at
    && booking.booking_status !== 'CANCELED'
  ));
  const inRange = mine.filter((booking) => overlapsRange(booking, rangeStart, rangeEnd));
  if (inRange.some((booking) => !isUnavailableHoldBooking(booking))) return false;
  if (coveringUnavailableHold(bookings, unit?.id, today || '')) return true;
  return inRange.some(isUnavailableHoldBooking);
}

export function isUnavailableHoldCollectionRow(row) {
  return Boolean(unavailableHoldLabel(`${row?.guestName || ''} ${row?.notes || ''}`));
}

export function coveringUnavailableHold(bookings, unitId, today) {
  return (bookings || []).find((booking) => (
    booking.unit_id === unitId
    && isUnavailableHoldBooking(booking)
    && booking.check_in_date
    && booking.check_out_date
    && booking.check_in_date <= today
    && today < booking.check_out_date
  )) || null;
}
