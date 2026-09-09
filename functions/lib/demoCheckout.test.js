import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDemoCheckoutRow, DEMO_DEPOSIT_AGOROT, DEMO_STAY_AGOROT } from './demoCheckout.js';

test('demo form is ₪5 stay and ₪1 deposit, unpaid', () => {
  const row = buildDemoCheckoutRow('form');
  assert.equal(DEMO_STAY_AGOROT, 500);
  assert.equal(DEMO_DEPOSIT_AGOROT, 100);
  assert.equal(row.total_price_agorot, 500);
  assert.equal(row.deposit_agorot, 100);
  assert.equal(row.payment_status, 'UNPAID');
  assert.equal(row.booking_status, 'PENDING');
  assert.match(row.checkout_token, /^tok_demo_/);
  assert.equal(row.unit_id, 'k671');
});

test('demo stay is deposit-paid so check-in charges the ₪4 balance', () => {
  const row = buildDemoCheckoutRow('stay');
  assert.equal(row.payment_status, 'DEPOSIT_PAID');
  assert.equal(row.booking_status, 'CONFIRMED');
  assert.equal(row.stay.hyp_deposit.paid, true);
  assert.equal(row.check_in_date <= row.check_out_date, true);
});
