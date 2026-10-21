import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInvoiceIntake } from './intake.js';
import { parseGrokInvoice, grokFullInvoice } from './grokFallback.js';

const BIZ = '22222222-2222-2222-2222-222222222222';
const RAN = '972506102416';
const XAI = 'https://api.x.ai/v1/chat/completions';

const handwritten = {
  is_invoice: true, handwritten: true, invoice_no: '4471', date: '20/10/2026', supplier: 'ירקות הגליל', supplier_vat: '512345678',
  before_vat: 300, vat: 54, total: 354,
  items: [
    { line_no: 1, sku: null, name: 'נייר טואלט', qty: 10, unit: 'חבילה', unit_price: 20, line_total: 200 },
    { line_no: 2, sku: null, name: 'סבון ידיים', qty: 4, unit: 'יח׳', unit_price: 25, line_total: 100 },
  ],
  corners: [[0.1, 0.1], [0.9, 0.12], [0.88, 0.95], [0.08, 0.93]],
};

function setup(grokReply: any, opts: { enhance?: any; grokStatus?: number; ocr?: any } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hw-'));
  const calls: Array<{ method: string; url: string; body: any; headers?: any }> = [];
  const fetchImpl = vi.fn(async (url: any, init: any) => {
    const u = String(url);
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init?.method, url: u, body, headers: init?.headers });
    const ok = (data: any) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u === XAI) {
      if (opts.grokStatus) return new Response('err', { status: opts.grokStatus });
      return ok({ model: 'grok-4.7', choices: [{ message: { content: JSON.stringify(grokReply) } }], usage: { total_tokens: 1 } });
    }
    if (u.includes('/api/inventory/items?')) return ok({ items: [{ id: 77, name: 'נייר טואלט', unit: 'חבילה', location: 'מחסן טוסקנה (C/27)', current_stock: 5, settings: {} }] });
    if (u.endsWith('/api/inventory/items/receive')) return ok(body.commit ? { ok: true, ids: body.lines.map((l: any) => l.id), skipped: [] } : { dry_run: true });
    if (u.endsWith('/api/inventory/items')) return ok(body.commit ? { ok: true, ids: [901], items: body.items.map((it: any) => ({ id: 901, name: it.name, sku: it.sku ?? null })), skipped: [] } : { dry_run: true });
    return new Response('nf', { status: 404 });
  });
  const enhance = opts.enhance ?? vi.fn(async (src: string, dst: string) => { copyFileSync(src, dst); return { ok: true, method: 'contour' }; });
  const intake = createInvoiceIntake({
    enabled: true, allowlist: ['0506102416'], businessId: BIZ, bridgeUrl: 'http://bridge.test',
    recordsPath: path.join(dir, 'rec.jsonl'), imagesDir: path.join(dir, 'img'), draftsPath: path.join(dir, 'drafts.json'),
    ocrBin: '/nonexistent', tmpDir: path.join(dir, 'tmp'),
    ocr: opts.ocr ?? (async () => [{ text: 'כתב יד', x: 0.1, y: 0.1, w: 0.2, h: 0.02 }]),
    fetchImpl: fetchImpl as any, grok: { apiKey: 'test-key', model: 'grok-4.7' }, enhance,
  });
  return { dir, intake, calls, enhance, fetchImpl };
}
const photo = { buffer: Buffer.from('fake-jpeg-bytes'), mimetype: 'image/jpeg' };

