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
  OutboundRateLimiter,
  isRanPhone,
  CARDCOM_CREATE_DOCUMENT_URL
} from './lib/cardcomTerminalService.js';

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
