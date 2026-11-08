import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchCardcomTransactions,
  normalizeCardcomDeal,
  rankCandidateBookings,
  formatRanApprovalPrompt,
  formatGuestConfirmationMessage,
  formatGuestInvoiceDeliveryMessage,
  recordCardcomTerminalPayment,
  createCardcomInvoiceForDeal,
  resolveBookingInvoiceDetails,
  OutboundRateLimiter,
  isRanPhone,
  isTestTransaction,
  isUnverifiedKinorotPayment,
  getBookingDueIls,
  CARDCOM_CREATE_DOCUMENT_URL
} from './lib/cardcomTerminalService.js';
import { CardcomStorage } from './lib/cardcomStorage.js';
import { isPollerEnabled, pollCardcomTerminal } from './syncCardcomTerminal.js';

test('normalizeCardcomDeal extracts all transaction fields correctly', () => {
  const raw = {
    DealNumber: '987654321',
    TerminalNumber: '184288',
    Amount: 1850.5,
    ApprovalNumber: '1234567',
    Last4CardDigitsString: '5566',
    CardOwnerName: 'ישראל ישראלי',
    CardNumberEntryMode: 'Phone',
    CreateDate: '2026-11-07T10:15:00',
    ResponseCode: 0,
    Status: 'Success'
  };

  const deal = normalizeCardcomDeal(raw);
  assert.equal(deal.dealId, '987654321');
  assert.equal(deal.terminal, '184288');
  assert.equal(deal.amount, 1850.5);
  assert.equal(deal.amountAgorot, 185050);
  assert.equal(deal.approval, '1234567');
  assert.equal(deal.last4, '5566');
  assert.equal(deal.cardOwnerName, 'ישראל ישראלי');
  assert.equal(deal.entryMode, 'Phone');
  assert.equal(deal.isSuccess, true);
});

test('normalizeCardcomDeal rejects failed or declined transactions', () => {
  const failed = normalizeCardcomDeal({
    DealNumber: '111',
    ResponseCode: 4,
    Status: 'Declined'
  });
  assert.equal(failed.isSuccess, false);
});

test('rankCandidateBookings ranks exact balance match highest', () => {
  const deal = {
    dealId: 'deal-001',
    amount: 1200,
    amountAgorot: 120000,
    approval: '998877',
    last4: '4321',
    cardOwnerName: 'דנה ישראלי'
  };

  const bookings = [
    {
      id: 'b-1',
      guest_name: 'יוסי כהן',
      unit_name: 'סוויטה 1',
      total_price_agorot: 200000,
      clearing_payments: [],
      check_in_date: '2026-11-07',
      check_out_date: '2026-11-09'
    },
    {
      id: 'b-2',
      guest_name: 'דנה ישראלי',
      unit_name: 'וילה מיאליס',
      total_price_agorot: 120000,
      clearing_payments: [],
      check_in_date: '2026-11-07',
      check_out_date: '2026-11-08'
    },
    {
      id: 'b-3',
      guest_name: 'אבי לוי',
      unit_name: 'גבעה 2',
      total_price_agorot: 300000,
      deposit_agorot: 120000,
      clearing_payments: [],
      check_in_date: '2026-11-15',
      check_out_date: '2026-11-17'
    }
  ];

  const ranked = rankCandidateBookings(deal, bookings, '2026-11-07');
  assert.ok(ranked.length >= 2);
  assert.equal(ranked[0].bookingId, 'b-2');
  assert.equal(ranked[0].guestName, 'דנה ישראלי');
  assert.ok(ranked[0].score >= 80, 'b-2 has high score from exact amount + strong name match + in-house');
});

test('rankCandidateBookings ignores deals already linked in clearing_payments', () => {
  const deal = {
    dealId: 'deal-already-linked',
    amount: 500,
    amountAgorot: 50000
  };

  const bookings = [
    {
      id: 'b-linked',
      guest_name: 'משה',
      total_price_agorot: 50000,
      clearing_payments: [
        { deal_number: 'deal-already-linked', amount_agorot: 50000 }
      ]
    }
  ];

  const ranked = rankCandidateBookings(deal, bookings);
  assert.equal(ranked.length, 0, 'Already linked deal should not produce candidates');
});

test('formatRanApprovalPrompt formats Hebrew message with all details and instructions', () => {
  const deal = {
    amount: 2500,
    last4: '1020',
    approval: '098765',
    dealTime: '2026-11-07T14:30:00Z'
  };

  const candidate = {
    guestName: 'דוד כהן',
    unitName: 'וילה מיאליס',
    checkIn: '2026-11-07',
    checkOut: '2026-11-09',
    dueIls: 2500
  };

  const text = formatRanApprovalPrompt(deal, candidate);
  assert.ok(text.includes('סליקה חדשה'), 'Includes heading');
  assert.ok(text.includes('2,500') || text.includes('2500'), 'Includes formatted amount');
  assert.ok(text.includes('1020'), 'Includes last 4');
  assert.ok(text.includes('098765'), 'Includes approval number');
  assert.ok(text.includes('דוד כהן'), 'Includes guest name');
  assert.ok(text.includes('וילה מיאליס'), 'Includes unit name');
  assert.ok(text.includes('השב *1* לאישור / *2* לאפשרות הבאה / *0* לא לשייך'), 'Includes 1/2/0 choices');
});

test('formatGuestConfirmationMessage asks about sending invoice via WhatsApp', () => {
  const deal = { amount: 1800, approval: '54321' };
  const booking = { guest_name: 'רוני ברק', unit_name: 'סוויטה 1' };
  const text = formatGuestConfirmationMessage(deal, booking);

  assert.ok(text.includes('רוני'), 'Greets guest by first name');
  assert.ok(text.includes('1,800') || text.includes('1800'), 'Mentions payment amount');
  assert.ok(text.includes('סוויטה 1'), 'Mentions unit');
  assert.ok(text.includes('לשלוח לך את החשבונית לכאן בווטסאפ?'), 'Asks guest about invoice');
});

test('formatGuestInvoiceDeliveryMessage sends invoice link gracefully', () => {
  const text = formatGuestInvoiceDeliveryMessage('https://secure.cardcom.solutions/doc/12345', '1099', 'סוויטה 1');
  assert.ok(text.includes('https://secure.cardcom.solutions/doc/12345'), 'Includes invoice url');
  assert.ok(text.includes('1099'), 'Includes invoice number');
});

test('company booking with custom line: invoice name, HP, line and guest text use it', async () => {
  const companyBooking = {
    id: 'b-company-1',
    guest_name: 'יוסי כהן',
    company_name: 'אלפא הייטק בע"מ',
    tax_id: '515998877',
    custom_invoice_line: 'סדנת מנהלים שנתית',
    guest_phone: '0541112233',
    guest_email: 'finance@alphatech.co.il',
    unit_name: 'וילה מיאליס'
  };

  const deal = { amount: 8500, approval: '987654' };

  // 1. Check resolveBookingInvoiceDetails
  const resolved = resolveBookingInvoiceDetails(companyBooking, companyBooking.unit_name);
  assert.equal(resolved.companyName, 'אלפא הייטק בע"מ');
  assert.equal(resolved.taxId, '515998877');
  assert.equal(resolved.customLine, 'סדנת מנהלים שנתית');
  assert.equal(resolved.invoiceLine, 'סדנת מנהלים שנתית');
  assert.equal(resolved.guestDescription, 'סדנת מנהלים שנתית');
  assert.ok(resolved.invoiceCustomerName.includes('אלפא הייטק בע"מ'));
  assert.ok(resolved.invoiceCustomerName.includes('515998877'));

  // 2. Check guest text: uses custom line and NOT unit name
  const guestMsg = formatGuestConfirmationMessage(deal, companyBooking, companyBooking.unit_name);
  assert.ok(guestMsg.includes('עבור סדנת מנהלים שנתית'), 'Guest text uses custom line');
  assert.ok(!guestMsg.includes('וילה מיאליס'), 'Guest text does not include unit name when custom line is set');
  assert.ok(guestMsg.includes('8,500') || guestMsg.includes('8500'));
  assert.ok(guestMsg.includes('987654'));

  // 3. Check Cardcom invoice creation: passes company name + HP and custom line
  let sentBody = null;
  const mockFetch = async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({ ResponseCode: 0, DocumentNumber: 'INV-888', DocumentUrl: 'https://cardcom/doc/888' })
    };
  };

  await createCardcomInvoiceForDeal({
    dealId: 'deal-comp-1',
    amount: 8500,
    booking: companyBooking,
    apiName: 'test',
    apiPassword: 'pass',
    fetchImpl: mockFetch
  });

  assert.ok(sentBody.Document.Name.includes('אלפא הייטק בע"מ ח.פ. 515998877'));
  assert.equal(sentBody.Document.Email, 'finance@alphatech.co.il');
  assert.equal(sentBody.Document.Products[0].Description, 'סדנת מנהלים שנתית');
});