describe('parseGrokInvoice', () => {
  it('normalises fields, drops our own company id, keeps corners', () => {
    const g = parseGrokInvoice('```json\n' + JSON.stringify({ ...handwritten, supplier_vat: '517258844' }) + '\n```')!;
    expect(g.is_invoice).toBe(true);
    expect(g.supplier_vat).toBeNull();
    expect(g.date).toBe('20/10/26');
    expect(g.date_iso).toBe('2026-10-20');
    expect(g.items).toHaveLength(2);
    expect(g.corners).toHaveLength(4);
  });
  it('returns null on garbage, not-invoice stays false', () => {
    expect(parseGrokInvoice('lol')).toBeNull();
    expect(parseGrokInvoice('{"is_invoice":false,"items":[]}')!.is_invoice).toBe(false);
  });
  it('no key → no call', async () => {
    const f = vi.fn();
    expect(await grokFullInvoice({ apiKey: '', fetchImpl: f as any }, Buffer.from('x'), 'image/jpeg')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('handwritten invoice → Grok whole-image fallback (mocked xAI)', () => {
  it('builds a draft; matches existing item by name; nothing committed before confirm', async () => {
    const { intake, calls } = setup(handwritten);
    const r = await intake.handleMedia(RAN, 'רן', photo);
    expect(r.kind).toBe('draft');
    const xai = calls.filter((c) => c.url === XAI);
    expect(xai).toHaveLength(1);
    expect(xai[0].body.messages[0].content[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    const d = r.draft!;
    expect(d.source).toBe('grok_full');
    expect(d.invoice_no).toBe('4471');
    expect(d.lines[0].existing?.id).toBe(77);
    expect(d.lines[0].matched_by).toBe('name');
    expect(d.lines[1].existing).toBeNull();
    expect(d.lines[1].suggested_name).toBe('סבון ידיים');
    expect(d.lines[1].name).toBeNull(); // Grok name is a suggestion only
    expect(d.extraction.checks.all_ok).toBe(false); // handwritten always needs "למרות פער"
    expect(r.details).toContain('Grok');
    expect(calls.some((c) => c.body?.commit)).toBe(false);
  });

  it('full flow: names + location + confirm → saved through the existing bridge path with original + processed photo', async () => {
    const { intake, calls, dir } = setup(handwritten);
    await intake.handleMedia(RAN, 'רן', photo);
    expect(await intake.handleText(RAN, 'רן', 'אשר חשבונית 4471')).toContain('חסר');
    await intake.handleText(RAN, 'רן', 'אשר שמות');
    await intake.handleText(RAN, 'רן', 'מיקום 2 מחסן טוסקנה');
    const out = await intake.handleText(RAN, 'רן', 'אשר חשבונית 4471 למרות פער');
    expect(out).toContain('נקלטה');
    const commits = calls.filter((c) => c.body?.commit);
    expect(commits.map((c) => c.url.replace('http://bridge.test', ''))).toEqual(['/api/inventory/items/receive', '/api/inventory/items']);
    expect(commits[0].body.lines[0]).toMatchObject({ id: 77, qty: 10, sku: null });
    expect(commits[1].body.items[0].sku).toBeUndefined();
    expect(commits[1].body.items[0].name).toBe('סבון ידיים');
    const rec = JSON.parse(readFileSync(path.join(dir, 'rec.jsonl'), 'utf8').trim());
    expect(rec.extraction_source).toBe('grok_full');
    expect(existsSync(rec.image_paths.mac)).toBe(true);
    expect(existsSync(rec.image_paths.processed)).toBe(true);
    expect(rec.image_paths.processed).toMatch(/-processed\.jpg$/);
    expect(rec.lines[1].inventory_item_id).toBe(901);
  });

  it('local crop failed → re-crops with Grok corners', async () => {
    const enhance = vi.fn(async (src: string, dst: string, corners?: any) => { copyFileSync(src, dst); return { ok: true, method: corners ? 'corners' : 'none' }; });
    const { intake } = setup(handwritten, { enhance });
    await intake.handleMedia(RAN, 'רן', photo);
    expect(enhance).toHaveBeenCalledTimes(2);
    expect(enhance.mock.calls[1][2]).toEqual(handwritten.corners);
  });

  it('Grok says not an invoice → not_invoice (falls through to other flows)', async () => {
    const { intake } = setup({ is_invoice: false, items: [] });
    const r = await intake.handleMedia(RAN, 'רן', photo);
    expect(r.kind).toBe('not_invoice');
  });

  it('xAI error → friendly error, no draft, no writes', async () => {
    const { intake, calls } = setup(handwritten, { grokStatus: 500 });
    const r = await intake.handleMedia(RAN, 'רן', photo);
    expect(r.kind).toBe('error');
    expect(calls.some((c) => c.method === 'POST' && c.url.startsWith('http://bridge'))).toBe(false);
  });

  it('missing / short invoice number → generated 10-digit number usable in commands', async () => {
    const { intake } = setup({ ...handwritten, invoice_no: '12' });
    const r = await intake.handleMedia(RAN, 'רן', photo);
    expect(r.draft!.invoice_no).toMatch(/^\d{10}$/);
  });

  it('API key never appears in the draft or reply', async () => {
    const { intake, dir } = setup(handwritten);
    const r = await intake.handleMedia(RAN, 'רן', photo);
    expect(r.reply).not.toContain('test-key');
    expect(readFileSync(path.join(dir, 'drafts.json'), 'utf8')).not.toContain('test-key');
  });

  it('regression 21/10: local OCR binary missing/crashing → still falls back to Grok and drafts', async () => {
    const { intake, calls } = setup(handwritten, { ocr: async () => { throw new Error('spawn bin/apple-vision-ocr-boxes ENOENT'); } });
    const r = await intake.handleMedia(RAN, 'רן', photo);
    expect(r.kind).toBe('draft');
    expect(calls.filter((c) => c.url === XAI)).toHaveLength(1);
  });

  it('manager qty / price commands: derive unit price from line total, recompute checks, show draft', async () => {
    const one = { ...handwritten, invoice_no: '1511', before_vat: 500, vat: 90, total: 590, items: [{ line_no: 1, sku: null, name: 'צמחי זריעת כרם', qty: null, unit: null, unit_price: null, line_total: 500 }] };
    const { intake, calls } = setup(one);
    const r = await intake.handleMedia(RAN, 'רן', photo);
    expect(r.draft!.extraction.checks.lines_math_ok).toBe(false);
    const a = await intake.handleText(RAN, 'רן', 'כמות 1 20');
    expect(a).toContain('עודכן כמות בשורה 1');
    let d = intake.latestDraft(RAN)!;
    expect(d.lines[0]).toMatchObject({ qty: 20, unit_price: 25, line_total: 500, ok: true });
    expect(d.extraction.checks).toMatchObject({ lines_math_ok: true, lines_sum_ok: true, vat_ok: true, all_ok: false });
    await intake.handleText(RAN, 'רן', 'מחיר 1 30');
    d = intake.latestDraft(RAN)!;
    expect(d.lines[0]).toMatchObject({ qty: 20, unit_price: 30, line_total: 600 });
    expect(d.extraction.lines_sum).toBe(600);
    expect(d.extraction.checks.lines_sum_ok).toBe(false);
    expect(await intake.handleText(RAN, 'רן', 'כמות 9 3')).toContain('אין שורה 9');
    expect(calls.some((c) => c.body?.commit)).toBe(false);
  });
  it('price first with only line total → derives qty', async () => {
    const one = { ...handwritten, items: [{ line_no: 1, sku: null, name: 'x פריט', qty: null, unit: null, unit_price: null, line_total: 300 }] };
    const { intake } = setup(one);
    await intake.handleMedia(RAN, 'רן', photo);
    await intake.handleText(RAN, 'רן', 'מחיר 1 15.5');
    expect(intake.latestDraft(RAN)!.lines[0].qty).toBeCloseTo(19.355, 3);
  });
});

import { parseInvoiceCommand } from './intake.js';
describe('parseInvoiceCommand qty/price', () => {
  it('parses', () => {
    expect(parseInvoiceCommand('כמות 2 10')).toEqual({ cmd: 'qty', line: 2, value: 10 });
    expect(parseInvoiceCommand('מחיר 1 12.50 ₪')).toEqual({ cmd: 'price', line: 1, value: 12.5 });
    expect(parseInvoiceCommand('מחיר 1 0')).toBeNull();
    expect(parseInvoiceCommand('כמות נייר טואלט')).toBeNull();
  });
});

describe('short reply + simple "אשר" (Ran 2026-10-21 UX)', () => {
  const inv1511 = { ...handwritten, invoice_no: '1511', supplier: 'שרון שלוש', supplier_vat: '025721663', date: '19/10/2026', before_vat: 500, vat: 90, total: 590, paid: null,
    items: [{ line_no: 1, sku: null, name: 'צמחי זריעת כרם', qty: null, unit: null, unit_price: null, line_total: null }] };
  it('interim message is sent before the Grok read', async () => {
    const order: string[] = [];
    const { intake, fetchImpl } = setup(inv1511);
    const r = await intake.handleMedia(RAN, 'רן', photo, '', async (t) => { order.push(`progress:${t}`); });
    expect(order).toEqual(['progress:רגע, בודקת את החשבונית — תיכף חוזרת אליך']);
    expect(r.kind).toBe('draft');
  });
  it('short reply: supplier/date/total + proposal, no VAT id, no lines', async () => {
    const { intake } = setup(inv1511);
    const r = await intake.handleMedia(RAN, 'רן', photo);
    const lines = r.reply.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('ספק: שרון שלוש');
    expect(lines[1]).toBe('תאריך: 19/10/26');
    expect(lines[2]).toBe('סכום חשבונית: 590.00 ₪');
    expect(lines[3]).toContain('*אשר*');
    expect(r.reply).not.toContain('025721663');
    expect(r.reply).not.toContain('צמחי');
  });
  it('paid status line only when on the invoice', async () => {
    const { intake } = setup({ ...inv1511, paid: true });
    const r = await intake.handleMedia(RAN, 'רן', photo);
    expect(r.reply.split('\n')[3]).toBe('שולם');
    expect(r.reply.split('\n')).toHaveLength(5);
  });
  it('"אשר" with qty missing & no line total → 1 × invoice amount (before VAT), suggested location, commits, notes it', async () => {
    const { intake, calls } = setup(inv1511);
    await intake.handleMedia(RAN, 'רן', photo);
    const out = await intake.handleText(RAN, 'רן', 'אשר');
    expect(out).toContain('נקלטה');
    expect(out).toContain('נרשם 1 × 500.00');
    const create = calls.find((c) => c.body?.commit && c.url.endsWith('/api/inventory/items'))!;
    expect(create.body.items[0]).toMatchObject({ name: 'צמחי זריעת כרם', current_stock: 1, cost_per_unit: 500, location: 'מחסן טוסקנה (C/27)' });
  });
  it('"אשר" with totals gap → asks for "אשר למרות פער", no commit', async () => {
    const { intake, calls } = setup({ ...handwritten, total: 999 });
    await intake.handleMedia(RAN, 'רן', photo);
    expect(await intake.handleText(RAN, 'רן', 'אשר')).toContain('אשר למרות פער');
    expect(calls.some((c) => c.body?.commit)).toBe(false);
    expect(await intake.handleText(RAN, 'רן', 'אשר למרות פער')).toContain('נקלטה');
  });
  it('"פרטים" shows the full draft; "אשר" without a draft is not handled', async () => {
    const { intake } = setup(inv1511);
    expect(await intake.handleText(RAN, 'רן', 'אשר')).toBeNull();
    await intake.handleMedia(RAN, 'רן', photo);
    expect(await intake.handleText(RAN, 'רן', 'פרטים')).toContain('*שורות:*');
  });
});
