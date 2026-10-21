import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { WAMessage } from '@whiskeysockets/baileys';
import { extractInvoice, type OcrToken } from './extract.js';
import { planCrops, cleanSuggestion, runSuggestJob, type CropSpec } from './nameSuggest.js';
import { createInvoiceIntake } from './intake.js';
import { createPipeline, type PipelineDeps } from '../pipeline.js';
import t259 from './fixtures/clear-11218259.tokens.json' with { type: 'json' };
import t290 from './fixtures/clear-11218290.tokens.json' with { type: 'json' };

const RAN = '972506102416';
const tok259 = t259 as OcrToken[];
const tok290 = t290 as OcrToken[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('crop planning (Apple Vision boxes)', () => {
  const x = extractInvoice(tok259);
  const specs = planCrops(tok259, x.lines.map((l) => l.sku), x.skew);
  const by = new Map(specs.map((s) => [s.sku, s]));
  it('plans one crop per SKU, inside the page, ~96 px per line', () => {
    expect(specs).toHaveLength(13);
    for (const s of specs) {
      expect(s.y1).toBeGreaterThan(s.y0);
      expect(s.x1).toBeGreaterThan(s.x0);
      expect(s.outH).toBe(96 * s.lines);
    }
  });
  it('detects wrapped 2nd lines (GLASS→חלונות, ACID BATH→חדרי רחצה, שמפו→30ml) but not the footer under the last row', () => {
    expect(by.get('9-909182')!.lines).toBe(2);
    expect(by.get('9-909178')!.lines).toBe(2);
    expect(by.get('5-60717')!.lines).toBe(2);
    expect(by.get('7-1011')!.lines).toBe(1);
    expect(by.get('9-6264')!.lines).toBe(1);
  });
  it('stops each crop before the next row', () => {
    const order = [...specs].sort((a, b) => a.y0 - b.y0);
    for (let i = 1; i < order.length; i++) expect(order[i - 1].y1).toBeLessThanOrEqual(order[i].y0 + 0.012);
  });
});

describe('cleanSuggestion', () => {
  it('strips SKUs, prices, line numbers, barcodes and next-row bleed', () => {
    expect(cleanSuggestion('5-60718 בוטיק boutique גל רחצה בשפופרת 30ml')).toBe('בוטיק boutique גל רחצה בשפופרת 30ml');
    expect(cleanSuggestion('OASIS PRO GLASS 9-909182 8 לניקוי והברקה')).toBe('OASIS PRO GLASS לניקוי והברקה');
    expect(cleanSuggestion('7-1011 נייר טואלט 1/32 7290011097653 150.00 16.50')).toBe('נייר טואלט 1/32');
    expect(cleanSuggestion('9-6264 כפפות M 9-6263 כפפות L')).toBe('כפפות M');
    expect(cleanSuggestion('טופז 25 גרם סבון\nשורה שנייה', 1)).toBe('טופז 25 גרם סבון');
    expect(cleanSuggestion('12 345.00')).toBeNull();
    expect(cleanSuggestion('בוטיק שמפו ומרכך 17/60-5 30ml')).toBe('בוטיק שמפו ומרכך 30ml');
    expect(cleanSuggestion('תרכיז לניקוי OASIS ACID BATH /8 חדרי רחצה')).toBe('תרכיז לניקוי OASIS ACID BATH חדרי רחצה');
    expect(cleanSuggestion('מטלית 50/80 - כחול נייר 1/32')).toBe('מטלית 50/80 - כחול נייר 1/32');
  });
});

const spec = (sku: string): CropSpec => ({ id: sku, sku, x0: 0, y0: 0, x1: 1, y1: 1, skx: 0, k: 0, outH: 96, lines: 1 });
const crop = async (_p: string, s: CropSpec[]) => s.map((x) => ({ id: x.id, png: Buffer.from(x.id) }));

describe('runSuggestJob (sequential, guest priority, timeout, errors)', () => {
  it('transcribes sequentially', async () => {
    let active = 0, maxActive = 0;
    const o = await runSuggestJob('img', [spec('1-111'), spec('2-222')], {
      crop, lastGuestAt: () => 0, setCurrent: () => {},
      transcribe: async (png) => { active++; maxActive = Math.max(maxActive, active); await sleep(5); active--; return png.toString() === '1-111' ? 'שם אחד' : 'שם שתיים'; },
    });
    expect(maxActive).toBe(1);
    expect(o.suggestions.get('1-111')).toBe('שם אחד');
    expect(o.suggestions.get('2-222')).toBe('שם שתיים');
    expect(o.failed).toEqual([]);
  });
  it('guest message aborts the in-flight call, waits for quiet, then retries', async () => {
    let lastGuest = 0; let cur: AbortController | null = null; let calls = 0;
    const p = runSuggestJob('img', [spec('1-111')], {
      crop, lastGuestAt: () => lastGuest, setCurrent: (c) => { cur = c; }, quietMs: 40,
      transcribe: (png, signal) => new Promise((res, rej) => { calls++; const t = setTimeout(() => res('סבון ידיים'), 60); signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); }); }),
    });
    await sleep(15); lastGuest = Date.now(); cur!.abort();
    const o = await p;
    expect(o.guestPauses).toBe(1);
    expect(calls).toBe(2);
    expect(o.suggestions.get('1-111')).toBe('סבון ידיים');
  });
  it('total timeout → remaining lines fall back to no suggestion', async () => {
    const o = await runSuggestJob('img', [spec('1-111'), spec('2-222')], {
      crop, lastGuestAt: () => 0, setCurrent: () => {}, deadlineMs: 50,
      transcribe: (_png, signal) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('timeout')))),
    });
    expect(o.aborted).toBe('timeout');
    expect(o.suggestions.size).toBe(0);
    expect(o.failed.sort()).toEqual(['1-111', '2-222']);
  });
  it('gemma errors → graceful fallback, stops after 2 consecutive errors', async () => {
    const tr = vi.fn(async () => { throw new Error('ollama 500'); });
    const o = await runSuggestJob('img', [spec('1-111'), spec('2-222'), spec('3-333')], { crop, lastGuestAt: () => 0, setCurrent: () => {}, transcribe: tr });
    expect(tr).toHaveBeenCalledTimes(2);
    expect(o.aborted).toBe('errors');
    expect(o.failed).toHaveLength(3);
  });
});