test('regular stay booking falls back to "אירוח" and unit name', async () => {
  const regularBooking = {
    id: 'b-reg-1',
    guest_name: 'דני לוי',
    unit_name: 'סוויטה 1'
  };

  const deal = { amount: 1500, approval: '112233' };

  // 1. Check resolveBookingInvoiceDetails
  const resolved = resolveBookingInvoiceDetails(regularBooking, regularBooking.unit_name);
  assert.equal(resolved.customLine, '');
  assert.equal(resolved.invoiceLine, 'אירוח ב-סוויטה 1');
  assert.equal(resolved.guestDescription, 'האירוח ב-סוויטה 1');
  assert.equal(resolved.invoiceCustomerName, 'דני לוי');

  // 2. Check guest text
  const guestMsg = formatGuestConfirmationMessage(deal, regularBooking, regularBooking.unit_name);
  assert.ok(guestMsg.includes('עבור האירוח ב-סוויטה 1'));

  // 3. Check regular booking without unit: falls back to "האירוח"
  const noUnitBooking = { guest_name: 'שרה' };
  const noUnitMsg = formatGuestConfirmationMessage(deal, noUnitBooking, '');
  assert.ok(noUnitMsg.includes('עבור האירוח'));

  // 4. Check Cardcom invoice fallback email when booking has no email
  let sentBody = null;
  const mockFetch = async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({ ResponseCode: 0, DocumentNumber: 'INV-111', DocumentUrl: 'https://cardcom/doc/111' })
    };
  };

  await createCardcomInvoiceForDeal({
    dealId: 'deal-reg-1',
    amount: 1500,
    booking: noUnitBooking,
    apiName: 'test',
    apiPassword: 'pass',
    fetchImpl: mockFetch
  });

  assert.equal(sentBody.Document.Email, 'mialeesresort@mialees.com');
  assert.equal(sentBody.Document.Products[0].Description, 'אירוח ונופש');
});

test('recordCardcomTerminalPayment records payment and is idempotent', () => {
  const booking = {
    id: 'b-test-1',
    guest_name: 'יפה גולן',
    total_price_agorot: 150000,
    clearing_payments: []
  };

  const deal = {
    dealId: 'deal-999',
    amount: 1500,
    amountAgorot: 150000,
    approval: '777888',
    last4: '9988',
    cardOwnerName: 'יפה גולן',
    dealTime: '2026-11-07T11:00:00'
  };

  const invoice = {
    documentNumber: 'INV-4001',
    documentUrl: 'https://cardcom/doc/4001'
  };

  // First call: records payment
  const first = recordCardcomTerminalPayment(booking, deal, invoice);
  assert.equal(first.isDuplicate, false);
  assert.equal(first.booking.clearing_payments.length, 1);
  assert.equal(first.booking.payment_status, 'PAID');
  assert.equal(first.booking.clearing_payments[0].deal_number, 'deal-999');
  assert.equal(first.booking.clearing_payments[0].document_number, 'INV-4001');

  // Second call: idempotent, does not add duplicate row
  const second = recordCardcomTerminalPayment(first.booking, deal, invoice);
  assert.equal(second.isDuplicate, true);
  assert.equal(second.booking.clearing_payments.length, 1);
  assert.equal(second.booking.clearing_payments[0].deal_number, 'deal-999');
});

test('createCardcomInvoiceForDeal links existing deal without new charge', async () => {
  let requestedUrl = '';
  let requestedBody = null;

  const mockFetch = async (url, options) => {
    requestedUrl = url;
    requestedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        ResponseCode: 0,
        DocumentNumber: '554433',
        DocumentUrl: 'https://secure.cardcom.solutions/doc/554433',
        Description: 'Success'
      })
    };
  };

  const res = await createCardcomInvoiceForDeal({
    dealId: 'deal-888',
    amount: 1250,
    name: 'יוסי כהן',
    email: '',
    phone: '0541234567',
    description: 'אירוח במיאליס',
    apiName: 'mock-user',
    apiPassword: 'mock-password',
    fetchImpl: mockFetch
  });

  assert.equal(requestedUrl, CARDCOM_CREATE_DOCUMENT_URL);
  assert.equal(requestedBody.Document.DocumentTypeToCreate, 'TaxInvoiceAndReceipt');
  assert.equal(requestedBody.Document.Email, 'mialeesresort@mialees.com', 'Fallback email used when guest has no email');
  assert.deepEqual(requestedBody.DealNumbers, [{ DealNumber: 'deal-888' }], 'Linked to existing deal without charging card');
  assert.equal(res.documentNumber, '554433');
  assert.equal(res.documentUrl, 'https://secure.cardcom.solutions/doc/554433');
});

test('OutboundRateLimiter strictly enforces limits and resets on reply', () => {
  const limiter = new OutboundRateLimiter();
  const guestChat = '972501234567@s.whatsapp.net';

  // 1st message: allowed
  assert.equal(limiter.canSend(guestChat).allowed, true);
  limiter.recordOutbound(guestChat);

  // 2nd message: allowed
  assert.equal(limiter.canSend(guestChat).allowed, true);
  limiter.recordOutbound(guestChat);

  // 3rd message within 60s: blocked by 60s limit
  const check3 = limiter.canSend(guestChat);
  assert.equal(check3.allowed, false);
  assert.equal(check3.reason, 'RATE_LIMIT_60S');

  // Reset clock for consecutive test
  limiter.history = []; // simulate 60s passed
  // 3rd outbound allowed
  assert.equal(limiter.canSend(guestChat).allowed, true);
  limiter.recordOutbound(guestChat);

  // 4th outbound: blocked by max 3 consecutive unreplied
  const check4 = limiter.canSend(guestChat);
  assert.equal(check4.allowed, false);
  assert.equal(check4.reason, 'MAX_CONSECUTIVE_UNREPLIED');

  // Guest replies: resets consecutive counter
  limiter.recordInbound(guestChat);
  assert.equal(limiter.canSend(guestChat).allowed, true);
});

test('isRanPhone recognizes Ran private phone and Baileys LID', () => {
  assert.equal(isRanPhone('+972 54-831-7887'), true);
  assert.equal(isRanPhone('054-831-7887'), true);
  assert.equal(isRanPhone('972548317887@s.whatsapp.net'), true);
  assert.equal(isRanPhone('170626836910125@lid'), true);
  assert.equal(isRanPhone('052-123-4567'), false);
  assert.equal(isRanPhone('050-999-9999'), false);
});

test('poller is disabled by default and enabled only when flag is set', () => {
  const oldEnv = process.env.CARDCOM_TERMINAL_SYNC_ENABLED;
  try {
    delete process.env.CARDCOM_TERMINAL_SYNC_ENABLED;
    assert.equal(isPollerEnabled(), false, 'Poller is disabled by default');

    process.env.CARDCOM_TERMINAL_SYNC_ENABLED = '0';
    assert.equal(isPollerEnabled(), false, 'Poller is disabled when set to 0');

    process.env.CARDCOM_TERMINAL_SYNC_ENABLED = '1';
    assert.equal(isPollerEnabled(), true, 'Poller is enabled when set to 1');

    process.env.CARDCOM_TERMINAL_SYNC_ENABLED = 'true';
    assert.equal(isPollerEnabled(), true, 'Poller is enabled when set to true');
  } finally {
    if (oldEnv !== undefined) {
      process.env.CARDCOM_TERMINAL_SYNC_ENABLED = oldEnv;
    } else {
      delete process.env.CARDCOM_TERMINAL_SYNC_ENABLED;
    }
  }
});

test('1,400 ₪ of "עומר" from 7.11 matches booking kin_685_76154', () => {
  const deal = {
    dealId: 'deal-omer-1400',
    terminal: '184288',
    amount: 1400,
    amountAgorot: 140000,
    approval: '887766',
    last4: '1122',
    cardOwnerName: 'עומר',
    dealTime: '2026-11-07T15:30:00'
  };

  const bookings = [
    {
      id: 'kin_999_other',
      guest_name: 'יוסי אברהם',
      unit_name: 'סוויטה 3',
      total_price_agorot: 200000,
      clearing_payments: [],
      check_in_date: '2026-11-20',
      check_out_date: '2026-11-22'
    },
    {
      id: 'kin_685_76154',
      guest_name: 'עומר כהן',
      unit_name: 'סוויטה מונטנה',
      total_price_agorot: 140000,
      clearing_payments: [],
      check_in_date: '2026-11-07',
      check_out_date: '2026-11-09'
    }
  ];

  const candidates = rankCandidateBookings(deal, bookings, '2026-11-07');
  assert.ok(candidates.length >= 1, 'Should find at least 1 candidate');
  assert.equal(candidates[0].bookingId, 'kin_685_76154');
  assert.equal(candidates[0].dueIls, 1400);
  assert.ok(candidates[0].score >= 80, 'High score from exact balance + name + today arrival');
});

