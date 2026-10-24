import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import { isGuestLeftMessage } from './guest/keywords.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Regression 2026-10-23 (Musical Courtyard 1+3): guests replied "יצאנו" and got the generic "אין לי תשובה מדויקת" fallback.
// Synthetic booking/phone only — no real reservation is touched.
const GUEST = '972545550001';
const booking = {
  id: 'kin_left1', unit_id: 'k681', guest_name: 'Test', guest_phone: '054-5550001',
  check_in_date: '2026-10-21', check_out_date: '2026-10-23', booking_status: 'CONFIRMED', checkout_token: 'tok_left1',
};
function makeDeps() {
  const sent: { jid: string; text: string }[] = [];
  const sms: string[] = [];
  const rooms = ((realRooms as any).rooms || realRooms) as any[];
  return Object.assign({
    send: vi.fn(async (jid: string, text: string) => void sent.push({ jid, text })),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn(async (t: string) => t) },
    resortos: {
      markRoomReady: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn(), requestGuestCall: vi.fn(async () => undefined),
      listUnits: vi.fn(async () => []), listBookings: vi.fn(async () => [booking]),
    },
    notifyManagerSms: vi.fn(async (m: string) => void sms.push(m)),
    barakForwardEnabled: false,
    cleaners: () => [],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  } as any as PipelineDeps, { sent, sms });
}
const msg = (text: string) => ({ key: { remoteJid: `${GUEST}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }) as any;
const at = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };
const replies = (d: ReturnType<typeof makeDeps>) => d.sent.filter((s) => s.jid.startsWith(GUEST)).map((s) => s.text);
afterEach(() => { vi.useRealTimers(); });

describe('guest-left intent', () => {
  it('detects phrasings in he/en/ru and ignores negations/questions', () => {
    for (const t of ['יצאנו', 'כבר יצאנו', 'עזבנו', 'סיימנו ויצאנו', 'יצאנו מהחדר', 'השארנו מפתח', 'we left', "We've left", 'checked out', 'мы уехали', 'выехали'])
      expect(isGuestLeftMessage(t), t).toBe(true);
    for (const t of ["מתי צ'ק אאוט?", 'עוד לא יצאנו', 'אפשר לצאת ב12?', 'we have not left yet', 'не выехали'])
      expect(isGuestLeftMessage(t), t).toBe(false);
  });

  it('"יצאנו" on checkout day → thanks + SMS to Ran, no fallback', async () => {
    at('2026-10-23T11:30:00+03:00');
    const d = makeDeps();
    await createPipeline(d).handleInbound(msg('יצאנו'));
    const r = replies(d);
    expect(r).toEqual(['תודה שעדכנתם! נסיעה טובה 🌿']);
    expect(d.sms).toHaveLength(1);
    expect(d.sms[0]).toContain('יצא');
    expect(d.resortos.markRoomReady).not.toHaveBeenCalled();
  });

  it('English the day after checkout → English thanks', async () => {
    at('2026-10-24T09:00:00+03:00');
    const d = makeDeps();
    await createPipeline(d).handleInbound(msg('we left'));
    expect(replies(d)).toEqual(['Thanks for letting us know! Have a safe trip 🌿']);
  });

  it('"מתי צ\'ק אאוט?" is not treated as guest-left', async () => {
    at('2026-10-22T20:00:00+03:00');
    const d = makeDeps();
    await createPipeline(d).handleInbound(msg("מתי צ'ק אאוט?"));
    const r = replies(d);
    expect(r.length).toBeGreaterThan(0);
    for (const t of r) { expect(t).not.toContain('נסיעה טובה'); expect(t).not.toContain('אין לי תשובה מדויקת'); }
    expect(d.sms.some((m) => m.includes('אורח עדכן שיצא'))).toBe(false);
  });
});
