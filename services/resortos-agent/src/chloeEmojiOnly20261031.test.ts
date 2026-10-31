import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import { isEmojiOnlyMessage } from './guest/keywords.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Regression 2026-10-31 11:31: guest (kin_811) sent "❤️" twice; Chloe answered verify_ask_booking + call fallback.
// Synthetic booking/phones only.
const GUEST = '972545550033';
const UNKNOWN = '972545559999';
const booking = { id: 'kin_emoji1', unit_id: 'k681', guest_name: 'Test', guest_phone: '054-5550033', check_in_date: '2026-10-29', check_out_date: '2026-11-02', booking_status: 'CHECKED_IN', checkout_token: 'tok_e1' };
function makeDeps() {
  const sent: { jid: string; text: string }[] = [];
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
    notifyManagerSms: vi.fn(async () => undefined),
    markGuestDeparted: vi.fn(async () => true),
    barakForwardEnabled: false,
    cleaners: () => [],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  } as any as PipelineDeps, { sent });
}
const msg = (from: string, text: string) => ({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }) as any;
afterEach(() => { vi.useRealTimers(); });
const now = () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T11:31:00+02:00')); };

describe('emoji-only detection', () => {
  it.each(['❤️', ' ❤️ ', '👍', '🙏', '🫶', '❤️❤️', '👍🏻🙏', '😂😂', '!!'])('"%s" is emoji-only', (t) => expect(isEmojiOnlyMessage(t)).toBe(true));
  it.each(['כן', 'תודה', 'ok', '1', 'תודה ❤️', '', '   '])('"%s" is not', (t) => expect(isEmojiOnlyMessage(t)).toBe(false));
});

describe('pipeline: emoji-only gets no reply', () => {
  it('known guest "❤️" twice → no reply, no verify, no call fallback', async () => {
    now();
    const d = makeDeps();
    const p = createPipeline(d);
    const r1 = await p.handleInbound(msg(GUEST, '❤️'));
    const r2 = await p.handleInbound(msg(GUEST, '❤️'));
    expect(d.sent).toHaveLength(0);
    expect(r1.reason).toBe('emoji_only_no_reply');
    expect(r2.reason).toBe('emoji_only_no_reply');
    expect(d.resortos.requestGuestCall).not.toHaveBeenCalled();
  });
  it('unknown sender "❤️" → no verify_ask_booking', async () => {
    now();
    const d = makeDeps();
    const r = await createPipeline(d).handleInbound(msg(UNKNOWN, '❤️'));
    expect(r.reason).not.toBe('verify_ask_booking');
    expect(d.sent).toHaveLength(0);
  });
  it.each(['👍', '🙏', '🫶'])('known guest "%s" → silent', async (e) => {
    now();
    const d = makeDeps();
    await createPipeline(d).handleInbound(msg(GUEST, e));
    expect(d.sent).toHaveLength(0);
  });
  it('a real short reply still gets an answer: "תודה"', async () => {
    now();
    const d = makeDeps();
    const r = await createPipeline(d).handleInbound(msg(GUEST, 'תודה'));
    expect(r.reason).not.toBe('emoji_only_no_reply');
    expect(d.sent.length).toBeGreaterThan(0);
  });
  it('unknown sender "כן" still starts verification as before', async () => {
    now();
    const d = makeDeps();
    const r = await createPipeline(d).handleInbound(msg(UNKNOWN, 'כן'));
    expect(r.reason).toBe('verify_ask_booking');
    expect(d.sent.length).toBe(1);
  });
});
