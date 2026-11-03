import { describe, expect, it } from 'vitest';
import { priorityChargeRows } from './priorityPayment';
import { voucherStayValue } from './voucherRates';

describe('voucher rates', () => {
  it('prices a Mialis corrective voucher as one midweek night in a shared-pool complex', () => {
    const priced = voucherStayValue({
      unit_id: 'k680',
      check_in_date: '2026-11-02',
      check_out_date: '2026-11-03'
    });
    expect(priced.agorot).toBe(41250);
    expect(priced.label).toBe('שובר חוויה מתקנת · מיאליס');
  });

  it('prices a private-pool cabin from the Nofesh Barama sheet without calling it corrective', () => {
    const priced = voucherStayValue({
      unit_id: 'k694',
      check_in_date: '2026-11-02',
      check_out_date: '2026-11-03'
    });
    expect(priced.agorot).toBe(41250);
    expect(priced.corrective).toBe(false);
  });

  it('shows the voucher in the guest charges', () => {
    const rows = priorityChargeRows({
      id: 'kinorot_1',
      unit_id: 'k680',
      payment_mode: 'VOUCHER',
      check_in_date: '2026-11-02',
      check_out_date: '2026-11-03',
      special_requests: 'kinorot:1|pay:voucher',
      clearing_payments: []
    });
    expect(rows.map((row) => row.kindLabel)).toEqual(['שובר']);
    expect(rows[0].amount_agorot).toBe(41250);
    expect(rows[0].accountLabel).toBe('שובר חוויה מתקנת · מיאליס');
  });
});
