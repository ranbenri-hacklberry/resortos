import test from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestBookingsForDeal,
  isBookingInDateWindow,
  getIsraelDateString,
  shiftDays,
  computeDateDistance,
  calculateBookingBalances,
  remainingIlsAfterCharge
} from './cardcomSuggestions.js';

test('date math and timezone: deals in UTC correctly map to Asia/Jerusalem', () => {
  // 2026-11-08T22:30:00Z is 2026-11-09T00:30:00 in Asia/Jerusalem (+2)
  const dStr = getIsraelDateString('2026-11-08T22:30:00Z');
  assert.equal(dStr, '2026-11-09');

  // Day shifts
  assert.equal(shiftDays('2026-11-08', 1), '2026-11-09');
  assert.equal(shiftDays('2026-11-08', -1), '2026-11-07');
  assert.equal(shiftDays('2026-11-08', -14), '2026-10-25');
});

test('rule 1: deal on 8th -> booking 8-9 shown', () => {
  const deal = {
    dealId: 'deal-8th',
    amount: 1000,
    dealTime: '2026-11-08T14:00:00Z' // Date D = 2026-11-08
  };

  const booking = {
    id: 'b-in-stay',
    guest_name: 'יוסי כהן',
    check_in_date: '2026-11-08',
    check_out_date: '2026-11-09',
    total_price_agorot: 100000,
    clearing_payments: []
  };

  const results = suggestBookingsForDeal(deal, [booking]);
  assert.equal(results.length, 1);
  assert.equal(results[0].bookingId, 'b-in-stay');
  assert.equal(results[0].exactAmountMatch, true);
});

test('rule 2: booking that starts after D is not shown (never check_in > D)', () => {
  const deal = {
    dealId: 'deal-8th',
    amount: 1000,
    dealTime: '2026-11-08T14:00:00Z' // Date D = 2026-11-08
  };

  const futureBooking = {
    id: 'b-month-ahead',
    guest_name: 'משה דוד',
    check_in_date: '2026-12-08', // 1 month ahead
    check_out_date: '2026-12-10',
    total_price_agorot: 100000,
    clearing_payments: []
  };

  const twoDaysAheadBooking = {
    id: 'b-two-days-ahead',
    guest_name: 'שלמה',
    check_in_date: '2026-11-10', // D + 2 days
    check_out_date: '2026-11-12',
    total_price_agorot: 100000,
    clearing_payments: []
  };

  const oneDayAheadBooking = {
    id: 'b-one-day-ahead',
    guest_name: 'רוני',
    check_in_date: '2026-11-09', // D + 1 day — future, must NOT be shown
    check_out_date: '2026-11-11',
    total_price_agorot: 100000,
    clearing_payments: []
  };

  const onSiteBooking = {
    id: 'b-on-site',
    guest_name: 'נוכח',
    check_in_date: '2026-11-07',
    check_out_date: '2026-11-09',
    total_price_agorot: 100000,
    clearing_payments: []
  };

  const results = suggestBookingsForDeal(deal, [futureBooking, twoDaysAheadBooking, oneDayAheadBooking, onSiteBooking]);
  assert.equal(results.length, 1, 'Only on-site booking (check_in <= D <= check_out) should be shown');
  assert.equal(results[0].bookingId, 'b-on-site');
});

test('rule 3: paid booking not shown (balance <= 0 excluded)', () => {
  const deal = {
    dealId: 'deal-8th',
    amount: 1000,
    dealTime: '2026-11-08T14:00:00Z'
  };

  const fullyPaidBooking = {
    id: 'b-fully-paid',
    guest_name: 'דנה ישראלי',
    check_in_date: '2026-11-08',
    check_out_date: '2026-11-09',
    total_price_agorot: 100000,
    clearing_payments: [
      { amount_agorot: 100000, method: 'CREDIT_CARD', txn: 'tx-123' }
    ]
  };

  const markedPaidBooking = {
    id: 'b-marked-paid',
    guest_name: 'שרה לוי',
    check_in_date: '2026-11-08',
    check_out_date: '2026-11-09',
    total_price_agorot: 100000,
    payment_status: 'PAID',
    clearing_payments: [
      { amount_agorot: 100000, method: 'CASH' }
    ]
  };

  const partialBooking = {
    id: 'b-partial',
    guest_name: 'אבי כהן',
    check_in_date: '2026-11-08',
    check_out_date: '2026-11-09',
    total_price_agorot: 150000,
    clearing_payments: [
      { amount_agorot: 50000, method: 'CASH' }
    ]
  };

  const results = suggestBookingsForDeal(deal, [fullyPaidBooking, markedPaidBooking, partialBooking]);
  assert.equal(results.length, 1);
  assert.equal(results[0].bookingId, 'b-partial');
  assert.equal(results[0].dueIls, 1000);
});

