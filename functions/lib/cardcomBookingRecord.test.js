import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCardcomBookingPayment,
  buildCardcomRefCustomFields,
  cardcomBookingRef,
  parseCardcomCustomFields,
  recomputePaymentFields,
  recordCardcomPaymentOnBooking
} from './cardcomBookingRecord.js';

const TOKEN = 'tok_test0000000000000000000000000001';

function officeBooking(extra = {}) {
  return {
    id: 'web_pilot-office_20261109_0001',
    checkout_token: TOKEN,
    guest_name: 'רן בן ארי',
    total_price_agorot: 100,
    payment_status: 'UNPAID',
    payment_mode: 'CREDIT_DEPOSIT',
    clearing_payments: [],
    balance_paid: false,
    updated_at: '2026-11-09T10:49:59.851799+00:00',
    ...extra
  };
}

const DEAL = {
  dealId: '269463011',
  amount: 1,
  approval: '691642',
  last4: '0085',
  documentNumber: '12',
  at: '2026-11-09T14:54:43.000Z'
};

test('booking reference custom fields round-trip (Cardcom Id/Value, ≤50 chars)', () => {
  const fields = buildCardcomRefCustomFields({ token: TOKEN, bookingId: 'web_pilot-office_20261109_0001' });
  assert.deepEqual(fields, [
    { Id: 1, Value: TOKEN },
    { Id: 2, Value: 'web_pilot-office_20261109_0001' }
  ]);
  for (const f of fields) assert.ok(f.Value.length <= 50);
  assert.deepEqual(parseCardcomCustomFields(fields), { token: TOKEN, bookingId: 'web_pilot-office_20261109_0001', test: false });
  assert.deepEqual(parseCardcomCustomFields({}), { token: '', bookingId: '', test: false });
  assert.deepEqual(parseCardcomCustomFields({ Field1: TOKEN }), { token: TOKEN, bookingId: '', test: false });
  assert.equal(parseCardcomCustomFields(buildCardcomRefCustomFields({ token: TOKEN, test: true })).test, true);
  assert.deepEqual(buildCardcomRefCustomFields({ token: 'not-a-token' }), []);
  assert.equal(cardcomBookingRef({ returnValue: TOKEN, customFields: parseCardcomCustomFields([]) }).token, TOKEN);
});

test('guest ₪1 payment closes a ₪1 booking: PAID, balance 0, one row with deal/approval/last4/doc', () => {
  const { booking, entry, duplicate } = applyCardcomBookingPayment(officeBooking(), DEAL, { now: '2026-11-09T14:54:44.000Z' });
  assert.equal(duplicate, false);
  assert.equal(booking.payment_status, 'PAID');
  assert.equal(booking.balance_paid, true);
  assert.equal(booking.balance_payment_method, 'CREDIT_CARD');
  assert.equal(booking.hyp_deal_id, '269463011');
  assert.equal(booking.clearing_payments.length, 1);
  assert.equal(entry.deal_number, '269463011');
  assert.equal(entry.txn, '269463011');
  assert.equal(entry.approval, '691642');
  assert.equal(entry.last4, '0085');
  assert.equal(entry.amount_agorot, 100);
  assert.equal(entry.document_number, '12');
  assert.equal(entry.invoice, '12');
  assert.equal(entry.method, 'CARD');
  assert.equal(entry.document_url, undefined, 'no document URL is stored by this recorder');
  assert.equal(recomputePaymentFields(booking).balance_agorot, 0);
});

test('same deal twice never double-records; partial payment is PARTIAL; status never downgrades', () => {
  const first = applyCardcomBookingPayment(officeBooking({ total_price_agorot: 50000 }), { ...DEAL, amount: 200 });
  assert.equal(first.booking.payment_status, 'PARTIAL');
  const again = applyCardcomBookingPayment(first.booking, { ...DEAL, amount: 200 });
  assert.equal(again.duplicate, true);
  assert.equal(again.changed, false);
  assert.equal(again.booking.clearing_payments.length, 1);
  assert.equal(recomputePaymentFields(again.booking).balance_agorot, 30000);

  const paidElsewhere = applyCardcomBookingPayment(officeBooking({ total_price_agorot: 50000, payment_status: 'PAID' }), DEAL);
  assert.equal(paidElsewhere.booking.payment_status, 'PAID');

  // A later report fills in a missing document number on the existing row, still one row.
  const noDoc = applyCardcomBookingPayment(officeBooking(), { ...DEAL, documentNumber: '' });
  const filled = applyCardcomBookingPayment(noDoc.booking, DEAL);
  assert.equal(filled.duplicate, true);
  assert.equal(filled.changed, true);
  assert.equal(filled.booking.clearing_payments.length, 1);
  assert.equal(filled.booking.clearing_payments[0].document_number, '12');
});

