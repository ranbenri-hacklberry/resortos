import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { WAMessage } from '@whiskeysockets/baileys';
import { extractInvoice, classifyInvoice, parseMoney, type OcrToken } from './extract.js';
import { createInvoiceIntake, parseInvoiceCommand, LOOSE_YES } from './intake.js';
import { createPipeline, type PipelineDeps } from '../pipeline.js';
import t259 from './fixtures/clear-11218259.tokens.json' with { type: 'json' };
import t290 from './fixtures/clear-11218290.tokens.json' with { type: 'json' };
import expected from './fixtures/expected.json' with { type: 'json' };

const BIZ = '22222222-2222-2222-2222-222222222222';
const RAN = '972506102416';
const RAN_TEST = '972548317887';
const tok259 = t259 as OcrToken[];
const tok290 = t290 as OcrToken[];
const exp = expected as Record<string, any>;

/** Replace text in tokens (simulate a different invoice). */
const swap = (toks: OcrToken[], from: string, to: string) => toks.map((t) => ({ ...t, text: t.text.split(from).join(to) }));

function records() {
  return Object.values(exp).map((r: any) => JSON.stringify({ ...r, recorded_at: '2026-10-19T14:30:00Z' })).join('\n') + '\n';
}
function inventory() {
  const items: any[] = [];
  for (const r of Object.values(exp) as any[]) for (const l of r.lines) {
    items.push({ id: l.inventory_item_id, name: l.name, unit: 'יח׳', location: 'מחסן טוסקנה (C/27)', current_stock: l.qty, supplier: r.supplier, settings: { sku: l.sku, supplier_vat: r.supplier_vat, invoice_ref: r.invoice_no } });
  }
  return items;
}

function setup(opts: { enabled?: boolean; now?: () => number } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'inv-'));
  const recordsPath = path.join(dir, 'invoice-records.jsonl');
  writeFileSync(recordsPath, records());
  const calls: Array<{ method: string; url: string; body: any }> = [];
  const fetchImpl = vi.fn(async (url: any, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init?.method, url: String(url), body });
    const u = String(url);
    const ok = (data: any) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.includes('/api/inventory/items?')) return ok({ items: inventory() });
    if (u.endsWith('/api/inventory/items/receive')) {
      return ok(body.commit ? { ok: true, updated: body.lines.length, ids: body.lines.map((l: any) => l.id), skipped: [] } : { dry_run: true, would_update: body.lines.length });
    }
    if (u.endsWith('/api/inventory/items')) {
      return ok(body.commit ? { ok: true, created: body.items.length, ids: body.items.map((_: any, i: number) => 1000 + i), items: body.items.map((it: any, i: number) => ({ id: 1000 + i, name: it.name, sku: it.sku })), skipped: [] } : { dry_run: true, would_create: body.items.length });
    }
    return new Response('not found', { status: 404 });
  });
  const cfg = {
    enabled: opts.enabled ?? true, allowlist: ['0506102416', '0548317887'], businessId: BIZ, bridgeUrl: 'http://bridge.test',
    recordsPath, imagesDir: path.join(dir, 'img'), draftsPath: path.join(dir, 'drafts.json'), ocrBin: '/nonexistent', tmpDir: path.join(dir, 'tmp'),
    fetchImpl: fetchImpl as any, now: opts.now,
  };
  const intake = createInvoiceIntake(cfg);
  const commits = () => calls.filter((c) => c.method === 'POST' && c.body?.commit === true);
  return { dir, cfg, intake, calls, commits, recordsPath, fetchImpl };
}