function setup(sg: { transcribe: (png: Buffer, s: AbortSignal) => Promise<string>; inlineWaitMs?: number; deadlineMs?: number; quietMs?: number; enabled?: boolean }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'invs-'));
  const recordsPath = path.join(dir, 'records.jsonl'); writeFileSync(recordsPath, '');
  const img = path.join(dir, 'x.jpg'); writeFileSync(img, 'x');
  const calls: any[] = [];
  const fetchImpl = vi.fn(async (url: any, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : undefined; calls.push({ url: String(url), body });
    const ok = (d: any) => new Response(JSON.stringify(d), { status: 200 });
    if (String(url).includes('/api/inventory/items?')) return ok({ items: [] });   // every SKU is NEW
    if (String(url).endsWith('/api/inventory/items')) return ok(body.commit ? { ok: true, ids: body.items.map((_: any, i: number) => 900 + i), items: body.items.map((it: any, i: number) => ({ id: 900 + i, sku: it.sku, name: it.name })) } : { dry_run: true });
    return new Response('nf', { status: 404 });
  });
  const intake = createInvoiceIntake({
    enabled: true, allowlist: ['0506102416'], businessId: '22222222-2222-2222-2222-222222222222', bridgeUrl: 'http://b',
    recordsPath, imagesDir: path.join(dir, 'img'), draftsPath: path.join(dir, 'drafts.json'), ocrBin: '/x', tmpDir: dir, fetchImpl: fetchImpl as any,
    suggest: { enabled: sg.enabled ?? true, crop, transcribe: sg.transcribe, inlineWaitMs: sg.inlineWaitMs ?? 200, deadlineMs: sg.deadlineMs, quietMs: sg.quietMs ?? 30 },
  });
  const commits = () => calls.filter((c) => c.body?.commit === true);
  return { intake, img, commits };
}
const toks290new = tok290.map((t) => ({ ...t, text: t.text.split('11218290').join('11400001') }));
const toks259new = tok259.map((t) => ({ ...t, text: t.text.split('11218259').join('11400002') }));

