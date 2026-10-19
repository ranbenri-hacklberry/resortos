import { describe, expect, it } from 'vitest';
import { cashPaymentsOnDate } from './cashDayReport';
import {
  applyPriorityPayment,
  cashCollectedAgorot,
  collectPriorityCash,
  formatPriorityShekels,
  parsePriorityShekels,
  priorityMethodKey,
  priorityMethodLabel,
  priorityPayLabel,
  priorityShekelMark
} from './priorityPayment';

const today = '2026-10-12';

function stay(partial = {}) {
  return {
    id: 'b1',
    unit_id: 'k688',
    guest_name: 'אגם ספיר',
    booking_status: 'CONFIRMED',
    payment_status: 'UNPAID',
    total_price_agorot: 200000,
    ...partial
  };
}

describe('priority shekel mark', () => {
  const arrival = {
    check_in_date: '2026-10-16',
    check_out_date: '2026-10-17',
    payment_status: 'UNPAID',
    total_price_agorot: 100000
  };
  const beforeCheckin = new Date('2026-10-16T11:30:00Z');
  const afterCheckin = new Date('2026-10-16T12:30:00Z');

  it('blinks for open cash only once check-in time has arrived', () => {
    expect(priorityShekelMark({ ...arrival, payment_mode: 'CASH' }, beforeCheckin)).toBe('');
    expect(priorityShekelMark({ ...arrival, payment_mode: 'CASH' }, afterCheckin)).toBe('blink');
    expect(priorityShekelMark({
      ...arrival,
      payment_mode: 'CASH',
      payment_status: 'PAID',
      clearing_payments: [{ source: 'CASH', accountKey: 'CASH', amount_agorot: 100000, txn: 'cash1' }]
    }, afterCheckin)).toBe('');
    expect(priorityShekelMark({ ...arrival, payment_mode: 'CARD' }, afterCheckin)).toBe('');
  });

  it('hides the shekel before check-in, including tomorrow', () => {
    const tomorrow = { ...arrival, check_in_date: '2026-10-17' };
    expect(priorityShekelMark(tomorrow, afterCheckin)).toBe('');
    expect(priorityShekelMark({ ...tomorrow, payment_mode: 'CASH' }, afterCheckin)).toBe('');
    expect(priorityShekelMark(arrival, new Date('2026-10-17T12:30:00Z'))).toBe('');
  });

  it('shows a steady shekel at check-in when nothing was recorded', () => {
    expect(priorityShekelMark(arrival, beforeCheckin)).toBe('');
    expect(priorityShekelMark(arrival, afterCheckin)).toBe('steady');
  });
});

describe('priority payment', () => {
  it('formats the grid cell for an unpaid stay and a paid cash stay', () => {
    expect(priorityPayLabel({ status: 'UNPAID', method: '', amountAgorot: 200000 })).toBe('לא שולם (2,000 ₪)');
    expect(priorityPayLabel({ status: 'PAID', method: 'CASH', amountAgorot: 200000 })).toBe('שולם (מזומן)');
    expect(priorityMethodKey({ payment_mode: 'VOUCHER', total_price_agorot: 0 })).toBe('VOUCHER');
    expect(priorityMethodKey({ special_requests: 'kinorot:1|pay:voucher' })).toBe('VOUCHER');
    expect(priorityMethodLabel('VOUCHER')).toBe('שובר');
    expect(priorityMethodLabel('')).toBe('לא צוין');
    expect(priorityMethodLabel('CASH')).toBe('מזומן');
    expect(priorityMethodLabel('BANK')).toBe('העברה בנקאית / ביט');
    expect(formatPriorityShekels(200000)).toBe('2,000 ₪');
    expect(parsePriorityShekels('2,000 ₪')).toBe(200000);
  });

  it('records one cash receipt that the daily cash report totals', () => {
    const first = collectPriorityCash(stay(), { today, collector: 'משרד' });
    expect(first.booking.payment_status).toBe('PAID');
    expect(first.booking.payment_mode).toBe('CASH');
    expect(first.collectedAgorot).toBe(200000);
    const rows = cashPaymentsOnDate([first.booking], [{ id: 'k688', name: 'פירנצה 2' }], today);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountAgorot).toBe(200000);
    expect(rows[0].unitName).toBe('פירנצה 2');

    const again = collectPriorityCash(first.booking, { today, collector: 'משרד' });
    expect(again.collectedAgorot).toBe(0);
    expect(cashPaymentsOnDate([again.booking], [], today)).toHaveLength(1);
  });

  it('records the cash amount the desk typed, and keeps a smaller amount partial', () => {
    const part = collectPriorityCash(stay(), { today, collector: 'משרד', collectedAgorot: 50000 });
    expect(part.booking.payment_status).toBe('PARTIAL');
    expect(part.collectedAgorot).toBe(50000);
    expect(cashPaymentsOnDate([part.booking], [], today)[0].amountAgorot).toBe(50000);
    expect(priorityPayLabel({
      status: 'PARTIAL',
      method: 'CASH',
      amountAgorot: 200000,
      collectedAgorot: 50000
    })).toBe('שולם חלקית (2,000 ₪) · נגבה 500 ₪');

    const saved = applyPriorityPayment(stay({ payment_mode: 'CASH' }), {
      today,
      collector: 'משרד',
      collectedAgorot: 50000
    });
    expect(saved.booking.payment_status).toBe('PARTIAL');
    expect(saved.collectedAgorot).toBe(50000);
  });

  it('counts only the cash part of a Kinorot split', () => {
    const split = stay({
      payment_status: 'PAID',
      payment_mode: 'CASH',
      total_price_agorot: 160000,
      clearing_payments: [
        { txn: 'kinorot_note_74513_2026-10-06_32000_card', source: 'KINOROT', method: 'card', accountKey: 'MAX', amount_agorot: 32000 },
        { txn: 'kinorot_note_74513_na_128000_cash', source: 'KINOROT', method: 'cash', accountKey: 'CASH', amount_agorot: 128000 }
      ]
    });
    expect(cashCollectedAgorot(split)).toBe(128000);
    const cashOnlyByTxn = stay({
      clearing_payments: [
        { txn: 'kinorot_note_1_na_128000_cash', source: 'KINOROT', method: 'cash', amount_agorot: 128000 }
      ]
    });
    expect(cashCollectedAgorot(cashOnlyByTxn)).toBe(128000);
  });

  it('does not put a card payment into the cash report', () => {
    const card = stay({ payment_status: 'PAID', payment_mode: 'CARD' });
    expect(priorityPayLabel({ status: 'PAID', method: 'CARD', amountAgorot: 200000 })).toBe('שולם (אשראי)');
    expect(cashPaymentsOnDate([card], [], today)).toHaveLength(0);
  });
});
