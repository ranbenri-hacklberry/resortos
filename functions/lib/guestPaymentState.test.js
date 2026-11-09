import assert from 'node:assert/strict';
import test from 'node:test';
import { mailboxHasPayment, mergeClearingPayments, protectPaymentState } from './guestPaymentState.js';

const paidMailbox = {
  id: 'web_pilot-office_20261109_0001',
  booking_status: 'CONFIRMED',
  payment_status: 'PAID',
  balance_paid: true,
  balance_paid_at: '2026-11-09T14:54:44.380Z',
  balance_payment_method: 'CREDIT_CARD',
  clearing_payments: [{ txn: '269463011', deal_number: '269463011', amount_agorot: 100, invoice: '12' }],
  payment: { purpose: 'balance' },
  stay: {
    hyp: { paid: true, id: '269463011', auth: '691642', hesh: '12' },
    hyp_intent: { purpose: 'balance', status: 'paid' },
    hyp_card: { last4: '0085' },
    balance_paid: true,
    payment_choice: 'CARD',
    operational_status: 'DIRTY',
    cabin_ready: false
  }
};

// What a READY publish from ResortOS looked like on 9.11 (buildStaySnapshot from an UNPAID booking).
const readyPublish = {
  ...paidMailbox,
  payment_status: 'UNPAID',
  balance_paid: false,
  clearing_payments: [],
  stay: {
    operational_status: 'READY',
    cabin_ready: true,
    hyp: null,
    hyp_intent: null,
    hyp_card: null,
    hyp_deposit: null,
    payment_proof: null
  }
};

test('a READY publish never clears or downgrades paid state on the mailbox', () => {
  const out = protectPaymentState(paidMailbox, readyPublish);
  assert.equal(out.payment_status, 'PAID');
  assert.equal(out.balance_paid, true);
  assert.equal(out.balance_payment_method, 'CREDIT_CARD');
  assert.equal(out.stay.hyp.paid, true);
  assert.equal(out.stay.hyp.id, '269463011');
  assert.equal(out.stay.hyp_intent.status, 'paid');
  assert.equal(out.stay.hyp_card.last4, '0085');
  assert.equal(out.stay.balance_paid, true);
  assert.equal(out.clearing_payments.length, 1);
  assert.deepEqual(out.payment, { purpose: 'balance' });
  // operational fields from the publish still apply
  assert.equal(out.stay.operational_status, 'READY');
  assert.equal(out.stay.cabin_ready, true);
});

test('a publish can still upgrade payment state and add payments', () => {
  const out = protectPaymentState(
    { ...paidMailbox, payment_status: 'DEPOSIT_PAID', balance_paid: false },
    { ...readyPublish, payment_status: 'PAID', clearing_payments: [{ txn: '1', amount_agorot: 500 }] }
  );
  assert.equal(out.payment_status, 'PAID');
  assert.deepEqual(out.clearing_payments.map((r) => r.txn), ['1', '269463011']);
});

test('mailboxHasPayment and clearing merge', () => {
  assert.equal(mailboxHasPayment(paidMailbox), true);
  assert.equal(mailboxHasPayment({ payment_status: 'UNPAID', stay: {} }), false);
  assert.equal(mailboxHasPayment({ payment_status: 'UNPAID', clearing_payments: [{ txn: '9' }] }), true);
  assert.equal(mergeClearingPayments([{ txn: '9' }], [{ txn: '9' }]).length, 1);
  assert.equal(protectPaymentState(null, readyPublish), readyPublish);
});