test('two charges of 180 ₪ of Yura Dushein from 5.11 match booking kin_694_75962 (20% deposit of 900)', () => {
  const deal1 = {
    dealId: 'deal-yura-1',
    terminal: '184288',
    amount: 180,
    amountAgorot: 18000,
    approval: '112233',
    last4: '4455',
    cardOwnerName: 'Yura Dushein',
    dealTime: '2026-11-05T10:00:00'
  };

  const deal2 = {
    dealId: 'deal-yura-2',
    terminal: '184288',
    amount: 180,
    amountAgorot: 18000,
    approval: '112234',
    last4: '4455',
    cardOwnerName: 'Yura Dushein',
    dealTime: '2026-11-05T10:05:00'
  };

  const bookings = [
    {
      id: 'kin_694_75962',
      guest_name: 'יורה דושיין',
      unit_name: 'סוויטה אלון',
      total_price_agorot: 90000, // 900 ILS total -> 20% deposit is 180 ILS
      clearing_payments: [],
      check_in_date: '2026-11-05',
      check_out_date: '2026-11-07'
    },
    {
      id: 'other_booking_900',
      guest_name: 'אבי שמיר',
      unit_name: 'סוויטה תמר',
      total_price_agorot: 90000,
      clearing_payments: [],
      check_in_date: '2026-11-25',
      check_out_date: '2026-11-27'
    }
  ];

  const cand1 = rankCandidateBookings(deal1, bookings, '2026-11-05');
  assert.ok(cand1.length >= 1);
  assert.equal(cand1[0].bookingId, 'kin_694_75962');
  assert.ok(cand1[0].reasons.includes('exact_20_percent_deposit'), 'Matches 20% deposit of 900');
  assert.ok(cand1[0].reasons.includes('strong_name_match'), 'Recognizes Yura Dushein <-> יורה דושיין');

  const cand2 = rankCandidateBookings(deal2, bookings, '2026-11-05');
  assert.ok(cand2.length >= 1);
  assert.equal(cand2[0].bookingId, 'kin_694_75962');
  assert.ok(cand2[0].reasons.includes('exact_20_percent_deposit'));
});

test('1 ₪ of "דניאל דניאל" is detected as test transaction', () => {
  const test1 = {
    dealId: 'deal-test-dan-1',
    amount: 1,
    cardOwnerName: 'דניאל דניאל'
  };
  assert.equal(isTestTransaction(test1), true);

  const test2 = {
    dealId: 'deal-test-5ils',
    amount: 5,
    cardOwnerName: 'ישראל ישראלי'
  };
  assert.equal(isTestTransaction(test2), true);

  const test3 = {
    dealId: 'deal-test-word',
    amount: 150,
    cardOwnerName: 'עסקת בדיקה'
  };
  assert.equal(isTestTransaction(test3), true);

  const realDeal = {
    dealId: 'deal-real-guest',
    amount: 1200,
    cardOwnerName: 'משה אהרוני'
  };
  assert.equal(isTestTransaction(realDeal), false);
});

test('600 ₪ from 8.11 matches אור כהן, kin_693_76058', () => {
  const deal = {
    dealId: 'deal-or-cohen-600',
    terminal: '184288',
    amount: 600,
    amountAgorot: 60000,
    approval: '334455',
    last4: '7788',
    cardOwnerName: 'Or Cohen',
    dealTime: '2026-11-08T12:00:00'
  };

  const bookings = [
    {
      id: 'kin_693_76058',
      guest_name: 'אור כהן',
      unit_name: 'סוויטה כנרת',
      total_price_agorot: 60000,
      clearing_payments: [],
      check_in_date: '2026-11-08',
      check_out_date: '2026-11-10'
    },
    {
      id: 'other_kin_booking',
      guest_name: 'שרה גולד',
      unit_name: 'סוויטה נוף',
      total_price_agorot: 60000,
      clearing_payments: [],
      check_in_date: '2026-11-28',
      check_out_date: '2026-11-30'
    }
  ];

  const candidates = rankCandidateBookings(deal, bookings, '2026-11-08');
  assert.ok(candidates.length >= 1);
  assert.equal(candidates[0].bookingId, 'kin_693_76058');
  assert.ok(candidates[0].reasons.includes('exact_due_balance'));
  assert.ok(candidates[0].reasons.includes('strong_name_match'));
});

test('booking marked PAID solely via Kinorot note without deal ID remains candidate', () => {
  const kinorotNotePayment = {
    method: 'KINOROT',
    note: 'שולם לפי קינורות',
    amount_ils: 1200
  };
  assert.equal(isUnverifiedKinorotPayment(kinorotNotePayment), true);

  const verifiedPayment = {
    deal_number: 'deal-real-123',
    approval: '998877',
    amount_ils: 1200
  };
  assert.equal(isUnverifiedKinorotPayment(verifiedPayment), false);

  const booking = {
    id: 'kin_unverified_note_1',
    guest_name: 'דוד ישראלי',
    unit_name: 'וילה מוריה',
    total_price_agorot: 120000,
    payment_status: 'PAID',
    clearing_payments: [kinorotNotePayment],
    check_in_date: '2026-11-10',
    check_out_date: '2026-11-12'
  };

  // Due calculation discounts unverified note
  const due = getBookingDueIls(booking);
  assert.equal(due, 1200, 'Unverified Kinorot note is discounted from verified payments');

  const deal = {
    dealId: 'deal-term-1200',
    terminal: '184288',
    amount: 1200,
    amountAgorot: 120000,
    approval: '556677',
    last4: '3344',
    cardOwnerName: 'דוד ישראלי',
    dealTime: '2026-11-10T09:00:00'
  };

  const candidates = rankCandidateBookings(deal, [booking], '2026-11-10');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].bookingId, 'kin_unverified_note_1');
  assert.ok(candidates[0].reasons.includes('unverified_kinorot_payment'), 'Identified as unverified Kinorot candidate');
});

test('exactly one tax invoice per transaction (idempotency and single invoice guarantee)', async () => {
  let fetchCallCount = 0;
  const mockFetch = async () => {
    fetchCallCount++;
    return {
      ok: true,
      json: async () => ({ ResponseCode: 0, DocumentNumber: 'NEW-DOC-1', DocumentUrl: 'https://cardcom/new' })
    };
  };

  // 1. Existing document number passed directly: no API call, reused: true
  const res1 = await createCardcomInvoiceForDeal({
    dealId: 'deal-doc-reuse-1',
    amount: 750,
    existingDocumentNumber: 'DOC-EXISTING-100',
    existingDocumentUrl: 'https://cardcom/doc/100',
    fetchImpl: mockFetch
  });
  assert.equal(fetchCallCount, 0, 'Did not call Cardcom API');
  assert.equal(res1.documentNumber, 'DOC-EXISTING-100');
  assert.equal(res1.reused, true);

  // 2. Booking clearing payment already contains invoice for this deal: no API call, reused: true
  const bookingWithDoc = {
    id: 'b-with-doc',
    guest_name: 'יוסי',
    clearing_payments: [
      {
        deal_number: 'deal-doc-reuse-2',
        document_number: 'DOC-EXISTING-200',
        document_url: 'https://cardcom/doc/200'
      }
    ]
  };

  const res2 = await createCardcomInvoiceForDeal({
    dealId: 'deal-doc-reuse-2',
    amount: 800,
    booking: bookingWithDoc,
    fetchImpl: mockFetch
  });
  assert.equal(fetchCallCount, 0, 'Did not call Cardcom API');
  assert.equal(res2.documentNumber, 'DOC-EXISTING-200');
  assert.equal(res2.reused, true);
});

test('CardcomStorage manages seen deals and pending matches in memory', async () => {
  const storage = new CardcomStorage();
  await storage.init();

  storage.addSeenDeal({
    deal_id: 'store-deal-1',
    terminal_number: '184288',
    amount: 500,
    card_owner_name: 'בדיקה'
  });
  assert.equal(storage.hasSeenDeal('store-deal-1'), true);
  assert.equal(storage.hasSeenDeal('non-existent-deal'), false);

  storage.addPendingMatch({
    deal_id: 'store-deal-1',
    status: 'pending',
    amount: 500
  });

  const active = storage.getActivePendingMatches();
  assert.ok(active.some((m) => m.deal_id === 'store-deal-1'));

  storage.updateMatchStatus('store-deal-1', 'test');
  const activeAfterUpdate = storage.getActivePendingMatches();
  assert.ok(!activeAfterUpdate.some((m) => m.deal_id === 'store-deal-1'), 'Test transaction is no longer active pending match');
});

