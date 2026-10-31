import { describe, it, expect, vi } from 'vitest';
import { createPipeline, extractTypedPhone, phonesMatch } from './pipeline.js';
function makeDeps() {
  const sent: Array<[string, string]> = [];
  const deps: any = {
    send: vi.fn(async (jid: string, text: string) => void sent.push([jid, text])),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn() },
    resortos: {
      markRoomReady: vi.fn(async () => ({ ok: true })),
      startCleaning: vi.fn(async () => ({ ok: true })),
      reportMaintenance: vi.fn(async () => ({})),
      reportSupplies: vi.fn(async () => ({})),
      listBookings: vi.fn(async () => []),
      listUnits: vi.fn(async () => [{ id: 'k687', operational_status: 'READY' }]),
    },
    cleaners: () => [],
    rooms: () => [],
    log: { info() {}, warn() {}, error() {} },
  };
  return Object.assign(deps, { sent });
}

const rooms = [{ id: 'k687', name: 'טוסקנה 1', property: 'טוסקנה', letterCode: 'C1', lockbox: '4321', aliases: ['c1'] }];
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const booking = {
  id: 'kin_test_toscana', unit_id: 'k687', guest_name: 'בדיקה', guest_phone: '052-606-5443',
  check_in_date: '2000-01-01', check_out_date: '2999-12-31', booking_status: 'CONFIRMED', checkout_token: 'tok_test_toscana',
};
const setup = (bookings: any[]) => {
  const deps: any = makeDeps();
  deps.cleaners = () => [];
  deps.rooms = () => rooms;
  deps.resortos.listBookings = vi.fn(async () => bookings);
  return deps;
};
const guestReplies = (deps: any, jid: string) => deps.sent.filter((s: any) => s[0] === jid).map((s: any) => s[1]);

describe('Guest phone lookup for @lid senders and typed booking phone (Ran 2026-10-21, Toscana 1)', () => {
  it('normalizes typed phones', () => {
    expect(extractTypedPhone('052-606-5443')).toBe('0526065443');
    expect(extractTypedPhone('המספר הוא +972 52 606 5443 תודה')).toBe('972526065443');
    expect(extractTypedPhone('רגינה כהן 21-22/10')).toBe('');
    expect(phonesMatch(extractTypedPhone('052-606-5443'), '972526065443')).toBe(true);
  });

  it('@lid sender is matched by key.senderPn (not the privacy-ID digits)', async () => {
    const deps = setup([booking]);
    const jid = '227294014632047@lid';
    await createPipeline(deps).handleInbound({ key: { remoteJid: jid, senderPn: '972526065443@s.whatsapp.net', fromMe: false }, message: { conversation: 'START_C1' } } as any);
    const all = guestReplies(deps, jid).join('\n');
    expect(all).not.toContain('רגע, אני בודקת את ההזמנה שלך');
    expect(all).toContain('tok_test_toscana');
  });

  // Ran 2026-10-22: a typed phone never releases the code in WhatsApp (was: typed phone → stay link/code in chat).
  it('unmatched scan asks about a booking, then the phone; a typed 052-606-5443 sends the guest link by SMS to the booking phone only', async () => {
    const deps = setup([{ ...booking, guest_phone: '972526065443' }]);
    deps.resortos.sendGuestLinkSms = vi.fn(async () => ({ ok: true }));
    const jid = '111122223333444@lid';
    const p = createPipeline(deps);
    await p.handleInbound({ key: { id: 'm1', remoteJid: jid, senderPn: '972541112222@s.whatsapp.net', fromMe: false }, message: { conversation: 'START_C1' } } as any);
    expect(guestReplies(deps, jid)[0]).toContain('יש לכם הזמנה ל');
    await p.handleInbound({ key: { id: 'm2', remoteJid: jid, senderPn: '972541112222@s.whatsapp.net', fromMe: false }, message: { conversation: 'כן' } } as any);
    expect(guestReplies(deps, jid)[1]).toContain('מה מספר הטלפון שאיתו בוצעה ההזמנה');
    await p.handleInbound({ key: { id: 'm3', remoteJid: jid, senderPn: '972541112222@s.whatsapp.net', fromMe: false }, message: { conversation: '052-606-5443' } } as any);
    const after = guestReplies(deps, jid).slice(2).join('\n');
    expect(after).toContain('שלחתי את הקישור לדף האורח ב-SMS');
    expect(after).not.toContain('tok_test_toscana');
    expect(after).not.toContain('4321');
    expect(deps.resortos.sendGuestLinkSms).toHaveBeenCalledWith(expect.objectContaining({ phone: '972526065443' }));
  });

  it('typed number not found and no OTP possible -> handoff to the manager; never asks forever', async () => {
    const deps = setup([booking]);
    const jid = '555566667777888@lid';
    const p = createPipeline(deps);
    await p.handleInbound({ key: { id: 'n1', remoteJid: jid, fromMe: false }, message: { conversation: 'START_C1' } } as any);
    expect(guestReplies(deps, jid)[0]).toContain('יש לכם הזמנה ל');
    await p.handleInbound({ key: { id: 'n2', remoteJid: jid, fromMe: false }, message: { conversation: 'My number is 050-000-0000' } } as any);
    expect(guestReplies(deps, jid)[1]).toContain('מנהל המתחם יחזור');
    expect(guestReplies(deps, jid).join('\n')).not.toContain('4321');
  });
});
