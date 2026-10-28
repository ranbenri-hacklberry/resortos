import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPipeline, type PipelineDeps } from '../pipeline.js';
import type { RoomEntry } from '../config.js';
import {
  buildCashInvoiceUrl, cashInvoiceAllowed, cashInvoiceConfig, createCashInvoiceClient, parseSoftResponse, readCashInvoices,
} from './cashInvoice.js';
import { pollPaidLinks, parseListResponse } from './payLinkWatch.js';
import { recordPayLink } from './hypPayLink.js';

// Ran 2026-10-28: cash invoice via HYP soft/Cash + paid-link watcher. HYP is always mocked here.
const tmp = () => join(mkdtempSync(join(tmpdir(), 'chloe-cashinv-')), 'x.jsonl');
const env = (extra: Record<string, string> = {}) => ({ HYP_PAYLINK_MASOF: 'M', HYP_PAYLINK_PASSP: 'SECRET', HYP_PAYLINK_KEY: 'K', ...extra }) as any;
const req = { key: 'cash:bk-test-1:50000:1', bookingId: 'bk-test-1', roomLabel: 'D1', guestName: 'בדיקה', amountAgorot: 50000, createdBy: 'מנהל' };

describe('cash invoice client', () => {
  it('flag + allowlist gate (empty allowlist = nobody)', () => {
    expect(cashInvoiceAllowed('bk-test-1', env())).toBe(false);
    expect(cashInvoiceAllowed('bk-test-1', env({ HYP_CASH_INVOICE_ENABLED: 'true' }))).toBe(false);
    expect(cashInvoiceAllowed('bk-test-1', env({ HYP_CASH_INVOICE_ENABLED: 'true', HYP_CASH_INVOICE_BOOKINGS: 'bk-test-1' }))).toBe(true);
    expect(cashInvoiceAllowed('real', env({ HYP_CASH_INVOICE_ENABLED: 'true', HYP_CASH_INVOICE_BOOKINGS: 'bk-test-1' }))).toBe(false);
  });
  it('builds the documented soft/Cash request with invoice params', () => {
    const q = new URL(buildCashInvoiceUrl({ ...req, email: 'a@b.co' }, cashInvoiceConfig(env()))).searchParams;
    expect(q.get('action')).toBe('soft');
    expect(q.get('TransType')).toBe('Cash');
    expect(q.get('Amount')).toBe('500.00');
    expect(q.get('heshDesc')).toBe('[0~לינה D1~1~500.00]');
    expect(q.get('Pritim')).toBe('True');
    expect(q.get('SendHesh')).toBe('True');
    expect(q.get('email')).toBe('a@b.co');
    expect(q.get('UserId')).toBe('000000000');
    expect(new URL(buildCashInvoiceUrl(req, cashInvoiceConfig(env()))).searchParams.get('SendHesh')).toBe('False');
  });
  it('classifies responses: success / rejection / ambiguous', () => {
    expect(parseSoftResponse('Id=416194874&CCode=0&Amount=200&Hesh=1234')).toMatchObject({ status: 'issued', transId: '416194874', invoiceNumber: '1234' });
    expect(parseSoftResponse('Id=0&CCode=400&Amount=200')).toMatchObject({ status: 'failed', ccode: '400' });
    expect(parseSoftResponse('<html>x</html>').status).toBe('review');
    expect(parseSoftResponse('').status).toBe('review');
    expect(parseSoftResponse('Id=0&CCode=0').status).toBe('review');
  });
  it('issues once, stores number + link, never twice for the same key, no secrets stored', async () => {
    const store = tmp();
    const f = vi.fn(async (url: string) => ({ text: async () => url.includes('action=soft') ? 'Id=777&CCode=0&Hesh=55' : 'Masof=M&TransId=777&action=PrintHesh&type=EZCOUNT&signature=abc' }));
    const c = createCashInvoiceClient(f as any, env({ HYP_CASH_INVOICE_ENABLED: 'true', HYP_CASH_INVOICE_BOOKINGS: 'bk-test-1' }), store);
    const r = await c.issue(req);
    expect(r).toMatchObject({ status: 'issued', transId: '777', invoiceNumber: '55' });
    expect(r.invoiceUrl).toContain('signature=abc');
    expect(await c.issue(req)).toMatchObject({ status: 'duplicate' });
    expect(f).toHaveBeenCalledTimes(2); // soft + PrintHesh only
    const rows = readCashInvoices(store);
    expect(rows.map((x) => x.status)).toEqual(['pending', 'issued']);
    expect(JSON.stringify(rows)).not.toMatch(/SECRET|PassP/);
  });
  it('ambiguous network failure → review, no retry; a later issue on the same key is blocked', async () => {
    const store = tmp();
    const f = vi.fn(async () => { throw new Error('timeout'); });
    const c = createCashInvoiceClient(f as any, env({ HYP_CASH_INVOICE_ENABLED: 'true', HYP_CASH_INVOICE_BOOKINGS: 'bk-test-1' }), store);
    expect((await c.issue(req)).status).toBe('review');
    expect(await c.issue(req)).toMatchObject({ status: 'duplicate' });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('not allowlisted → never calls HYP', async () => {
    const f = vi.fn();
    const c = createCashInvoiceClient(f as any, env({ HYP_CASH_INVOICE_ENABLED: 'true' }), tmp());
    expect((await c.issue(req)).status).toBe('not_allowed');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('pipeline: cash confirm → invoice question (allowlisted test booking only)', () => {
  const rooms: RoomEntry[] = [{ id: 'k690', name: 'חצר מוזיקלית 1', property: 'חצר מוזיקלית', letterCode: 'D1', lockbox: '4321', aliases: ['d1'] } as any];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const plus = (n: number) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const booking = { id: 'bk-test-1', unit_id: 'k690', guest_name: 'בדיקה טסט', guest_phone: '0501112222', check_in_date: plus(-1), check_out_date: plus(1), booking_status: 'CONFIRMED', payment_status: 'PARTIAL', total_price_agorot: 120000 };
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  function make(bookings: any[] = [booking]) {
    const sent: string[] = [];
    const who = { phone: '972500000001', name: 'מנהל בדיקה', role: 'MANAGER', language: 'he' } as any;
    const cashInvoice = { issue: vi.fn(async () => ({ status: 'issued' as const, invoiceNumber: '55', invoiceUrl: 'u' })) };
    const deps: PipelineDeps = {
      send: vi.fn(async (_j, t) => void sent.push(t)),
      isAudio: (m) => !!m.message?.audioMessage,
      extractText: (m) => m.message?.conversation ?? null,
      transcribe: vi.fn(async () => ({ text: '', language: 'he', duration_ms: 1 })),
      llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' } as any)), translateTask: vi.fn() },
      resortos: {
        markRoomReady: vi.fn(async () => ({ ok: true as const })), reportMaintenance: vi.fn(), reportSupplies: vi.fn(),
        listUnits: vi.fn(async () => [{ id: 'k690', operational_status: 'READY', staff_occupancy: 'OCCUPIED' }]),
        listBookings: vi.fn(async () => bookings), setPaymentStatus: vi.fn(),
        collectCash: vi.fn(async () => ({ ok: true as const, guest_name: 'בדיקה טסט', amount_agorot: 50000 })),
      } as any,
      cleaners: () => [who], rooms: () => rooms, log: { info() {}, warn() {}, error() {} },
      cashInvoice: cashInvoice as any,
    };
    const p = createPipeline(deps);
    const say = (t: string) => p.handleInbound({ key: { remoteJid: `${who.phone}@s.whatsapp.net`, fromMe: false }, message: { conversation: t } } as any);
    return { sent, say, cashInvoice };
  }
  it('flag off → existing flow unchanged (payment-status question, no invoice)', async () => {
    const { sent, say, cashInvoice } = make();
    await say('START_D1'); await say('גביתי 500 מזומן'); await say('כן');
    expect(sent.at(-1)).toContain('נרשמה גביית מזומן');
    expect(sent.at(-1)).not.toContain('חשבונית');
    expect(cashInvoice.issue).not.toHaveBeenCalled();
  });
  it('allowlisted: asks, takes a typed email, issues once, then continues to payment status', async () => {
    process.env.HYP_CASH_INVOICE_ENABLED = 'true'; process.env.HYP_CASH_INVOICE_BOOKINGS = 'bk-test-1';
    const { sent, say, cashInvoice } = make();
    await say('START_D1'); await say('גביתי 500 מזומן'); await say('כן');
    expect(sent.at(-1)).toContain('להפיק חשבונית');
    expect(sent.at(-1)).toContain('אין מייל');
    await say('guest@example.com');
    expect(cashInvoice.issue).toHaveBeenCalledTimes(1);
    expect(cashInvoice.issue).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'bk-test-1', amountAgorot: 50000, email: 'guest@example.com' }));
    expect(sent.at(-1)).toContain('הופקה חשבונית');
  });
  it('allowlisted but manager says לא → no invoice', async () => {
    process.env.HYP_CASH_INVOICE_ENABLED = 'true'; process.env.HYP_CASH_INVOICE_BOOKINGS = 'bk-test-1';
    const { sent, say, cashInvoice } = make();
    await say('START_D1'); await say('גביתי 500 מזומן'); await say('כן'); await say('לא');
    expect(cashInvoice.issue).not.toHaveBeenCalled();
    expect(sent.at(-1)).toContain('לא הפקתי חשבונית');
  });
  it('a real (non-allowlisted) booking never gets the question even with the flag on', async () => {
    process.env.HYP_CASH_INVOICE_ENABLED = 'true'; process.env.HYP_CASH_INVOICE_BOOKINGS = '';
    const { sent, say, cashInvoice } = make();
    await say('START_D1'); await say('גביתי 500 מזומן'); await say('כן');
    expect(sent.at(-1)).not.toContain('חשבונית');
    expect(cashInvoice.issue).not.toHaveBeenCalled();
  });
});

describe('paid payment-link watcher (polling HYP LIST, mocked)', () => {
  const linkEntry = { roomId: 'k690', roomLabel: 'D1', bookingId: 'bk-test-1', guestName: 'בדיקה', phone: '0501112222', amountAgorot: 65000, description: 'D1 · הזמנה x', createdBy: 'מנהל', createdByJid: 'mgr@s.whatsapp.net' };
  it('parses only real lists', () => {
    expect(parseListResponse('CCode=902&Fild1=')).toBe(null);
    expect(parseListResponse('[{"payRequestId":"a","status":"3"}]')).toEqual([{ payRequestId: 'a', status: '3' }]);
  });
  it('paid link → invoice link saved once, manager notified, guest never', async () => {
    const links = tmp(); const paid = tmp();
    recordPayLink({ ...linkEntry, result: { ok: true, dryRun: false, payRequestId: 'pr-1', paymentURL: 'u' } }, links);
    recordPayLink({ ...linkEntry, bookingId: 'other', result: { ok: true, dryRun: true } }, links);
    const f = vi.fn(async (url: string) => ({ text: async () => url.includes('iCommand=LIST') ? '[{"payRequestId":"pr-1","status":"3","Amount":"650"}]' : 'Masof=M&TransId=9&action=PrintHesh&type=EZCOUNT&signature=s' }));
    const notify = vi.fn(async () => {});
    const finder = { find: vi.fn(async () => '9') };
    const out = await pollPaidLinks({ fetchImpl: f as any, env: env(), finder, notifyManager: notify, linksPath: links, paidPath: paid });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ bookingId: 'bk-test-1', status: 'paid_linked', transId: '9' });
    expect(out[0].invoiceUrl).toContain('signature=s');
    expect(notify).toHaveBeenCalledWith('mgr@s.whatsapp.net', expect.stringContaining('שולם'));
    expect(await pollPaidLinks({ fetchImpl: f as any, env: env(), finder, notifyManager: notify, linksPath: links, paidPath: paid })).toHaveLength(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it('unpaid or HYP error → nothing recorded', async () => {
    const links = tmp(); const paid = tmp();
    recordPayLink({ ...linkEntry, result: { ok: true, dryRun: false, payRequestId: 'pr-1', paymentURL: 'u' } }, links);
    const unpaid = vi.fn(async () => ({ text: async () => '[{"payRequestId":"pr-1","status":"2"}]' }));
    expect(await pollPaidLinks({ fetchImpl: unpaid as any, env: env(), linksPath: links, paidPath: paid })).toHaveLength(0);
    const err = vi.fn(async () => ({ text: async () => 'CCode=901' }));
    expect(await pollPaidLinks({ fetchImpl: err as any, env: env(), linksPath: links, paidPath: paid })).toHaveLength(0);
  });
  it('paid but no TransId finder → recorded once as paid_no_trans, notified once', async () => {
    const links = tmp(); const paid = tmp();
    recordPayLink({ ...linkEntry, result: { ok: true, dryRun: false, payRequestId: 'pr-1', paymentURL: 'u' } }, links);
    const f = vi.fn(async () => ({ text: async () => '[{"payRequestId":"pr-1","status":"3"}]' }));
    const notify = vi.fn(async () => {});
    expect((await pollPaidLinks({ fetchImpl: f as any, env: env(), notifyManager: notify, linksPath: links, paidPath: paid }))[0]).toMatchObject({ status: 'paid_no_trans' });
    expect(await pollPaidLinks({ fetchImpl: f as any, env: env(), notifyManager: notify, linksPath: links, paidPath: paid })).toHaveLength(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