describe('intake with suggested names', () => {
  it('fast job → suggestions inline in the draft, unconfirmed; confirm blocked; loose yes changes nothing', async () => {
    const s = setup({ transcribe: async () => '5-71517 טופז 25 גרם סבון' });
    const d = await s.intake.draftFromTokens(RAN, 'רני', toks290new, s.img);
    const r = await s.intake.withSuggestions(d, toks290new, s.img);
    expect(r.followUp).toBeUndefined();
    expect(r.details).toContain('שם מוצע: טופז 25 גרם סבון');
    expect(r.details).toContain('לא מאושר');
    expect(r.draft!.lines[0].name).toBeNull();
    expect(await s.intake.handleText(RAN, 'רני', 'מיקום הכל מחסן טוסקנה (C/27)')).toBeTruthy();
    expect(await s.intake.handleText(RAN, 'רני', 'ספק קליר כימיקלים בע"מ')).toBeTruthy();
    expect(await s.intake.handleText(RAN, 'רני', 'אשר חשבונית 11400001')).toContain('אישור שמות מוצעים');
    for (const y of ['כן', '1', 'ok', 'מאשר']) expect(await s.intake.handleText(RAN, 'רני', y)).toContain('אשר שמות');
    expect(s.intake.latestDraft(RAN)!.lines[0].name).toBeNull();
    expect(s.commits()).toHaveLength(0);
    expect(await s.intake.handleText(RAN, 'רני', 'אשר שם 1')).toContain('אושרו 1');
    expect(await s.intake.handleText(RAN, 'רני', 'אשר חשבונית 11400001')).toContain('נקלטה');
    expect(s.commits()[0].body.items[0].name).toBe('טופז 25 גרם סבון');
  });

  it('slow job → draft immediately with ⏳, then ONE follow-up; accept all / edit one', async () => {
    let n = 0;
    const s = setup({ inlineWaitMs: 10, transcribe: async () => { n++; await sleep(15); return `שם מוצע ${n}`; } });
    const d = await s.intake.draftFromTokens(RAN, 'רני', toks259new, s.img);
    const t = Date.now();
    const r = await s.intake.withSuggestions(d, toks259new, s.img);
    expect(Date.now() - t).toBeLessThan(150);
    expect(r.reply).toContain('⏳');
    expect(r.details).toContain('חסר שם');
    const fu = await r.followUp!;
    expect(fu).toContain('שמות מוצעים — חשבונית 11400002');
    expect(fu!.match(/שם מוצע:/g)).toHaveLength(13);
    expect(await s.intake.handleText(RAN, 'רני', 'שם 2 שמפו ומרכך בוטיק 30 מ"ל')).toContain('שמפו ומרכך בוטיק');
    expect(await s.intake.handleText(RAN, 'רני', 'אשר שמות')).toContain('אושרו 12');
    const dr = s.intake.latestDraft(RAN)!;
    expect(dr.lines[1].name).toBe('שמפו ומרכך בוטיק 30 מ"ל');
    expect(dr.lines.every((l) => l.name)).toBe(true);
  });

  it('draft cancelled before suggestions finish → no follow-up', async () => {
    const s = setup({ inlineWaitMs: 5, transcribe: async () => { await sleep(30); return 'סבון'; } });
    const d = await s.intake.draftFromTokens(RAN, 'רני', toks290new, s.img);
    const r = await s.intake.withSuggestions(d, toks290new, s.img);
    await s.intake.handleText(RAN, 'רני', 'בטל חשבונית 11400001');
    expect(await r.followUp!).toBeNull();
  });

  it('guest activity during the job aborts the call and timeout falls back to "חסר שם"', async () => {
    const s = setup({ inlineWaitMs: 5, deadlineMs: 120, quietMs: 1000, transcribe: (_p, sig) => new Promise((res, rej) => { const t = setTimeout(() => res('x y'), 80); sig.addEventListener('abort', () => { clearTimeout(t); rej(new Error('abort')); }); }) });
    const d = await s.intake.draftFromTokens(RAN, 'רני', toks290new, s.img);
    const r = await s.intake.withSuggestions(d, toks290new, s.img);
    await sleep(20); s.intake.noteGuestActivity();
    const fu = await r.followUp!;
    expect(fu).toContain('לא הצלחתי לקרוא');
    expect(s.intake.latestDraft(RAN)!.lines[0].suggested_name ?? null).toBeNull();
  });

  it('sub-flag off → no name job at all', async () => {
    const tr = vi.fn(async () => 'x');
    const s = setup({ enabled: false, transcribe: tr });
    expect(s.intake.suggestEnabled()).toBe(false);
  });
});

describe('pipeline: guest priority + follow-up delivery', () => {
  const cleaners = [{ phone: RAN, name: 'רני', language: 'he', role: 'MANAGER' }] as any[];
  function deps(intake: any) {
    const sent: Array<[string, string]> = [];
    const d: PipelineDeps = {
      send: vi.fn(async (j, t) => void sent.push([j, t])), isAudio: () => false, extractText: (m) => m.message?.conversation ?? null,
      transcribe: vi.fn() as any, llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn() } as any,
      resortos: { markRoomReady: vi.fn(), startCleaning: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn() } as any,
      cleaners: () => cleaners, rooms: () => [], log: { info() {}, warn() {}, error() {} },
      invoiceIntake: intake, downloadMedia: vi.fn(async () => ({ buffer: Buffer.from('x'), mimetype: 'image/jpeg' })),
    };
    return Object.assign(d, { sent });
  }
  it('sends the draft first, then the single follow-up', async () => {
    const intake = { isAllowed: () => true, handleText: async () => null, noteGuestActivity: vi.fn(),
      handleMedia: async () => ({ kind: 'draft', reply: 'טיוטה', followUp: sleep(10).then(() => 'הצעות') }) };
    const d = deps(intake);
    await createPipeline(d).handleInbound({ key: { remoteJid: `${RAN}@s.whatsapp.net`, fromMe: false, id: 'a' }, message: { imageMessage: { mimetype: 'image/jpeg' } } } as unknown as WAMessage);
    await sleep(30);
    expect(d.sent.map((x) => x[1])).toEqual(['טיוטה', 'הצעות']);
    expect(intake.noteGuestActivity).not.toHaveBeenCalled();
  });
  it('a guest message notifies the intake (guest priority)', async () => {
    const intake = { isAllowed: () => true, handleText: async () => null, handleMedia: vi.fn(), noteGuestActivity: vi.fn() };
    const d = deps(intake);
    await createPipeline(d).handleInbound({ key: { remoteJid: '972541111111@s.whatsapp.net', fromMe: false, id: 'g' }, message: { conversation: 'שלום, מה הקוד לחדר?' } } as unknown as WAMessage).catch(() => {});
    expect(intake.noteGuestActivity).toHaveBeenCalled();
  });
});
