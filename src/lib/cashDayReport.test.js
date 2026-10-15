import { describe, expect, it } from 'vitest';
import { isValidIsraeliId } from './clearingPayments.js';
import { buildCashDayReportHtml, cashPaymentsOnDate } from './cashDayReport.js';

const booking = {
  id: 'b1',
  unit_id: 'k671',
  guest_name: 'עדי פריצקר',
  booking_status: 'CHECKED_IN',
  clearing_payments: [{
    source: 'CASH',
    accountKey: 'CASH',
    amount_agorot: 170000,
    date: '2026-10-12',
    payer_name: 'עדי פריצקר',
    payer_id: '123456782',
    collector: 'משרד'
  }]
};

describe('cash day report', () => {
  it('accepts a real Israeli id and lists that cash payment', () => {
    expect(isValidIsraeliId('123456782')).toBe(true);
    expect(isValidIsraeliId('123456789')).toBe(false);
    const rows = cashPaymentsOnDate([booking], [{ id: 'k671', name: 'בתי נורית 1' }], '2026-10-12');
    expect(rows).toHaveLength(1);
    expect(rows[0].payerId).toBe('123456782');
    expect(rows[0].unitName).toBe('בתי נורית 1');
    const html = buildCashDayReportHtml([booking], [{ id: 'k671', name: 'בתי נורית 1' }], '2026-10-12');
    expect(html).toContain('עדי פריצקר');
    expect(html).toContain('123456782');
    expect(html).toContain('₪1,700');
    expect(cashPaymentsOnDate([booking], [], '2026-10-13')).toHaveLength(0);
  });
});
