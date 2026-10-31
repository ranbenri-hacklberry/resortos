import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import { isGuestLeftMessage, isGuestLeftWithThanks, GUEST_LEFT_WARM_THANKS, GUEST_LEFT_THANKS } from './guest/keywords.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Regression 2026-10-31: "צ׳ק-אאוט בוצע השארנו גם נקי תודה..." got the checkout FAQ. Synthetic booking only.
const GUEST = '972545550031';
const booking = {
  id: 'kin_done1', unit_id: 'k681', guest_name: 'Test', guest_phone: '054-5550031',
  check_in_date: '2026-10-29', check_out_date: '2026-10-31', booking_status: 'CONFIRMED', checkout_token: 'tok_done1',
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
const replies = (d: ReturnType<typeof makeDeps>) => d.sent.filter((s) => s.jid.startsWith(GUEST)).map((s) => s.text);
afterEach(() => { vi.useRealTimers(); });

const EXACT = 'צ׳ק-אאוט בוצע השארנו גם נקי תודה רבה לכם על הכל חוויה נהדרת נהנו מאד!🫶🙏';
const DONE = [
  EXACT,
  "צ'ק אאוט בוצע, תודה!",
  'עשינו צ׳ק אאוט, תודה רבה נהנינו',
  'סיימנו את הצ׳ק-אאוט והשארנו נקי',
  'השארנו את החדר נקי, תודה על הכל',
  'We checked out, thanks for everything!',
  "We've checked out, thank you!",
  'Checkout done, thanks a lot',
];
const QUESTIONS = ['מתי הצ׳ק-אאוט?', 'אפשר צ׳ק-אאוט מאוחר?', 'עד מתי צ׳ק אאוט', 'What time is check-out?', 'Can we do a late checkout?'];

describe('checkout-done + thanks detection', () => {
  it.each(DONE)('detects "%s" as guest-left', (t) => expect(isGuestLeftMessage(t)).toBe(true));
  it.each(QUESTIONS)('does not treat question "%s" as guest-left', (t) => expect(isGuestLeftMessage(t)).toBe(false));
  it('negations are not departures', () => {
    expect(isGuestLeftMessage('עוד לא עשינו צ׳ק אאוט')).toBe(false);
    expect(isGuestLeftMessage("we haven't checked out yet")).toBe(false);
  });
  it('thanks variant detection', () => {
    expect(isGuestLeftWithThanks(EXACT)).toBe(true);
    expect(isGuestLeftWithThanks('יצאנו')).toBe(false);
  });
});

describe('pipeline: checkout-done reply on checkout day', () => {
  const run = async (text: string) => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T11:05:00+02:00'));
    const d = makeDeps();
    await createPipeline(d).handleInbound(msg(text));
    return d;
  };
  it('exact 31/10 message → warm Hebrew farewell, no FAQ, SMS to manager', async () => {
    const d = await run(EXACT);
    const r = replies(d).join('\n');
    expect(r).toContain(GUEST_LEFT_WARM_THANKS.he);
    expect(r).not.toMatch(/שעת צ׳ק-אאוט רשמית|ℹ️/);
    expect(d.sms.length).toBe(1);
  });
  it('English variant → English warm farewell', async () => {
    const d = await run('We checked out, thanks for everything!');
    const r = replies(d).join('\n');
    expect(r).toContain(GUEST_LEFT_WARM_THANKS.en);
    expect(r).not.toMatch(/ℹ️/);
  });
  it('plain "יצאנו" keeps the original short thanks', async () => {
    const d = await run('יצאנו');
    expect(replies(d).join('\n')).toContain(GUEST_LEFT_THANKS.he);
  });
  it.each(['מתי הצ׳ק-אאוט?', 'What time is check-out?'])('question "%s" still gets checkout info, no farewell', async (q) => {
    const d = await run(q);
    const r = replies(d).join('\n');
    expect(r).not.toContain(GUEST_LEFT_WARM_THANKS.he);
    expect(r).not.toContain(GUEST_LEFT_WARM_THANKS.en);
    expect(r).toMatch(/13:00|check-?out|צ׳ק-אאוט/i);
    expect(d.sms.length).toBe(0);
  });
});
