import { describe, expect, it } from 'vitest';
import {
  bookingTotalAmount,
  bookingForFinanceRow,
  financeMismatchTotals,
  financeStayRollup,
  rowPaymentBreakdown,
  moneyGaps,
  rowStayFacts,
  scaleBreakdown
} from './bookingFinance.js';

describe('bookingFinance', () => {
  it('counts nights at noon Israel dates and treats same-day as zero', () => {
    expect(rowStayFacts({}, { check_in_date: '2026-09-02', check_out_date: '2026-09-03', adults_count: 2, children_count: 1 })).toEqual({
      checkIn: '2026-09-02',
      nights: 1,
      guests: 3
    });
    expect(rowStayFacts({ stayDate: '2026-09-02' }, { check_in_date: '2026-09-02', check_out_date: '2026-09-02' }).nights).toBe(0);
  });

  it('takes the larger of the collection row and sibling cabin totals, then splits agorot-safe', () => {
    const booking = { id: 'b1', unit_id: 'hill-1', total_price_agorot: 50000 };
    const sibling = { id: 'b2', unit_id: 'hill-2', total_price_agorot: 70000 };
    expect(bookingTotalAmount({ amount: 900 }, booking, {
      bookings: [booking, sibling],
      units: [{ id: 'hill-1', property_id: 'p' }, { id: 'hill-2', property_id: 'p' }]
    })).toBe(900);

    const split = scaleBreakdown({
      due: 100.01,
      paid: 100.01,
      credit: { amount: 100.01, movements: [{ id: 'm1', amount: 100.01 }] },
      cash: { amount: 0, movements: [] },
      transfer: { amount: 0, movements: [] },
      check: { amount: 0, movements: [] }
    }, 2, 0);
    expect(split.due).toBe(50.01);
    expect(split.credit.amount).toBe(50.01);
    expect(split.credit.movements[0].id).toBe('m1#0');
  });

  it('sums open stays versus Hyp charges that are not on any booking', () => {
    const open = {
      id: 'kin_1',
      guest_name: 'פרח לוי',
      unit_id: 'k811',
      check_in_date: '2026-09-07',
      check_out_date: '2026-09-10',
      total_price_agorot: 130000,
      payment_status: 'UNPAID',
      clearing_payments: []
    };
    const paid = {
      id: 'kin_2',
      guest_name: 'יהודה בן אוליאל',
      unit_id: 'suite-2',
      check_in_date: '2026-09-01',
      check_out_date: '2026-09-03',
      total_price_agorot: 150000,
      payment_status: 'PAID',
      clearing_payments: [{ source: 'HYP', txn: '475835790', ref: '0439905', amount_agorot: 150000 }]
    };
    const totals = financeMismatchTotals([], [open, paid], [{ id: 'k811' }, { id: 'suite-2' }], null, {
      rows: [
        { txn: '475835790', ref: '0439905', amount: 1500, date: '2026-08-31', terminalId: '4502210929' },
        { txn: '999', ref: '111', amount: 400, date: '2026-09-02', terminalId: '4502210929' }
      ]
    }, { month: '2026-09' });
    expect(totals.bookingAmount).toBe(1300);
    expect(totals.bookingCount).toBe(1);
    expect(totals.paymentAmount).toBe(400);
    expect(totals.paymentCount).toBe(1);
  });

  it('rolls a copied multi-cabin stay once and keeps August card charges on a September arrival', () => {
    const units = [{ id: 'k687' }, { id: 'k688' }, { id: 'k811' }];
    const isa = ['k687', 'k688'].map((unit_id, i) => ({
      id: `kin_${unit_id}_73119`,
      guest_name: 'איסא פארוק',
      unit_id,
      check_in_date: '2026-09-03',
      special_requests: 'kinorot:73119',
      total_price_agorot: 260000,
      deposit_agorot: 260000,
      payment_mode: 'CARD',
      clearing_payments: i === 0 ? [
        { source: 'HYP', ref: '1', amount_agorot: 52000 },
        { source: 'HYP', ref: '2', amount_agorot: 78000 },
        { source: 'KINOROT', amount_agorot: 130000, last4: '9429' }
      ] : [
        { source: 'HYP', ref: '1', amount_agorot: 52000 },
        { source: 'HYP', ref: '2', amount_agorot: 78000 },
        { source: 'KINOROT', amount_agorot: 130000, last4: '9429' }
      ]
    }));
    const yaniv = {
      id: 'kin_811_71281',
      guest_name: 'יניב דרור',
      unit_id: 'k811',
      check_in_date: '2026-09-02',
      special_requests: 'kinorot:71281',
      total_price_agorot: 140000,
      deposit_agorot: 140000,
      payment_mode: 'CARD',
      clearing_payments: [
        { source: 'HYP', ref: '0077320', amount_agorot: 112000, last4: '3321' },
        { source: 'KINOROT', amount_agorot: 28000, last4: '3321', date: '2026-08-31' }
      ]
    };
    const rollup = financeStayRollup([...isa, yaniv], units, { month: '2026-09' });
    expect(rollup.stayCount).toBe(2);
    expect(rollup.booked).toBe(4000);
    expect(rollup.credit).toBe(4000);
    expect(rollup.open).toBe(0);
  });

  it('keeps future September check-ins out of the headline until they arrive', () => {
    const arrived = {
      id: 'kin_1',
      guest_name: 'פרח לוי',
      unit_id: 'k811',
      check_in_date: '2026-09-07',
      total_price_agorot: 130000,
      clearing_payments: []
    };
    const later = {
      id: 'kin_2',
      guest_name: 'אורח עתידי',
      unit_id: 'k812',
      check_in_date: '2026-09-20',
      total_price_agorot: 900000,
      clearing_payments: []
    };
    const rollup = financeStayRollup([arrived, later], [{ id: 'k811' }, { id: 'k812' }], {
      month: '2026-09',
      throughDate: '2026-09-07'
    });
    expect(rollup.stayCount).toBe(1);
    expect(rollup.booked).toBe(1300);
    expect(rollup.futureCount).toBe(1);
    expect(rollup.futureBooked).toBe(9000);
  });

  it('counts a Kinorot card charge as paid even when Hyp has no approval number yet', () => {
    const booking = {
      id: 'kin_811_71281',
      guest_name: 'יניב דרור',
      unit_id: 'k811',
      total_price_agorot: 140000,
      clearing_payments: [
        { source: 'HYP', ref: '0077320', txn: '476893180', amount_agorot: 112000, last4: '3321' },
        { source: 'KINOROT', txn: 'kinorot_note_71281_2026-08-31_28000_card', amount_agorot: 28000, last4: '3321', date: '2026-08-31' }
      ]
    };
    const breakdown = rowPaymentBreakdown({ amount: 1400 }, booking, null, { bookings: [booking], units: [{ id: 'k811' }] });
    expect(breakdown.paid).toBe(1400);
    expect(breakdown.credit.amount).toBe(1400);
  });

  it('finds the calendar booking for a daily-report row when the formal link missed', () => {
    const booking = {
      id: 'kin_824_72914',
      guest_name: 'יהודה בן אוליאל',
      check_in_date: '2026-09-01',
      clearing_payments: [{ ref: '0439905' }]
    };
    expect(bookingForFinanceRow(
      { id: 'daily-1', stayDate: '2026-09-01', guestName: 'יהודה בן אוליאל' },
      { byCollection: {} },
      { bookings: [booking] }
    )?.id).toBe('kin_824_72914');
  });

  it('flags unmatched credit in the daily report when Hyp proof is missing', () => {
    const gaps = moneyGaps(
      { status: 'unpaid', methods: ['אשראי'] },
      { payment_mode: 'CREDIT_FULL' },
      null
    );
    expect(gaps).toContain('לא שולם בדוח היומי');
  });
});
