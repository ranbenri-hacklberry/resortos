import { describe, it, expect } from 'vitest';
import { defaultCheckoutTime, checkoutTimeForBooking, bookingCheckoutOverride, MOTZASH } from './checkoutTime.js';
describe('checkout time rule (Ran 2026-10-31)', () => {
  it('Saturday is 13:00', () => expect(defaultCheckoutTime('2026-10-31')).toBe('13:00'));
  it('weekdays are 11:00', () => { for (const d of ['2026-10-30', '2026-11-01', '2026-11-04']) expect(defaultCheckoutTime(d)).toBe('11:00'); });
  it('motzash note overrides', () => expect(checkoutTimeForBooking({ check_out_date: '2026-10-31', special_requests: 'kinorot:1|out:motzash|in:15:00' })).toBe(MOTZASH));
  it('explicit out time overrides', () => expect(checkoutTimeForBooking({ check_out_date: '2026-10-31', special_requests: 'out:18:00|in:15:00' })).toBe('18:00'));
  it('Kinorot default out:15:00 is not an agreement', () => expect(bookingCheckoutOverride({ special_requests: 'out:15:00|in:15:00' })).toBeNull());
  it('weekday booking without note → 11:00', () => expect(checkoutTimeForBooking({ check_out_date: '2026-11-02' })).toBe('11:00'));
});
