import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { createPipeline, type PipelineDeps } from '../pipeline.js';
import type { CleanerProfile, RoomEntry } from '../config.js';
import {
  amountFromReply, balanceDueAgorot, buildCreateUrl, createHypPayLinkClient, parseCreateResponse,
  payLinkConfig, readPayLinks, redactUrl, draftFromBooking, invoiceItemLine,
} from './hypPayLink.js';

// Ran 2026-10-28: manager scans / types a room → 8 = payment link; editable amount + phone; HYP mocked.
const rooms: RoomEntry[] = [
  { id: 'k690', name: 'חצר מוזיקלית 1', property: 'חצר מוזיקלית', letterCode: 'D1', lockbox: '4321', aliases: ['d1'] } as any,
];
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const plus = (n: number) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const booking = {
  id: 'bk-test-1', unit_id: 'k690', guest_name: 'בדיקה טסט', guest_phone: '0501112222',
  check_in_date: plus(-1), check_out_date: plus(1), booking_status: 'CONFIRMED', payment_status: 'PARTIAL',
  total_price_agorot: 120000, clearing_payments: [{ amount_agorot: 40000 }],
};

function makeDeps(who: CleanerProfile, bookings: any[] = [booking]) {
  const sent: string[] = [];
  const payLink = { create: vi.fn(async () => ({ ok: true, dryRun: false, payRequestId: 'pr-1', paymentURL: 'https://pay.hyp.co.il/p/?pay=TEST' })) };
  const resortos = {
    markRoomReady: vi.fn(async () => ({ ok: true as const })),
    reportMaintenance: vi.fn(async () => ({})),
    reportSupplies: vi.fn(async () => ({})),
    listUnits: vi.fn(async () => [{ id: 'k690', operational_status: 'READY', staff_occupancy: 'OCCUPIED' }]),
    listBookings: vi.fn(async () => bookings),
    setPaymentStatus: vi.fn(), collectCash: vi.fn(), sendGuestLinkSms: vi.fn(),
  };
  const deps: PipelineDeps = {
    send: vi.fn(async (_jid, text) => void sent.push(text)),
    isAudio: (m) => !!m.message?.audioMessage,
    extractText: (m) => m.message?.conversation ?? null,
    transcribe: vi.fn(async () => ({ text: '', language: 'he', duration_ms: 1 })),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' } as any)), translateTask: vi.fn() },
    resortos: resortos as any,
    cleaners: () => [who],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
    payLink: payLink as any,
  };
  return { deps, sent, resortos, payLink };
}
const say = (p: any, from: string, text: string) =>
  p.handleInbound({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } } as any);

beforeEach(() => { const f = process.env.HYP_PAYLINK_STORE!; if (existsSync(f)) rmSync(f); });

describe('HYP payment link helpers', () => {
  it('balance = total − clearing payments; PAID → 0', () => {
    expect(balanceDueAgorot(booking as any)).toBe(80000);
    expect(balanceDueAgorot({ ...booking, payment_status: 'PAID' } as any)).toBe(0);
  });
  it('amount parsing never mistakes a phone for an amount', () => {
    expect(amountFromReply('450')).toBe(45000);
    expect(amountFromReply('סכום 450.5')).toBe(45050);
    expect(amountFromReply('₪1,200')).toBe(null); // ambiguous thousands separator → ask again
    expect(amountFromReply('0527778888')).toBe(null);
  });
  it('builds the documented CREATE request and redacts credentials', () => {
    const cfg = { ...payLinkConfig({}), masof: 'M', passp: 'SECRET' };
    const url = buildCreateUrl({ roomId: 'k690', roomLabel: 'D1', bookingId: 'b', guestName: 'דנה', phone: '0501112222', amountAgorot: 45050, description: 'D1 · הזמנה b' }, cfg);
    const q = new URL(url).searchParams;
    expect(q.get('action')).toBe('payRequest');
    expect(q.get('iCommand')).toBe('CREATE');
    expect(q.get('Amount')).toBe('450.50');
    expect(q.get('cell')).toBe('0501112222');
    expect(redactUrl(url)).not.toContain('SECRET');
  });
  it('adds HYP/EZcount invoice params (one item = Amount, Hebrew, email only when known)', () => {
    const cfg = { ...payLinkConfig({}), masof: 'M', passp: 'SECRET' };
    const base = { roomId: 'k690', roomLabel: 'D1', bookingId: 'b', guestName: 'דנה', phone: '0501112222', amountAgorot: 45050, description: 'D1 · הזמנה b' };
    const q = new URL(buildCreateUrl(base, cfg)).searchParams;
    expect(q.get('Pritim')).toBe('True');
    expect(q.get('heshDesc')).toBe('[0~לינה D1~1~450.50]');
    expect(q.get('EZ.lang')).toBe('he');
    expect(q.get('SendHesh')).toBe('False');
    expect(q.get('email')).toBe(null);
    const q2 = new URL(buildCreateUrl({ ...base, guestEmail: 'dana@example.com' }, cfg)).searchParams;
    expect(q2.get('SendHesh')).toBe('True');
    expect(q2.get('email')).toBe('dana@example.com');
    expect(new URL(buildCreateUrl({ ...base, guestEmail: 'not-an-email' }, cfg)).searchParams.get('SendHesh')).toBe('False');
    expect(invoiceItemLine({ ...base, roomLabel: 'A[1]~x', amountAgorot: 100 })).toBe('[0~לינה A 1  x~1~1.00]');
  });
  it('draftFromBooking carries the guest email when the booking has one', () => {
    const b: any = { id: 'b1', unit_id: 'k690', guest_name: 'דנה', guest_phone: '0501112222', total_price_agorot: 10000, guest_email: 'd@x.co' };
    expect(draftFromBooking('k690', 'D1', b).guestEmail).toBe('d@x.co');
    expect(draftFromBooking('k690', 'D1', { ...b, guest_email: null }).guestEmail).toBeUndefined();
  });
  it('parses success / error / html responses', () => {
    expect(parseCreateResponse('payRequestId=abc&Fild1=&paymentURL=https://pay.hyp.co.il/p/?pay=x')).toMatchObject({ ok: true, payRequestId: 'abc' });
    expect(parseCreateResponse('CCode=902')).toMatchObject({ ok: false, ccode: '902' });
    expect(parseCreateResponse('<html>err</html>').ok).toBe(false);
  });
  it('default client is dry-run unless enabled, and never fetches in dry-run', async () => {
    const f = vi.fn();
    const r = await createHypPayLinkClient(f as any, { HYP_A_MASOF: 'm', HYP_A_PASSP: 'p' }).create({} as any);
    expect(r).toMatchObject({ ok: true, dryRun: true });
    expect(f).not.toHaveBeenCalled();
    const live = createHypPayLinkClient(vi.fn(async () => ({ text: async () => 'payRequestId=z&paymentURL=u' })) as any,
      { HYP_PAYLINK_ENABLED: 'true', HYP_A_MASOF: 'm', HYP_A_PASSP: 'p' });
    expect(await live.create({ amountAgorot: 100 } as any)).toMatchObject({ ok: true, dryRun: false, payRequestId: 'z' });
    expect(await createHypPayLinkClient(vi.fn() as any, { HYP_PAYLINK_ENABLED: 'true' }).create({} as any))
      .toMatchObject({ ok: false, error: 'missing_env:HYP_A_MASOF,HYP_A_PASSP' });
  });
});

