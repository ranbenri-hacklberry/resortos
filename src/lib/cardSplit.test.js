import { describe, expect, it } from 'vitest';
import { addCardSplit } from './cardSplit';

function stay(partial = {}) {
  return {
    id: 'kin_1',
    guest_name: 'אורח',
    payment_status: 'UNPAID',
    payment_mode: '',
    total_price_agorot: 45000,
    clearing_payments: [],
    ...partial
  };
}

describe('card split', () => {
  it('keeps each card as its own charge and closes the stay when they cover the total', () => {
    const first = addCardSplit(stay(), {
      today: '2026-11-02',
      amountAgorot: 25000,
      last4: '6860',
      approval: '1735058'
    });
    expect(first.booking.payment_status).toBe('PARTIAL');
    expect(first.booking.payment_mode).toBe('CARD');
    expect(first.booking.clearing_payments).toHaveLength(1);
    expect(first.booking.clearing_payments[0].last4).toBe('6860');
    expect(first.booking.clearing_payments[0].ref).toBe('1735058');
    expect(first.booking.clearing_payments.some((row) => row.source === 'CASH')).toBe(false);

    const second = addCardSplit(first.booking, {
      today: '2026-11-02',
      amountAgorot: 20000,
      last4: '4242'
    });
    expect(second.booking.payment_status).toBe('PAID');
    expect(second.booking.payment_mode).toBe('CARD');
    expect(second.booking.clearing_payments.map((row) => row.last4)).toEqual(['6860', '4242']);
    expect(second.booking.clearing_payments[1].ref).toBe('');
    expect(second.booking.clearing_payments.some((row) => row.source === 'CASH')).toBe(false);
  });

  it('keeps an existing cash line and marks the stay as card plus cash', () => {
    const next = addCardSplit(stay({
      payment_mode: 'CASH',
      clearing_payments: [{ source: 'CASH', accountKey: 'CASH', method: 'cash', amount_agorot: 20000, txn: 'cash1' }]
    }), {
      today: '2026-11-02',
      amountAgorot: 25000,
      last4: '1111',
      approval: '99'
    });
    expect(next.booking.payment_mode).toBe('CARD_CASH');
    expect(next.booking.payment_status).toBe('PAID');
    expect(next.booking.clearing_payments.map((row) => row.source)).toEqual(['CASH', 'CARD']);
  });

  it('rejects a card without four digits', () => {
    expect(() => addCardSplit(stay(), { today: '2026-11-02', amountAgorot: 10000, last4: '12' })).toThrow('4 ספרות');
  });
});
