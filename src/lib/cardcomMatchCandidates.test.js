import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  calculateBookingBalances,
  classifyDealToBooking,
  getCandidateUnpaidBookings,
  isUnverifiedKinorotPayment
} from './cardcomMatchCandidates.js';

test('calculateBookingBalances calculates due balance and paid status correctly', () => {
  const unpaidBooking = {
    total_price_agorot: 250000,
    deposit_agorot: 50000,
    clearing_payments: [
      { amount_ils: 500 }
    ],
    payment_status: 'PARTIAL'
  };

  const balances = calculateBookingBalances(unpaidBooking);
  assert.equal(balances.totalIls, 2500);
  assert.equal(balances.paidIls, 500);
  assert.equal(balances.dueIls, 2000);
  assert.equal(balances.depositIls, 500);
  assert.equal(balances.isPaid, false);
  assert.equal(balances.isUnpaid, true);

  const fullyPaidBooking = {
    total_price_agorot: 100000,
    clearing_payments: [
      { amount_ils: 1000 }
    ],
    payment_status: 'PAID'
  };

  const paidBalances = calculateBookingBalances(fullyPaidBooking);
  assert.equal(paidBalances.totalIls, 1000);
  assert.equal(paidBalances.paidIls, 1000);
  assert.equal(paidBalances.dueIls, 0);
  assert.equal(paidBalances.isPaid, true);
  assert.equal(paidBalances.isUnpaid, false);
});

test('classifyDealToBooking classifies exact due balance match (סגירה מלאה)', () => {
  const booking = {
    total_price_agorot: 180000,
    clearing_payments: []
  };

  const result = classifyDealToBooking(1800, booking);
  assert.equal(result.type, 'exact_due');
  assert.equal(result.tag, 'סגירה מלאה');
  assert.equal(result.priority, 1);
  assert.equal(result.remainingAfterPayment, 0);
  assert.ok(result.description.includes('סוגר את מלוא היתרה'));
});

test('classifyDealToBooking classifies exact deposit match (מקדמה מדויקת)', () => {
  const booking = {
    total_price_agorot: 300000,
    deposit_agorot: 60000,
    clearing_payments: []
  };

  const result = classifyDealToBooking(600, booking);
  assert.equal(result.type, 'exact_deposit');
  assert.equal(result.tag, 'מקדמה מדויקת');
  assert.equal(result.priority, 2);
  assert.equal(result.remainingAfterPayment, 2400);
  assert.ok(result.description.includes('סוגר מקדמה ₪600'));
  assert.ok(result.description.includes('2,400'));
});

test('classifyDealToBooking classifies partial payment and computes remaining balance', () => {
  const booking = {
    total_price_agorot: 450000,
    clearing_payments: [
      { amount_ils: 1000 }
    ]
  };

  // Total: 4,500, Paid: 1,000, Due: 3,500
  // Deal: 1,500 -> Partial payment, covers 1,500, leaves 2,000
  const result = classifyDealToBooking(1500, booking);
  assert.equal(result.type, 'partial_payment');
  assert.equal(result.tag, 'תשלום חלקי');
  assert.equal(result.priority, 3);
  assert.equal(result.dueIls, 3500);
  assert.equal(result.remainingAfterPayment, 2000);
  assert.ok(result.description.includes('יסגור ₪1,500 מתוך ₪3,500'));
  assert.ok(result.description.includes('2,000'));
});

test('classifyDealToBooking classifies overpayment with surplus calculation', () => {
  const booking = {
    total_price_agorot: 100000,
    clearing_payments: []
  };

  const result = classifyDealToBooking(1200, booking);
  assert.equal(result.type, 'overpayment');
  assert.equal(result.tag, 'סגירת יתרה + עודף');
  assert.equal(result.priority, 4);
  assert.equal(result.remainingAfterPayment, 0);
  assert.ok(result.description.includes('עודף: ₪200'));
});

test('getCandidateUnpaidBookings filters out paid and canceled bookings and ranks properly', () => {
  const bookings = [
    {
      id: 'b-canceled',
      guest_name: 'רוני מבוטל',
      booking_status: 'CANCELED',
      total_price_agorot: 100000
    },
    {
      id: 'b-paid',
      guest_name: 'יוסי שולם',
      total_price_agorot: 100000,
      clearing_payments: [{ amount_ils: 1000 }],
      payment_status: 'PAID'
    },
    {
      id: 'b-exact',
      guest_name: 'אורלי כהן',
      unit_name: 'סוויטה כנרת',
      total_price_agorot: 150000,
      clearing_payments: [],
      check_in_date: '2026-11-10'
    },
    {
      id: 'b-partial',
      guest_name: 'דני לוי',
      unit_name: 'וילה רמות',
      total_price_agorot: 300000,
      clearing_payments: [],
      check_in_date: '2026-11-11'
    }
  ];

  const candidates = getCandidateUnpaidBookings(1500, bookings);
  assert.equal(candidates.length, 2, 'Only the two unpaid, active bookings should be returned');

  // Exact match (b-exact) should be ranked first
  assert.equal(candidates[0].bookingId, 'b-exact');
  assert.equal(candidates[0].type, 'exact_due');
  assert.equal(candidates[0].remainingAfterPayment, 0);

  // Partial match (b-partial) should be ranked second
  assert.equal(candidates[1].bookingId, 'b-partial');
  assert.equal(candidates[1].type, 'partial_payment');
  assert.equal(candidates[1].dueIls, 3000);
  assert.equal(candidates[1].remainingAfterPayment, 1500);
});

