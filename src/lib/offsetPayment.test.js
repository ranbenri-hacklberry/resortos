import { describe, expect, it } from 'vitest';
import { PAYMENT_METHODS, paymentParts, priorityMethodKey, priorityMethodLabel } from './priorityPayment';
import { paymentKind, paymentKindLabel } from './bookingFinance';
import { cashPaymentsOnDate } from './cashDayReport';

const offsetBooking = {
  id: 'demo-offset',
  check_in_date: '2026-10-23',
  payment_mode: 'OFFSET',
  total_price_agorot: 50000,
  clearing_payments: [{ source: 'OFFSET', amount_agorot: 50000, date: '2026-10-23', at: '2026-10-23T08:00:00.000Z', note: 'קיזוז משכר: עובד בדיקה' }]
};

describe('offset (קיזוז) payment', () => {
  it('is listed and labelled', () => {
    expect(PAYMENT_METHODS.some((m) => m.key === 'OFFSET' && m.label === 'קיזוז')).toBe(true);
    expect(priorityMethodLabel('OFFSET')).toBe('קיזוז');
    expect(priorityMethodKey(offsetBooking)).toBe('OFFSET');
    expect(paymentKindLabel('offset')).toBe('קיזוז');
  });
  it('is not counted as card or cash', () => {
    const parts = paymentParts(offsetBooking);
    expect(parts.offset).toBe(50000);
    expect(parts.card).toBe(0);
    expect(parts.cash).toBe(0);
    expect(paymentKind({ methods: ['קיזוז'] })).toBe('offset');
  });
  it('does not appear in cash day report', () => {
    const rows = cashPaymentsOnDate([offsetBooking], [], '2026-10-23');
    expect(Array.isArray(rows) ? rows.length : 0).toBe(0);
  });
});
