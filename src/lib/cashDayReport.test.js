import { describe, expect, it } from 'vitest';
import { isValidIsraeliId } from './clearingPayments.js';
import { buildCashDayReportHtml, cashPaymentsOnDate, cashWeekSelection, previousCashWeek, rowMatchesCashSelection } from './cashDayReport.js';

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

  it('opens Priority on the previous Sunday–Saturday week', () => {
    expect(previousCashWeek('2026-10-29')).toEqual({ from: '2026-10-18', to: '2026-10-24' });
    expect(previousCashWeek('2026-10-25')).toEqual({ from: '2026-10-18', to: '2026-10-24' });
    expect(previousCashWeek('2026-10-24')).toEqual({ from: '2026-10-11', to: '2026-10-17' });
    const week = previousCashWeek('2026-10-29');
    const selection = cashWeekSelection(week);
    expect(rowMatchesCashSelection({ cashDates: ['2026-10-20'], primaryDate: '2026-10-20' }, selection)).toBe(true);
    expect(rowMatchesCashSelection({ cashDates: ['2026-10-29'], checkIn: '2026-10-29' }, selection)).toBe(false);
    const html = buildCashDayReportHtml([booking], [{ id: 'k671', name: 'בתי נורית 1' }], week);
    expect(html).toContain('value="week:2026-10-18:2026-10-24"');
    expect(html).toContain('השבוע הקודם · 18/10–24/10');
    expect(html).toContain('const defaultSelection = "week:2026-10-18:2026-10-24"');
  });
});