describe('manager flow: scan → 8 → edit amount/phone → confirm', () => {
  it('shows balance + phone, edits both, creates once on כן, stores the record', async () => {
    const who = { phone: '972500000001', name: 'מנהל בדיקה', role: 'MANAGER', language: 'he' } as any;
    const { deps, sent, payLink, resortos } = makeDeps(who);
    const p = createPipeline(deps);
    await say(p, who.phone, 'START_D1');
    expect(sent.at(-1)).toContain('8 - 💳 קישור תשלום');
    expect(sent.at(-1)).toContain('7 - התחל / סיים ניקיון');
    await say(p, who.phone, '8');
    expect(sent.at(-1)).toContain('בדיקה טסט');
    expect(sent.at(-1)).toContain('₪800');
    expect(sent.at(-1)).toContain('0501112222');
    await say(p, who.phone, '650');
    expect(sent.at(-1)).toContain('₪650');
    await say(p, who.phone, '052-777-8888');
    expect(sent.at(-1)).toContain('0527778888');
    expect(payLink.create).not.toHaveBeenCalled();
    await say(p, who.phone, 'כן');
    expect(payLink.create).toHaveBeenCalledTimes(1);
    expect(payLink.create).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'bk-test-1', phone: '0527778888', amountAgorot: 65000 }));
    expect(sent.at(-1)).toContain('https://pay.hyp.co.il/p/?pay=TEST');
    const rec = readPayLinks(process.env.HYP_PAYLINK_STORE);
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ bookingId: 'bk-test-1', phone: '0527778888', amountAgorot: 65000, createdBy: 'מנהל בדיקה' });
    expect(JSON.stringify(rec)).not.toMatch(/PassP|Masof/);
    // no booking / payment writes
    expect(resortos.setPaymentStatus).not.toHaveBeenCalled();
    expect(resortos.collectCash).not.toHaveBeenCalled();
    expect(resortos.sendGuestLinkSms).not.toHaveBeenCalled();
  });
  it('typed room name also reaches the option; לא cancels without creating', async () => {
    const who = { phone: '972500000002', name: 'מנהל', role: 'OPS_MANAGER', language: 'he' } as any;
    const { deps, sent, payLink } = makeDeps(who);
    const p = createPipeline(deps);
    await say(p, who.phone, 'D1');
    expect(sent.at(-1)).toContain('8 - 💳 קישור תשלום');
    await say(p, who.phone, 'קישור תשלום');
    expect(sent.at(-1)).toContain('סכום לתשלום');
    await say(p, who.phone, 'לא');
    expect(sent.at(-1)).toContain('בוטל');
    expect(payLink.create).not.toHaveBeenCalled();
  });
  it('no active booking → no link', async () => {
    const who = { phone: '972500000003', name: 'מנהל', role: 'MANAGER', language: 'he' } as any;
    const { deps, sent, payLink } = makeDeps(who, []);
    const p = createPipeline(deps);
    await say(p, who.phone, 'START_D1');
    await say(p, who.phone, '8');
    expect(sent.at(-1)).toContain('אין הזמנה פעילה');
    expect(payLink.create).not.toHaveBeenCalled();
  });
  it('cleaners never get a payment link', async () => {
    const who = { phone: '972500000004', name: 'מנקה', role: 'CLEANER', language: 'he' } as any;
    const { deps, sent, payLink } = makeDeps(who);
    const p = createPipeline(deps);
    await say(p, who.phone, 'START_D1');
    await say(p, who.phone, '8');
    await say(p, who.phone, 'כן');
    expect(payLink.create).not.toHaveBeenCalled();
    expect(sent.join('\n')).not.toContain('קישור תשלום');
  });
});
