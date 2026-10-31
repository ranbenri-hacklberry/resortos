import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as duty from './checkoutDuty.js';
import { CHECKOUT_HOUR, listOverdueCheckouts } from './checkoutDuty.js';

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
  });

  // Changed 2026-10-31 by Ran's explicit decision ("לוח השנה: להסיר את הסימון האוטומטי"):
  // the previous test asserted auto CHECKED_OUT from 11:00; that behaviour was removed on purpose.
  it('from 11 lists overdue stays for the duty panel but never auto-marks CHECKED_OUT', () => {
    const now = atHour(CHECKOUT_HOUR);
    expect(listOverdueCheckouts([stay], now).map((row) => row.id)).toEqual(['b1']);
    expect(stay.booking_status).toBe('CHECKED_IN');
    expect('applyAutoCheckout' in duty).toBe(false);
    const cal = readFileSync(new URL('../components/ResortOSCalendar.jsx', import.meta.url), 'utf8');
    expect(cal).not.toMatch(/applyAutoCheckout|autoCheckoutRef/);
  });
});
