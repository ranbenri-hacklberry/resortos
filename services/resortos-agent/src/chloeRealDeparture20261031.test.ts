import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import { isDueOut } from './guest/dueOut.js';
import { createGuestDepartedMarker } from './integration/guestDeparted.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Ran 2026-10-31: CHECKED_OUT only on a real departure. Synthetic bookings/phones only; no network, no DB.
const GUEST = '972545550032';
const MANAGER = '972548317887';
const mk = (over: Record<string, unknown> = {}) => ({
  id: 'kin_dep1', unit_id: 'k681', guest_name: 'Test', guest_phone: '054-5550032',
  check_in_date: '2026-10-29', check_out_date: '2026-10-31', booking_status: 'CONFIRMED', checkout_token: 'tok_dep1', ...over,
});
function makeDeps(bookings: any[], extra: Partial<PipelineDeps> = {}) {
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
      listUnits: vi.fn(async () => []), listBookings: vi.fn(async () => bookings),
    },
    notifyManagerSms: vi.fn(async (m: string) => void sms.push(m)),
    markGuestDeparted: vi.fn(async () => true),
    barakForwardEnabled: false,
    cleaners: () => [],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
    ...extra,
  } as any as PipelineDeps, { sent, sms });
}
const msg = (from: string, text: string) => ({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }) as any;
const at = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };
afterEach(() => { vi.useRealTimers(); });

describe('Chloe guest-left → real departure write (guest_message)', () => {
  it('on checkout day: replies once, SMS Ran once, marks departed once', async () => {
    at('2026-10-31T11:05:00+02:00');
    const d = makeDeps([mk()]);
    await createPipeline(d).handleInbound(msg(GUEST, 'צ׳ק-אאוט בוצע השארנו גם נקי תודה רבה לכם על הכל חוויה נהדרת נהנו מאד!🫶🙏'));
    await new Promise((r) => setImmediate(r));
    expect(d.sent.filter((s) => s.jid.startsWith(GUEST))).toHaveLength(1);
    expect(d.sms).toHaveLength(1);
    expect(d.markGuestDeparted).toHaveBeenCalledTimes(1);
    expect((d.markGuestDeparted as any).mock.calls[0][0]).toMatchObject({ bookingId: 'kin_dep1', unitId: 'k681' });
  });
  it('day after checkout (late message) still marks departed', async () => {
    at('2026-11-01T09:00:00+02:00');
    const d = makeDeps([mk()]);
    await createPipeline(d).handleInbound(msg(GUEST, 'יצאנו'));
    expect(d.markGuestDeparted).toHaveBeenCalledTimes(1);
  });
  it('already CHECKED_OUT (e.g. self-checkout) → no second write', async () => {
    at('2026-10-31T11:05:00+02:00');
    const d = makeDeps([mk({ booking_status: 'CHECKED_OUT' })]);
    await createPipeline(d).handleInbound(msg(GUEST, 'יצאנו'));
    expect(d.markGuestDeparted).not.toHaveBeenCalled();
  });
  it('a checkout question never marks departed', async () => {
    at('2026-10-31T09:00:00+02:00');
    const d = makeDeps([mk()]);
    await createPipeline(d).handleInbound(msg(GUEST, 'מתי הצ׳ק-אאוט?'));
    expect(d.markGuestDeparted).not.toHaveBeenCalled();
  });
  it('marker posts to the Studio self-checkout-effects endpoint with source=guest_message; no secret → no call', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    const ok = await createGuestDepartedMarker({ baseUrl: 'http://studio.test/', secret: 's', fetchImpl: f as any })({ bookingId: 'kin_dep1', unitId: 'k681', at: 'T' });
    expect(ok).toBe(true);
    const [url, init] = (f.mock.calls[0] as any);
    expect(url).toBe('http://studio.test/api/guest/self-checkout-effects');
    expect(init.headers['x-hotelos-mailbox']).toBe('s');
    expect(JSON.parse(init.body)).toEqual({ source: 'guest_message', booking_id: 'kin_dep1', unit_id: 'k681', checked_out_at: 'T' });
    const f2 = vi.fn();
    expect(await createGuestDepartedMarker({ baseUrl: 'http://x', secret: '', fetchImpl: f2 as any })({ bookingId: 'b' })).toBe(false);
    expect(f2).not.toHaveBeenCalled();
  });
});

describe('due_out + cleaning list', () => {
  it('isDueOut', () => {
    expect(isDueOut(mk(), '2026-10-31')).toBe(true);
    expect(isDueOut(mk({ booking_status: 'CHECKED_IN' }), '2026-10-31')).toBe(true);
    expect(isDueOut(mk({ booking_status: 'CHECKED_OUT' }), '2026-10-31')).toBe(false);
    expect(isDueOut(mk(), '2026-10-30')).toBe(false);
  });
  it('manager "מה ממתין לניקיון": due_out room is on the cleaning list and flagged as not yet departed', async () => {
    at('2026-10-31T08:00:00+02:00');
    const d = makeDeps([mk({ booking_status: 'CHECKED_IN' }), mk({ id: 'kin_dep2', unit_id: 'k682', booking_status: 'CHECKED_OUT' })], {
      cleaners: () => [{ phone: MANAGER, name: 'רני', role: 'MANAGER' } as any],
    });
    await createPipeline(d).handleInbound(msg(MANAGER, 'מה ממתין לניקיון?'));
    const r = d.sent.map((s) => s.text).join('\n');
    expect(r).toContain('ממתינים לניקיון (2)');
    expect(r).toContain('יוצאים היום, טרם אישרו יציאה (1)');
  });
});