test('dedupe is by exact deal id only, never by approval number', () => {
  const first = applyCardcomBookingPayment(officeBooking({ total_price_agorot: 50000 }), DEAL);
  const other = applyCardcomBookingPayment(first.booking, { ...DEAL, dealId: '269463099' });
  assert.equal(other.duplicate, false);
  assert.equal(other.booking.clearing_payments.length, 2);
});

function fakeDb(initial) {
  let row = { ...initial };
  const calls = [];
  let interfere = 0;
  const restFetch = async (path, init = {}) => {
    calls.push({ method: init.method || 'GET', path });
    if ((init.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => (path.includes(encodeURIComponent('x')) ? [] : [row]) };
    }
    if (init.method === 'PATCH') {
      if (interfere > 0) {
        interfere -= 1;
        row = { ...row, updated_at: '2026-11-09T14:54:44.500000+00:00' };
        return { ok: true, status: 200, json: async () => [] };
      }
      const guard = decodeURIComponent(path.split('updated_at=eq.')[1] || '');
      if (guard !== row.updated_at) return { ok: true, status: 200, json: async () => [] };
      row = { ...row, ...JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => [row] };
    }
    return { ok: false, status: 405, json: async () => null };
  };
  return { restFetch, calls, get row() { return row; }, interfereOnce() { interfere = 1; } };
}

test('recordCardcomPaymentOnBooking: records once, second report is a no-op (webhook + poller)', async () => {
  const db = fakeDb(officeBooking());
  const ref = { token: TOKEN, bookingId: 'web_pilot-office_20261109_0001' };
  const a = await recordCardcomPaymentOnBooking({ restFetch: db.restFetch, ref, payment: DEAL, now: '2026-11-09T14:54:44.000Z' });
  assert.equal(a.ok, true);
  assert.equal(a.recorded, true);
  assert.equal(a.paymentStatus, 'PAID');
  const b = await recordCardcomPaymentOnBooking({ restFetch: db.restFetch, ref, payment: DEAL });
  assert.equal(b.ok, true);
  assert.equal(b.duplicate, true);
  assert.equal(db.row.clearing_payments.length, 1);
  assert.equal(db.calls.filter((c) => c.method === 'PATCH').length, 1);
  assert.match(db.calls[0].path, /^\/hotelos_bookings\?or=\(checkout_token\.eq\.tok_/);
});

test('recordCardcomPaymentOnBooking retries on a concurrent update and still writes one row', async () => {
  const db = fakeDb(officeBooking());
  db.interfereOnce();
  const res = await recordCardcomPaymentOnBooking({ restFetch: db.restFetch, ref: { token: TOKEN }, payment: DEAL });
  assert.equal(res.ok, true);
  assert.equal(db.row.clearing_payments.length, 1);
  assert.equal(db.calls.filter((c) => c.method === 'PATCH').length, 2);
});

test('recordCardcomPaymentOnBooking reports missing booking / ref / db without throwing', async () => {
  const empty = async () => ({ ok: true, status: 200, json: async () => [] });
  assert.equal((await recordCardcomPaymentOnBooking({ restFetch: empty, ref: { token: TOKEN }, payment: DEAL })).reason, 'BOOKING_NOT_FOUND');
  assert.equal((await recordCardcomPaymentOnBooking({ restFetch: empty, ref: {}, payment: DEAL })).reason, 'NO_BOOKING_REF');
  assert.equal((await recordCardcomPaymentOnBooking({ ref: { token: TOKEN }, payment: DEAL })).reason, 'NO_DB');
  const down = async () => null;
  assert.equal((await recordCardcomPaymentOnBooking({ restFetch: down, ref: { token: TOKEN }, payment: DEAL })).reason, 'DB_READ_FAILED');
});
