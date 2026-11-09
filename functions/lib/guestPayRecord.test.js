import assert from 'node:assert/strict';
import test from 'node:test';
import { recordGuestPaymentInResortOS } from '../api/checkout/[[path]].js';

const TOKEN = 'tok_test0000000000000000000000000001';

function fakeResortOS(booking) {
  const db = { row: { ...booking }, patches: 0 };
  db.restFetch = async (path, init = {}) => {
    if ((init.method || 'GET') === 'GET') return { ok: true, status: 200, json: async () => [db.row] };
    db.patches += 1;
    const body = JSON.parse(init.body);
    db.row = { ...db.row, ...body, updated_at: new Date(Date.now() + db.patches).toISOString() };
    return { ok: true, status: 200, json: async () => [db.row] };
  };
  return db;
}

test('guest-page Cardcom success is recorded on the ResortOS booking once (webhook + return)', async () => {
  const db = fakeResortOS({
    id: 'web_pilot-office_20261109_0001', checkout_token: TOKEN, total_price_agorot: 100,
    payment_status: 'UNPAID', clearing_payments: [], updated_at: '2026-11-09T14:52:00.000Z'
  });
  const row = { id: 'web_pilot-office_20261109_0001', guest_name: 'רן בן ארי', stay: { hyp_intent: { amount: 1 } } };
  const result = { id: '269463011', auth: '691642', last4: '0085', hesh: '12', amount: 1 };
  const first = await recordGuestPaymentInResortOS({}, TOKEN, row, result, { restFetch: db.restFetch });
  assert.equal(first.ok, true);
  const second = await recordGuestPaymentInResortOS({}, TOKEN, row, result, { restFetch: db.restFetch });
  assert.equal(second.ok, true);
  assert.equal(db.patches, 1, 'second callback is a no-op');
  assert.equal(db.row.payment_status, 'PAID');
  assert.equal(db.row.clearing_payments.length, 1);
  assert.equal(db.row.clearing_payments[0].deal_number, '269463011');
  assert.equal(db.row.clearing_payments[0].document_number, '12');
});

test('a ResortOS write failure never throws out of the payment callback', async () => {
  const res = await recordGuestPaymentInResortOS({}, TOKEN, { id: 'b1' }, { id: '1', amount: 1 }, {
    restFetch: async () => { throw new Error('network down'); }
  });
  assert.equal(res.ok, false);
  const noDeal = await recordGuestPaymentInResortOS({}, TOKEN, { id: 'b1' }, {}, { restFetch: async () => { throw new Error('x'); } });
  assert.equal(noDeal.reason, 'NO_DEAL_ID');
});
