function bookingTime(value) {
  const n = Date.parse(value || '');
  return Number.isFinite(n) ? n : 0;
}

export function isCanceledBooking(row) {
  return Boolean(row?.deleted_at) || row?.booking_status === 'CANCELED';
}

export function stayStillHasNights(row, today) {
  return Boolean(row?.check_out_date && row.check_out_date > today);
}

export function isKinorotBookingId(id) {
  return String(id || '').startsWith('kin_');
}

/**
 * Whether a Studio/cloud row should overwrite the local Dexie copy.
 * Kinorot ids follow Postgres: a live scrape must revive a locally canceled copy.
 */
export function clearingProofCount(booking) {
  return (booking?.clearing_payments || []).filter((row) => {
    const ref = String(row?.ref || '').trim();
    return ref && !/^0+$/.test(ref);
  }).length;
}

export function clearingPaidAgorot(booking) {
  return (booking?.clearing_payments || []).reduce((sum, row) => (
    sum + (Number(row?.amount_agorot) || Math.round((Number(row?.amount) || 0) * 100))
  ), 0);
}

export function shouldApplyIncomingBooking(existing, incoming, today, ranks) {
  if (!existing) return true;
  const { paymentStatusRank, bookingStatusRank } = ranks;
  if (clearingProofCount(incoming) > clearingProofCount(existing)) return true;
  if (clearingPaidAgorot(incoming) > clearingPaidAgorot(existing)) return true;
  if (isCanceledBooking(incoming) && !isCanceledBooking(existing)) return true;
  if (isCanceledBooking(existing) && !isCanceledBooking(incoming)) {
    if (isKinorotBookingId(incoming.id || existing.id)) return true;
    return bookingTime(incoming?.updated_at) > bookingTime(existing?.updated_at);
  }
  const existingCheckedOut = existing?.booking_status === 'CHECKED_OUT';
  const incomingCheckedOut = incoming?.booking_status === 'CHECKED_OUT';
  if (existingCheckedOut && !incomingCheckedOut && stayStillHasNights(incoming, today)) return true;
  if (!existingCheckedOut && incomingCheckedOut && stayStillHasNights(existing, today)) return false;
  if (existingCheckedOut && !incomingCheckedOut) return false;
  if (incomingCheckedOut && !existingCheckedOut) return true;
  if (paymentStatusRank(incoming?.payment_status) > paymentStatusRank(existing?.payment_status)) return true;
  if (bookingStatusRank(incoming?.booking_status) > bookingStatusRank(existing?.booking_status)) return true;
  const incomingT = bookingTime(incoming?.updated_at);
  const existingT = bookingTime(existing?.updated_at);
  if (incomingT && existingT && incomingT > existingT) return true;
  if (incomingT && existingT && incomingT < existingT) return false;
  if (paymentStatusRank(existing?.payment_status) > paymentStatusRank(incoming?.payment_status)) return false;
  if (bookingStatusRank(existing?.booking_status) > bookingStatusRank(incoming?.booking_status)) return false;
  return true;
}
