import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRanApprovalChoice,
  isGuestInvoiceYesReply,
  handleRanTerminalInbound,
  handleGuestInvoiceReply
} from './lib/cardcomApproval.js';
import { OutboundRateLimiter } from './lib/cardcomTerminalService.js';

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

  // Message sent to guest asking about invoice (emailed to guest + asks if also in WhatsApp)
  const guestMsg = sentMessages.find((m) => m.jid.includes('972501112233'));
  assert.ok(guestMsg);
  assert.ok(guestMsg.text.includes('החשבונית נשלחה למייל שלך'));
  assert.ok(guestMsg.text.includes('לשלוח לך אותה גם לכאן בווטסאפ?'));

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

test('deal already has document → no new invoice and saves existing doc on payment', async () => {
  const mockMatches = [
    {
      id: 'match-doc-exists',
      deal_id: 'deal-999',
      terminal_number: '184288',
      amount: 1200,
      approval: '776655',
      last4: '1234',
      document_number: 'DOC-554433',
      candidates: [
        {
          bookingId: 'book-exist',
          guestName: 'ישראל',
          guestPhone: '054-111-2222',
          unitName: 'בקתת נוף',
          dueIls: 1200
        }
      ],
      current_candidate_index: 0,
      status: 'pending'
    }
  ];

  let cardcomFetchCalls = 0;
  const mockFetch = async () => {
    cardcomFetchCalls++;
    return { ok: true, json: async () => ({ ResponseCode: 0, DocumentNumber: 'NEW-111' }) };
  };

  let patchedBooking = null;
  const sent = [];

  const res = await handleRanTerminalInbound('+972 54-831-7887', '1', {
    matches: mockMatches,
    saveMatches: async () => {},
    loadBooking: async () => ({ id: 'book-exist', guest_name: 'ישראל', clearing_payments: [] }),
    patchBooking: async (_, patch) => { patchedBooking = patch; },
    sendWhatsApp: async (_, text) => { sent.push(text); return true; },
    cardcomCreds: { apiName: 'test', apiPassword: 'test' },
    fetchImpl: mockFetch
  });

  assert.equal(res.handled, true);
  // Cardcom create document was NOT called!
  assert.equal(cardcomFetchCalls, 0, 'Must NOT issue a new Cardcom invoice when deal already has document');
  assert.equal(mockMatches[0].invoice_number, 'DOC-554433');
  assert.equal(patchedBooking.clearing_payments[0].document_number, 'DOC-554433');
  assert.equal(patchedBooking.clearing_payments[0].invoice, 'DOC-554433');
  assert.equal(patchedBooking.clearing_payments[0].approval, '776655');
  assert.equal(patchedBooking.clearing_payments[0].last4, '1234');
  assert.equal(patchedBooking.clearing_payments[0].deal_number, 'deal-999');
  assert.ok(sent[0].includes('נשמרה חשבונית קיימת שמספרה DOC-554433'));
});

test('booking with email → invoice emailed to guest and WhatsApp mentions email', async () => {
  let requestBody = null;
  const mockFetch = async (url, opts) => {
    requestBody = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({
        ResponseCode: 0,
        DocumentNumber: 'INV-EMAIL-01',
        DocumentUrl: 'https://cardcom/doc/01'
      })
    };
  };

  const mockMatches = [
    {
      id: 'match-with-email',
      deal_id: 'deal-email-1',
      terminal_number: '184288',
      amount: 2100,
      approval: '889900',
      last4: '9988',
      candidates: [
        {
          bookingId: 'book-email-1',
          guestName: 'מיכל רון',
          guestPhone: '052-777-8899',
          guestEmail: 'michal@example.com',
          unitName: 'וילה מול הנוף',
          dueIls: 2100
        }
      ],
      current_candidate_index: 0,
      status: 'pending'
    }
  ];

  const sentMessages = [];
  const res = await handleRanTerminalInbound('+972 54-831-7887', '1', {
    matches: mockMatches,
    saveMatches: async () => {},
    loadBooking: async () => ({
      id: 'book-email-1',
      guest_name: 'מיכל רון',
      guest_email: 'michal@example.com',
      clearing_payments: []
    }),
    patchBooking: async () => {},
    sendWhatsApp: async (jid, text) => { sentMessages.push({ jid, text }); return true; },
    cardcomCreds: { apiName: 'test', apiPassword: 'test' },
    rateLimiter: new OutboundRateLimiter(),
    fetchImpl: mockFetch
  });

  assert.equal(res.handled, true);
  // Email sent to guest email
  assert.equal(requestBody.Document.Email, 'michal@example.com');
  assert.equal(requestBody.Document.IsSendByEmail, true);
  assert.equal(requestBody.DealNumbers[0].DealNumber, 'deal-email-1');

  // WhatsApp to guest says it was sent to email and asks if also in WhatsApp
  const guestMsg = sentMessages.find((m) => m.jid.includes('972527778899'));
  assert.ok(guestMsg);
  assert.ok(guestMsg.text.includes('889900'), 'Includes approval number');
  assert.ok(guestMsg.text.includes('החשבונית נשלחה למייל שלך'), 'Mentions emailed to guest');
  assert.ok(guestMsg.text.includes('לשלוח לך אותה גם לכאן בווטסאפ?'), 'Asks if also in WhatsApp');
});

