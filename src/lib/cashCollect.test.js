import { describe, expect, it } from 'vitest';
import { addCashCollection } from './cashCollect.js';
import { buildRoomLogEvents } from './roomLog.js';

describe('cash collection', () => {
  it('adds the amount and keeps an earlier receipt from the same day', () => {
    const first = addCashCollection({
      id: 'b1',
      guest_name: 'נועה לוי',
      total_price_agorot: 200000,
      clearing_payments: []
    }, {
      amountAgorot: 100000,
      collector: 'רני',
      at: '2026-10-17T04:24:00.000Z',
      today: '2026-10-17'
    });
    const second = addCashCollection(first.booking, {
      amountAgorot: 50000,
      collector: 'רני',
      at: '2026-10-17T05:00:00.000Z',
      today: '2026-10-17'
    });
    expect(second.booking.clearing_payments).toHaveLength(2);
    expect(second.booking.payment_status).toBeUndefined();
    expect(second.booking.cash_collected_by).toBe('רני');
  });

  it('writes who collected, when, and how much on the room log', () => {
    const [row] = buildRoomLogEvents(
      { operational_status: 'READY' },
      {
        operational_status: 'READY',
        room_log_cash: { amount_agorot: 100000, actor: 'רני' }
      },
      'גביתי 1000 מזומן',
      '2026-10-17T04:24:00.000Z'
    );
    expect(row.kind).toBe('cash');
    expect(row.actor).toBe('רני');
    expect(row.text).toBe('גבה מזומן ₪1,000');
    expect(row.quote).toBe('גביתי 1000 מזומן');
  });
});
