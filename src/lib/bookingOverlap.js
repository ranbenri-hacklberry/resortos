export function isActiveBooking(booking) {
  return Boolean(
    booking &&
    !booking.deleted_at &&
    booking.booking_status !== 'CANCELED' &&
    booking.booking_status !== 'CHECKED_OUT'
  );
}

export function staysOverlap(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut;
}

export function findOverlappingBooking(bookings, unitId, checkIn, checkOut, excludeId) {
  return (bookings || []).find((booking) => (
    isActiveBooking(booking) &&
    booking.unit_id === unitId &&
    booking.id !== excludeId &&
    staysOverlap(checkIn, checkOut, booking.check_in_date, booking.check_out_date)
  ));
}

export function maxAvailableNights(bookings, unitId, checkIn, excludeId) {
  const nextStart = (bookings || [])
    .filter((booking) => (
      isActiveBooking(booking) &&
      booking.unit_id === unitId &&
      booking.id !== excludeId &&
      booking.check_in_date > checkIn
    ))
    .map((booking) => booking.check_in_date)
    .sort()[0];
  if (!nextStart) return 60;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${nextStart}T00:00:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}
