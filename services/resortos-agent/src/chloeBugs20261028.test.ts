import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPipeline, hasGuestBooking, isStaffHousingBooking, isBackendError, type PipelineDeps } from './pipeline.js';
import { isIntroMessage, isGuideLinkRequest, isFoundItMessage, isProblemReport, stripQrTokens, TV_RE } from './guest/keywords.js';
import { KNOWN_STAFF_LIDS } from './whatsapp/client.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Chloe log review 26–28/10/2026. Synthetic bookings and phones only — no real reservation, room, lock or payment is touched.
const GUEST = '972545550028';
const GENERIC = 'אין לי תשובה מדויקת';
const booking = {
  id: 'kin_t28', unit_id: 'k689', guest_name: 'בדיקה טסט', guest_phone: '054-5550028',
  check_in_date: '2026-10-27', check_out_date: '2026-10-28', booking_status: 'CONFIRMED', payment_status: 'PAID', checkout_token: 'tok_t28',
};
const MGRS = [
  { phone: '972500000001', name: 'מנהל א', role: 'MANAGER', language: 'he' },
  { phone: '972500000002', name: 'מנהל ב', role: 'MANAGER', language: 'he' },
  { phone: '972500000003', name: 'מנהל ג', role: 'MANAGER', language: 'he' },
];
function makeDeps(over: Partial<any> = {}) {
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
    ...over,
  } as any as PipelineDeps, { sent, sms });
}
const msg = (text: string, jid = `${GUEST}@s.whatsapp.net`) => ({ key: { remoteJid: jid, fromMe: false }, message: { conversation: text } }) as any;
const at = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };
const to = (d: ReturnType<typeof makeDeps>, who: string) => d.sent.filter((s) => s.jid.startsWith(who)).map((s) => s.text);
beforeEach(() => { process.env.GUEST_ID_STORE_DIR = mkdtempSync(path.join(tmpdir(), 'chloe28-')); });
afterEach(() => { vi.useRealTimers(); delete process.env.CHLOE_GUEST_ID_SCAN; });

describe('bug 1: non-questions and real questions never get the generic fallback', () => {
  it('keyword helpers', () => {
    expect(isIntroMessage('שלום, כאן נעמה לוי לגבי ההזמנה בטוסקנה 3 (2026-10-27–2026-10-28)')).toBe(true);
    expect(isIntroMessage('מתי הצ׳ק אין?')).toBe(false);
    expect(isGuideLinkRequest('שלום, שלחו לי בבקשה את הקישור למדריך הדיגיטלי של מול הנוף · בקתה 1 START_F1')).toBe(true);
    expect(isFoundItMessage('בסדר מצאנו במיטות למעלה')).toBe(true);
    expect(isFoundItMessage('איפה הסדינים?')).toBe(false);
    expect(TV_RE.test('איך מדליקים את המסךך')).toBe(true);
    expect(stripQrTokens('קישור START_B2')).toBe('קישור');
  });
  for (const [label, text, must] of [
    ['intro', 'שלום, כאן בדיקה טסט לגבי ההזמנה בטוסקנה 3 (2026-10-27–2026-10-28)', 'tok_t28'],
    ['guide link + QR token', 'שלום, שלחו לי בבקשה את הקישור למדריך הדיגיטלי של טוסקנה · 3 START_C3', 'tok_t28'],
    ['found it', 'בסדר מצאנו במיטות למעלה', 'שמחים'],
  ] as const) {
    it(label, async () => {
      at('2026-10-27T16:00:00+03:00');
      const d = makeDeps();
      await createPipeline(d).handleInbound(msg(text));
      const r = to(d, GUEST);
      expect(r.length).toBeGreaterThan(0);
      expect(r.join('\n')).toContain(must);
      for (const t of r) expect(t).not.toContain(GENERIC);
    });
  }
  it('"how do I turn on the screen" is answered as a TV question', async () => {
    at('2026-10-27T21:00:00+03:00');
    const d = makeDeps();
    await createPipeline(d).handleInbound(msg('איך מדליקים את המסךך'));
    const r = to(d, GUEST);
    expect(r.length).toBeGreaterThan(0);
    for (const t of r) expect(t).not.toContain(GENERIC);
  });
});