test('no email → business mailbox and WhatsApp asks if to send in WhatsApp', async () => {
  let requestBody = null;
  const mockFetch = async (url, opts) => {
    requestBody = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({
        ResponseCode: 0,
        DocumentNumber: 'INV-NOEMAIL-02',
        DocumentUrl: 'https://cardcom/doc/02'
      })
    };
  };

  const mockMatches = [
    {
      id: 'match-no-email',
      deal_id: 'deal-noemail-2',
      terminal_number: '184288',
      amount: 1500,
      approval: '445566',
      last4: '7711',
      candidates: [
        {
          bookingId: 'book-noemail-2',
          guestName: 'יוסי כהן',
          guestPhone: '054-999-8877',
          unitName: 'סוויטה אלון',
          dueIls: 1500
        }
      ],
      current_candidate_index: 0,
      status: 'pending'
    }
  ];

  const sentMessages = [];
  const res = await handleRanTerminalInbound('+972 54-831-7887', '1', {
    matches: mockMatches,
    saveMatches: async () => {},
    loadBooking: async () => ({
      id: 'book-noemail-2',
      guest_name: 'יוסי כהן',
      guest_email: null,
      clearing_payments: []
    }),
    patchBooking: async () => {},
    sendWhatsApp: async (jid, text) => { sentMessages.push({ jid, text }); return true; },
    cardcomCreds: { apiName: 'test', apiPassword: 'test' },
    rateLimiter: new OutboundRateLimiter(),
    fetchImpl: mockFetch
  });

  assert.equal(res.handled, true);
  // Email sent to business mailbox fallback
  assert.equal(requestBody.Document.Email, 'mialeesresort@mialees.com');
  assert.equal(requestBody.Document.IsSendByEmail, true);

  // WhatsApp to guest asks if to send in WhatsApp (no "גם")
  const guestMsg = sentMessages.find((m) => m.jid.includes('972549998877'));
  assert.ok(guestMsg);
  assert.ok(guestMsg.text.includes('445566'), 'Includes approval number');
  assert.ok(!guestMsg.text.includes('החשבונית נשלחה למייל שלך'), 'Does not claim sent to guest email');
  assert.ok(guestMsg.text.includes('לשלוח לך את החשבונית לכאן בווטסאפ?'), 'Asks if to send in WhatsApp');
});

test('idempotent on repeat approval does not issue second invoice or duplicate payment', async () => {
  let cardcomCalls = 0;
  const mockFetch = async () => {
    cardcomCalls++;
    return {
      ok: true,
      json: async () => ({
        ResponseCode: 0,
        DocumentNumber: 'INV-IDEMP-01',
        DocumentUrl: 'https://cardcom/doc/idemp'
      })
    };
  };

  const booking = {
    id: 'book-repeat',
    guest_name: 'אורח חוזר',
    total_price_agorot: 100000,
    clearing_payments: []
  };

  const mockMatches = [
    {
      id: 'match-repeat',
      deal_id: 'deal-repeat-1',
      terminal_number: '184288',
      amount: 1000,
      approval: '112233',
      last4: '0099',
      candidates: [
        {
          bookingId: 'book-repeat',
          guestName: 'אורח חוזר',
          guestPhone: '050-000-1111',
          unitName: 'וילה',
          dueIls: 1000
        }
      ],
      current_candidate_index: 0,
      status: 'pending'
    }
  ];

  const sentMessages = [];
  const deps = {
    matches: mockMatches,
    saveMatches: async () => {},
    loadBooking: async () => booking,
    patchBooking: async (_, patch) => {
      Object.assign(booking, patch);
    },
    sendWhatsApp: async (jid, text) => { sentMessages.push({ jid, text }); return true; },
    cardcomCreds: { apiName: 'test', apiPassword: 'test' },
    fetchImpl: mockFetch
  };

  // 1. First approval
  const res1 = await handleRanTerminalInbound('+972 54-831-7887', '1', deps);
  assert.equal(res1.handled, true);
  assert.equal(cardcomCalls, 1);
  assert.equal(booking.clearing_payments.length, 1);
  assert.equal(booking.clearing_payments[0].invoice, 'INV-IDEMP-01');

  // 2. Repeat approval (Ran sends '1' again)
  const res2 = await handleRanTerminalInbound('+972 54-831-7887', '1', deps);
  assert.equal(res2.handled, true);
  assert.equal(cardcomCalls, 1, 'Cardcom invoice must NOT be called a second time on repeat approval');
  assert.equal(booking.clearing_payments.length, 1, 'clearing_payments must NOT contain duplicate rows');
  assert.ok(res2.reply.includes('כבר שויכה') || res2.reply.includes('לא בוצע חיוב או שיוך כפול'));
});
