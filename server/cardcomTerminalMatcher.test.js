import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  const dryStorage = new CardcomStorage({ fetchImpl: mockFetch });
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
  const applyStorage = new CardcomStorage({ fetchImpl: mockFetch });
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

