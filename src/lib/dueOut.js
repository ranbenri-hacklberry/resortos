/**
 * Display-only "due_out" state (Ran 2026-10-31): the stay's checkout date is today and there is no
 * real departure yet (status is not CHECKED_OUT). Never written to the DB; boards/briefings compute it.
 */
export function isDueOut(booking, today) {
  if (!booking || booking.deleted_at) return false;
  const st = String(booking.booking_status || '').toUpperCase();
  return String(booking.check_out_date || '').slice(0, 10) === today
    && st !== 'CHECKED_OUT' && st !== 'CANCELED' && st !== 'CANCELLED';
}

/** 'due_out' | 'checked_out' | 'checked_in' | 'cancelled' | 'confirmed' */
export function stayDisplayState(booking, today) {
  if (isDueOut(booking, today)) return 'due_out';
  const st = String(booking?.booking_status || '').toUpperCase();
  if (st === 'CHECKED_OUT') return 'checked_out';
  if (st === 'CHECKED_IN') return 'checked_in';
  if (st === 'CANCELED' || st === 'CANCELLED') return 'cancelled';
  return 'confirmed';
}
