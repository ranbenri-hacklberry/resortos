import { describe, expect, it } from 'vitest';
import { cashPaymentsOnDate } from './cashDayReport';
import { dueAgorotOf, recordedPaidAgorot } from './bookingPaid';
import {
  applyPaymentDraft,
  applyPriorityPayment,
  cashCollectedAgorot,
  collectPriorityCash,
  formatPriorityShekels,
  parsePriorityShekels,
  paymentBreakdown,
  chargeDisplay,
  priorityChargeRows,
  priorityMethodKey,
  priorityMethodLabel,
  priorityPayLabel,
  priorityStatusKey,
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

describe('guest card cash field', () => {
  it('keeps the amount being typed instead of the saved cash', () => {
    const card = applyPaymentDraft(
      { id: 'k1', bookingId: 'b9', collectedText: '', amountText: '2,000 ₪', cashCollectedAgorot: 0, paidAgorot: 0, amountAgorot: 200000 },
      { collectedText: '350', paymentBookingId: 'b9' }
    );
    expect(card.collectedText).toBe('350');
  });

  it('leaves another guest on the same unit unchanged', () => {
    const card = applyPaymentDraft(
      { id: 'k1', bookingId: 'b2', collectedText: '100 ₪' },
      { collectedText: '350', paymentBookingId: 'b9' }
    );
    expect(card.collectedText).toBe('100 ₪');
  });
});

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
    expect(priorityMethodLabel('BANK')).toBe('העברה');
    expect(priorityMethodLabel('CARD_CASH')).toBe('אשראי + מזומן');
    expect(priorityMethodLabel('AIRBNB')).toBe('Airbnb');
    expect(priorityMethodLabel('BOOKING')).toBe('בוקינג');
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

  it('marks the stay paid by card and clears the balance', () => {
    const open = stay({
      payment_status: 'DEPOSIT_PAID',
      deposit_agorot: 26000,
      clearing_payments: [{ source: 'KINOROT', method: 'card', accountKey: 'MAX', amount_agorot: 26000, txn: 'kinorot_note_1' }]
    });
    const paid = applyPriorityPayment(open, { statusKey: 'PAID', methodKey: 'CARD', today, collector: 'משרד' });
    expect(paid.booking.payment_status).toBe('PAID');
    expect(paid.booking.payment_mode).toBe('CARD');
    expect(recordedPaidAgorot(paid.booking)).toBe(200000);
    expect(dueAgorotOf(paid.booking)).toBe(0);
    expect(cashPaymentsOnDate([paid.booking], [], today)).toHaveLength(0);
    expect(paid.collectedAgorot).toBe(174000);
  });

  it('clears the balance when paid is marked without a method', () => {
    const paid = applyPriorityPayment(stay(), { statusKey: 'PAID', today, collector: 'משרד' });
    expect(dueAgorotOf(paid.booking)).toBe(0);
    expect(recordedPaidAgorot(paid.booking)).toBe(200000);
  });

  it('shows a zero balance on the card as soon as paid is chosen', () => {
    const card = applyPaymentDraft(
      { id: 'k1', bookingId: 'b9', amountAgorot: 130000, paidAgorot: 26000, payStatus: 'PARTIAL', payMethod: '' },
      { payStatus: 'PAID', paymentBookingId: 'b9' }
    );
    expect(card.paidAgorot).toBe(130000);
    expect(Math.max(0, card.amountAgorot - card.paidAgorot)).toBe(0);
  });

  it('shows a card deposit as partial credit, then a cash top-up as a split', () => {
    const deposit = stay({
      total_price_agorot: 130000,
      deposit_agorot: 26000,
      payment_status: 'DEPOSIT_PAID',
      payment_mode: 'CARD',
      clearing_payments: [{
        source: 'KINOROT',
        method: 'card',
        accountKey: 'MAX',
        amount_agorot: 26000,
        txn: 'kinorot_note_1_26000_card'
      }]
    });
    expect(priorityStatusKey(deposit)).toBe('PARTIAL');
    expect(priorityMethodKey(deposit)).toBe('CARD');

    const paid = collectPriorityCash(deposit, { today, collector: 'משרד', collectedAgorot: 104000 });
    expect(paid.booking.payment_status).toBe('PAID');
    expect(paid.booking.payment_mode).toBe('CARD_CASH');
    expect(paymentBreakdown(paid.booking)).toBe('אשראי 260 ₪ · מזומן 1,040 ₪');
    expect(recordedPaidAgorot(paid.booking)).toBe(130000);
    expect(dueAgorotOf(paid.booking)).toBe(0);
    expect(cashPaymentsOnDate([paid.booking], [], today)[0].amountAgorot).toBe(104000);

    const airbnb = applyPriorityPayment(stay(), { statusKey: 'PAID', methodKey: 'AIRBNB', today, collector: 'משרד' });
    expect(airbnb.booking.payment_mode).toBe('AIRBNB');
    expect(dueAgorotOf(airbnb.booking)).toBe(0);
    const booking = applyPriorityPayment(stay(), { statusKey: 'PAID', methodKey: 'BOOKING', today, collector: 'משרד' });
    expect(booking.booking.payment_mode).toBe('BOOKING');
    expect(dueAgorotOf(booking.booking)).toBe(0);
  });

  it('lists two same-day card charges when the last four digits differ', () => {
    const rows = priorityChargeRows(stay({
      clearing_payments: [
        { source: 'CARD', method: 'card', amount_agorot: 20000, last4: '1111', date: '2026-11-01', txn: 'card-a' },
        { source: 'CARD', method: 'card', amount_agorot: 20000, last4: '2222', date: '2026-11-01', txn: 'card-b' }
      ]
    }));
    expect(rows.map((row) => row.last4)).toEqual(['1111', '2222']);
  });

  it('lists every charge with its payment type and an approval number for card or bank', () => {
    const booking = stay({
      id: 'kinorot_stay_9001',
      special_requests: 'kinorot:9001|שולם מזומן 500|חויב אשראי 260',
      clearing_payments: [
        { source: 'HYP', accountKey: 'MAX_HYP', method: 'card', amount_agorot: 180000, ref: '445566', date: '2026-10-01', txn: 'hyp1' },
        { source: 'BANK', accountKey: 'BANK', method: 'bank', amount_agorot: 70000, ref: 'TR-19', date: '2026-10-02', txn: 'bank1' },
        { source: 'CASH', accountKey: 'CASH', method: 'cash', amount_agorot: 50000, date: '2026-10-03', txn: 'cash1' }
      ],
      stay: { hyp: { paid: true, auth: '445566', amount: 1800 } }
    });
    const rows = priorityChargeRows(booking);
    expect(rows.map((row) => row.kindLabel)).toEqual(['אשראי', 'העברה בנקאית', 'מזומן', 'אשראי']);
    expect(rows[0].needsApproval).toBe(true);
    expect(rows[0].approval).toBe('445566');
    expect(rows[1].approval).toBe('TR-19');
    expect(rows[2].needsApproval).toBe(false);
    expect(rows[2].approval).toBe('');
    expect(rows[3].amount_agorot).toBe(26000);
    expect(rows[3].approval).toBe('');
    expect(chargeDisplay({ source: 'HYP', amount_agorot: 100, method: 'card' }).approval).toBe('');
  });

  it('exposes txn, invoice, and gateway from chargeDisplay', () => {
    const cardcomPayment = {
      source: 'CARD',
      gateway: 'cardcom',
      txn: '269149464',
      deal_number: '269149464',
      invoice: '6',
      document_number: '6',
      document_url: 'https://secure.cardcom.solutions/doc/6',
      amount_agorot: 65000,
      approval: '0834838',
      last4: '7717'
    };
    const display = chargeDisplay(cardcomPayment);
    expect(display.txn).toBe('269149464');
    expect(display.invoice).toBe('6');
    expect(display.gateway).toBe('cardcom');
    expect(display.approval).toBe('0834838');
    expect(display.last4).toBe('7717');
    expect(display.kind).toBe('card');
    expect(display.needsApproval).toBe(true);
  });

  it('shows txn without invoice when invoice missing', () => {
    const payment = {
      source: 'CARD',
      txn: '269149464',
      amount_agorot: 65000
    };
    const display = chargeDisplay(payment);
    expect(display.txn).toBe('269149464');
    expect(display.invoice).toBe('');
  });

  it('does not put a card payment into the cash report', () => {
    const card = stay({ payment_status: 'PAID', payment_mode: 'CARD' });
    expect(priorityPayLabel({ status: 'PAID', method: 'CARD', amountAgorot: 200000 })).toBe('שולם (אשראי)');
    expect(cashPaymentsOnDate([card], [], today)).toHaveLength(0);
  });
});

describe('manual paid fallback', async () => {
  const { priorityChargeRows: rowsOf } = await import('./priorityPayment');
  it('shows synthetic line when marked paid without charges', () => {
    const rows = rowsOf({ id: 'b1', payment_status: 'PAID', payment_mode: 'VOUCHER', total_price_agorot: 0, clearing_payments: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].kindLabel).toBe('שובר (סומן ידנית)');
    expect(rows[0].amount_agorot).toBe(0);
  });
  it('uses deposit for DEPOSIT_PAID', () => {
    const rows = rowsOf({ id: 'b2', payment_status: 'DEPOSIT_PAID', payment_mode: 'CASH', deposit_agorot: 90000, total_price_agorot: 180000 });
    expect(rows[0].kindLabel).toBe('מזומן (סומן ידנית)');
    expect(rows[0].amount_agorot).toBe(90000);
  });
  it('no fallback for unpaid', () => {
    expect(rowsOf({ id: 'b3', payment_status: 'UNPAID', payment_mode: 'CASH', total_price_agorot: 5 })).toHaveLength(0);
  });
});