test('sync backfill: dry-run does not persist while apply persists proposals', async () => {
  const mockTransactions = [
    {
      DealNumber: 'backfill-deal-999',
      TerminalNumber: '184288',
      Amount: 1500,
      ApprovalNumber: '998877',
      Last4CardDigitsString: '1234',
      CardOwnerName: 'ראובן כהן',
      CardNumberEntryMode: 'Phone',
      CreateDate: '2026-11-01T10:00:00',
      ResponseCode: 0,
      Status: 'Success'
    }
  ];

  const mockBookings = [
    {
      id: 'b-backfill-match',
      guest_name: 'ראובן כהן',
      unit_name: 'סוויטה 1',
      total_price_agorot: 150000,
      clearing_payments: [],
      check_in_date: '2026-11-01',
      check_out_date: '2026-11-03'
    }
  ];

  const mockFetch = async (url) => {
    if (url.includes('ListTransactions')) {
      return {
        ok: true,
        json: async () => ({ ResponseCode: 0, Transactions: mockTransactions })
      };
    }
    if (url.includes('hotelos_bookings')) {
      return {
        ok: true,
        json: async () => mockBookings
      };
    }
    return { ok: true, json: async () => [] };
  };

  // Test 1: Dry run
  const dryStorage = new CardcomStorage({ fetchImpl: mockFetch, enableDiskCache: false });
  await dryStorage.init();

  const dryResult = await pollCardcomTerminal({
    apiName: 'mock-user',
    apiPassword: 'mock-pass',
    sinceDate: '2026-11-01',
    isDryRun: true,
    force: true,
    fetchImpl: mockFetch,
    storage: dryStorage,
    bookings: mockBookings
  });

  assert.equal(dryResult.ok, true);
  assert.equal(dryResult.isDryRun, true);
  assert.equal(dryResult.totalPolled, 1);
  assert.equal(dryResult.dryRunResults.length, 1);
  assert.equal(dryResult.dryRunResults[0].dealId, 'backfill-deal-999');
  assert.equal(dryResult.dryRunResults[0].topCandidate.bookingId, 'b-backfill-match');
  assert.equal(dryStorage.hasSeenDeal('backfill-deal-999'), false, 'Dry run must NOT add deal to storage');
  assert.equal(dryStorage.getPendingMatches().length, 0, 'Dry run must NOT add matches to storage');

  // Test 2: Apply
  const applyStorage = new CardcomStorage({ fetchImpl: mockFetch, enableDiskCache: false });
  await applyStorage.init();

  const applyResult = await pollCardcomTerminal({
    apiName: 'mock-user',
    apiPassword: 'mock-pass',
    sinceDate: '2026-11-01',
    isDryRun: false,
    force: true,
    fetchImpl: mockFetch,
    storage: applyStorage,
    bookings: mockBookings
  });

  assert.equal(applyResult.ok, true);
  assert.equal(applyResult.isDryRun, false);
  assert.equal(applyStorage.hasSeenDeal('backfill-deal-999'), true, 'Apply must record seen deal');
  assert.equal(applyStorage.getPendingMatches().length, 1, 'Apply must persist pending match');
  assert.equal(applyStorage.getPendingMatches()[0].deal_id, 'backfill-deal-999');
});

test('fetchCardcomTransactions sends LimitForTerminal, paginates beyond 50, checks ResponseCode, filters refunds and non-ILS', async () => {
  const requestedBodies = [];

  const mockFetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    requestedBodies.push(body);

    if (body.Page === 1) {
      // Return 50 transactions on page 1
      const page1Deals = Array.from({ length: 50 }, (_, i) => ({
        DealNumber: `page1-deal-${i + 1}`,
        TerminalNumber: '184288',
        Amount: 100 + i,
        ApprovalNumber: `app1-${i}`,
        Last4CardDigitsString: '1111',
        CardOwnerName: `Guest ${i}`,
        ResponseCode: 0,
        Status: 'Success',
        CoinId: '1',
        IsRefund: false
      }));

      // Add a refund, a non-ILS deal, and a failed deal to page 1
      page1Deals[0].IsRefund = true; // should be skipped
      page1Deals[1].CoinId = '2'; // USD, should be skipped
      page1Deals[2].Status = 'Declined'; // should be skipped

      return {
        ok: true,
        json: async () => ({
          ResponseCode: 0,
          Transactions: page1Deals
        })
      };
    }

    if (body.Page === 2) {
      // Return 5 transactions on page 2 (terminates pagination)
      const page2Deals = Array.from({ length: 5 }, (_, i) => ({
        DealNumber: `page2-deal-${i + 1}`,
        TerminalNumber: '184288',
        Amount: 200 + i,
        ApprovalNumber: `app2-${i}`,
        Last4CardDigitsString: '2222',
        CardOwnerName: `Guest P2-${i}`,
        ResponseCode: 0,
        Status: 'Success',
        CoinId: '1',
        IsRefund: false
      }));

      return {
        ok: true,
        json: async () => ({
          ResponseCode: 0,
          Transactions: page2Deals
        })
      };
    }

    return {
      ok: true,
      json: async () => ({ ResponseCode: 0, Transactions: [] })
    };
  };

  const deals = await fetchCardcomTransactions({
    from: '2026-11-01',
    to: '2026-11-05',
    terminal: '184288',
    apiName: 'test-user',
    apiPassword: 'test-password',
    fetchImpl: mockFetch
  });

  // Verify LimitForTerminal was sent
  assert.equal(requestedBodies.length, 2, 'Paginates across 2 pages');
  assert.equal(requestedBodies[0].LimitForTerminal, 184288);
  assert.equal(requestedBodies[0].TerminalNumber, 184288);
  assert.equal(requestedBodies[0].Page, 1);
  assert.equal(requestedBodies[1].Page, 2);

  // 50 on page 1 (minus 3 skipped: refund, USD, declined = 47) + 5 on page 2 = 52 total
  assert.equal(deals.length, 52);
  assert.ok(!deals.some((d) => d.dealId === 'page1-deal-1'), 'Refund was filtered out');
  assert.ok(!deals.some((d) => d.dealId === 'page1-deal-2'), 'Non-ILS was filtered out');
  assert.ok(!deals.some((d) => d.dealId === 'page1-deal-3'), 'Declined transaction was filtered out');

  // Verify ResponseCode !== 0 throws
  const failingFetch = async () => ({
    ok: true,
    json: async () => ({ ResponseCode: 1, Description: 'Invalid terminal credentials' })
  });

  await assert.rejects(
    fetchCardcomTransactions({
      from: '2026-11-01',
      to: '2026-11-05',
      terminal: '184288',
      apiName: 'bad-user',
      apiPassword: 'bad-password',
      fetchImpl: failingFetch
    }),
    /Cardcom ListTransactions failed/
  );
});

