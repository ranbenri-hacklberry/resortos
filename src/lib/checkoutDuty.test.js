import { describe, expect, it } from 'vitest';
import { applyAutoCheckout, CHECKOUT_HOUR, listOverdueCheckouts } from './checkoutDuty.js';

const stay = {
  id: 'b1',
  unit_id: 'k671',
  guest_name: 'אורח',
  check_in_date: '2026-08-23',
  check_out_date: '2026-08-25',
  booking_status: 'CHECKED_IN'
};

function atHour(hour) {
  return new Date(Date.UTC(2026, 7, 25, hour - 3, 5, 0));
}

describe('auto checkout at 11', () => {
  it('does not close stays before 11 Israel time', () => {
    const now = atHour(CHECKOUT_HOUR - 1);
    expect(listOverdueCheckouts([stay], now)).toEqual([]);
    expect(applyAutoCheckout(stay, now)).toBeNull();
  });

  it('marks due stays checked out from 11', () => {
    const now = atHour(CHECKOUT_HOUR);
    expect(listOverdueCheckouts([stay], now).map((row) => row.id)).toEqual(['b1']);
    const next = applyAutoCheckout(stay, now);
    expect(next.booking_status).toBe('CHECKED_OUT');
    expect(next.stay.auto_checked_out_at).toBeTruthy();
  });
});
