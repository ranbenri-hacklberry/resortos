import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRanApprovalChoice,
  isGuestInvoiceYesReply,
  handleRanTerminalInbound,
  handleGuestInvoiceReply
} from './lib/cardcomApproval.js';

test('parseRanApprovalChoice parses Ran approval choices correctly', () => {
  assert.equal(parseRanApprovalChoice('1'), '1');
  assert.equal(parseRanApprovalChoice('כן'), '1');
  assert.equal(parseRanApprovalChoice('אשר'), '1');
  assert.equal(parseRanApprovalChoice('1 לאישור'), '1');

  assert.equal(parseRanApprovalChoice('2'), '2');
  assert.equal(parseRanApprovalChoice('הבא'), '2');
  assert.equal(parseRanApprovalChoice('2 לאפשרות הבאה'), '2');

  assert.equal(parseRanApprovalChoice('0'), '0');
  assert.equal(parseRanApprovalChoice('לא'), '0');
  assert.equal(parseRanApprovalChoice('אל תשייך'), '0');

  assert.equal(parseRanApprovalChoice('שלום מה נשמע'), null);
});

test('isGuestInvoiceYesReply detects guest yes response for invoice', () => {
  assert.equal(isGuestInvoiceYesReply('כן'), true);
  assert.equal(isGuestInvoiceYesReply('אשמח'), true);
  assert.equal(isGuestInvoiceYesReply('כן בבקשה'), true);
  assert.equal(isGuestInvoiceYesReply('שלח'), true);
  assert.equal(isGuestInvoiceYesReply('לא צריך'), false);
});

test('handleRanTerminalInbound rejects non-Ran sender', async () => {
  const matches = [];
  const res = await handleRanTerminalInbound('052-999-9999', '1', {
    matches,
    saveMatches: async () => {},
    loadBooking: async () => null,
    patchBooking: async () => null,
    sendWhatsApp: async () => true
  });
  assert.equal(res.handled, false);
});

test('handleRanTerminalInbound processes Ran approval (choice 1) end-to-end', async () => {
  const mockMatches = [
    {
      id: 'match-1',
      deal_id: 'deal-101',
      terminal_number: '184288',
      amount: 1400,
      approval: '001122',
      last4: '4455',
      candidates: [
        {
          bookingId: 'book-1',
          guestName: 'דני לוי',
          guestPhone: '050-111-2233',
          guestEmail: 'dani@example.com',
          unitId: 'hill-1',
          unitName: 'צימר בגבעה 1',
          checkIn: '2026-11-07',
          checkOut: '2026-11-09',
          dueIls: 1400,
          totalIls: 1400,
          score: 95
        }
      ],
      current_candidate_index: 0,
      status: 'pending'
    }
  ];

  let patchedBookingId = '';
  let patchedData = null;
  const sentMessages = [];
  const loggedComms = [];

  const mockBooking = {
    id: 'book-1',
    guest_name: 'דני לוי',
    total_price_agorot: 140000,
    clearing_payments: []
  };

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      ResponseCode: 0,
      DocumentNumber: '99881',
      DocumentUrl: 'https://secure.cardcom.solutions/doc/99881'
    })
  });

  const res = await handleRanTerminalInbound('+972 54-831-7887', '1', {
    matches: mockMatches,
    saveMatches: async () => {},
    loadBooking: async () => mockBooking,
    patchBooking: async (id, patch) => {
      patchedBookingId = id;
      patchedData = patch;
    },
    sendWhatsApp: async (jid, text) => {
      sentMessages.push({ jid, text });
      return true;
    },
    logGuestComm: async (c) => {
      loggedComms.push(c);
    },
    cardcomCreds: { apiName: 'test', apiPassword: 'test' },
    fetchImpl: mockFetch
  });

  assert.equal(res.handled, true);
  assert.equal(mockMatches[0].status, 'approved');
  assert.equal(mockMatches[0].selected_booking_id, 'book-1');
  assert.equal(mockMatches[0].invoice_number, '99881');

  // Booking patched
  assert.equal(patchedBookingId, 'book-1');
  assert.equal(patchedData.clearing_payments.length, 1);
  assert.equal(patchedData.clearing_payments[0].deal_number, 'deal-101');
  assert.equal(patchedData.clearing_payments[0].document_number, '99881');
  assert.equal(patchedData.payment_status, 'PAID');

  // Message sent to Ran confirming
  assert.ok(sentMessages.some((m) => m.text.includes('שויכה בהצלחה ל-*דני לוי*')));

  // Message sent to guest asking about invoice
  const guestMsg = sentMessages.find((m) => m.jid.includes('972501112233'));
  assert.ok(guestMsg);
  assert.ok(guestMsg.text.includes('לשלוח לך את החשבונית לכאן בווטסאפ?'));

  // Outbound logged in guest communications
  assert.equal(loggedComms.length, 1);
  assert.equal(loggedComms[0].bookingId, 'book-1');
});

