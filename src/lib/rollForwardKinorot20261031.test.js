import { describe, it, expect } from 'vitest';
import { bookingsNeedingCheckoutRollForward } from './checkoutDuty.js';

describe('roll-forward skips Kinorot bookings (Ran 2026-10-31)', () => {
  const today = '2026-10-31';
  const base = { booking_status: 'CHECKED_IN', check_in_date: '2026-10-28', check_out_date: '2026-10-30' };
  it('excludes kin_* ids and kinorot sources, keeps others', () => {
    const rows = bookingsNeedingCheckoutRollForward([
      { ...base, id: 'kin_697_1' },
      { ...base, id: 'x2', source: 'kinorot' },
      { ...base, id: 'local_1' }
    ], today);
    expect(rows.map((r) => r.id)).toEqual(['local_1']);
  });
});