test('getCandidateUnpaidBookings filters candidates by search query', () => {
  const bookings = [
    {
      id: 'b-1',
      guest_name: 'אביבית שלום',
      unit_name: 'גבעה 1',
      guest_phone: '0541112222',
      total_price_agorot: 200000,
      clearing_payments: []
    },
    {
      id: 'b-2',
      guest_name: 'מיכאל אברהם',
      unit_name: 'סוויטה 2',
      guest_phone: '0529998888',
      total_price_agorot: 200000,
      clearing_payments: []
    }
  ];

  const filteredByName = getCandidateUnpaidBookings(2000, bookings, 'אביבית');
  assert.equal(filteredByName.length, 1);
  assert.equal(filteredByName[0].bookingId, 'b-1');

  const filteredByPhone = getCandidateUnpaidBookings(2000, bookings, '052999');
  assert.equal(filteredByPhone.length, 1);
  assert.equal(filteredByPhone[0].bookingId, 'b-2');
});

test('classifyDealToBooking classifies exact 20% deposit match (מקדמה 20%)', () => {
  const booking = {
    total_price_agorot: 90000, // 900 ILS total
    deposit_agorot: 0, // no explicit deposit
    clearing_payments: []
  };

  // 20% of 900 is 180 (like Yura Dushein)
  const result = classifyDealToBooking(180, booking);
  assert.equal(result.type, 'exact_20_deposit');
  assert.equal(result.tag, 'מקדמה 20%');
  assert.equal(result.priority, 2);
  assert.equal(result.remainingAfterPayment, 720);
  assert.ok(result.description.includes('מקדמת 20%'));
  assert.ok(result.description.includes('180'));
});

test('calculateBookingBalances discounts unverified Kinorot note payments and flags isUnverifiedPaid', () => {
  const unverifiedPayment = {
    method: 'KINOROT',
    note: 'שולם לפי קינורות',
    amount_ils: 1500
  };
  assert.equal(isUnverifiedKinorotPayment(unverifiedPayment), true);

  const booking = {
    total_price_agorot: 150000, // 1500 ILS
    payment_status: 'PAID',
    clearing_payments: [unverifiedPayment]
  };

  const balances = calculateBookingBalances(booking);
  assert.equal(balances.totalIls, 1500);
  assert.equal(balances.paidIls, 0, 'Unverified Kinorot note does not count towards verified paidIls');
  assert.equal(balances.dueIls, 1500, 'Due balance remains full');
  assert.equal(balances.isUnverifiedPaid, true, 'Booking is flagged as isUnverifiedPaid');
  assert.equal(balances.isUnpaid, true, 'Booking is considered unpaid for candidate matching');

  // Classified as verifying Kinorot payment
  const classification = classifyDealToBooking(1500, booking);
  assert.equal(classification.tag, 'אימות תשלום קינורות');
  assert.ok(classification.description.includes('מאמת תשלום קינורות'));
});

test('candidate rules: deal on 8th -> booking 8-9 shown; month ahead not shown; paid not shown; checkout 5 days earlier shown', () => {
  const dealDate = '2026-11-08';
  const deal = { amount: 1000, deal_time: '2026-11-08T12:00:00Z', payer_name: 'יובל' };

  const bookingStay8to9 = {
    id: 'b-8-9',
    guest_name: 'יובל כהן',
    check_in_date: '2026-11-08',
    check_out_date: '2026-11-09',
    total_price_agorot: 100000,
    clearing_payments: []
  };

  const bookingMonthAhead = {
    id: 'b-month-ahead',
    guest_name: 'יוסי',
    check_in_date: '2026-12-08',
    check_out_date: '2026-12-10',
    total_price_agorot: 100000,
    clearing_payments: []
  };

  const bookingPaid = {
    id: 'b-paid',
    guest_name: 'דניאל',
    check_in_date: '2026-11-08',
    check_out_date: '2026-11-09',
    total_price_agorot: 100000,
    payment_status: 'PAID',
    clearing_payments: [{ amount_ils: 1000, method: 'CASH' }]
  };

  const bookingCheckout5DaysAgo = {
    id: 'b-checkout-5d-ago',
    guest_name: 'עומר',
    check_in_date: '2026-10-31',
    check_out_date: '2026-11-03',
    total_price_agorot: 100000,
    clearing_payments: []
  };

  const allBookings = [bookingStay8to9, bookingMonthAhead, bookingPaid, bookingCheckout5DaysAgo];
  const candidates = getCandidateUnpaidBookings(1000, allBookings, '', deal);

  assert.equal(candidates.length, 2);
  const ids = candidates.map((c) => c.bookingId);
  assert.ok(ids.includes('b-8-9'), 'Stay 8->9 must be shown');
  assert.ok(ids.includes('b-checkout-5d-ago'), 'Checkout 5 days earlier must be shown');
  assert.ok(!ids.includes('b-month-ahead'), 'Booking starting in a month must NOT be shown');
  assert.ok(!ids.includes('b-paid'), 'Paid booking must NOT be shown');
});