test('rule 4: checkout 5 days earlier with balance shown (backwards search up to 14 days)', () => {
  const deal = {
    dealId: 'deal-8th',
    amount: 700,
    dealTime: '2026-11-08T10:00:00Z' // D = 2026-11-08
  };

  // Checked out Nov 3 (5 days before Nov 8)
  const checkout5DaysAgo = {
    id: 'b-debt-5-days',
    guest_name: 'עומר שיבלי',
    check_in_date: '2026-10-31',
    check_out_date: '2026-11-03',
    total_price_agorot: 70000,
    clearing_payments: []
  };

  // Checked out Oct 24 (15 days before Nov 8, exceeds 14 days)
  const checkout15DaysAgo = {
    id: 'b-debt-15-days',
    guest_name: 'עומר שיבלי',
    check_in_date: '2026-10-20',
    check_out_date: '2026-10-24',
    total_price_agorot: 70000,
    clearing_payments: []
  };

  // Older debts only when explicitly requested (separate older_debts list)
  assert.equal(suggestBookingsForDeal(deal, [checkout5DaysAgo, checkout15DaysAgo]).length, 0);
  const results = suggestBookingsForDeal(deal, [checkout5DaysAgo, checkout15DaysAgo], { includeOlderDebts: true });
  assert.equal(results.length, 1);
  assert.equal(results[0].bookingId, 'b-debt-5-days');
});

test('November deal (268711314, 2026-11-02 20:26 IL) never gets Oct 21-30 stays as default suggestions', () => {
  const deal = { dealId: '268711314', amount: 500, dealTime: '2026-11-02T18:26:18+00:00', payer_name: 'יובל דוד צוקרמן' };
  const mk = (id, cin, cout, due) => ({ id, guest_name: id, check_in_date: cin, check_out_date: cout, total_price_agorot: due * 100, clearing_payments: [] });
  const october = [
    mk('bracha', '2026-10-21', '2026-10-24', 760),
    mk('udi', '2026-10-23', '2026-10-24', 900),
    mk('ilana', '2026-10-26', '2026-10-27', 500),
    mk('simkovich', '2026-10-29', '2026-10-30', 150),
    mk('zabusky', '2026-10-30', '2026-10-31', 742)
  ];
  const stay = [mk('in-house', '2026-11-01', '2026-11-03', 900), mk('checkout-d-1', '2026-10-30', '2026-11-01', 500), mk('future', '2026-11-04', '2026-11-05', 500)];
  const ids = suggestBookingsForDeal(deal, [...october, ...stay]).map((c) => c.bookingId);
  // Strict on-site: checkout on 2026-11-01 is before D=2026-11-02, so only in-house stays.
  assert.deepEqual(ids, ['in-house']);
  for (const c of suggestBookingsForDeal(deal, [...october, ...stay])) {
    assert.ok(c.checkIn <= '2026-11-02' && c.checkOut >= '2026-11-02');
  }
});