test('handleRanTerminalInbound advances candidate on choice 2', async () => {
  const mockMatches = [
    {
      id: 'match-2',
      deal_id: 'deal-102',
      terminal_number: '184288',
      amount: 800,
      approval: '334455',
      candidates: [
        {
          bookingId: 'book-A',
          guestName: 'שרה',
          unitId: 'k826',
          unitName: 'Aura',
          checkIn: '2026-11-07',
          checkOut: '2026-11-08',
          dueIls: 800,
          totalIls: 800,
          score: 70
        },
        {
          bookingId: 'book-B',
          guestName: 'מיכל',
          unitId: 'k827',
          unitName: 'Bloom',
          checkIn: '2026-11-07',
          checkOut: '2026-11-08',
          dueIls: 800,
          totalIls: 800,
          score: 65
        }
      ],
      current_candidate_index: 0,
      status: 'pending'
    }
  ];

  const sent = [];
  const res = await handleRanTerminalInbound('054-831-7887', '2', {
    matches: mockMatches,
    saveMatches: async () => {},
    loadBooking: async () => null,
    patchBooking: async () => null,
    sendWhatsApp: async (_, text) => {
      sent.push(text);
      return true;
    }
  });

  assert.equal(res.handled, true);
  assert.equal(mockMatches[0].current_candidate_index, 1);
  assert.ok(sent[0].includes('אפשרות הבאה'));
  assert.ok(sent[0].includes('מיכל'));
});

test('handleRanTerminalInbound marks ignored on choice 0', async () => {
  const mockMatches = [
    {
      id: 'match-3',
      deal_id: 'deal-103',
      terminal_number: '184288',
      amount: 500,
      candidates: [],
      current_candidate_index: 0,
      status: 'pending'
    }
  ];

  const sent = [];
  const res = await handleRanTerminalInbound('054-831-7887', '0', {
    matches: mockMatches,
    saveMatches: async () => {},
    loadBooking: async () => null,
    patchBooking: async () => null,
    sendWhatsApp: async (_, text) => {
      sent.push(text);
      return true;
    }
  });

  assert.equal(res.handled, true);
  assert.equal(mockMatches[0].status, 'ignored');
  assert.ok(sent[0].includes('סומנה כלא משויכת'));
});

test('handleGuestInvoiceReply delivers invoice url when guest replies yes', async () => {
  const mockMatches = [
    {
      id: 'match-4',
      deal_id: 'deal-104',
      terminal_number: '184288',
      amount: 1500,
      status: 'approved',
      selected_booking_id: 'book-guest-1',
      invoice_number: 'INV-777',
      invoice_url: 'https://cardcom/doc/777',
      candidates: [
        {
          bookingId: 'book-guest-1',
          guestName: 'נועם',
          guestPhone: '052-3334444',
          unitId: 'k826',
          unitName: 'Aura',
          checkIn: '2026-11-07',
          checkOut: '2026-11-08',
          dueIls: 0,
          totalIls: 1500,
          score: 90
        }
      ],
      current_candidate_index: 0
    }
  ];

  const sentMessages = [];
  const loggedComms = [];

  const sent = await handleGuestInvoiceReply('052-333-4444', 'כן תודה רבה!', {
    matches: mockMatches,
    saveMatches: async () => {},
    loadBooking: async () => null,
    patchBooking: async () => null,
    sendWhatsApp: async (_, text) => {
      sentMessages.push(text);
      return true;
    },
    logGuestComm: async (c) => {
      loggedComms.push(c);
    }
  });

  assert.equal(sent, true);
  assert.equal(mockMatches[0].guest_invoice_requested, true);
  assert.ok(mockMatches[0].guest_invoice_sent_at);
  assert.ok(sentMessages[0].includes('https://cardcom/doc/777'));
  assert.equal(loggedComms.length, 1);
  assert.equal(loggedComms[0].bookingId, 'book-guest-1');
});
