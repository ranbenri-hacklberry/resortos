import { describe, it, expect } from 'vitest';
import {
  parseRanApprovalChoice,
  isGuestInvoiceYesReply,
  handleRanTerminalInbound,
  handleGuestInvoiceReply,
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

    // Message sent to guest asking about invoice
    const guestMsg = sentMessages.find((m) => m.jid.includes('972501112233'));
    expect(guestMsg).toBeDefined();
    expect(guestMsg?.text).toContain('לשלוח לך את החשבונית לכאן בווטסאפ?');

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
});
