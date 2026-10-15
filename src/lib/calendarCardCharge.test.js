import { describe, expect, it } from 'vitest';
import { applyCalendarCardPayment } from './calendarCardCharge.js';

describe('applyCalendarCardPayment', () => {
  it('marks the stay paid by card after a successful charge', () => {
    const next = applyCalendarCardPayment({
      id: 'b1',
      total_price_agorot: 150000,
      payment_status: 'UNPAID',
      payment_mode: '',
      clearing_payments: []
    }, {
      terminal: 'A',
      lowProfileId: 'lp-1',
      params: { Id: 'txn-9', ACode: '4455', Amount: '1500', L4digit: '1234', Brand: 'Visa' }
    });
    expect(next.payment_status).toBe('PAID');
    expect(next.payment_mode).toBe('CARD');
    expect(next.clearing_payments).toHaveLength(1);
    expect(next.clearing_payments[0].source).toBe('HYP');
    expect(next.clearing_payments[0].amount_agorot).toBe(150000);
    expect(next.clearing_payments[0].ref).toBe('4455');
    expect(next.stay.hyp_intent.status).toBe('paid');
  });

  it('does not duplicate the same card transaction', () => {
    const once = applyCalendarCardPayment({
      id: 'b1',
      total_price_agorot: 150000,
      clearing_payments: []
    }, { terminal: 'A', params: { Id: 'txn-9', Amount: '1500' } });
    const twice = applyCalendarCardPayment(once, { terminal: 'A', params: { Id: 'txn-9', Amount: '1500' } });
    expect(twice.clearing_payments).toHaveLength(1);
  });
});