describe('bug 2 + 7: departure / problem messages', () => {
  it('guest left + lockbox problem → apology, staff flag, and NO ID request', async () => {
    process.env.CHLOE_GUEST_ID_SCAN = '1';
    at('2026-10-28T11:39:00+03:00');
    const d = makeDeps();
    await createPipeline(d).handleInbound(msg('היי השארנו את המפתח בדלת.לא הצלחנו לפתוח את הכספת.תודה על החוויה'));
    await new Promise((r) => setTimeout(r, 1700));
    const r = to(d, GUEST);
    expect(r.join('\n')).toContain('מצטערים');
    expect(r.join('\n')).not.toContain('תעודת הזהות');
    expect(d.sms.some((m) => m.includes('תקלה'))).toBe(true);
  });
  it('problem detector ignores "no problems"', () => {
    expect(isProblemReport('לא הצלחנו לפתוח את הכספת')).toBe(true);
    expect(isProblemReport('הכל היה מעולה, לא היו בעיות')).toBe(false);
  });
  it('in-stay problem is flagged to staff once per 30 min', async () => {
    at('2026-10-27T18:00:00+03:00');
    const d = makeDeps();
    const p = createPipeline(d);
    await p.handleInbound(msg('המזגן לא עובד'));
    await p.handleInbound(msg('המזגן עדיין לא עובד'));
    expect(d.sms.filter((m) => m.includes('תקלה'))).toHaveLength(1);
  });
});

describe('bug 3: wrong-room QR alert', () => {
  it('one alert per scan, to one manager only', async () => {
    at('2026-10-27T16:00:00+03:00');
    const d = makeDeps({ cleaners: () => MGRS });
    const p = createPipeline(d);
    await p.handleInbound(msg('START_D1'));
    await p.handleInbound(msg('START_D1'));
    const alerts = d.sent.filter((s) => s.text.includes('סריקת QR לא תואמת'));
    expect(alerts).toHaveLength(1);
    for (const s of d.sent) expect(s.text).not.toMatch(/\b\d{4}\b.*כספת|קוד כספת/);
  });
});

describe('bug 4: media without text', () => {
  it('guest photo without caption is acknowledged once, not dropped', async () => {
    at('2026-10-27T16:00:00+03:00');
    const d = makeDeps();
    const p = createPipeline(d);
    const img = { key: { remoteJid: `${GUEST}@s.whatsapp.net`, fromMe: false }, message: { imageMessage: { mimetype: 'image/jpeg' } } } as any;
    const r1 = await p.handleInbound(img);
    const r2 = await p.handleInbound(img);
    expect(r1.handled).toBe(true);
    expect(r2.handled).toBe(true);
    expect(to(d, GUEST)).toHaveLength(1);
  });
});

describe('bug 5: staff phone is staff, not a guest', () => {
  const [lid, phone] = Object.entries(KNOWN_STAFF_LIDS)[0];
  const staffBooking = { ...booking, id: 'kin_staff', unit_id: 'k679', guest_name: 'עובד מגורי צוות', guest_phone: phone, check_in_date: '2026-10-01', check_out_date: '2026-12-31' };
  it('staff-housing bookings are not guest stays', () => {
    const rooms = ((realRooms as any).rooms || realRooms) as any[];
    expect(isStaffHousingBooking(staffBooking, rooms)).toBe(true);
    expect(hasGuestBooking([staffBooking], phone, rooms)).toBe(false);
    expect(hasGuestBooking([booking], booking.guest_phone, rooms)).toBe(true);
  });
  it('known staff @lid without senderPn is answered as staff, never with the guest fallback for בתי נורית 8', async () => {
    at('2026-10-27T18:57:00+03:00');
    const d = makeDeps({ cleaners: () => [{ phone, name: 'צוות', role: 'MANAGER', language: 'he' }] });
    (d as any).resortos.listBookings = vi.fn(async () => [staffBooking]);
    await createPipeline(d).handleInbound(msg('מוזיקלית 2', `${lid}@lid`));
    const r = to(d, lid);
    for (const t of r) { expect(t).not.toContain(GENERIC); expect(t).not.toContain('בתי נורית 8'); expect(t).not.toContain('תעודת הזהות'); }
  });
});

describe('bug 6: backend failure', () => {
  it('one holding reply + one internal alert, never repeated "לא הבנתי"', async () => {
    at('2026-10-26T16:58:00+03:00');
    const d = makeDeps();
    (d as any).resortos.listBookings = vi.fn(async () => { throw new Error('ResortOS /api/ops/bookings -> HTTP 500 fetch failed'); });
    const p = createPipeline(d);
    for (const t of ['שלחו לי את הקישור למדריך', 'מאוד מאכזב..חייבת לומר', 'אהלן']) await p.handleInbound(msg(t));
    const r = to(d, GUEST);
    expect(r).toEqual(['רגע, בודקת ומחזירה תשובה 🙏']);
    expect(r.join()).not.toContain('לא הבנתי');
    expect(d.sms.length).toBe(1);
    expect(isBackendError(new Error('HTTP 500'))).toBe(true);
    expect(isBackendError(new Error('TypeError: x is undefined'))).toBe(false);
  });
});
