import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractKinId,
  financeSummary,
  formatGuestPhone,
  ilsFromAgorot,
  isAuthorizedContactManager,
  maskAccountNumber,
  matchesHebrewName,
  matchesKinId,
  matchesPhone,
  projectBankAccount,
  projectBooking,
  projectBookingContact,
  projectBookingMoney,
  projectInvoiceDetails,
  projectPayment,
  resolveUnitHebrewName
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

test('projectBooking exposes birthday and upsell fields as read-only', () => {
  const row = {
    id: 'b_birthday_1',
    unit_id: 'k685',
    guest_name: 'יוסי כהן',
    check_in_date: '2026-11-10',
    check_out_date: '2026-11-12',
    adults_count: 2,
    children_count: 0,
    booking_status: 'CONFIRMED',
    payment_status: 'PAID',
    is_birthday: true,
    birthday_note: 'עוגת שוקולד ובלונים',
    upsell_description: 'ארוחת בוקר כפרית + צ׳ק אאוט מאוחר',
    upsell_price: '250.00'
  };
  const projected = projectBooking(row);
  assert.equal(projected.id, 'b_birthday_1');
  assert.equal(projected.is_birthday, true);
  assert.equal(projected.birthday_note, 'עוגת שוקולד ובלונים');
  assert.equal(projected.upsell_description, 'ארוחת בוקר כפרית + צ׳ק אאוט מאוחר');
  assert.equal(projected.upsell_price, 250);

  // default / empty fallback
  const empty = projectBooking({ id: 'b_plain', unit_id: 'k686' });
  assert.equal(empty.is_birthday, false);
  assert.equal(empty.birthday_note, null);
  assert.equal(empty.upsell_description, null);
  assert.equal(empty.upsell_price, null);
});

test('isAuthorizedContactManager identifies Ran, Daniel Shukron, and Natasha', () => {
  // Ran
  assert.equal(isAuthorizedContactManager({ id: 'ran', role: 'MANAGER', is_active: true }), true);
  assert.equal(isAuthorizedContactManager({ id: 'rani', role: 'MANAGER', is_active: true }), true);
  assert.equal(isAuthorizedContactManager({ id: 'u1', username: 'ranbenri', role: 'MANAGER', is_active: true }), true);
  assert.equal(isAuthorizedContactManager({ id: 'u2', display_name: 'רן בן ארי', role: 'MANAGER', is_active: true }), true);

  // Daniel Shukron
  assert.equal(isAuthorizedContactManager({ id: 'daniel', role: 'MANAGER', is_active: true }), true);
  assert.equal(isAuthorizedContactManager({ id: 'u3', username: 'shukron', role: 'MANAGER', is_active: true }), true);
  assert.equal(isAuthorizedContactManager({ id: 'u4', display_name: 'דניאל שוקרון', role: 'MANAGER', is_active: true }), true);

  // Natasha
  assert.equal(isAuthorizedContactManager({ id: 'natasha', role: 'MANAGER', is_active: true }), true);
  assert.equal(isAuthorizedContactManager({ id: 'u5', username: 'natashamcp', role: 'MANAGER', is_active: true }), true);
  assert.equal(isAuthorizedContactManager({ id: 'u6', display_name: 'נטשה', role: 'MANAGER', is_active: true }), true);

  // Unauthorized users
  assert.equal(isAuthorizedContactManager({ id: 'adam', username: 'adam', role: 'MANAGER', is_active: true }), false);
  assert.equal(isAuthorizedContactManager({ id: 'priority', role: 'PRIORITY', is_active: true }), false);
  assert.equal(isAuthorizedContactManager({ id: 'cleaner', role: 'HOUSEKEEPING', is_active: true }), false);
  assert.equal(isAuthorizedContactManager({ id: 'daniel', role: 'MANAGER', is_active: false }), false);
  assert.equal(isAuthorizedContactManager(null), false);
});