test('rule 5: rank exact amount match first, then name similarity, then date proximity', () => {
  const deal = {
    dealId: 'deal-ranking',
    amount: 500,
    payer_name: 'יוסי כהן',
    dealTime: '2026-11-08T12:00:00Z' // D = 2026-11-08
  };

  const bookings = [
    // Candidate A: Different amount (partial balance 1200), in-house stay (distance 0), name doesn't match
    {
      id: 'b-partial-close-date',
      guest_name: 'משה שמש',
      check_in_date: '2026-11-08',
      check_out_date: '2026-11-09',
      total_price_agorot: 120000,
      clearing_payments: []
    },
    // Candidate B: Exact amount (500), checked out 4 days ago (distance 4), name doesn't match
    {
      id: 'b-exact-amount-past',
      guest_name: 'אבי לוי',
      check_in_date: '2026-11-01',
      check_out_date: '2026-11-04',
      total_price_agorot: 50000,
      clearing_payments: []
    },
    // Candidate C: Exact amount (500), checked out 4 days ago, STRONG name match (יוסי כהן)
    {
      id: 'b-exact-amount-name-match',
      guest_name: 'יוסי כהן',
      check_in_date: '2026-11-01',
      check_out_date: '2026-11-04',
      total_price_agorot: 50000,
      clearing_payments: []
    },
    // Candidate D: Exact amount (500), in-house stay (distance 0), no name match
    {
      id: 'b-exact-amount-in-house',
      guest_name: 'שרה גולד',
      check_in_date: '2026-11-08',
      check_out_date: '2026-11-09',
      total_price_agorot: 50000,
      clearing_payments: []
    }
  ];

  const results = suggestBookingsForDeal(deal, bookings, { includeOlderDebts: true });

  // Exact amount candidates (B, C, D) must all rank before Candidate A (partial amount)
  assert.equal(results[3].bookingId, 'b-partial-close-date');

  // Among exact matches (B, C, D):
  // C has strong name match -> must rank #1
  assert.equal(results[0].bookingId, 'b-exact-amount-name-match');

  // Between D (in-house, dist 0) and B (past, dist 4):
  // D has closer date proximity -> must rank before B
  assert.equal(results[1].bookingId, 'b-exact-amount-in-house');
  assert.equal(results[2].bookingId, 'b-exact-amount-past');
});

test('rule 6: max 10 candidates returned', () => {
  const deal = {
    dealId: 'deal-many',
    amount: 500,
    dealTime: '2026-11-08T12:00:00Z'
  };

  const bookings = Array.from({ length: 25 }, (_, i) => ({
    id: `b-cand-${i}`,
    guest_name: `אורח ${i}`,
    check_in_date: '2026-11-08',
    check_out_date: '2026-11-09',
    total_price_agorot: 50000,
    clearing_payments: []
  }));

  const results = suggestBookingsForDeal(deal, bookings);
  assert.equal(results.length, 10);
});

test('rule 7: manual search by name/phone stays available as explicit fallback outside default date window', () => {
  const deal = {
    dealId: 'deal-search',
    amount: 800,
    dealTime: '2026-11-08T12:00:00Z'
  };

  const farFutureBooking = {
    id: 'b-far-future',
    guest_name: 'יוסי ברק',
    guest_phone: '0541234567',
    check_in_date: '2026-12-25', // Next month (normally excluded by date window)
    check_out_date: '2026-12-27',
    total_price_agorot: 80000,
    clearing_payments: []
  };

  // Without query: excluded by date window
  const defaultResults = suggestBookingsForDeal(deal, [farFutureBooking]);
  assert.equal(defaultResults.length, 0);

  // With manual search query by name: found!
  const nameQueryResults = suggestBookingsForDeal(deal, [farFutureBooking], { query: 'ברק' });
  assert.equal(nameQueryResults.length, 1);
  assert.equal(nameQueryResults[0].bookingId, 'b-far-future');

  // With manual search query by phone: found!
  const phoneQueryResults = suggestBookingsForDeal(deal, [farFutureBooking], { query: '054123' });
  assert.equal(phoneQueryResults.length, 1);
  assert.equal(phoneQueryResults[0].bookingId, 'b-far-future');
});

