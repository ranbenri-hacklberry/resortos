import test from 'node:test';
import assert from 'node:assert/strict';
import {
  financeSummary,
  ilsFromAgorot,
  maskAccountNumber,
  projectBankAccount,
  projectBookingMoney,
  projectPayment
} from './mcpRead.js';

test('120000 agorot is 1200.00 ILS', () => {
  assert.equal(ilsFromAgorot(120000), '1200.00');
  assert.equal(ilsFromAgorot(180000), '1800.00');
  assert.equal(ilsFromAgorot(-20000), '-200.00');
});

test('booking money separates value, receipts, refunds and balance', () => {
  const partial = projectBookingMoney({
    id: 'b1',
    unit_id: 'k680',
    guest_name: 'אורח',
    check_in_date: '2026-10-16',
    check_out_date: '2026-10-17',
    booking_status: 'CONFIRMED',
    payment_status: 'PARTIAL',
    total_price_agorot: 180000,
    deposit_agorot: 36000,
    clearing_payments: [{ amount_agorot: 50000, source: 'CASH', date: '2026-10-16', last4: '4242', payer_id: '123456782' }]
  });
  assert.equal(partial.booking_value_ils, '1800.00');
  assert.equal(partial.receipts_ils, '500.00');
  assert.equal(partial.balance_ils, '1300.00');
  assert.equal(partial.payments[0].last4, undefined);
  assert.equal(partial.payments[0].payer_id, undefined);
  assert.equal(JSON.stringify(partial).includes('4242'), false);

  const refunded = projectBookingMoney({
    id: 'b2',
    unit_id: 'k681',
    check_in_date: '2026-10-16',
    check_out_date: '2026-10-17',
    booking_status: 'CONFIRMED',
    total_price_agorot: 100000,
    clearing_payments: [
      { amount_agorot: 100000, source: 'CARD', txn: 't1', invoice: '88' },
      { amount_agorot: -20000, source: 'CARD', txn: 't2', invoice: '89' }
    ]
  });
  assert.equal(refunded.receipts_ils, '1000.00');
  assert.equal(refunded.refunds_ils, '-200.00');
  assert.equal(refunded.payments[0].invoice, '88');
});

test('summary skips canceled bookings and does not report profit', () => {
  const summary = financeSummary([
    { unit_id: 'k680', check_in_date: '2026-10-16', booking_status: 'CONFIRMED', total_price_agorot: 180000, clearing_payments: [{ amount_agorot: 50000, date: '2026-10-16' }] },
    { unit_id: 'k681', check_in_date: '2026-10-16', booking_status: 'CANCELED', total_price_agorot: 90000, clearing_payments: [] },
    { unit_id: 'dome-blue', check_in_date: '2026-11-01', booking_status: 'CONFIRMED', total_price_agorot: 120000, clearing_payments: [] }
  ], {
    from: '2026-10-01',
    to: '2026-10-31',
    propertyId: 'mool',
    unitProperty: (id) => (id.startsWith('k68') ? 'mool' : 'kipat')
  });
  assert.equal(summary.bookings, 1);
  assert.equal(summary.canceled_bookings, 1);
  assert.equal(summary.booking_value_ils, '1800.00');
  assert.equal(summary.receipts_ils, '500.00');
  assert.equal(summary.profit, null);
  assert.equal(summary.divisor, 100);
});

test('bank account number is masked and payment drops card fields', () => {
  assert.equal(maskAccountNumber('395140'), '••••5140');
  const account = projectBankAccount({
    id: 'a1',
    accountType: 'CARD',
    currency: 'ILS',
    accountNumber: '4580123412341234',
    parsedAccount: { bank: '12', branch: '92', number: '395140' },
    displayBalance: { amount: 10.5, currency: 'ILS' }
  });
  assert.equal(account.account_number_masked, '••••5140');
  assert.equal(JSON.stringify(account).includes('395140'), false);
  const payment = projectPayment({ amount_agorot: 100, last4: '9999', payer_id: '123456782', source: 'CARD' });
  assert.equal(payment.last4, undefined);
  assert.equal(payment.amount_ils, '1.00');
});