test('matchesHebrewName handles Hebrew spelling variants (כתיב מלא / חסר like סויסה / סוויסה)', () => {
  // Variant סוויסה / סויסה
  assert.equal(matchesHebrewName('יוסי סוויסה', 'סויסה'), true);
  assert.equal(matchesHebrewName('יוסי סויסה', 'סוויסה'), true);
  assert.equal(matchesHebrewName('סוויסה, יוסי', 'סויסה'), true);
  assert.equal(matchesHebrewName('משה סויסה', 'יוסי'), false);

  // Partial name & words
  assert.equal(matchesHebrewName('דניאל שוקרון', 'דניאל'), true);
  assert.equal(matchesHebrewName('דניאל שוקרון', 'שוקרון'), true);
  assert.equal(matchesHebrewName('דניאל שוקרון', 'שוקרון דניאל'), true);

  // Punctuation and quotes
  assert.equal(matchesHebrewName('אלפא הייטק בע"מ', 'אלפא'), true);
  assert.equal(matchesHebrewName('אלפא הייטק בע"מ', 'בעמ'), true);
  assert.equal(matchesHebrewName('אלפא הייטק בע"מ', 'בע"מ'), true);

  // Empty query matches all
  assert.equal(matchesHebrewName('יוסי סוויסה', ''), true);
});

test('formatGuestPhone formats Israeli mobile, landline, and international phones', () => {
  // Israeli mobile 10-digit
  const m1 = formatGuestPhone('0541112233');
  assert.equal(m1.e164, '+972541112233');
  assert.equal(m1.local, '054-111-2233');

  // Israeli mobile already 972
  const m2 = formatGuestPhone('972528889900');
  assert.equal(m2.e164, '+972528889900');
  assert.equal(m2.local, '052-888-9900');

  // Israeli landline 9-digit
  const l1 = formatGuestPhone('046123456');
  assert.equal(l1.e164, '+97246123456');
  assert.equal(l1.local, '04-612-3456');

  // International phone
  const intl = formatGuestPhone('+14155552671');
  assert.equal(intl.e164, '+14155552671');

  // Empty
  const emp = formatGuestPhone('');
  assert.equal(emp.e164, '');
  assert.equal(emp.local, '');
});

test('matchesPhone compares digits, local, and international numbers', () => {
  assert.equal(matchesPhone('0541112233', '054-111-2233'), true);
  assert.equal(matchesPhone('054-111-2233', '0541112233'), true);
  assert.equal(matchesPhone('+972541112233', '0541112233'), true);
  assert.equal(matchesPhone('0541112233', '+972541112233'), true);
  assert.equal(matchesPhone('0541112233', '1112233'), true);
  assert.equal(matchesPhone('0541112233', '0520000000'), false);
});

test('extractKinId and matchesKinId handle kin_ prefix and special_requests', () => {
  assert.equal(extractKinId({ id: 'kin_76154' }), '76154');
  assert.equal(extractKinId({ id: 'b1', special_requests: 'kinorot:76154|in:15:00' }), '76154');
  assert.equal(extractKinId({ id: 'b1', kin_id: '76154' }), '76154');

  assert.equal(matchesKinId({ id: 'kin_76154' }, '76154'), true);
  assert.equal(matchesKinId({ id: 'kin_76154' }, 'kin_76154'), true);
  assert.equal(matchesKinId({ id: 'b1', special_requests: 'kinorot:76154' }, '76154'), true);
  assert.equal(matchesKinId({ id: 'kin_76154' }, '99999'), false);
});

test('projectInvoiceDetails extracts invoice name, company, and tax ID / ח.פ.', () => {
  const inv = projectInvoiceDetails({
    company_name: 'אלפא הייטק בע"מ',
    tax_id: '515998877'
  });
  assert.equal(inv.company_name, 'אלפא הייטק בע"מ');
  assert.equal(inv.tax_id, '515998877');
  assert.equal(inv.hp, '515998877');
  assert.equal(inv.formatted, 'אלפא הייטק בע"מ ח.פ. 515998877');

  // Fallback to special_requests hp:
  const inv2 = projectInvoiceDetails({
    invoice_name: 'חברת בדיקה בע"מ',
    special_requests: 'note|ח.פ: 512345678'
  });
  assert.equal(inv2.tax_id, '512345678');
  assert.equal(inv2.formatted, 'חברת בדיקה בע"מ ח.פ. 512345678');
});

test('resolveUnitHebrewName uses catalog or default units', () => {
  const catalog = [{ id: 'k680', name: 'מול הנוף 1' }];
  assert.equal(resolveUnitHebrewName('k680', catalog), 'מול הנוף 1');
  // Fallback from DEFAULT_RESORT_UNITS
  assert.equal(resolveUnitHebrewName('mialis-villa', []), 'וילה מיאליס ריזורט');
  assert.equal(resolveUnitHebrewName('unknown-unit', []), 'unknown-unit');
});