test('deal on Nov 8 -> no booking with check_in after Nov 9 in the default list', () => {
  const deal = {
    dealId: 'deal-nov-8',
    amount: 500,
    dealTime: '2026-11-08T15:00:00Z' // Deal on Nov 8
  };

  const bookings = [
    {
      id: 'b-nov-9',
      guest_name: 'אורח נוב 9',
      check_in_date: '2026-11-09', // check_in = Nov 9 (> D) -> hidden
      check_out_date: '2026-11-10',
      total_price_agorot: 50000,
      clearing_payments: []
    },
    {
      id: 'b-nov-10',
      guest_name: 'אורח נוב 10',
      check_in_date: '2026-11-10', // check_in = Nov 10 (> Nov 9) -> strictly forbidden
      check_out_date: '2026-11-12',
      total_price_agorot: 50000,
      clearing_payments: []
    },
    {
      id: 'b-nov-11',
      guest_name: 'אורח נוב 11',
      check_in_date: '2026-11-11', // check_in = Nov 11 (> Nov 9) -> strictly forbidden
      check_out_date: '2026-11-13',
      total_price_agorot: 50000,
      clearing_payments: []
    },
    {
      id: 'b-dec-01',
      guest_name: 'אורח דצמבר',
      check_in_date: '2026-12-01', // far future -> strictly forbidden
      check_out_date: '2026-12-03',
      total_price_agorot: 50000,
      clearing_payments: []
    }
  ];

  const results = suggestBookingsForDeal(deal, bookings);
  const ids = results.map((r) => r.bookingId);

  assert.ok(!ids.includes('b-nov-9'), 'Booking with check_in on Nov 9 (after D) must not be shown');
  assert.ok(!ids.includes('b-nov-10'), 'Booking with check_in on Nov 10 (after Nov 9) must NOT be in the default list');
  assert.ok(!ids.includes('b-nov-11'), 'Booking with check_in on Nov 11 (after Nov 9) must NOT be in the default list');
  assert.ok(!ids.includes('b-dec-01'), 'Booking with check_in in Dec must NOT be in the default list');

  // Verify none of the returned results have check_in > D
  for (const candidate of results) {
    assert.ok(candidate.checkIn <= '2026-11-08', `Candidate check_in ${candidate.checkIn} must be <= 2026-11-08`);
  }
});



test('hard rule: only bookings with check_in <= D <= check_out (physically on site)', () => {
  const deal = { dealId: 'onsite-1', amount: 500, dealTime: '2026-11-08T12:00:00Z' };
  const bookings = [
    { id: 'before', guest_name: 'A', check_in_date: '2026-11-01', check_out_date: '2026-11-07', total_price_agorot: 50000, clearing_payments: [], booking_status: 'CONFIRMED' },
    { id: 'on-site', guest_name: 'B', check_in_date: '2026-11-07', check_out_date: '2026-11-09', total_price_agorot: 50000, clearing_payments: [], booking_status: 'CONFIRMED' },
    { id: 'future', guest_name: 'C', check_in_date: '2026-11-09', check_out_date: '2026-11-11', total_price_agorot: 50000, clearing_payments: [], booking_status: 'CONFIRMED' },
    { id: 'checkout-day', guest_name: 'D', check_in_date: '2026-11-06', check_out_date: '2026-11-08', total_price_agorot: 50000, clearing_payments: [], booking_status: 'CONFIRMED' }
  ];
  const ids = suggestBookingsForDeal(deal, bookings).map((c) => c.bookingId);
  assert.deepEqual(ids.sort(), ['checkout-day', 'on-site']);
});

test('Iska-style booking: deposit metadata must not shrink due (1:1 remaining = total - payments)', () => {
  const booking = {
    id: 'kin_680_76182',
    guest_name: 'איסקה קופציק',
    unit_id: 'k680',
    check_in_date: '2026-11-08',
    check_out_date: '2026-11-09',
    total_price_agorot: 50000,
    deposit_agorot: 10000,
    payment_status: 'UNPAID',
    clearing_payments: [],
    booking_status: 'CHECKED_IN'
  };
  const deal = { amount: 500, deal_time: '2026-11-08T12:10:35.000Z', payer_name: 'איסקה', deal_id: '269337493' };
  const results = suggestBookingsForDeal(deal, [booking]);
  assert.equal(results.length, 1);
  assert.equal(results[0].dueIls, 500);
  assert.equal(results[0].totalIls, 500);
  assert.equal(results[0].paidIls, 0);
  assert.equal(results[0].type, 'exact_due');
  assert.equal(results[0].remainingAfterPayment, 0);
  assert.ok(String(results[0].unitName).includes('מול הנוף') || results[0].unitName === 'k680');
});