describe('invoice extraction (Apple Vision tokens, digits only)', () => {
  it('parses dotted thousands', () => {
    expect(parseMoney('2.475.00')).toBe(2475);
    expect(parseMoney('5,634.75')).toBe(5634.75);
  });
  for (const [no, toks] of [['11218259', tok259], ['11218290', tok290]] as const) {
    it(`reads Clear invoice ${no}: header, totals and every line`, () => {
      const x = extractInvoice(toks);
      const e = exp[no];
      expect(x.invoice_no).toBe(no);
      expect(x.date).toBe('18/10/26');
      expect(x.date_iso).toBe('2026-10-18');
      expect(x.supplier_vat).toBe('511921058');
      expect(x.customer_no).toBe('346817');
      expect(x.total).toBe(e.total);
      expect(x.before_vat).toBe(e.before_vat);
      expect(x.vat).toBe(e.vat_18);
      expect(x.lines.map((l) => [l.sku, l.qty, l.unit_price, l.line_total])).toEqual(e.lines.map((l: any) => [l.sku, l.qty, l.unit_price, l.line_total]));
      expect(x.checks.all_ok).toBe(true);
      expect(classifyInvoice(x, toks).isInvoice).toBe(true);
    });
  }
  it('does not classify a non-invoice photo as an invoice', () => {
    const toks: OcrToken[] = [{ text: 'HAPPY BIRTHDAY', x: 0.2, y: 0.5, w: 0.3, h: 0.05 }, { text: '2026', x: 0.4, y: 0.4, w: 0.1, h: 0.05 }];
    const x = extractInvoice(toks);
    expect(classifyInvoice(x, toks).isInvoice).toBe(false);
  });
});

describe('invoice command parser', () => {
  it('parses commands strictly', () => {
    expect(parseInvoiceCommand('אשר חשבונית 11218290')).toEqual({ cmd: 'confirm', invoice: '11218290', override: false });
    expect(parseInvoiceCommand('אשר חשבונית 11218290 למרות פער')).toEqual({ cmd: 'confirm', invoice: '11218290', override: true });
    expect(parseInvoiceCommand('בטל חשבונית 11218290')).toEqual({ cmd: 'cancel', invoice: '11218290' });
    expect(parseInvoiceCommand('שם 3 ספריי זכוכית')).toEqual({ cmd: 'name', line: 3, value: 'ספריי זכוכית' });
    expect(parseInvoiceCommand('מיקום הכל מחסן טוסקנה')).toEqual({ cmd: 'location', line: 'all', value: 'מחסן טוסקנה' });
    for (const y of ['כן', '1', 'ok', 'מאשר', 'אשר', 'אשר חשבונית']) expect(parseInvoiceCommand(y)?.cmd === 'confirm').toBe(false);
    for (const y of ['כן', '1', 'ok', 'OK', 'מאשר']) expect(LOOSE_YES.test(y)).toBe(true);
  });
});