test('CardcomStorage persist writes both tables via persist_cardcom_sync RPC, surfaces write errors, and preserves local backup', async () => {
  const sentRequests = [];
  const mockFetch = async (url, opts) => {
    sentRequests.push({ url: String(url), method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
    return { ok: true, status: 200, json: async () => [] };
  };

  const storage = new CardcomStorage({
    supabaseUrl: 'https://mock.supabase.co',
    supabaseKey: 'mock-key',
    fetchImpl: mockFetch,
    enableDiskCache: false
  });
  await storage.init();

  storage.addSeenDeal({ deal_id: 'seen-101', terminal_number: '184288', amount: 500 });
  storage.addPendingMatch({ deal_id: 'pending-202', amount: 800, status: 'pending' });

  await storage.persist();

  // Verify persist_cardcom_sync RPC was targeted with both arrays
  const rpcReq = sentRequests.find((r) => r.url.includes('/rpc/persist_cardcom_sync'));
  const runtimeReq = sentRequests.filter((r) => r.url.includes('/hotelos_runtime_settings'));

  assert.ok(rpcReq, 'Must persist to dedicated tables via persist_cardcom_sync RPC');
  assert.ok(Array.isArray(rpcReq.body.p_seen) && rpcReq.body.p_seen.length > 0, 'Must include seen deals in RPC');
  assert.ok(Array.isArray(rpcReq.body.p_pending) && rpcReq.body.p_pending.length > 0, 'Must include pending matches in RPC');
  assert.ok(runtimeReq.length >= 2, 'Must sync to hotelos_runtime_settings');

  // Verify error surfacing on RPC failure
  const failingFetch = async (url) => {
    if (String(url).includes('/rpc/persist_cardcom_sync')) {
      return { ok: false, status: 500, statusText: 'Internal Server Error', text: async () => 'DB RPC error' };
    }
    return { ok: true, status: 200, json: async () => [] };
  };

  const failingStorage = new CardcomStorage({
    supabaseUrl: 'https://mock.supabase.co',
    supabaseKey: 'mock-key',
    fetchImpl: failingFetch,
    enableDiskCache: false
  });
  await failingStorage.init();
  failingStorage.addSeenDeal({ deal_id: 'seen-err', terminal_number: '184288', amount: 100 });

  await assert.rejects(
    failingStorage.persist(),
    /CardcomStorage\.persist failed/
  );
});

test('concurrency: two simultaneous approvals create exactly one invoice and reuse document', async () => {
  let cardcomCallCount = 0;
  const mockFetch = async (url, opts) => {
    if (url.includes('CreateDocument')) {
      cardcomCallCount++;
      return {
        ok: true,
        json: async () => ({
          ResponseCode: 0,
          DocumentNumber: 'INV-UNIQUE-555',
          DocumentUrl: 'https://cardcom/doc/555'
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const booking = { id: 'b-concur-1', guest_name: 'רן' };

  // Request 1: first to call Cardcom
  const res1 = await createCardcomInvoiceForDeal({
    dealId: 'deal-concur-999',
    amount: 1500,
    booking,
    apiName: 'mock-user',
    apiPassword: 'mock-pass',
    fetchImpl: mockFetch
  });

  assert.equal(res1.documentNumber, 'INV-UNIQUE-555');
  assert.equal(cardcomCallCount, 1);

  // Request 2 (concurrent/subsequent): existingDocumentNumber passed or recognized
  const res2 = await createCardcomInvoiceForDeal({
    dealId: 'deal-concur-999',
    amount: 1500,
    booking,
    existingDocumentNumber: res1.documentNumber,
    existingDocumentUrl: res1.documentUrl,
    apiName: 'mock-user',
    apiPassword: 'mock-pass',
    fetchImpl: mockFetch
  });

  assert.equal(res2.documentNumber, 'INV-UNIQUE-555');
  assert.equal(res2.reused, true);
  assert.equal(cardcomCallCount, 1, 'Cardcom API was called exactly once across both requests');
});

test('ops link endpoint integration: creates invoice with ExternalId, reuses existing doc, rejects duplicate booking assignment, and handles DB write failure', async () => {
  const { onRequest } = await import('../functions/api/ops/[[path]].js');

  const baseEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
    HOTELOS_DESK_PIN: '1234',
    CARDCOM_API_NAME: 'test-cardcom-user',
    CARDCOM_API_PASSWORD: 'test-cardcom-password'
  };

  const mockBooking = {
    id: 'b-link-101',
    guest_name: 'יוסי כהן',
    total_price_agorot: 100000,
    clearing_payments: []
  };

  const mockMatch = {
    deal_id: 'deal-link-777',
    amount: 1000,
    approval: '123456',
    last4: '9988',
    payer_name: 'יוסי כהן'
  };

  // 1. Success with new invoice creation: receipt before invoice!
  let receiptRpcBody = null;
  let cardcomCreatedDoc = null;
  let finalizeRpcBody = null;
  let claimRetryCalled = false;

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts = {}) => {
      const urlStr = String(url);

      if (urlStr.includes('/cardcom_pending_matches')) {
        return new Response(JSON.stringify([mockMatch]), { status: 200 });
      }
      if (urlStr.includes('/hotelos_bookings?id=eq.b-link-101')) {
        return new Response(JSON.stringify([mockBooking]), { status: 200 });
      }
      if (urlStr.includes('/rpc/record_cardcom_deal_receipt')) {
        receiptRpcBody = JSON.parse(opts.body);
        return new Response(JSON.stringify({
          ok: true,
          booking_id: 'b-link-101',
          payment_status: 'PARTIAL',
          total_paid_agorot: 100000,
          ledger_status: 'pending_invoice'
        }), { status: 200 });
      }
      if (urlStr.includes('/rpc/claim_cardcom_deal_retry')) {
        claimRetryCalled = true;
        return new Response(JSON.stringify({ ok: true, status: 'claiming_retry' }), { status: 200 });
      }
      if (urlStr.includes('ListTransactions')) {
        // Not yet created in Cardcom
        return new Response(JSON.stringify({ ResponseCode: 0, Tranzactions: [] }), { status: 200 });
      }
      if (urlStr.includes('CreateDocument')) {
        cardcomCreatedDoc = JSON.parse(opts.body);
        return new Response(JSON.stringify({
          ResponseCode: 0,
          DocumentNumber: 'INV-OPS-100',
          DocumentUrl: 'https://cardcom/doc/100'
        }), { status: 200 });
      }
      if (urlStr.includes('/rpc/finalize_cardcom_deal_invoice')) {
        finalizeRpcBody = JSON.parse(opts.body);
        return new Response(JSON.stringify({ ok: true, status: 'invoiced', document_number: 'INV-OPS-100' }), { status: 200 });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const linkReq = new Request('https://test/api/ops/cardcom-terminal/link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer 1234'
      },
      body: JSON.stringify({
        deal_id: 'deal-link-777',
        booking_id: 'b-link-101'
      })
    });

    const res1 = await onRequest({
      request: linkReq,
      params: { path: ['cardcom-terminal', 'link'] },
      env: baseEnv
    });

    const body1 = await res1.json();
    assert.equal(res1.status, 200);
    assert.equal(body1.ok, true);
    assert.equal(body1.invoice.documentNumber, 'INV-OPS-100');
    assert.ok(receiptRpcBody, 'Must call record_cardcom_deal_receipt FIRST');
    assert.equal(receiptRpcBody.p_receipt_entry.deal_number, 'deal-link-777');
    assert.equal(receiptRpcBody.p_receipt_entry.external_id, 'deal-link-777');
    assert.equal(receiptRpcBody.p_receipt_entry.invoice_status, 'pending_invoice');
    assert.equal(claimRetryCalled, true, 'Must call claim_cardcom_deal_retry before Cardcom');
    assert.equal(cardcomCreatedDoc.Document.ExternalId, 'deal-link-777');
    assert.equal(finalizeRpcBody.p_document_number, 'INV-OPS-100');

    // 2. Reject duplicate assignment if deal is already assigned to another booking
    globalThis.fetch = async (urlStr) => {
      if (String(urlStr).includes('/cardcom_pending_matches')) {
        return new Response(JSON.stringify([mockMatch]), { status: 200 });
      }
      if (String(urlStr).includes('/hotelos_bookings?id=eq.b-link-101')) {
        return new Response(JSON.stringify([mockBooking]), { status: 200 });
      }
      if (String(urlStr).includes('/rpc/record_cardcom_deal_receipt')) {
        return new Response(JSON.stringify({
          error: 'DEAL_ALREADY_ASSIGNED',
          message: 'Deal deal-link-777 is already claimed by booking b-other-999'
        }), { status: 409 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    };

    const dupReq = new Request('https://test/api/ops/cardcom-terminal/link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer 1234'
      },
      body: JSON.stringify({
        deal_id: 'deal-link-777',
        booking_id: 'b-link-101'
      })
    });

    const dupRes = await onRequest({
      request: dupReq,
      params: { path: ['cardcom-terminal', 'link'] },
      env: baseEnv
    });

    const dupBody = await dupRes.json();
    assert.equal(dupRes.status, 409);
    assert.equal(dupBody.error, 'DEAL_ALREADY_ASSIGNED');

    // 3. Reject with 500 DB_WRITE_FAILED if database receipt write fails: ZERO Cardcom calls!
    let cardcomDocCalledOnDbFail = false;
    globalThis.fetch = async (urlStr) => {
      if (String(urlStr).includes('/cardcom_pending_matches')) {
        return new Response(JSON.stringify([mockMatch]), { status: 200 });
      }
      if (String(urlStr).includes('/hotelos_bookings?id=eq.b-link-101')) {
        return new Response(JSON.stringify([mockBooking]), { status: 200 });
      }
      if (String(urlStr).includes('/rpc/record_cardcom_deal_receipt')) {
        return new Response(JSON.stringify({ error: 'DB_RECEIPT_ERROR' }), { status: 500 });
      }
      if (String(urlStr).includes('CreateDocument')) {
        cardcomDocCalledOnDbFail = true;
        return new Response(JSON.stringify({ ResponseCode: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const failReq = new Request('https://test/api/ops/cardcom-terminal/link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer 1234'
      },
      body: JSON.stringify({
        deal_id: 'deal-link-777',
        booking_id: 'b-link-101'
      })
    });

    const failRes = await onRequest({
      request: failReq,
      params: { path: ['cardcom-terminal', 'link'] },
      env: baseEnv
    });

    const failBody = await failRes.json();
    assert.equal(failRes.status, 500);
    assert.equal(failBody.error, 'DB_WRITE_FAILED');
    assert.equal(cardcomDocCalledOnDbFail, false, 'Hard rule: Cardcom CreateDocument must NOT be called if DB receipt write fails');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('concurrent link requests (Promise.all) produce exactly one Cardcom document', async () => {
  const { onRequest } = await import('../functions/api/ops/[[path]].js');

  const baseEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
    HOTELOS_DESK_PIN: '1234',
    CARDCOM_API_NAME: 'test-cardcom-user',
    CARDCOM_API_PASSWORD: 'test-cardcom-password'
  };

  const mockBooking = {
    id: 'b-conc-1',
    guest_name: 'שרה לוי',
    total_price_agorot: 80000,
    clearing_payments: []
  };

  const mockMatch = {
    deal_id: 'deal-conc-123',
    amount: 800,
    approval: '887766',
    last4: '4321',
    payer_name: 'שרה לוי'
  };

  let cardcomDocCount = 0;
  let claimState = null;

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts = {}) => {
      const urlStr = String(url);

      if (urlStr.includes('/cardcom_pending_matches')) {
        return new Response(JSON.stringify([mockMatch]), { status: 200 });
      }
      if (urlStr.includes('/hotelos_bookings?id=eq.b-conc-1')) {
        return new Response(JSON.stringify([mockBooking]), { status: 200 });
      }
      if (urlStr.includes('/rpc/record_cardcom_deal_receipt')) {
        return new Response(JSON.stringify({
          ok: true,
          booking_id: 'b-conc-1',
          payment_status: 'PARTIAL',
          total_paid_agorot: 80000,
          ledger_status: 'pending_invoice'
        }), { status: 200 });
      }
      if (urlStr.includes('/rpc/claim_cardcom_deal_retry')) {
        if (claimState === 'claiming_retry') {
          return new Response(JSON.stringify({
            error: 'DEAL_CLAIM_IN_PROGRESS',
            message: 'Deal deal-conc-123 is currently being retried by another worker'
          }), { status: 409 });
        }
        claimState = 'claiming_retry';
        return new Response(JSON.stringify({ ok: true, status: 'claiming_retry' }), { status: 200 });
      }
      if (urlStr.includes('ListTransactions')) {
        return new Response(JSON.stringify({ ResponseCode: 0, Tranzactions: [] }), { status: 200 });
      }
      if (urlStr.includes('CreateDocument')) {
        cardcomDocCount++;
        await new Promise((r) => setTimeout(r, 20));
        return new Response(JSON.stringify({
          ResponseCode: 0,
          DocumentNumber: 'INV-CONC-888',
          DocumentUrl: 'https://cardcom/doc/888'
        }), { status: 200 });
      }
      if (urlStr.includes('/rpc/finalize_cardcom_deal_invoice')) {
        return new Response(JSON.stringify({ ok: true, status: 'invoiced', document_number: 'INV-CONC-888' }), { status: 200 });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const makeReq = () => new Request('https://test/api/ops/cardcom-terminal/link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer 1234'
      },
      body: JSON.stringify({
        deal_id: 'deal-conc-123',
        booking_id: 'b-conc-1'
      })
    });

    const [res1, res2] = await Promise.all([
      onRequest({ request: makeReq(), params: { path: ['cardcom-terminal', 'link'] }, env: baseEnv }),
      onRequest({ request: makeReq(), params: { path: ['cardcom-terminal', 'link'] }, env: baseEnv })
    ]);

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Exactly one Cardcom document creation was called
    assert.equal(cardcomDocCount, 1, 'Cardcom CreateDocument was called exactly once');

    // One request succeeded with 200; the other returned 409 DEAL_CLAIM_IN_PROGRESS
    const statuses = [res1.status, res2.status].sort();
    assert.ok(statuses.includes(200), 'At least one request succeeded');
    const rejected = res1.status !== 200 ? body1 : body2;
    if (rejected?.error) {
      assert.equal(rejected.error, 'DEAL_CLAIM_IN_PROGRESS');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ops link fails immediately before Cardcom or booking write if receipt write fails', async () => {
  const { onRequest } = await import('../functions/api/ops/[[path]].js');

  const baseEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
    HOTELOS_DESK_PIN: '1234',
    CARDCOM_API_NAME: 'test-cardcom-user',
    CARDCOM_API_PASSWORD: 'test-cardcom-password'
  };

  const mockBooking = { id: 'b-claim-fail', guest_name: 'משה דוד', total_price_agorot: 50000, clearing_payments: [] };
  const mockMatch = { deal_id: 'deal-claim-fail-99', amount: 500, approval: '112233' };

  let cardcomCalled = false;

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/cardcom_pending_matches')) return new Response(JSON.stringify([mockMatch]), { status: 200 });
      if (urlStr.includes('/hotelos_bookings?id=eq.b-claim-fail')) return new Response(JSON.stringify([mockBooking]), { status: 200 });
      if (urlStr.includes('/rpc/record_cardcom_deal_receipt')) {
        return new Response(JSON.stringify({ error: 'DB_ERROR' }), { status: 500 });
      }
      if (urlStr.includes('CreateDocument')) {
        cardcomCalled = true;
        return new Response(JSON.stringify({ ResponseCode: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const req = new Request('https://test/api/ops/cardcom-terminal/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer 1234' },
      body: JSON.stringify({ deal_id: 'deal-claim-fail-99', booking_id: 'b-claim-fail' })
    });

    const res = await onRequest({ request: req, params: { path: ['cardcom-terminal', 'link'] }, env: baseEnv });
    const body = await res.json();

    assert.equal(res.status, 500);
    assert.equal(body.error, 'DB_WRITE_FAILED');
    assert.equal(cardcomCalled, false, 'Cardcom CreateDocument must NOT be called when DB receipt fails');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ops link timeout reconciliation looks up document by ExternalId and avoids duplicate CreateDocument', async () => {
  const { onRequest } = await import('../functions/api/ops/[[path]].js');

  const baseEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
    HOTELOS_DESK_PIN: '1234',
    CARDCOM_API_NAME: 'test-cardcom-user',
    CARDCOM_API_PASSWORD: 'test-cardcom-password'
  };

  const mockBooking = { id: 'b-rec-1', guest_name: 'יונתן כהן', total_price_agorot: 50000, clearing_payments: [] };
  const mockMatch = { deal_id: 'deal-rec-555', amount: 500, approval: '998877' };

  let createDocCalled = false;
  let listTxnsCalled = false;
  let listRequestBody = null;

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('/cardcom_pending_matches')) return new Response(JSON.stringify([mockMatch]), { status: 200 });
      if (urlStr.includes('/hotelos_bookings?id=eq.b-rec-1')) return new Response(JSON.stringify([mockBooking]), { status: 200 });
      if (urlStr.includes('/rpc/record_cardcom_deal_receipt')) {
        return new Response(JSON.stringify({
          ok: true,
          booking_id: 'b-rec-1',
          payment_status: 'PARTIAL',
          total_paid_agorot: 50000,
          ledger_status: 'pending_invoice'
        }), { status: 200 });
      }
      if (urlStr.includes('/rpc/claim_cardcom_deal_retry')) {
        return new Response(JSON.stringify({ ok: true, status: 'claiming_retry' }), { status: 200 });
      }
      if (urlStr.includes('ListTransactions')) {
        listTxnsCalled = true;
        listRequestBody = opts.body ? JSON.parse(opts.body) : null;
        // Documented Cardcom KB 499 response structure
        return new Response(JSON.stringify({
          ResponseCode: 0,
          Description: 'Success',
          Page: 1,
          Page_size: 100,
          Tranzactions: [{
            TranzactionId: 'deal-rec-555',
            TerminalNumber: 184288,
            Amount: 500.0,
            CoinId: 1,
            DocumentNumber: 'INV-RECONCILED-77',
            DocumentUrl: 'https://cardcom/doc/reconciled-77',
            ExternalId: 'deal-deal-rec-555',
            DealType: 1,
            IsRefund: false,
            JParameter: 0
          }]
        }), { status: 200 });
      }
      if (urlStr.includes('CreateDocument')) {
        createDocCalled = true;
        return new Response(JSON.stringify({ ResponseCode: 0 }), { status: 200 });
      }
      if (urlStr.includes('/rpc/finalize_cardcom_deal_invoice')) {
        return new Response(JSON.stringify({ ok: true, status: 'invoiced', document_number: 'INV-RECONCILED-77' }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const req = new Request('https://test/api/ops/cardcom-terminal/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer 1234' },
      body: JSON.stringify({ deal_id: 'deal-rec-555', booking_id: 'b-rec-1' })
    });

    const res = await onRequest({ request: req, params: { path: ['cardcom-terminal', 'link'] }, env: baseEnv });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.invoice.documentNumber, 'INV-RECONCILED-77');
    assert.equal(body.invoice.reused, true);
    assert.equal(listTxnsCalled, true, 'Must query Cardcom for existing document');
    assert.equal(listRequestBody.TranStatus, 'Success', 'Must send TranStatus: Success in ListTransactions request');
    assert.equal(createDocCalled, false, 'Must NOT call CreateDocument again during reconciliation');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ops link timeout or network error marks reconciliation_needed (never failed)', async () => {
  const { onRequest } = await import('../functions/api/ops/[[path]].js');

  const baseEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
    HOTELOS_DESK_PIN: '1234',
    CARDCOM_API_NAME: 'test-cardcom-user',
    CARDCOM_API_PASSWORD: 'test-cardcom-password'
  };

  const mockBooking = { id: 'b-timeout-1', guest_name: 'יוסי', total_price_agorot: 50000, clearing_payments: [] };
  const mockMatch = { deal_id: 'deal-timeout-99', amount: 500 };

  let markReconPayload = null;

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('/cardcom_pending_matches')) return new Response(JSON.stringify([mockMatch]), { status: 200 });
      if (urlStr.includes('/hotelos_bookings?id=eq.b-timeout-1')) return new Response(JSON.stringify([mockBooking]), { status: 200 });
      if (urlStr.includes('/rpc/record_cardcom_deal_receipt')) {
        return new Response(JSON.stringify({ ok: true, booking_id: 'b-timeout-1', ledger_status: 'pending_invoice' }), { status: 200 });
      }
      if (urlStr.includes('/rpc/claim_cardcom_deal_retry')) {
        return new Response(JSON.stringify({ ok: true, status: 'claiming_retry' }), { status: 200 });
      }
      if (urlStr.includes('ListTransactions')) {
        return new Response(JSON.stringify({ ResponseCode: 0, Tranzactions: [] }), { status: 200 });
      }
      if (urlStr.includes('CreateDocument')) {
        // Simulate network error / timeout
        throw new Error('Cardcom network timeout');
      }
      if (urlStr.includes('/rpc/mark_cardcom_deal_reconciliation_needed')) {
        markReconPayload = JSON.parse(opts.body);
        return new Response(JSON.stringify({ ok: true, status: 'reconciliation_needed' }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const req = new Request('https://test/api/ops/cardcom-terminal/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer 1234' },
      body: JSON.stringify({ deal_id: 'deal-timeout-99', booking_id: 'b-timeout-1' })
    });

    const res = await onRequest({ request: req, params: { path: ['cardcom-terminal', 'link'] }, env: baseEnv });
    assert.equal(res.status, 502);
    assert.ok(markReconPayload, 'Must call mark_cardcom_deal_reconciliation_needed RPC on error');
    assert.equal(markReconPayload.p_deal_id, 'deal-timeout-99');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auth: missing config fails closed, pending route requires auth, and dev token rejected in non-development', async () => {
  const { onRequest } = await import('../functions/api/ops/[[path]].js');

  // 1. Missing secrets: fails closed
  const reqUnauth = new Request('https://test/api/ops/cardcom-terminal/pending', { method: 'GET' });
  const res1 = await onRequest({ request: reqUnauth, params: { path: ['cardcom-terminal', 'pending'] }, env: {} });
  assert.equal(res1.status, 401, 'Must fail closed when no secrets configured');

  // 2. Pending route requires authentication
  const envWithSecrets = {
    HOTELOS_DESK_PIN: '1234',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    SUPABASE_URL: 'https://mock.supabase.co'
  };
  const res2 = await onRequest({ request: reqUnauth, params: { path: ['cardcom-terminal', 'pending'] }, env: envWithSecrets });
  assert.equal(res2.status, 401, 'Pending route must require authorization');

  // 3. dev-local-token rejected in non-development
  const reqDevToken = new Request('https://test/api/ops/cardcom-terminal/pending', {
    method: 'GET',
    headers: { Authorization: 'Bearer dev-local-token' }
  });
  const res3 = await onRequest({ request: reqDevToken, params: { path: ['cardcom-terminal', 'pending'] }, env: { ...envWithSecrets, ENVIRONMENT: 'production' } });
  assert.equal(res3.status, 401, 'dev-local-token must be rejected in non-development');

  // 4. dev-local-token accepted in development
  let pendingFetchCalled = false;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      pendingFetchCalled = true;
      return new Response(JSON.stringify([]), { status: 200 });
    };
    const reqDevTokenDev = new Request('https://test/api/ops/cardcom-terminal/pending', {
      method: 'GET',
      headers: { Authorization: 'Bearer dev-local-token' }
    });
    const res4 = await onRequest({ request: reqDevTokenDev, params: { path: ['cardcom-terminal', 'pending'] }, env: { ...envWithSecrets, ENVIRONMENT: 'development' } });
    assert.equal(res4.status, 200, 'dev-local-token must be accepted in development');
    assert.equal(pendingFetchCalled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('migration 009 SQL upgrades existing schema and handles fresh schema', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migPath = path.join(__dirname, '..', 'migrations', '009_cardcom_terminal_sync_and_ledger.sql');

  assert.ok(fs.existsSync(migPath), '009 migration file must exist');
  const sql = fs.readFileSync(migPath, 'utf8');

  // Verify search_path and security definer
  assert.ok(sql.includes('SET search_path = public, pg_temp'), 'Must set search_path = public, pg_temp');
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.record_cardcom_deal_receipt(TEXT, JSONB) FROM PUBLIC, anon, authenticated;'), 'Must revoke execute on record_cardcom_deal_receipt');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.record_cardcom_deal_receipt(TEXT, JSONB) TO service_role;'), 'Must grant execute to service_role');
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.claim_cardcom_deal_retry(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;'), 'Must revoke execute on claim_cardcom_deal_retry');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.claim_cardcom_deal_retry(TEXT, TEXT, TEXT) TO service_role;'), 'Must grant claim_cardcom_deal_retry to service_role');
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.finalize_cardcom_deal_invoice(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;'), 'Must revoke execute on finalize_cardcom_deal_invoice');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.finalize_cardcom_deal_invoice(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;'), 'Must grant finalize_cardcom_deal_invoice to service_role');

  // Verify additive ALTER TABLE statements for upgrading existing schema
  assert.ok(sql.includes('ALTER TABLE public.cardcom_seen_deals ADD COLUMN IF NOT EXISTS updated_at'), 'Must add updated_at to seen_deals');
  assert.ok(sql.includes('ALTER TABLE public.cardcom_pending_matches ALTER COLUMN id TYPE TEXT;'), 'Must alter pending_matches id column to text');
  assert.ok(sql.includes('ALTER TABLE public.cardcom_pending_matches ADD COLUMN IF NOT EXISTS document_number TEXT;'), 'Must add document_number column');
  assert.ok(sql.includes('ALTER TABLE public.cardcom_pending_matches ADD COLUMN IF NOT EXISTS document_url TEXT;'), 'Must add document_url column');
  assert.ok(sql.includes('ALTER TABLE public.cardcom_pending_matches ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;'), 'Must add is_test column');
  assert.ok(sql.includes('ALTER TABLE public.cardcom_pending_matches ADD COLUMN IF NOT EXISTS guest_name TEXT;'), 'Must add guest_name column');
  assert.ok(sql.includes('ALTER TABLE public.cardcom_pending_matches ADD COLUMN IF NOT EXISTS unit_name TEXT;'), 'Must add unit_name column');
  assert.ok(sql.includes('ALTER TABLE public.cardcom_terminal_audit_log ADD COLUMN IF NOT EXISTS event_id TEXT;'), 'Must add event_id to audit log');

  // Verify unique indexes
  assert.ok(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_cardcom_seen_deals ON public.cardcom_seen_deals (terminal_number, deal_id);'), 'Must create unique index for seen deals');
  assert.ok(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_cardcom_pending_matches ON public.cardcom_pending_matches (terminal_number, deal_id);'), 'Must create unique index for pending matches');
  assert.ok(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_cardcom_deal_ledger ON public.cardcom_deal_ledger (terminal, deal_id);'), 'Must create unique index for deal ledger');
  assert.ok(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_cardcom_terminal_audit_log_event_id ON public.cardcom_terminal_audit_log (event_id) WHERE event_id IS NOT NULL;'), 'Must create unique index for audit event_id');

  // Verify old permissive policy removal and restrictive grants
  assert.ok(sql.includes('DROP POLICY IF EXISTS "lan_cardcom_seen_deals_all" ON public.cardcom_seen_deals;'), 'Must drop permissive seen deals policy');
  assert.ok(sql.includes('DROP POLICY IF EXISTS "lan_cardcom_pending_matches_all" ON public.cardcom_pending_matches;'), 'Must drop permissive pending matches policy');
  assert.ok(sql.includes('REVOKE ALL ON public.cardcom_seen_deals FROM anon, authenticated, PUBLIC;'), 'Must revoke anon/authenticated from seen deals');
  assert.ok(sql.includes('REVOKE ALL ON public.cardcom_pending_matches FROM anon, authenticated, PUBLIC;'), 'Must revoke anon/authenticated from pending matches');
  assert.ok(sql.includes('GRANT ALL ON public.cardcom_seen_deals TO service_role;'), 'Must grant seen deals to service_role only');
  assert.ok(sql.includes('GRANT ALL ON public.cardcom_pending_matches TO service_role;'), 'Must grant pending matches to service_role only');

  // Verify FOR UPDATE locking on ledger row before checking global assignment in RPC
  const lockIndex = sql.indexOf('FOR UPDATE');
  const globalCheckIndex = sql.indexOf('SELECT id INTO v_existing_booking_id');
  assert.ok(lockIndex > 0 && globalCheckIndex > 0 && lockIndex < globalCheckIndex, 'Must lock ledger row with FOR UPDATE before checking global booking assignment');
});

test('auth: verifySessionToken requires configured secret and future numeric expiry', async () => {
  const { onRequest } = await import('../functions/api/ops/[[path]].js');
  const crypto = await import('node:crypto');

  const sign = (secret, payload) => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
    const sig = crypto.createHmac('sha256', secret).update(encoded).digest('hex');
    return `${encoded}.${sig}`;
  };

  const secret = 'valid-super-secret-key';

  // 1. Valid token with future exp and configured secret: passes auth
  const validToken = sign(secret, { user: 'manager', exp: Date.now() + 60000 });
  const reqValid = new Request('https://test/api/ops/cardcom-terminal/pending', {
    method: 'GET',
    headers: { Authorization: `Bearer ${validToken}` }
  });
  const resValid = await onRequest({
    request: reqValid,
    params: { path: ['cardcom-terminal', 'pending'] },
    env: { CHECKOUT_MAILBOX_SECRET: secret }
  });
  assert.notEqual(resValid.status, 401, 'Valid session token must not return 401');

  // 2. Secret missing on server: must return 401 (no default salt fallback)
  const fallbackToken = sign('dashboard_salt', { user: 'manager', exp: Date.now() + 60000 });
  const reqNoSecret = new Request('https://test/api/ops/cardcom-terminal/pending', {
    method: 'GET',
    headers: { Authorization: `Bearer ${fallbackToken}` }
  });
  const resNoSecret = await onRequest({
    request: reqNoSecret,
    params: { path: ['cardcom-terminal', 'pending'] },
    env: {} // missing secret
  });
  assert.equal(resNoSecret.status, 401, 'Missing secret must return 401 and not accept fallback salt');

  // 3. Expired token: must return 401
  const expiredToken = sign(secret, { user: 'manager', exp: Date.now() - 5000 });
  const reqExpired = new Request('https://test/api/ops/cardcom-terminal/pending', {
    method: 'GET',
    headers: { Authorization: `Bearer ${expiredToken}` }
  });
  const resExpired = await onRequest({
    request: reqExpired,
    params: { path: ['cardcom-terminal', 'pending'] },
    env: { CHECKOUT_MAILBOX_SECRET: secret }
  });
  assert.equal(resExpired.status, 401, 'Expired token must return 401');

  // 4. Non-numeric or missing expiry: must return 401
  const noExpToken = sign(secret, { user: 'manager' });
  const reqNoExp = new Request('https://test/api/ops/cardcom-terminal/pending', {
    method: 'GET',
    headers: { Authorization: `Bearer ${noExpToken}` }
  });
  const resNoExp = await onRequest({
    request: reqNoExp,
    params: { path: ['cardcom-terminal', 'pending'] },
    env: { CHECKOUT_MAILBOX_SECRET: secret }
  });
  assert.equal(resNoExp.status, 401, 'Token without numeric exp must return 401');
});

test('ops link reconciliation: fail-closed after ambiguous outcome (409 and never CreateDocument)', async () => {
  const { onRequest } = await import('../functions/api/ops/[[path]].js');

  const baseEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
    CHECKOUT_MAILBOX_SECRET: 'test-secret',
    CARDCOM_API_NAME: 'test-cardcom-user',
    CARDCOM_API_PASSWORD: 'test-cardcom-password'
  };

  const mockBooking = { id: 'b-failclose-1', guest_name: 'שרה לוי', total_price_agorot: 40000, clearing_payments: [] };
  const mockMatch = { deal_id: 'deal-failclose-1', amount: 400, approval: '112233' };

  let createDocCalls = 0;
  let markReconciliationCalls = 0;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url, opts = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('/cardcom_pending_matches')) return new Response(JSON.stringify([mockMatch]), { status: 200 });
      if (urlStr.includes('/hotelos_bookings?id=eq.b-failclose-1')) return new Response(JSON.stringify([mockBooking]), { status: 200 });
      if (urlStr.includes('/rpc/record_cardcom_deal_receipt')) {
        // Return status indicating deal was in ambiguous outcome (reconciliation_needed)
        return new Response(JSON.stringify({
          ok: true,
          booking_id: 'b-failclose-1',
          payment_status: 'PARTIAL',
          ledger_status: 'reconciliation_needed'
        }), { status: 200 });
      }
      if (urlStr.includes('/rpc/claim_cardcom_deal_retry')) {
        return new Response(JSON.stringify({ ok: true, status: 'claiming_retry' }), { status: 200 });
      }
      if (urlStr.includes('ListTransactions')) {
        // Return 0 transactions (no document found)
        return new Response(JSON.stringify({
          ResponseCode: 0,
          Description: 'Success',
          Page: 1,
          Page_size: 100,
          Tranzactions: []
        }), { status: 200 });
      }
      if (urlStr.includes('CreateDocument')) {
        createDocCalls += 1;
        return new Response(JSON.stringify({ ResponseCode: 0, DocumentNumber: 'SHOULD-NOT-BE-CALLED' }), { status: 200 });
      }
      if (urlStr.includes('/rpc/mark_cardcom_deal_reconciliation_needed')) {
        markReconciliationCalls += 1;
        return new Response(JSON.stringify({ ok: true, status: 'reconciliation_needed' }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const req = new Request('https://test/api/ops/cardcom-terminal/link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-secret'
      },
      body: JSON.stringify({
        deal_id: 'deal-failclose-1',
        booking_id: 'b-failclose-1',
        terminal: '184288'
      })
    });

    const res = await onRequest({ request: req, params: { path: ['cardcom-terminal', 'link'] }, env: baseEnv });
    assert.equal(res.status, 409, 'Ambiguous outcome without confirmed document must return 409 RECONCILIATION_REQUIRED');
    const body = await res.json();
    assert.equal(body.error, 'RECONCILIATION_REQUIRED');
    assert.equal(createDocCalls, 0, 'CreateDocument must NEVER be called automatically after ambiguous outcome');
    assert.ok(markReconciliationCalls >= 1, 'mark_cardcom_deal_reconciliation_needed must be called');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ops link document reuse: already known document_number on proposal is reused without Cardcom calls', async () => {
  const { onRequest } = await import('../functions/api/ops/[[path]].js');

  const baseEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
    CHECKOUT_MAILBOX_SECRET: 'test-secret',
    CARDCOM_API_NAME: 'test-cardcom-user',
    CARDCOM_API_PASSWORD: 'test-cardcom-password'
  };

  const mockBooking = { id: 'b-reuse-known-1', guest_name: 'דוד לוי', total_price_agorot: 30000, clearing_payments: [] };
  const mockMatch = {
    deal_id: 'deal-reuse-known-1',
    amount: 300,
    document_number: 'INV-KNOWN-PROPOSAL-42',
    document_url: 'https://cardcom/doc/known-42'
  };

  let listTxnsCalls = 0;
  let createDocCalls = 0;
  let finalizeCalls = 0;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/cardcom_pending_matches')) return new Response(JSON.stringify([mockMatch]), { status: 200 });
      if (urlStr.includes('/hotelos_bookings?id=eq.b-reuse-known-1')) return new Response(JSON.stringify([mockBooking]), { status: 200 });
      if (urlStr.includes('/rpc/record_cardcom_deal_receipt')) {
        return new Response(JSON.stringify({
          ok: true,
          booking_id: 'b-reuse-known-1',
          payment_status: 'PARTIAL',
          ledger_status: 'pending_invoice'
        }), { status: 200 });
      }
      if (urlStr.includes('ListTransactions')) {
        listTxnsCalls += 1;
        return new Response(JSON.stringify({ ResponseCode: 0, Tranzactions: [] }), { status: 200 });
      }
      if (urlStr.includes('CreateDocument')) {
        createDocCalls += 1;
        return new Response(JSON.stringify({ ResponseCode: 0 }), { status: 200 });
      }
      if (urlStr.includes('/rpc/finalize_cardcom_deal_invoice')) {
        finalizeCalls += 1;
        return new Response(JSON.stringify({ ok: true, status: 'invoiced', document_number: 'INV-KNOWN-PROPOSAL-42' }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const req = new Request('https://test/api/ops/cardcom-terminal/link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-secret'
      },
      body: JSON.stringify({
        deal_id: 'deal-reuse-known-1',
        booking_id: 'b-reuse-known-1',
        terminal: '184288'
      })
    });

    const res = await onRequest({ request: req, params: { path: ['cardcom-terminal', 'link'] }, env: baseEnv });
    assert.equal(res.status, 200, 'Must succeed when document is reused');
    const body = await res.json();
    assert.equal(body.invoice?.reused, true);
    assert.equal(body.invoice?.documentNumber, 'INV-KNOWN-PROPOSAL-42');
    assert.equal(listTxnsCalls, 0, 'Must NOT query ListTransactions when document is already known');
    assert.equal(createDocCalls, 0, 'Must NEVER call CreateDocument when document is already known');
    assert.equal(finalizeCalls, 1, 'Must finalize with known document number');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ops link lookup: fail-closed ALWAYS on lookup error (non-zero ResponseCode or malformed response)', async () => {
  const { onRequest } = await import('../functions/api/ops/[[path]].js');

  const baseEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
    CHECKOUT_MAILBOX_SECRET: 'test-secret',
    CARDCOM_API_NAME: 'test-cardcom-user',
    CARDCOM_API_PASSWORD: 'test-cardcom-password'
  };

  const mockBooking = { id: 'b-always-fail-1', guest_name: 'אבי כהן', total_price_agorot: 20000, clearing_payments: [] };
  const mockMatch = { deal_id: 'deal-always-fail-1', amount: 200 };

  let createDocCalls = 0;
  let markReconCalls = 0;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/cardcom_pending_matches')) return new Response(JSON.stringify([mockMatch]), { status: 200 });
      if (urlStr.includes('/hotelos_bookings?id=eq.b-always-fail-1')) return new Response(JSON.stringify([mockBooking]), { status: 200 });
      if (urlStr.includes('/rpc/record_cardcom_deal_receipt')) {
        return new Response(JSON.stringify({
          ok: true,
          booking_id: 'b-always-fail-1',
          payment_status: 'PARTIAL',
          ledger_status: 'pending_invoice'
        }), { status: 200 });
      }
      if (urlStr.includes('/rpc/claim_cardcom_deal_retry')) {
        return new Response(JSON.stringify({ ok: true, status: 'claiming_retry' }), { status: 200 });
      }
      if (urlStr.includes('ListTransactions')) {
        // Return non-zero ResponseCode to trigger lookup error on fresh deal
        return new Response(JSON.stringify({
          ResponseCode: 5,
          Description: 'Internal Cardcom Error'
        }), { status: 200 });
      }
      if (urlStr.includes('CreateDocument')) {
        createDocCalls += 1;
        return new Response(JSON.stringify({ ResponseCode: 0 }), { status: 200 });
      }
      if (urlStr.includes('/rpc/mark_cardcom_deal_reconciliation_needed')) {
        markReconCalls += 1;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const req = new Request('https://test/api/ops/cardcom-terminal/link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-secret'
      },
      body: JSON.stringify({
        deal_id: 'deal-always-fail-1',
        booking_id: 'b-always-fail-1',
        terminal: '184288'
      })
    });

    const res = await onRequest({ request: req, params: { path: ['cardcom-terminal', 'link'] }, env: baseEnv });
    assert.equal(res.status, 409, 'Lookup error must fail-closed ALWAYS with 409');
    const body = await res.json();
    assert.equal(body.error, 'RECONCILIATION_REQUIRED');
    assert.equal(createDocCalls, 0, 'CreateDocument must NEVER be called when lookup errors');
    assert.equal(markReconCalls, 1, 'Must mark reconciliation_needed on lookup error');
  } finally {
    globalThis.fetch = originalFetch;
  }
});




