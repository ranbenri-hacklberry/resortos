import { describe, it, expect } from 'vitest';
import {
  parseRanApprovalChoice,
  isGuestInvoiceYesReply,
  handleRanTerminalInbound,
  handleGuestInvoiceReply,
  OutboundRateLimiter,
  type TerminalPendingMatch
} from './cardcomApproval.js';

describe('cardcomApproval', () => {
  it('parses Ran approval choices correctly', () => {
    expect(parseRanApprovalChoice('1')).toBe('1');
    expect(parseRanApprovalChoice('כן')).toBe('1');
    expect(parseRanApprovalChoice('אשר')).toBe('1');
    expect(parseRanApprovalChoice('1 לאישור')).toBe('1');

    expect(parseRanApprovalChoice('2')).toBe('2');
    expect(parseRanApprovalChoice('הבא')).toBe('2');
    expect(parseRanApprovalChoice('2 לאפשרות הבאה')).toBe('2');

    expect(parseRanApprovalChoice('0')).toBe('0');
    expect(parseRanApprovalChoice('לא')).toBe('0');
    expect(parseRanApprovalChoice('אל תשייך')).toBe('0');

    expect(parseRanApprovalChoice('שלום מה נשמע')).toBeNull();
  });

  it('detects guest yes response for invoice', () => {
    expect(isGuestInvoiceYesReply('כן')).toBe(true);
    expect(isGuestInvoiceYesReply('אשמח')).toBe(true);
    expect(isGuestInvoiceYesReply('כן בבקשה')).toBe(true);
    expect(isGuestInvoiceYesReply('שלח')).toBe(true);
    expect(isGuestInvoiceYesReply('לא צריך')).toBe(false);
  });

  it('handleRanTerminalInbound rejects non-Ran sender', async () => {
    const matches: TerminalPendingMatch[] = [];
    const res = await handleRanTerminalInbound('052-999-9999', '1', {
      matches,
      saveMatches: async () => {},
      loadBooking: async () => null,
      patchBooking: async () => null,
      sendWhatsApp: async () => true
    });
    expect(res.handled).toBe(false);
  });

  it('handleRanTerminalInbound processes Ran approval (choice 1) end-to-end', async () => {
    const mockMatches: TerminalPendingMatch[] = [
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
    let patchedData: any = null;
    const sentMessages: Array<{ jid: string; text: string }> = [];
    const loggedComms: any[] = [];

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
      fetchImpl: mockFetch as any
    });

    expect(res.handled).toBe(true);
    expect(mockMatches[0].status).toBe('approved');
    expect(mockMatches[0].selected_booking_id).toBe('book-1');
    expect(mockMatches[0].invoice_number).toBe('99881');

    // Booking patched
    expect(patchedBookingId).toBe('book-1');
    expect(patchedData.clearing_payments.length).toBe(1);
    expect(patchedData.clearing_payments[0].deal_number).toBe('deal-101');
    expect(patchedData.clearing_payments[0].document_number).toBe('99881');
    expect(patchedData.payment_status).toBe('PAID');

    // Message sent to Ran confirming
    expect(sentMessages.some((m) => m.text.includes('שויכה בהצלחה ל-*דני לוי*'))).toBe(true);

    // Message sent to guest asking about invoice (emailed to guest + asks if also in WhatsApp)
    const guestMsg = sentMessages.find((m) => m.jid.includes('972501112233'));
    expect(guestMsg).toBeDefined();
    expect(guestMsg?.text).toContain('החשבונית נשלחה למייל שלך');
    expect(guestMsg?.text).toContain('לשלוח לך אותה גם לכאן בווטסאפ?');

    // Outbound logged in guest communications
    expect(loggedComms.length).toBe(1);
    expect(loggedComms[0].bookingId).toBe('book-1');
  });

  it('handleRanTerminalInbound advances candidate on choice 2', async () => {
    const mockMatches: TerminalPendingMatch[] = [
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

    const sent: string[] = [];
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

    expect(res.handled).toBe(true);
    expect(mockMatches[0].current_candidate_index).toBe(1);
    expect(sent[0]).toContain('אפשרות הבאה');
    expect(sent[0]).toContain('מיכל');
  });

  it('handleRanTerminalInbound marks ignored on choice 0', async () => {
    const mockMatches: TerminalPendingMatch[] = [
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

    const sent: string[] = [];
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

    expect(res.handled).toBe(true);
    expect(mockMatches[0].status).toBe('ignored');
    expect(sent[0]).toContain('סומנה כלא משויכת');
  });

  it('handleGuestInvoiceReply delivers invoice url when guest replies yes', async () => {
    const mockMatches: TerminalPendingMatch[] = [
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

    const sentMessages: string[] = [];
    const loggedComms: any[] = [];

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

    expect(sent).toBe(true);
    expect(mockMatches[0].guest_invoice_requested).toBe(true);
    expect(mockMatches[0].guest_invoice_sent_at).toBeDefined();
    expect(sentMessages[0]).toContain('https://cardcom/doc/777');
    expect(loggedComms.length).toBe(1);
    expect(loggedComms[0].bookingId).toBe('book-guest-1');
  });

  it('deal already has document → no new invoice and saves existing doc on payment', async () => {
    const mockMatches: TerminalPendingMatch[] = [
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
            unitId: 'u1',
            unitName: 'בקתת נוף',
            checkIn: '2026-11-07',
            checkOut: '2026-11-09',
            dueIls: 1200,
            totalIls: 1200,
            score: 90
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

    let patchedBooking: any = null;
    const sent: string[] = [];

    const res = await handleRanTerminalInbound('+972 54-831-7887', '1', {
      matches: mockMatches,
      saveMatches: async () => {},
      loadBooking: async () => ({ id: 'book-exist', guest_name: 'ישראל', clearing_payments: [] }),
      patchBooking: async (_, patch) => { patchedBooking = patch; },
      sendWhatsApp: async (_, text) => { sent.push(text); return true; },
      cardcomCreds: { apiName: 'test', apiPassword: 'test' },
      fetchImpl: mockFetch as any
    });

    expect(res.handled).toBe(true);
    expect(cardcomFetchCalls).toBe(0);
    expect(mockMatches[0].invoice_number).toBe('DOC-554433');
    expect(patchedBooking.clearing_payments[0].document_number).toBe('DOC-554433');
    expect(patchedBooking.clearing_payments[0].invoice).toBe('DOC-554433');
    expect(patchedBooking.clearing_payments[0].approval).toBe('776655');
    expect(patchedBooking.clearing_payments[0].last4).toBe('1234');
    expect(patchedBooking.clearing_payments[0].deal_number).toBe('deal-999');
    expect(sent[0]).toContain('נשמרה חשבונית קיימת שמספרה DOC-554433');
  });

  it('booking with email → invoice emailed to guest and WhatsApp mentions email', async () => {
    let requestBody: any = null;
    const mockFetch = async (_url: any, opts: any) => {
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

    const mockMatches: TerminalPendingMatch[] = [
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
            unitId: 'u2',
            unitName: 'וילה מול הנוף',
            checkIn: '2026-11-07',
            checkOut: '2026-11-09',
            dueIls: 2100,
            totalIls: 2100,
            score: 95
          }
        ],
        current_candidate_index: 0,
        status: 'pending'
      }
    ];

    const sentMessages: Array<{ jid: string; text: string }> = [];
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
      fetchImpl: mockFetch as any
    });

    expect(res.handled).toBe(true);
    expect(requestBody.Document.Email).toBe('michal@example.com');
    expect(requestBody.Document.IsSendByEmail).toBe(true);
    expect(requestBody.DealNumbers[0].DealNumber).toBe('deal-email-1');

    const guestMsg = sentMessages.find((m) => m.jid.includes('972527778899'));
    expect(guestMsg).toBeDefined();
    expect(guestMsg?.text).toContain('889900');
    expect(guestMsg?.text).toContain('החשבונית נשלחה למייל שלך');
    expect(guestMsg?.text).toContain('לשלוח לך אותה גם לכאן בווטסאפ?');
  });

  it('no email → business mailbox and WhatsApp asks if to send in WhatsApp', async () => {
    let requestBody: any = null;
    const mockFetch = async (_url: any, opts: any) => {
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

    const mockMatches: TerminalPendingMatch[] = [
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
            unitId: 'u3',
            unitName: 'סוויטה אלון',
            checkIn: '2026-11-07',
            checkOut: '2026-11-09',
            dueIls: 1500,
            totalIls: 1500,
            score: 85
          }
        ],
        current_candidate_index: 0,
        status: 'pending'
      }
    ];

    const sentMessages: Array<{ jid: string; text: string }> = [];
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
      fetchImpl: mockFetch as any
    });

    expect(res.handled).toBe(true);
    expect(requestBody.Document.Email).toBe('mialeesresort@mialees.com');
    expect(requestBody.Document.IsSendByEmail).toBe(true);

    const guestMsg = sentMessages.find((m) => m.jid.includes('972549998877'));
    expect(guestMsg).toBeDefined();
    expect(guestMsg?.text).toContain('445566');
    expect(guestMsg?.text).not.toContain('החשבונית נשלחה למייל שלך');
    expect(guestMsg?.text).toContain('לשלוח לך את החשבונית לכאן בווטסאפ?');
  });

  it('idempotent on repeat approval does not issue second invoice or duplicate payment', async () => {
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

    const mockMatches: TerminalPendingMatch[] = [
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
            unitId: 'u4',
            unitName: 'וילה',
            checkIn: '2026-11-07',
            checkOut: '2026-11-09',
            dueIls: 1000,
            totalIls: 1000,
            score: 90
          }
        ],
        current_candidate_index: 0,
        status: 'pending'
      }
    ];

    const sentMessages: Array<{ jid: string; text: string }> = [];
    const deps = {
      matches: mockMatches,
      saveMatches: async () => {},
      loadBooking: async () => booking,
      patchBooking: async (_: any, patch: any) => {
        Object.assign(booking, patch);
      },
      sendWhatsApp: async (jid: string, text: string) => { sentMessages.push({ jid, text }); return true; },
      cardcomCreds: { apiName: 'test', apiPassword: 'test' },
      fetchImpl: mockFetch as any
    };

    // 1. First approval
    const res1 = await handleRanTerminalInbound('+972 54-831-7887', '1', deps);
    expect(res1.handled).toBe(true);
    expect(cardcomCalls).toBe(1);
    expect(booking.clearing_payments.length).toBe(1);
    expect(booking.clearing_payments[0].invoice).toBe('INV-IDEMP-01');

    // 2. Repeat approval
    const res2 = await handleRanTerminalInbound('+972 54-831-7887', '1', deps);
    expect(res2.handled).toBe(true);
    expect(cardcomCalls).toBe(1);
    expect(booking.clearing_payments.length).toBe(1);
    expect(res2.reply?.includes('כבר שויכה') || res2.reply?.includes('לא בוצע חיוב או שיוך כפול')).toBe(true);
  });
});
