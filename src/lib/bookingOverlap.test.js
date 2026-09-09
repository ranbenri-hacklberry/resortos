import { describe, expect, it } from 'vitest';
import {
  findOverlappingBooking,
  isActiveBooking,
  maxAvailableNights,
  staysOverlap
} from './bookingOverlap.js';

const stay = (id, extra = {}) => ({
  id,
  unit_id: 'dome-blue',
  check_in_date: '2026-09-02',
  check_out_date: '2026-09-04',
  booking_status: 'CONFIRMED',
  ...extra
});

describe('bookingOverlap', () => {
  it('lets checkout day become the next check-in (same-day turnover)', () => {
    expect(staysOverlap('2026-09-02', '2026-09-03', '2026-09-03', '2026-09-04')).toBe(false);
    expect(staysOverlap('2026-09-02', '2026-09-04', '2026-09-03', '2026-09-05')).toBe(true);
  });

  it('finds a live overlap on the same unit and skips canceled / checked-out / other cabins', () => {
    const rows = [
      stay('a'),
      stay('b', { booking_status: 'CANCELED' }),
      stay('c', { booking_status: 'CHECKED_OUT' }),
      stay('d', { unit_id: 'hill-1' }),
      stay('e', { deleted_at: '2026-09-01T00:00:00Z' })
    ];
    expect(isActiveBooking(rows[1])).toBe(false);
    expect(findOverlappingBooking(rows, 'dome-blue', '2026-09-03', '2026-09-05', 'new')).toBe(rows[0]);
    expect(findOverlappingBooking(rows, 'dome-blue', '2026-09-03', '2026-09-05', 'a')).toBeUndefined();
    expect(findOverlappingBooking(rows, 'hill-1', '2026-09-02', '2026-09-04', 'd')).toBeUndefined();
  });

  it('caps available nights at the next arrival, at least one night, otherwise 60', () => {
    const rows = [
      stay('next', { check_in_date: '2026-09-10', check_out_date: '2026-09-12' })
    ];
    expect(maxAvailableNights(rows, 'dome-blue', '2026-09-02', 'x')).toBe(8);
    expect(maxAvailableNights([], 'dome-blue', '2026-09-02', 'x')).toBe(60);
    expect(maxAvailableNights(rows, 'dome-blue', '2026-09-10', 'next')).toBe(60);
  });
});