describe('invoice intake flow (mock bridge, no real DB)', () => {
  it('rejects re-sending 11218259 as a duplicate, without any write', async () => {
    const s = setup();
    const r = await s.intake.draftFromTokens(RAN, 'רני', tok259, null);
    expect(r.kind).toBe('duplicate');
    expect(r.reply).toContain('כבר נקלטה');
    expect(s.commits()).toHaveLength(0);
    expect(s.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('maps a new invoice with the same SKUs to +qty on existing items; loose yes never commits; exact confirm commits once', async () => {
    const s = setup();
    const toks = swap(tok259, '11218259', '11299999');
    const r = await s.intake.draftFromTokens(RAN, 'רני', toks, null);
    expect(r.kind).toBe('draft');
    expect(r.draft!.lines).toHaveLength(13);
    expect(r.draft!.lines.every((l) => l.existing)).toBe(true);
    expect(r.details).toContain('+150');
    expect(r.details).toContain(exp['11218259'].lines[12].name);
    expect(r.details).not.toContain('חסר שם');
    expect(r.details).toContain('אשר חשבונית 11299999');
    expect(s.commits()).toHaveLength(0);

    for (const y of ['כן', '1', 'ok', 'מאשר']) {
      const a = await s.intake.handleText(RAN, 'רני', y);
      expect(a).toContain('אשר חשבונית 11299999');
    }
    expect(s.calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    const ok = await s.intake.handleText(RAN, 'רני', 'אשר חשבונית 11299999');
    expect(ok).toContain('נקלטה');
    const commits = s.commits();
    expect(commits).toHaveLength(1);
    expect(commits[0].url).toContain('/api/inventory/items/receive');
    expect(commits[0].body.invoice_ref).toBe('11299999');
    expect(commits[0].body.confirmed_by).toContain('רני');
    expect(commits[0].body.lines.find((l: any) => l.sku === '7-1011').qty).toBe(150);
    const recs = readFileSync(s.recordsPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(recs.at(-1).invoice_no).toBe('11299999');
    expect(recs.at(-1).received_item_ids).toHaveLength(13);

    // second confirm / resend → duplicate, no extra writes
    expect(await s.intake.handleText(RAN, 'רני', 'אשר חשבונית 11299999')).toContain('כבר נקלטה');
    expect((await s.intake.draftFromTokens(RAN, 'רני', toks, null)).kind).toBe('duplicate');
    expect(s.commits()).toHaveLength(1);
  });

  it('new SKU needs a name from the manager before commit; creates it via POST /api/inventory/items', async () => {
    const s = setup();
    const toks = swap(swap(tok290, '11218290', '11300001'), '5-71517', '5-88888');
    const r = await s.intake.draftFromTokens(RAN_TEST, 'רני', toks, null);
    expect(r.kind).toBe('draft');
    expect(r.details).toContain('חסר שם');
    expect(r.details).toContain('5-88888');
    expect(r.details).toContain('חסר מיקום');
    expect(await s.intake.handleText(RAN_TEST, 'רני', 'אשר חשבונית 11300001')).toContain('חסר');
    expect(s.commits()).toHaveLength(0);
    expect(await s.intake.handleText(RAN_TEST, 'רני', 'שם 1 סבון ידיים 25 גרם')).toContain('סבון ידיים 25 גרם');
    expect(await s.intake.handleText(RAN_TEST, 'רני', 'מיקום הכל מחסן טוסקנה (C/27)')).toContain('מחסן טוסקנה');
    const ok = await s.intake.handleText(RAN_TEST, 'רני', 'אשר חשבונית 11300001');
    expect(ok).toContain('נוצרו 1');
    const c = s.commits();
    expect(c).toHaveLength(1);
    expect(c[0].url).toMatch(/\/api\/inventory\/items$/);
    expect(c[0].body.items[0]).toMatchObject({ name: 'סבון ידיים 25 גרם', category: 'ניקיון', sku: '5-88888', current_stock: 1, cost_per_unit: 160, supplier: 'קליר כימיקלים בע"מ', location: 'מחסן טוסקנה (C/27)' });
  });

  it('a gap in the checks requires "למרות פער"', async () => {
    const s = setup();
    const toks = swap(swap(tok290, '11218290', '11300002'), '189.00', '199.00');
    const r = await s.intake.draftFromTokens(RAN, 'רני', toks, null);
    expect(r.kind).toBe('draft');
    expect(r.draft!.extraction.checks.all_ok).toBe(false);
    expect(await s.intake.handleText(RAN, 'רני', 'אשר חשבונית 11300002')).toContain('למרות פער');
    expect(s.commits()).toHaveLength(0);
    expect(await s.intake.handleText(RAN, 'רני', 'אשר חשבונית 11300002 למרות פער')).toContain('נקלט למרות פער');
    expect(s.commits()).toHaveLength(1);
  });

  it('cancel drops the draft without writing', async () => {
    const s = setup();
    await s.intake.draftFromTokens(RAN, 'רני', swap(tok290, '11218290', '11300003'), null);
    expect(await s.intake.handleText(RAN, 'רני', 'בטל חשבונית 11300003')).toContain('בוטלה');
    expect(await s.intake.handleText(RAN, 'רני', 'אשר חשבונית 11300003')).toContain('אין טיוטה');
    expect(s.commits()).toHaveLength(0);
  });

  it('drafts persist across restarts and expire after 48h', async () => {
    let t = Date.parse('2026-10-19T15:00:00Z');
    const s = setup({ now: () => t });
    await s.intake.draftFromTokens(RAN, 'רני', swap(tok290, '11218290', '11300004'), null);
    const again = createInvoiceIntake({ ...s.cfg, now: () => t });
    expect(again.latestDraft(RAN)?.invoice_no).toBe('11300004');
    t += 49 * 3600 * 1000;
    expect(again.latestDraft(RAN)).toBeNull();
    expect(await again.handleText(RAN, 'רני', 'אשר חשבונית 11300004')).toContain('אין טיוטה');
    expect(s.commits()).toHaveLength(0);
  });

  it('flag off or non-allowlisted phone → feature inert', async () => {
    const off = setup({ enabled: false });
    expect(off.intake.isAllowed(RAN)).toBe(false);
    expect(await off.intake.handleText(RAN, 'רני', 'אשר חשבונית 11218290')).toBeNull();
    const on = setup();
    expect(on.intake.isAllowed('972501234567')).toBe(false);
    expect(on.intake.isAllowed('0506102416')).toBe(true);
    expect(on.intake.isAllowed(RAN_TEST)).toBe(true);
    expect(await on.intake.handleText('972501234567', 'x', 'אשר חשבונית 11218290')).toBeNull();
  });
});

describe('pipeline integration', () => {
  const cleaners = [
    { phone: RAN, name: 'רני', language: 'he', role: 'MANAGER' },
    { phone: '972509999001', name: 'עובד', language: 'he', role: 'HOUSEKEEPING' },
  ] as any[];
  const img = (from: string, caption?: string) => ({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false, id: 'I' + Math.random() }, message: { imageMessage: { mimetype: 'image/jpeg', ...(caption ? { caption } : {}) } } }) as unknown as WAMessage;
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 })); });
  afterEach(() => fetchSpy.mockRestore());

  function deps(intake: any) {
    const sent: Array<[string, string]> = [];
    const d: PipelineDeps = {
      send: vi.fn(async (j, t) => void sent.push([j, t])),
      isAudio: () => false,
      extractText: (m) => m.message?.conversation ?? null,
      transcribe: vi.fn() as any,
      llm: { extractIntent: vi.fn(), translateTask: vi.fn() } as any,
      resortos: { markRoomReady: vi.fn(), startCleaning: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn() } as any,
      cleaners: () => cleaners,
      rooms: () => [],
      log: { info() {}, warn() {}, error() {} },
      invoiceIntake: intake,
      downloadMedia: vi.fn(async () => ({ buffer: Buffer.from('x'), mimetype: 'image/jpeg' })),
    };
    return Object.assign(d, { sent });
  }

  it('allowlisted manager image → invoice intake reply', async () => {
    const intake = { isAllowed: vi.fn(() => true), handleText: vi.fn(async () => null), handleMedia: vi.fn(async () => ({ kind: 'draft', reply: 'טיוטה' })) };
    const d = deps(intake);
    const r = await createPipeline(d).handleInbound(img(RAN));
    expect(r.handled).toBe(true);
    expect(intake.handleMedia).toHaveBeenCalled();
    expect(d.sent[0][1]).toBe('טיוטה');
  });

  it('non-manager sender never triggers intake', async () => {
    const intake = { isAllowed: vi.fn(() => true), handleText: vi.fn(async () => 'x'), handleMedia: vi.fn(async () => ({ kind: 'draft', reply: 'טיוטה' })) };
    const d = deps(intake);
    await createPipeline(d).handleInbound(img('972509999001'));
    expect(intake.handleMedia).not.toHaveBeenCalled();
    expect(d.sent.some(([, t]) => t === 'טיוטה')).toBe(false);
  });

  it('flag off: caption-less manager image asks what it is — no fake 5000 ₪ check', async () => {
    const intake = { isAllowed: vi.fn(() => false), handleText: vi.fn(), handleMedia: vi.fn() };
    const d = deps(intake);
    const r = await createPipeline(d).handleInbound(img(RAN));
    expect(r.handled).toBe(true);
    expect(intake.handleMedia).not.toHaveBeenCalled();
    expect(d.sent[0][1]).toContain('מה זה');
    expect(fetchSpy.mock.calls.some((c: any[]) => String(c[0]).includes('/checks/capture'))).toBe(false);
  });

  it('not-an-invoice image with no caption also asks (no check capture)', async () => {
    const intake = { isAllowed: vi.fn(() => true), handleText: vi.fn(async () => null), handleMedia: vi.fn(async () => ({ kind: 'not_invoice', reply: '' })) };
    const d = deps(intake);
    await createPipeline(d).handleInbound(img(RAN));
    expect(d.sent[0][1]).toContain('מה זה');
    expect(fetchSpy.mock.calls.some((c: any[]) => String(c[0]).includes('/checks/capture'))).toBe(false);
  });
});
