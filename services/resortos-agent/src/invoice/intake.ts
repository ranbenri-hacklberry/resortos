/**
 * Chloe invoice intake (phase 2): manager sends a supplier invoice image/PDF on WhatsApp →
 * Apple Vision box-OCR → numeric extraction → Hebrew draft → manager names new SKUs →
 * explicit "אשר חשבונית <מספר>" → bridge (receive existing / create new) → invoice record.
 *
 * Safety: feature flag + phone allowlist, nothing is written before the exact confirm phrase,
 * duplicate invoice numbers are rejected, all DB writes go through the ResortOS bridge endpoints.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync, copyFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { extractInvoice, classifyInvoice, type OcrToken, type InvoiceExtraction } from './extract.js';
import { grokInvoiceLines, grokFullInvoice, type GrokCfg, type GrokInvoice } from './grokFallback.js';
import { normHe } from '../manager/inventoryQuestion.js';
import { planCrops, runSuggestJob, swiftCropper, ollamaTranscriber, type CropSpec, type OllamaVisionCfg } from './nameSuggest.js';

export interface InvoiceMedia { buffer: Buffer; mimetype: string; fileName?: string }

export interface InvoiceIntakeConfig {
  enabled: boolean;
  /** Phone numbers allowed to use the feature (any format; compared by last 9 digits). */
  allowlist: string[];
  businessId: string;
  bridgeUrl: string;
  recordsPath: string;
  imagesDir: string;
  draftsPath: string;
  ocrBin: string;
  tmpDir: string;
  ttlMs?: number;
  defaultCategory?: string;
  ocr?: (imagePath: string) => Promise<OcrToken[]>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  log?: { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void };
  /** Grok (xAI) fallback for unnamed new lines (suggestions only). */
  grok?: GrokCfg | null;
  /** Crop/deskew/enhance the photo (scripts/invoice_enhance.py). Original is always kept. */
  enhance?: ((src: string, dst: string, corners?: Array<[number, number]> | null) => Promise<{ ok: boolean; method: string }>) | null;
  enhanceScript?: string;
  pythonBin?: string;
  /** Suggested Hebrew names for new SKUs (CHLOE_INVOICE_NAME_SUGGEST). Never auto-confirmed. */
  suggest?: {
    enabled: boolean;
    cropBin?: string;
    ollama?: OllamaVisionCfg;
    crop?: (imagePath: string, specs: CropSpec[]) => Promise<Array<{ id: string; png: Buffer }>>;
    transcribe?: (png: Buffer, signal: AbortSignal) => Promise<string>;
    deadlineMs?: number;    // default 60 s total
    quietMs?: number;       // guest-quiet period before (re)trying, default 8 s
    inlineWaitMs?: number;  // include suggestions in the draft if ready within this, default 5 s
  };
}

export interface DraftLine {
  line_no: number;
  sku: string;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
  latin: string;
  ok: boolean;
  existing: { id: number; name: string; location: string | null; unit: string | null; current_stock: number | null } | null;
  name: string | null;
  /** gemma4 transcription of the description cell — a suggestion only, until the manager accepts it */
  suggested_name?: string | null;
  suggested_by?: 'grok' | null;
  /** How an existing item was matched: catalogue number or (handwritten) exact normalized name. */
  matched_by?: 'sku' | 'name';
  /** Service / non-stock line: filed as an expense, never sent to inventory. */
  expense?: boolean;
  location: string | null;
  unit: string;
}

export interface InvoiceDraft {
  key: string;
  phone: string;
  manager: string;
  invoice_no: string;
  created_at: number;
  expires_at: number;
  image_path: string | null;
  /** Cropped / deskewed / enhanced copy of the photo (original stays in image_path). */
  processed_image_path?: string | null;
  /** 'grok_full' = handwritten/manual invoice read entirely by Grok (whole image). */
  source?: 'local' | 'grok_full';
  /** Payment status if written on the invoice (Grok only). */
  paid?: boolean | null;
  kind?: 'inventory' | 'expense' | 'mixed';
  expense_category?: string | null;
  /** Suggested filing location for new lines (matched items → supplier history → most common). */
  suggested_location?: string | null;
  /** Notes about automatic fixes applied on simple approve (shown in the result). */
  auto_notes?: string[];
  supplier: string | null;
  supplier_vat: string | null;
  category: string;
  extraction: Omit<InvoiceExtraction, 'lines'>;
  lines: DraftLine[];
}

export interface MediaResult {
  kind: 'draft' | 'duplicate' | 'not_invoice' | 'unsure' | 'error';
  reply: string;
  draft?: InvoiceDraft;
  /** Resolves to ONE follow-up message (name suggestions) to send after `reply`, or null. */
  followUp?: Promise<string | null>;
  /** Full draft (lines, checks) — what "פרטים" shows. The chat reply itself is the short form. */
  details?: string;
}

const tail = (p: string) => {
  const d = String(p || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (d.startsWith('972')) return d.slice(3).slice(-9);
  if (d.startsWith('0')) return d.slice(1).slice(-9);
  return d.slice(-9);
};
const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtQty = (n: number | null) => (n === null ? '?' : Number.isInteger(n) ? String(n) : String(n));

export const LOOSE_YES = /^(?:כן|כן\s*כן|1|ok|okay|אוקי|אוקיי|מאשר|מאשרת|אישור|בסדר|מאושר|yes|👍)[.!]?$/i;

export function parseInvoiceCommand(text: string):
  | { cmd: 'name'; line: number; value: string }
  | { cmd: 'location'; line: number | 'all'; value: string }
  | { cmd: 'unit'; line: number; value: string }
  | { cmd: 'qty'; line: number; value: number }
  | { cmd: 'price'; line: number; value: number }
  | { cmd: 'supplier'; value: string }
  | { cmd: 'cancel'; invoice: string }
  | { cmd: 'confirm'; invoice: string; override: boolean }
  | { cmd: 'accept_names' }
  | { cmd: 'approve_latest'; override: boolean }
  | { cmd: 'details' }
  | { cmd: 'to_inventory' }
  | { cmd: 'to_expense'; value: string | null }
  | { cmd: 'accept_name'; line: number }
  | null {
  const t = text.trim().replace(/\s+/g, ' ');
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^אשר חשבונית (\d{4,12})( למרות פער)?$/))) return { cmd: 'confirm', invoice: m[1], override: Boolean(m[2]) };
  if ((m = t.match(/^בטל חשבונית (\d{4,12})$/))) return { cmd: 'cancel', invoice: m[1] };
  if ((m = t.match(/^אשר( למרות פער)?[.!]?$/))) return { cmd: 'approve_latest', override: Boolean(m[1]) };
  if (/^(?:פרטים|פירוט)$/.test(t)) return { cmd: 'details' };
  if (/^מלאי$/.test(t)) return { cmd: 'to_inventory' };
  if ((m = t.match(/^הוצאה(?: (.{2,40}))?$/))) return { cmd: 'to_expense', value: m[1]?.trim() || null };
  if (/^אשר שמות$/.test(t)) return { cmd: 'accept_names' };
  if ((m = t.match(/^אשר שם (\d{1,3})$/))) return { cmd: 'accept_name', line: Number(m[1]) };
  if ((m = t.match(/^שם (\d{1,3}) (.{2,120})$/))) return { cmd: 'name', line: Number(m[1]), value: m[2].trim() };
  if ((m = t.match(/^מיקום (\d{1,3}|הכל) (.{2,120})$/))) return { cmd: 'location', line: m[1] === 'הכל' ? 'all' : Number(m[1]), value: m[2].trim() };
  if ((m = t.match(/^יחידה (\d{1,3}) (.{1,40})$/))) return { cmd: 'unit', line: Number(m[1]), value: m[2].trim() };
  if ((m = t.match(/^(כמות|מחיר) (\d{1,3}) (\d{1,7}(?:[.,]\d{1,3})?)\s*(?:₪|ש"ח|ש״ח)?$/))) {
    const v = Number(m[3].replace(',', '.'));
    if (Number.isFinite(v) && v > 0) return { cmd: m[1] === 'כמות' ? 'qty' : 'price', line: Number(m[2]), value: v };
  }
  if ((m = t.match(/^ספק (.{2,120})$/))) return { cmd: 'supplier', value: m[1].trim() };
  return null;
}

function runFile(bin: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });
}

export function createInvoiceIntake(cfg: InvoiceIntakeConfig) {
  const now = cfg.now || (() => Date.now());
  const ttl = cfg.ttlMs ?? 48 * 3600 * 1000;
  const f = cfg.fetchImpl || fetch;
  const log = cfg.log || { info() {}, warn() {}, error() {} };
  const allow = new Set(cfg.allowlist.map(tail).filter((t) => t.length >= 7));
  const ocr = cfg.ocr || (async (p: string) => JSON.parse(await runFile(cfg.ocrBin, [p], 60_000)) as OcrToken[]);
  // guest priority for the background name job
  let lastGuestAt = 0;
  let currentJob: AbortController | null = null;
  function noteGuestActivity() {
    lastGuestAt = now();
    if (currentJob) { try { currentJob.abort(new Error('guest priority')); } catch { /* ignore */ } }
  }
  const sg = cfg.suggest;
  const suggestOn = Boolean(sg?.enabled && (sg.crop || sg.cropBin) && (sg.transcribe || sg.ollama));
  const cropFn = sg?.crop || (sg?.cropBin ? swiftCropper(sg.cropBin, cfg.tmpDir) : null);
  const transcribeFn = sg?.transcribe || (sg?.ollama ? ollamaTranscriber(sg.ollama, f) : null);

  // ---------- persistence ----------
  function loadDrafts(): Record<string, InvoiceDraft> {
    try {
      if (!existsSync(cfg.draftsPath)) return {};
      const all = JSON.parse(readFileSync(cfg.draftsPath, 'utf8')) as Record<string, InvoiceDraft>;
      const t = now();
      let changed = false;
      for (const [k, v] of Object.entries(all)) if (!v || v.expires_at <= t) { delete all[k]; changed = true; }
      if (changed) saveDrafts(all);
      return all;
    } catch (e) { log.error({ err: String(e) }, 'invoice drafts unreadable'); return {}; }
  }
  function saveDrafts(all: Record<string, InvoiceDraft>) {
    mkdirSync(path.dirname(cfg.draftsPath), { recursive: true });
    const tmp = `${cfg.draftsPath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2), 'utf8');
    renameSync(tmp, cfg.draftsPath);
  }
  function latestDraft(phone: string): InvoiceDraft | null {
    const p = tail(phone);
    const list = Object.values(loadDrafts()).filter((d) => d.phone === p).sort((a, b) => b.created_at - a.created_at);
    return list[0] || null;
  }
  function draftFor(phone: string, invoice: string): InvoiceDraft | null {
    return loadDrafts()[`${tail(phone)}:${invoice}`] || null;
  }
  function putDraft(d: InvoiceDraft) { const all = loadDrafts(); all[d.key] = d; saveDrafts(all); }
  function dropDraft(key: string) { const all = loadDrafts(); delete all[key]; saveDrafts(all); }

  function records(): any[] {
    if (!existsSync(cfg.recordsPath)) return [];
    return readFileSync(cfg.recordsPath, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }
  function findRecord(invoiceNo: string, vat: string | null) {
    return records().find((r) => String(r.invoice_no) === String(invoiceNo) && (!vat || !r.supplier_vat || String(r.supplier_vat) === String(vat))) || null;
  }
  function supplierByVat(vat: string | null): string | null {
    if (!vat) return null;
    const r = [...records()].reverse().find((x) => String(x.supplier_vat) === vat && x.supplier);
    return r?.supplier || null;
  }

  // ---------- bridge ----------
  async function bridge(method: 'GET' | 'POST', p: string, body?: unknown): Promise<any> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const r = await f(`${cfg.bridgeUrl}${p}`, {
        method, signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-resortos-agent': 'true' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const txt = await r.text();
      let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
      if (!r.ok) throw new Error(`${p} ${r.status}: ${data?.error || txt}`);
      return data;
    } finally { clearTimeout(timer); }
  }
  async function allItems(): Promise<{ bySku: Map<string, any>; all: any[] }> {
    const data = await bridge('GET', `/api/inventory/items?business_id=${cfg.businessId}`);
    const all = (data?.items || []).slice().sort((a: any, b: any) => a.id - b.id);
    const bySku = new Map<string, any>();
    for (const it of all) { const sku = it?.settings?.sku; if (sku && !bySku.has(String(sku))) bySku.set(String(sku), it); }
    return { bySku, all };
  }
  async function activeItemsBySku(): Promise<Map<string, any>> {
    const data = await bridge('GET', `/api/inventory/items?business_id=${cfg.businessId}`);
    const out = new Map<string, any>();
    for (const it of (data?.items || []).sort((a: any, b: any) => a.id - b.id)) {
      const sku = it?.settings?.sku; if (sku && !out.has(String(sku))) out.set(String(sku), it);
    }
    return out;
  }

  // ---------- formatting ----------
  const isExp = (l: DraftLine) => Boolean(l.expense);
  const isNew = (l: DraftLine) => !l.existing && !l.expense;
  const isInv = (l: DraftLine) => !l.expense;
  function missing(d: InvoiceDraft) {
    return {
      names: d.lines.filter((l) => isNew(l) && !l.name && !l.suggested_name).map((l) => l.line_no),
      unconfirmed: d.lines.filter((l) => isNew(l) && !l.name && l.suggested_name).map((l) => l.line_no),
      locations: d.lines.filter((l) => isNew(l) && !l.location).map((l) => l.line_no),
      supplier: d.lines.some(isNew) && !d.supplier,
    };
  }
  /** Where new lines would be filed: shared location of matched items → this supplier's history → most common in records. */
  function suggestLocation(d: InvoiceDraft): string | null {
    const locs = [...new Set(d.lines.filter((l) => l.existing && (l.existing.location || l.location)).map((l) => (l.existing!.location || l.location) as string))];
    if (locs.length === 1) return locs[0];
    const count = new Map<string, number>();
    const recs = records();
    const bySupplier = recs.filter((r) => (d.supplier_vat && String(r.supplier_vat) === d.supplier_vat) || (d.supplier && r.supplier && String(r.supplier).trim() === d.supplier.trim()));
    for (const r of (bySupplier.length ? bySupplier : recs)) for (const l of r.lines || []) if (l.location) count.set(l.location, (count.get(l.location) || 0) + 1);
    const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  }
  /** Short default reply (Ran 2026-10-21): supplier, date, total, paid (if on invoice), one proposal line. */
  function formatShort(d: InvoiceDraft, title?: string): string {
    const x = d.extraction;
    if (d.suggested_location === undefined) { d.suggested_location = suggestLocation(d); putDraft(d); }
    const out: string[] = [];
    if (title) out.push(title);
    out.push(`ספק: ${d.supplier || 'לא מזוהה'}`);
    out.push(`תאריך: ${x.date || 'לא מזוהה'}`);
    out.push(`סכום חשבונית: ${money(x.total ?? x.before_vat ?? x.lines_sum)} ₪`);
    if (d.paid === true) out.push('שולם');
    else if (d.paid === false) out.push('לא שולם');
    const hasNew = d.lines.some(isNew);
    const nInv = d.lines.filter(isInv).length, nExp = d.lines.filter(isExp).length;
    const loc = hasNew ? (d.suggested_location ? ` ל${d.suggested_location}` : '') : '';
    const gap = totalsOk(d) ? '' : ' (יש פער בסכומים — *אשר למרות פער*)';
    const needSup = hasNew && !d.supplier ? ' · קודם: ספק <שם>' : '';
    const cat = d.expense_category || 'אחר';
    if (nExp && !nInv) out.push(`לתייק כהוצאה: ${cat}? *אשר*${gap} · לשינוי: הוצאה <קטגוריה> / מלאי · *פרטים*`);
    else if (nExp) out.push(`להכניס ${nInv} פריטים${loc} ו־${nExp} שורות כהוצאה: ${cat}? *אשר*${gap}${needSup} · לשינוי: מלאי / הוצאה <קטגוריה> / מיקום · *פרטים*`);
    else out.push(`להכניס${loc}? *אשר*${gap}${needSup} · לשינוי: ספק / כמות / מחיר / מיקום <שורה> <ערך> / הוצאה <קטגוריה> · *פרטים*`);
    return out.join('\n');
  }
  function totalsOk(d: InvoiceDraft): boolean {
    const c = d.extraction.checks;
    return d.source === 'grok_full' ? (c.lines_sum_ok && c.vat_ok) : c.all_ok;
  }
  function formatDraft(d: InvoiceDraft, title = '🧾 *טיוטת קליטת חשבונית*'): string {
    const x = d.extraction;
    const c = x.checks;
    const mark = (b: boolean) => (b ? '✅' : '❌');
    const out: string[] = [title];
    out.push(`מס׳ חשבונית: *${d.invoice_no}*`);
    out.push(`ספק: ${d.supplier || '❓ לא מזוהה'}${d.supplier_vat ? ` (ח.פ ${d.supplier_vat})` : ''}`);
    if (x.date) out.push(`תאריך: ${x.date}`);
    out.push(`סכום שורות: ${money(x.lines_sum)} | לפני מע״מ: ${money(x.before_vat)} | מע״מ: ${money(x.vat)} | סה״כ: *${money(x.total)}* ₪`);
    out.push(`בדיקות: ${mark(c.lines_math_ok)} כמות×מחיר  ${mark(c.lines_sum_ok)} שורות=סיכום  ${mark(c.vat_ok)} לפני מע״מ+מע״מ=סה״כ  ${mark(c.rounding_ok)} עיגול`);
    if (c.vat_ok && x.before_vat !== null && Math.abs(x.lines_sum - x.before_vat) >= 0.01 && c.rounding_ok) out.push(`(הפרש עיגול ${money(Math.abs(x.lines_sum - x.before_vat))} ₪)`);
    for (const p of c.problems) out.push(`⚠️ ${p}`);
    out.push('');
    out.push('*שורות:*');
    for (const l of d.lines) {
      const price = `${money(l.unit_price)} ₪${l.ok ? '' : ' ⚠️'}`;
      if (l.expense) {
        out.push(`${l.line_no}. 💼 הוצאה (${d.expense_category || 'אחר'}): ${l.name || l.suggested_name || '—'} · ${money(l.line_total)} ₪`);
      } else if (l.existing) {
        out.push(`${l.line_no}. ${l.existing.name} *+${fmtQty(l.qty)}* (${l.sku ? `מק״ט ${l.sku}, ` : ''}${price}${l.matched_by === 'name' ? ', זוהה לפי שם' : ''}) · ${l.existing.location || l.location || 'מיקום?'}`);
      } else {
        const nm = l.name ? `*${l.name}*` : l.suggested_name ? `💡 שם מוצע${l.suggested_by === 'grok' ? ' (Grok)' : ''}: ${l.suggested_name} _(לא מאושר)_` : '*חסר שם*';
        out.push(`${l.line_no}. 🆕 ${nm} ${l.sku ? ` · מק״ט ${l.sku}` : ''} · כמות ${fmtQty(l.qty)} ${l.unit} · ${price}${l.latin ? ` · "${l.latin}"` : ''} · ${l.location ? l.location : '*חסר מיקום*'}`);
      }
    }
    const m = missing(d);
    out.push('');
    if (m.supplier) out.push(`❓ ספק לא מזוהה — לכתוב: ספק <שם הספק>`);
    if (m.unconfirmed.length) out.push(`💡 שמות מוצעים (לא מאושרים) בשורות ${m.unconfirmed.join(', ')} — לאשר הכל: אשר שמות | שורה: אשר שם <שורה> | לתקן: שם <שורה> <טקסט>`);
    if (m.names.length) out.push(`✏️ חסרים שמות לשורות ${m.names.join(', ')} — לכתוב: שם <שורה> <שם הפריט>`);
    if (m.locations.length) out.push(`📍 חסר מיקום לשורות ${m.locations.join(', ')} — לכתוב: מיקום <שורה|הכל> <מחסן>`);
    out.push(`לקליטה יש לכתוב בדיוק: *אשר חשבונית ${d.invoice_no}*${c.all_ok ? '' : ` (יש פער בבדיקות — נדרש: אשר חשבונית ${d.invoice_no} למרות פער)`}`);
    out.push(`לביטול: בטל חשבונית ${d.invoice_no}`);
    out.push('שום דבר לא נשמר במלאי עד אישור מפורש. הטיוטה נשמרת 48 שעות.');
    return out.join('\n');
  }

  // ---------- media ----------
  async function toImage(media: InvoiceMedia): Promise<{ path: string; ext: string }> {
    mkdirSync(cfg.tmpDir, { recursive: true });
    const id = randomUUID();
    const isPdf = /pdf/i.test(media.mimetype) || /\.pdf$/i.test(media.fileName || '');
    const ext = isPdf ? 'pdf' : /png/i.test(media.mimetype) ? 'png' : 'jpg';
    const src = path.join(cfg.tmpDir, `invoice-${id}.${ext}`);
    writeFileSync(src, media.buffer);
    if (!isPdf) return { path: src, ext };
    const png = path.join(cfg.tmpDir, `invoice-${id}.png`);
    await runFile('/usr/bin/sips', ['-s', 'format', 'png', src, '--out', png], 60_000);
    return { path: png, ext: 'pdf' };
  }

  const grokCfg = cfg.grok && cfg.grok.apiKey ? cfg.grok : null;
  /** Fill still-unnamed NEW lines from Grok. Suggestions only (manager must confirm). Never touches matched lines. */
  async function grokFill(d: InvoiceDraft, imagePath: string | null): Promise<boolean> {
    if (!grokCfg || !imagePath) return false;
    const targets = d.lines.filter((l) => isNew(l) && !l.name && !l.suggested_name);
    if (!targets.length) return false;
    try {
      const img = readFileSync(imagePath);
      const r = await grokInvoiceLines({ ...grokCfg, fetchImpl: grokCfg.fetchImpl || f }, img, /\.png$/i.test(imagePath) ? 'image/png' : 'image/jpeg',
        targets.map((l) => ({ line_no: l.line_no, sku: l.sku, latin: l.latin, qty: l.qty, unit_price: l.unit_price })));
      if (!r) return false;
      let filled = 0;
      for (const l of targets) {
        const g = r.lines.get(l.sku);
        if (!g) continue;
        l.suggested_name = g.name;
        l.suggested_by = 'grok';
        filled++;
        if (l.unit === 'יח׳' && g.unit) l.unit = g.unit;
        if (l.qty == null && g.qty != null) l.qty = g.qty;
        if (l.unit_price == null && g.unit_price != null) l.unit_price = g.unit_price;
      }
      log.info({ invoice: d.invoice_no, asked: targets.length, filled, model: r.model, ms: r.ms, usage: r.usage }, 'invoice grok fallback');
      return filled > 0;
    } catch (e: any) {
      log.warn({ invoice: d.invoice_no, err: String(e?.name === 'AbortError' ? 'timeout' : e) }, 'invoice grok fallback failed');
      return false;
    }
  }

  const enhanceFn = cfg.enhance === null ? null : cfg.enhance || (cfg.enhanceScript
    ? async (src: string, dst: string, corners?: Array<[number, number]> | null) => {
      const out = await runFile(cfg.pythonBin || 'python3', [cfg.enhanceScript!, src, dst, corners ? JSON.stringify(corners) : ''], 60_000);
      const j = JSON.parse(out.trim().split('\n').pop() || '{}');
      return { ok: Boolean(j.ok), method: String(j.method || 'none') };
    } : null);
  async function processImage(src: string, corners?: Array<[number, number]> | null): Promise<{ path: string; method: string } | null> {
    if (!enhanceFn) return null;
    const dst = src.replace(/\.[a-z0-9]+$/i, '') + '-processed.jpg';
    try {
      const r = await enhanceFn(src, dst, corners);
      return r.ok && existsSync(dst) ? { path: dst, method: r.method } : null;
    } catch (e) { log.warn({ err: String(e) }, 'invoice image enhance failed'); return null; }
  }

  function matchItem(g: { sku: string | null; name: string }, bySku: Map<string, any>, all: any[]): { it: any; by: 'sku' | 'name' } | null {
    if (g.sku && bySku.has(g.sku)) return { it: bySku.get(g.sku), by: 'sku' };
    const n = normHe(g.name);
    if (n.length < 2) return null;
    const hits = all.filter((it) => normHe(it?.name || '') === n || (Array.isArray(it?.settings?.supplier_product_name) ? it.settings.supplier_product_name : [it?.settings?.supplier_product_name]).some((x: any) => x && normHe(String(x)) === n));
    const ids = new Set(hits.map((h) => h.id));
    return ids.size === 1 ? { it: hits[0], by: 'name' } : null; // ambiguous → treat as new, manager decides
  }

  function grokChecks(g: GrokInvoice, linesSum: number): InvoiceExtraction['checks'] {
    const problems: string[] = ['חשבונית ידנית — נקראה ע״י Grok, יש לבדוק כל שורה מול הצילום'];
    const lines_math_ok = g.items.every((l) => l.qty != null && l.unit_price != null && (l.line_total == null || Math.abs(l.qty * l.unit_price - l.line_total) < 0.02));
    if (!lines_math_ok) problems.push('יש שורות בלי כמות/מחיר או שכמות×מחיר≠סה״כ שורה');
    const ref = g.before_vat ?? g.total;
    const lines_sum_ok = ref != null && Math.abs(linesSum - ref) <= 1;
    if (!lines_sum_ok) problems.push(`סכום השורות (${money(linesSum)}) לא תואם לסיכום בחשבונית (${money(ref)})`);
    const vat_ok = g.before_vat != null && g.vat != null && g.total != null ? Math.abs(g.before_vat + g.vat - g.total) <= 0.05 : g.vat == null && g.total != null && lines_sum_ok;
    if (!vat_ok) problems.push('לא ניתן לאמת לפני מע״מ + מע״מ = סה״כ');
    const rounding_ok = true;
    // Handwritten is never auto-"all_ok": confirmation always requires "למרות פער" after the manager checked the photo.
    return { lines_math_ok, lines_sum_ok, vat_ok, rounding_ok, all_ok: false, problems };
  }

  /** Whole-image Grok read for invoices the local path could not anchor (no SKU rows). Draft only — nothing is saved before "אשר חשבונית". */
  async function grokDraft(phone: string, managerName: string, origPath: string, processed: { path: string; method: string } | null): Promise<MediaResult | null> {
    if (!grokCfg) return null;
    const sendPath = processed?.path || origPath;
    let r: Awaited<ReturnType<typeof grokFullInvoice>>;
    try {
      r = await grokFullInvoice({ ...grokCfg, fetchImpl: grokCfg.fetchImpl || f }, readFileSync(sendPath), /\.png$/i.test(sendPath) ? 'image/png' : 'image/jpeg');
    } catch (e: any) {
      log.warn({ err: String(e?.name === 'AbortError' ? 'timeout' : e) }, 'invoice grok full read failed');
      return { kind: 'error', reply: '❌ ניסיתי לקרוא את החשבונית (כתב יד) עם Grok ולא הצלחתי. אפשר לשלוח צילום חד יותר.' };
    }
    const g = r?.invoice;
    log.info({ model: r?.model, ms: r?.ms, usage: r?.usage, is_invoice: g?.is_invoice, items: g?.items.length ?? 0 }, 'invoice grok full read');
    if (!g || !g.is_invoice || !g.items.length) return null;
    // Local edge detection failed but Grok saw the paper → crop with Grok's corners.
    if ((!processed || processed.method === 'none') && g.corners) processed = (await processImage(origPath, g.corners)) || processed;
    const t = now();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dt = new Date(t);
    const invoice_no = g.invoice_no && g.invoice_no.length >= 4 ? g.invoice_no
      : `${String(dt.getFullYear()).slice(2)}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}${pad(dt.getHours())}${pad(dt.getMinutes())}`;
    const dup = findRecord(invoice_no, g.supplier_vat);
    if (dup) return { kind: 'duplicate', reply: `⛔ חשבונית ${invoice_no}${dup.supplier ? ` של ${dup.supplier}` : ''} כבר נקלטה (${String(dup.recorded_at || dup.date || '').slice(0, 16)}). לא קלטתי שוב — המלאי לא השתנה.` };
    let bySku: Map<string, any>; let all: any[];
    try { const res = await allItems(); bySku = res.bySku; all = res.all; } catch (e) {
      log.error({ err: String(e) }, 'invoice intake: inventory lookup failed');
      return { kind: 'error', reply: '❌ לא הצלחתי לבדוק את המלאי מול ResortOS כרגע. אפשר לנסות שוב בעוד דקה.' };
    }
    const supplier = supplierByVat(g.supplier_vat) || g.supplier;
    const category = supplier && /קליר/.test(supplier) ? 'ניקיון' : (cfg.defaultCategory || 'כללי');
    const lines: DraftLine[] = g.items.map((gl) => {
      const exp = gl.kind === 'expense';
      const m = exp ? null : matchItem(gl, bySku, all);
      const it = m?.it;
      const line_total = gl.line_total ?? (gl.qty != null && gl.unit_price != null ? Math.round(gl.qty * gl.unit_price * 100) / 100 : null);
      return {
        line_no: gl.line_no, sku: gl.sku || '', qty: gl.qty, unit_price: gl.unit_price, line_total, latin: '',
        ok: gl.qty != null && gl.unit_price != null && (gl.line_total == null || Math.abs(gl.qty * gl.unit_price - gl.line_total) < 0.02),
        existing: it ? { id: it.id, name: it.name, location: it.location ?? null, unit: it.unit ?? null, current_stock: it.current_stock ?? null } : null,
        matched_by: m?.by,
        expense: exp || undefined,
        name: it ? it.name : null,
        suggested_name: it ? null : gl.name,
        suggested_by: it ? null : 'grok',
        location: it ? it.location ?? null : null,
        unit: it?.unit || gl.unit || 'יח׳',
      };
    });
    const locs = [...new Set(lines.filter((l) => l.existing && l.location).map((l) => l.location as string))];
    if (locs.length === 1) for (const l of lines) if (!l.existing && !l.location) l.location = locs[0];
    // Fallback suggestion when nothing matched and no supplier history: the most common location in inventory.
    const invCount = new Map<string, number>();
    for (const it of all) if (it?.location) invCount.set(it.location, (invCount.get(it.location) || 0) + 1);
    const invLoc = [...invCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const lines_sum = Math.round(lines.reduce((a, l) => a + (l.line_total || 0), 0) * 100) / 100;
    const d: InvoiceDraft = {
      key: `${tail(phone)}:${invoice_no}`, phone: tail(phone), manager: managerName, invoice_no,
      created_at: t, expires_at: t + ttl, image_path: origPath, processed_image_path: processed?.path || null, source: 'grok_full', paid: g.paid, kind: g.kind, expense_category: g.kind === 'inventory' ? null : (g.expense_category || 'אחר'),
      supplier, supplier_vat: g.supplier_vat, category,
      extraction: {
        invoice_no, date: g.date, date_iso: g.date_iso, supplier_vat: g.supplier_vat, customer_no: null,
        lines_sum, subtotal: g.before_vat, before_vat: g.before_vat, vat: g.vat, total: g.total,
        checks: grokChecks(g, lines_sum), skew: 0,
      },
      lines,
    };
    d.suggested_location = suggestLocation(d) ?? invLoc;
    putDraft(d);
    log.info({ invoice: invoice_no, lines: lines.length, new: lines.filter(isNew).length, byName: lines.filter((l) => l.matched_by === 'name').length, generatedNo: invoice_no !== g.invoice_no }, 'invoice grok draft created');
    return { kind: 'draft', reply: formatShort(d), details: formatDraft(d), draft: d };
  }

  async function handleMedia(phone: string, managerName: string, media: InvoiceMedia, caption = '', onProgress?: (text: string) => Promise<void>): Promise<MediaResult> {
    if (!isAllowed(phone)) return { kind: 'not_invoice', reply: '' };
    let img: { path: string; ext: string };
    let tokens: OcrToken[];
    try {
      img = await toImage(media);
    } catch (e) {
      log.error({ err: String(e) }, 'invoice file conversion failed');
      return { kind: 'error', reply: '❌ לא הצלחתי לקרוא את הקובץ (OCR). אפשר לשלוח שוב צילום ברור / PDF.' };
    }
    try {
      tokens = await ocr(img.path);
    } catch (e) {
      // Local OCR unavailable/broken (e.g. missing binary, 21/10): don't give up — Grok can still read the whole image.
      log.error({ err: String(e) }, 'invoice OCR failed');
      if (!grokCfg) return { kind: 'error', reply: '❌ לא הצלחתי לקרוא את הקובץ (OCR). אפשר לשלוח שוב צילום ברור / PDF.' };
      tokens = [];
    }
    const isPdf = img.ext === 'pdf';
    const processed = isPdf ? null : await processImage(img.path);
    let res = await draftFromTokens(phone, managerName, tokens, img.path, caption);
    if (res.kind === 'draft' && res.draft && processed) { res.draft.processed_image_path = processed.path; putDraft(res.draft); }
    // Handwritten / manual invoice: the local path found no SKU rows at all → read the whole image with Grok.
    if ((res.kind === 'not_invoice' || res.kind === 'unsure') && grokCfg && extractInvoice(tokens).lines.length === 0) {
      if (onProgress) { try { await onProgress('רגע, בודקת את החשבונית — תיכף חוזרת אליך'); } catch (e) { log.warn({ err: String(e) }, 'invoice progress send failed'); } }
      const g = await grokDraft(phone, managerName, img.path, processed);
      if (g) return g;
    }
    if (res.kind === 'draft' && res.draft && suggestOn) return withSuggestions(res, tokens, img.path);
    if (res.kind === 'draft' && res.draft && grokCfg && await grokFill(res.draft, img.path)) {
      putDraft(res.draft);
      return { ...res, reply: formatShort(res.draft), details: formatDraft(res.draft) };
    }
    return res;
  }

  function suggestionsText(d: InvoiceDraft): string | null {
    const sug = d.lines.filter((l) => isNew(l) && !l.name && l.suggested_name);
    const miss = d.lines.filter((l) => isNew(l) && !l.name && !l.suggested_name);
    if (!sug.length && !miss.length) return null;
    const out = [`💡 *שמות מוצעים — חשבונית ${d.invoice_no}* (קריאה אוטומטית, לא מאושר)`];
    for (const l of sug) out.push(`${l.line_no}. מק״ט ${l.sku} — שם מוצע${l.suggested_by === 'grok' ? ' (Grok)' : ''}: ${l.suggested_name}`);
    for (const l of miss) out.push(`${l.line_no}. מק״ט ${l.sku} — לא הצלחתי לקרוא, *חסר שם*`);
    out.push('');
    if (sug.length) out.push('לאשר את כל השמות המוצעים: *אשר שמות*', 'לאשר שורה אחת: אשר שם <שורה>');
    out.push('לתקן / להזין: שם <שורה> <טקסט>');
    return out.join('\n');
  }

  /** Background name job: draft goes out at once; suggestions inline if ready within ~5 s, else ONE follow-up. */
  async function withSuggestions(res: MediaResult, tokens: OcrToken[], imagePath: string): Promise<MediaResult> {
    const d0 = res.draft!;
    const targets = d0.lines.filter((l) => isNew(l) && !l.name).map((l) => l.sku);
    if (!targets.length) return res;
    if (!cropFn || !transcribeFn) {
      if (grokCfg && await grokFill(d0, imagePath)) {
        putDraft(d0);
        return { ...res, draft: d0, reply: formatShort(d0), details: formatDraft(d0) };
      }
      return res;
    }
    const specs = planCrops(tokens, targets, d0.extraction.skew);
    const t0 = now();
    const job = runSuggestJob(imagePath, specs, {
      crop: cropFn, transcribe: transcribeFn, lastGuestAt: () => lastGuestAt,
      setCurrent: (c) => { currentJob = c; }, now,
      deadlineMs: sg?.deadlineMs, quietMs: sg?.quietMs, log,
    }).then(async (o) => {
      const d = loadDrafts()[d0.key];
      if (!d) return { o, d: null as InvoiceDraft | null };
      for (const l of d.lines) if (isNew(l) && !l.name && o.suggestions.has(l.sku)) l.suggested_name = o.suggestions.get(l.sku)!;
      await grokFill(d, imagePath); // only lines the local model could not read
      putDraft(d);
      log.info({ invoice: d.invoice_no, suggested: o.suggestions.size, failed: o.failed.length, aborted: o.aborted, guestPauses: o.guestPauses, ms: now() - t0 }, 'invoice name suggestions');
      return { o, d };
    }).catch((e) => { log.error({ err: String(e) }, 'invoice name job crashed'); return { o: null, d: null }; });
    const inlineWait = sg?.inlineWaitMs ?? 5_000;
    const first = await Promise.race([job.then(() => 'done' as const), new Promise<'wait'>((r) => setTimeout(() => r('wait'), inlineWait))]);
    if (first === 'done') {
      const { d } = await job;
      if (d) return { ...res, draft: d, reply: formatShort(d), details: formatDraft(d) };
      return res;
    }
    const followUp = job.then(({ d }) => {
      if (!d) return null;
      const cur = loadDrafts()[d.key];       // cancelled / confirmed meanwhile → nothing to send
      return cur ? suggestionsText(cur) : null;
    });
    return { ...res, reply: `${res.reply}\n\n⏳ קוראת שמות מוצעים לשורות החדשות — אשלח בהודעה נפרדת (עד דקה).`, followUp };
  }

  async function draftFromTokens(phone: string, managerName: string, tokens: OcrToken[], imagePath: string | null, caption = ''): Promise<MediaResult> {
    const x = extractInvoice(tokens);
    const cls = classifyInvoice(x, tokens);
    if (!cls.isInvoice) {
      if (x.lines.length || x.supplier_vat || x.invoice_no) {
        return { kind: 'unsure', reply: '🤔 לא בטוחה שזו חשבונית ספק. מה התמונה? (חשבונית / שיק / אחר). לשיק יש לצרף כיתוב עם סכום ותאריך.' };
      }
      return { kind: 'not_invoice', reply: '' };
    }
    if (!x.invoice_no) return { kind: 'unsure', reply: '🧾 נראה כמו חשבונית אבל לא זיהיתי מספר חשבונית. אפשר לשלוח צילום חד יותר של החלק העליון?' };
    const dup = findRecord(x.invoice_no, x.supplier_vat);
    if (dup) {
      return { kind: 'duplicate', reply: `⛔ חשבונית ${x.invoice_no}${dup.supplier ? ` של ${dup.supplier}` : ''} כבר נקלטה (${String(dup.recorded_at || dup.date || '').slice(0, 16)}). לא קלטתי שוב — המלאי לא השתנה.` };
    }
    let bySku: Map<string, any>;
    try { bySku = await activeItemsBySku(); } catch (e) {
      log.error({ err: String(e) }, 'invoice intake: inventory lookup failed');
      return { kind: 'error', reply: '❌ לא הצלחתי לבדוק את המלאי מול ResortOS כרגע. אפשר לנסות שוב בעוד דקה.' };
    }
    const supplier = supplierByVat(x.supplier_vat) || (x.supplier_vat ? [...bySku.values()].find((i) => String(i?.settings?.supplier_vat) === x.supplier_vat)?.supplier || null : null);
    const category = supplier && /קליר/.test(supplier) ? 'ניקיון' : (cfg.defaultCategory || 'כללי');
    const lines: DraftLine[] = x.lines.map((l) => {
      const it = bySku.get(l.sku);
      return {
        ...l,
        existing: it ? { id: it.id, name: it.name, location: it.location ?? null, unit: it.unit ?? null, current_stock: it.current_stock ?? null } : null,
        name: it ? it.name : null,
        location: it ? it.location ?? null : null,
        unit: it?.unit || 'יח׳',
      };
    });
    // Default location for new lines: the location shared by this invoice's existing items (if unique).
    const locs = [...new Set(lines.filter((l) => l.existing && l.location).map((l) => l.location as string))];
    if (locs.length === 1) for (const l of lines) if (!l.existing && !l.location) l.location = locs[0];
    const t = now();
    const { lines: _omit, ...ext } = x;
    const d: InvoiceDraft = {
      key: `${tail(phone)}:${x.invoice_no}`, phone: tail(phone), manager: managerName, invoice_no: x.invoice_no,
      created_at: t, expires_at: t + ttl, image_path: imagePath, supplier, supplier_vat: x.supplier_vat, category,
      extraction: ext, lines,
    };
    putDraft(d);
    log.info({ invoice: x.invoice_no, lines: lines.length, new: lines.filter(isNew).length, checks: x.checks.all_ok, caption: Boolean(caption) }, 'invoice draft created');
    return { kind: 'draft', reply: formatShort(d), details: formatDraft(d), draft: d };
  }

  // ---------- commands ----------
  async function handleText(phone: string, managerName: string, text: string, opts: { otherPending?: boolean } = {}): Promise<string | null> {
    if (!isAllowed(phone)) return null;
    const cmd = parseInvoiceCommand(text);
    const latest = latestDraft(phone);
    if (!cmd) {
      if (latest && !opts.otherPending && LOOSE_YES.test(text.trim())) {
        const pend = missing(latest).unconfirmed;
        return `כדי לקלוט את חשבונית ${latest.invoice_no} צריך לכתוב בדיוק: *אשר חשבונית ${latest.invoice_no}*` +
          (pend.length ? `\nקודם יש לאשר שמות מוצעים (שורות ${pend.join(', ')}): *אשר שמות* או אשר שם <שורה>` : '') +
          `\n(תשובה כמו "כן" לא קולטת חשבוניות ולא מאשרת שמות.)`;
      }
      return null;
    }
    if (cmd.cmd === 'cancel') {
      const d = draftFor(phone, cmd.invoice);
      if (!d) return `אין טיוטה פתוחה לחשבונית ${cmd.invoice}.`;
      dropDraft(d.key);
      return `🗑️ טיוטת חשבונית ${cmd.invoice} בוטלה. שום דבר לא נקלט במלאי.`;
    }
    if (cmd.cmd === 'confirm') return confirm(phone, managerName, cmd.invoice, cmd.override);
    if (!latest) return null; // not an invoice context — let other flows handle it
    if (cmd.cmd === 'details') return formatDraft(latest);
    if (cmd.cmd === 'to_inventory' || cmd.cmd === 'to_expense') {
      const d = latest;
      if (cmd.cmd === 'to_inventory') { for (const l of d.lines) l.expense = undefined; d.kind = 'inventory'; }
      else { for (const l of d.lines) { l.expense = true; l.existing = null; l.matched_by = undefined; } d.kind = 'expense'; d.expense_category = cmd.value || d.expense_category || 'אחר'; }
      putDraft(d);
      return formatShort(d, cmd.cmd === 'to_inventory' ? '✏️ עודכן: קליטה למלאי' : `✏️ עודכן: הוצאה — ${d.expense_category}`);
    }
    if (cmd.cmd === 'approve_latest') return approveSimple(phone, managerName, latest, cmd.override);
    const d = latest;
    if (cmd.cmd === 'accept_names' || cmd.cmd === 'accept_name') {
      const pool = d.lines.filter((l) => isNew(l) && !l.name && l.suggested_name && (cmd.cmd === 'accept_names' || l.line_no === cmd.line));
      if (!pool.length) {
        if (cmd.cmd === 'accept_name') return `אין שם מוצע לא-מאושר בשורה ${cmd.line}. אפשר להזין: שם ${cmd.line} <טקסט>`;
        return 'אין שמות מוצעים שממתינים לאישור.';
      }
      for (const l of pool) l.name = l.suggested_name!;
      putDraft(d);
      return formatDraft(d, `✅ *אושרו ${pool.length} שמות — טיוטת חשבונית*`);
    }
    if (cmd.cmd === 'qty' || cmd.cmd === 'price') {
      const l = d.lines.find((x) => x.line_no === cmd.line);
      if (!l) return `אין שורה ${cmd.line} בטיוטת חשבונית ${d.invoice_no} (יש ${d.lines.length} שורות).`;
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const r3 = (n: number) => Math.round(n * 1000) / 1000;
      if (cmd.cmd === 'qty') {
        l.qty = cmd.value;
        if (l.unit_price != null) l.line_total = r2(l.qty * l.unit_price);
        else if (l.line_total != null) l.unit_price = r2(l.line_total / l.qty);
      } else {
        l.unit_price = cmd.value;
        if (l.qty != null) l.line_total = r2(l.qty * l.unit_price);
        else if (l.line_total != null) l.qty = r3(l.line_total / l.unit_price);
      }
      recheck(d);
      putDraft(d);
      return formatShort(d, `✏️ עודכן ${cmd.cmd === 'qty' ? 'כמות' : 'מחיר'} בשורה ${l.line_no}`);
    }
    if (cmd.cmd === 'supplier') { d.supplier = cmd.value; if (/קליר/.test(cmd.value)) d.category = 'ניקיון'; }
    else {
      const targets = cmd.cmd === 'location' && cmd.line === 'all' ? d.lines : d.lines.filter((l) => l.line_no === cmd.line);
      if (!targets.length) return `אין שורה ${String((cmd as any).line)} בטיוטת חשבונית ${d.invoice_no} (יש ${d.lines.length} שורות).`;
      for (const l of targets) {
        if (cmd.cmd === 'name') {
          if (l.existing) return `שורה ${l.line_no} היא פריט קיים במלאי ("${l.existing.name}") — השם נלקח מהמלאי ולא משתנה כאן.`;
          l.name = cmd.value;
        } else if (cmd.cmd === 'location') { if (!l.existing) l.location = cmd.value; }
        else if (cmd.cmd === 'unit') { if (l.existing) return `שורה ${l.line_no} היא פריט קיים — היחידה נלקחת מהמלאי.`; l.unit = cmd.value; }
      }
      if (cmd.cmd === 'location' && targets.every((l) => l.existing)) return `השורות שנבחרו הן פריטים קיימים — המיקום שלהם נשאר כמו במלאי. (מיקום משנה רק פריטים חדשים)`;
    }
    putDraft(d);
    return formatDraft(d, '✏️ *עודכן — טיוטת חשבונית*');
  }

  /** Re-run line math / line-sum / VAT checks after a manual qty / price edit. Handwritten drafts never become all_ok. */
  function recheck(d: InvoiceDraft) {
    const x = d.extraction;
    for (const l of d.lines) l.ok = l.qty != null && l.unit_price != null && l.line_total != null && Math.abs(l.qty * l.unit_price - l.line_total) < 0.02;
    x.lines_sum = Math.round(d.lines.reduce((a, l) => a + (l.line_total || 0), 0) * 100) / 100;
    const ref = x.before_vat ?? x.subtotal ?? x.total;
    const lines_math_ok = d.lines.every((l) => l.ok);
    const lines_sum_ok = ref != null && Math.abs(x.lines_sum - ref) <= 1;
    const vat_ok = x.before_vat != null && x.vat != null && x.total != null ? Math.abs(x.before_vat + x.vat - x.total) <= 0.05 : x.checks.vat_ok;
    const rounding_ok = x.before_vat == null || Math.abs(x.lines_sum - x.before_vat) <= 1;
    const problems: string[] = [];
    if (d.source === 'grok_full') problems.push('חשבונית ידנית — נקראה ע״י Grok, יש לבדוק כל שורה מול הצילום');
    if (!lines_math_ok) problems.push('יש שורות בלי כמות/מחיר או שכמות×מחיר≠סה״כ שורה');
    if (!lines_sum_ok) problems.push(`סכום השורות (${money(x.lines_sum)}) לא תואם לסיכום בחשבונית (${money(ref)})`);
    if (!vat_ok) problems.push('לא ניתן לאמת לפני מע״מ + מע״מ = סה״כ');
    x.checks = { lines_math_ok, lines_sum_ok, vat_ok, rounding_ok, all_ok: d.source !== 'grok_full' && lines_math_ok && lines_sum_ok && vat_ok && rounding_ok, problems };
  }

  /** "אשר": fill what can be filled automatically, then go through the normal confirm/commit path. */
  async function approveSimple(phone: string, managerName: string, d: InvoiceDraft, override: boolean): Promise<string> {
    const notes: string[] = [];
    const r2 = (n: number) => Math.round(n * 100) / 100;
    for (const l of d.lines) {
      if (isExp(l)) { if (!l.name && l.suggested_name) l.name = l.suggested_name; continue; }
      if (isNew(l) && !l.name && l.suggested_name) l.name = l.suggested_name;
      if (isNew(l) && !l.location) l.location = d.suggested_location ?? suggestLocation(d);
      if (!l.qty || l.qty <= 0) {
        if (l.line_total == null && d.lines.length === 1) l.line_total = d.extraction.before_vat ?? d.extraction.total;
        if (l.unit_price && l.line_total) l.qty = Math.round((l.line_total / l.unit_price) * 1000) / 1000;
        else if (l.line_total) { l.qty = 1; l.unit_price = l.line_total; notes.push(`שורה ${l.line_no}: לא הופיעה כמות — נרשם 1 × ${money(l.line_total)} ₪`); }
      } else if (l.unit_price == null && l.line_total != null) l.unit_price = r2(l.line_total / l.qty);
      if (l.line_total == null && l.qty && l.unit_price != null) l.line_total = r2(l.qty * l.unit_price);
    }
    recheck(d);
    d.auto_notes = notes;
    putDraft(d);
    const m = missing(d);
    if (m.supplier) return `חסר שם ספק — לכתוב: ספק <שם>, ואז *אשר*.`;
    if (m.names.length) return `חסר שם לשורות ${m.names.join(', ')} — לכתוב: שם <שורה> <טקסט>, ואז *אשר*.`;
    if (m.locations.length) return `לאן להכניס? לכתוב: מיקום הכל <מחסן>, ואז *אשר*.`;
    if (d.lines.some((l) => isInv(l) && (!l.qty || l.qty <= 0))) return `חסרה כמות בשורות ${d.lines.filter((l) => isInv(l) && (!l.qty || l.qty <= 0)).map((l) => l.line_no).join(', ')} — לכתוב: כמות <שורה> <מספר>, ואז *אשר*.`;
    if (!totalsOk(d) && !override) return `⚠️ הסכומים בחשבונית לא מסתדרים (*פרטים* לפירוט). אם בדקת וזה תקין: *אשר למרות פער*`;
    const res = await confirm(phone, managerName, d.invoice_no, true);
    return notes.length && res.startsWith('✅') ? `${res}\n${notes.map((n) => `ℹ️ ${n}`).join('\n')}` : res;
  }

  async function confirm(phone: string, managerName: string, invoice: string, override: boolean): Promise<string> {
    const d = draftFor(phone, invoice);
    if (!d) {
      const rec = findRecord(invoice, null);
      return rec ? `⛔ חשבונית ${invoice} כבר נקלטה בעבר. לא קלטתי שוב.` : `אין טיוטה פתוחה לחשבונית ${invoice} (אולי פגה אחרי 48 שעות). אפשר לשלוח שוב את התמונה.`;
    }
    if (findRecord(d.invoice_no, d.supplier_vat)) { dropDraft(d.key); return `⛔ חשבונית ${invoice} כבר נקלטה. הטיוטה נסגרה בלי שינוי.`; }
    const m = missing(d);
    if (m.names.length || m.unconfirmed.length || m.locations.length || m.supplier) {
      const parts = [];
      if (m.unconfirmed.length) parts.push(`אישור שמות מוצעים בשורות ${m.unconfirmed.join(', ')} (אשר שמות / אשר שם <שורה> / שם <שורה> <טקסט>)`);
      if (m.supplier) parts.push('שם ספק (ספק <שם>)');
      if (m.names.length) parts.push(`שמות לשורות ${m.names.join(', ')}`);
      if (m.locations.length) parts.push(`מיקום לשורות ${m.locations.join(', ')}`);
      return `⏸️ עוד לא אפשר לקלוט את ${invoice} — חסר: ${parts.join('; ')}.`;
    }
    if (!d.extraction.checks.all_ok && !override) {
      return `⏸️ בבדיקות החשבונית יש פער:\n${d.extraction.checks.problems.map((p) => `• ${p}`).join('\n')}\nאם נבדק וזה תקין, יש לכתוב: *אשר חשבונית ${invoice} למרות פער*`;
    }
    if (d.lines.some((l) => isInv(l) && (!l.qty || l.qty <= 0))) return `⏸️ יש שורה בלי כמות תקינה — לא ניתן לקלוט. אפשר לבטל ולשלוח צילום חד יותר.`;
    const confirmedBy = `${managerName || 'מנהל'} (WhatsApp ***${d.phone.slice(-4)}, ${new Date(now()).toISOString()})`;
    const invoiceRef = d.invoice_no;
    // Persist image under the invoices folder (before writes so the record can point at it).
    let imageSaved: string | null = null;
    try {
      if (d.image_path && existsSync(d.image_path)) {
        mkdirSync(cfg.imagesDir, { recursive: true });
        imageSaved = path.join(cfg.imagesDir, `invoice-${d.supplier_vat || 'supplier'}-${d.invoice_no}${path.extname(d.image_path) || '.jpg'}`);
        copyFileSync(d.image_path, imageSaved);
      }
    } catch (e) { log.warn({ err: String(e) }, 'invoice image save failed'); }
    let processedSaved: string | null = null;
    try {
      if (d.processed_image_path && existsSync(d.processed_image_path)) {
        mkdirSync(cfg.imagesDir, { recursive: true });
        processedSaved = path.join(cfg.imagesDir, `invoice-${d.supplier_vat || 'supplier'}-${d.invoice_no}-processed.jpg`);
        copyFileSync(d.processed_image_path, processedSaved);
      }
    } catch (e) { log.warn({ err: String(e) }, 'invoice processed image save failed'); }
    const receiveLines = d.lines.filter((l) => l.existing && !l.expense).map((l) => ({ id: l.existing!.id, qty: l.qty, sku: l.sku || null, unit_price: l.unit_price, invoice_line: l.line_no }));
    const newItems = d.lines.filter(isNew).map((l) => ({
      name: l.name, category: d.category, unit: l.unit, current_stock: l.qty, cost_per_unit: l.unit_price,
      supplier: d.supplier, location: l.location, supplier_product_name: [l.latin || l.name],
      sku: l.sku || undefined, invoice_line: l.line_no, line_total: l.line_total, invoice_date: d.extraction.date_iso,
      supplier_vat: d.supplier_vat, invoice_image: processedSaved || imageSaved,
    }));
    const base = { business_id: cfg.businessId, confirmed_by: confirmedBy, invoice_ref: invoiceRef };
    let received: any = null, created: any = null;
    try {
      // Dry-runs first: any validation error stops before a single write.
      if (receiveLines.length) await bridge('POST', '/api/inventory/items/receive', { ...base, lines: receiveLines });
      if (newItems.length) await bridge('POST', '/api/inventory/items', { ...base, items: newItems });
      if (receiveLines.length) received = await bridge('POST', '/api/inventory/items/receive', { ...base, lines: receiveLines, commit: true });
      if (received && received.ok === false) throw new Error(`receive partial: ${JSON.stringify(received.failed)}`);
      if (newItems.length) created = await bridge('POST', '/api/inventory/items', { ...base, items: newItems, commit: true });
    } catch (e) {
      log.error({ err: String(e), invoice: invoiceRef }, 'invoice commit failed');
      return `❌ הקליטה של ${invoiceRef} נכשלה מול ResortOS: ${String((e as Error).message).slice(0, 200)}\nהטיוטה נשמרה. אפשר לנסות שוב "אשר חשבונית ${invoiceRef}" (פעולה חוזרת לא תכפיל כמויות).`;
    }
    const createdIds: number[] = created?.ids || [];
    const createdBySku = new Map<string, number>((created?.items || []).map((i: any) => [String(i.sku), i.id]));
    const createdByName = new Map<string, number>((created?.items || []).filter((i: any) => !i.sku).map((i: any) => [String(i.name), i.id]));
    const rec = {
      invoice_no: d.invoice_no, date: d.extraction.date, date_iso: d.extraction.date_iso,
      supplier: d.supplier, supplier_vat: d.supplier_vat, customer_no: d.extraction.customer_no,
      subtotal: d.extraction.subtotal ?? d.extraction.lines_sum, before_vat: d.extraction.before_vat, vat_18: d.extraction.vat, total: d.extraction.total,
      category: d.category,
      lines: d.lines.map((l) => ({
        line_no: l.line_no, sku: l.sku, name: l.existing?.name || l.name, qty: l.qty, unit_price: l.unit_price, line_total: l.line_total,
        unit: l.existing?.unit || l.unit, location: l.existing?.location || l.location,
        action: l.expense ? 'expense' : l.existing ? 'received' : 'created', inventory_item_id: l.existing?.id ?? (l.sku ? createdBySku.get(l.sku) : createdByName.get(String(l.name || ''))) ?? null,
      })),
      created_item_ids: createdIds, received_item_ids: received?.ids || [], receive_skipped: received?.skipped || [], create_skipped: created?.skipped || [],
      image_paths: { mac: imageSaved, processed: processedSaved }, extraction_source: d.source || 'local',
      type: d.lines.every(isExp) ? 'expense' : d.lines.some(isExp) ? 'mixed' : 'inventory', expense_category: d.lines.some(isExp) ? (d.expense_category || 'אחר') : null, paid: d.paid ?? null,
      expense_total: d.lines.some(isExp) ? Math.round(d.lines.filter(isExp).reduce((a, l) => a + (l.line_total || 0), 0) * 100) / 100 : null, business_id: cfg.businessId, confirmed_by: confirmedBy, recorded_at: new Date(now()).toISOString(),
      checks: d.extraction.checks, override_gap: override && !d.extraction.checks.all_ok, source: 'chloe-whatsapp-invoice-intake',
    };
    mkdirSync(path.dirname(cfg.recordsPath), { recursive: true });
    appendFileSync(cfg.recordsPath, JSON.stringify(rec) + '\n');
    dropDraft(d.key);
    const nRec = (received?.ids || []).length, nNew = createdIds.length;
    if (d.lines.every(isExp)) {
      return [`✅ *חשבונית ${invoiceRef} תויקה כהוצאה — ${d.expense_category || 'אחר'}*`, `ספק: ${d.supplier || '—'} | סה״כ ${money(d.extraction.total)} ₪`, 'המלאי לא השתנה. נרשם ברשומות החשבוניות של קלואי (עדיין לא במערכת הכספים).'].join('\n');
    }
    const lines = d.lines.filter(isInv).map((l) => `${l.line_no}. ${l.existing?.name || l.name} ${l.existing ? `+${fmtQty(l.qty)}` : `🆕 ${fmtQty(l.qty)}`}`);
    if (d.lines.some(isExp)) lines.push(`+ ${d.lines.filter(isExp).length} שורות תויקו כהוצאה — ${d.expense_category || 'אחר'} (לא במלאי)`);
    return [`✅ *חשבונית ${invoiceRef} נקלטה*`, `ספק: ${d.supplier || '—'} | סה״כ ${money(d.extraction.total)} ₪`,
      `עודכנו ${nRec} פריטים קיימים, נוצרו ${nNew} פריטים חדשים${(received?.skipped || []).length ? ` (דולגו ${(received.skipped).length} שכבר נקלטו)` : ''}.`,
      ...lines, override && !d.extraction.checks.all_ok ? '⚠️ נקלט למרות פער בבדיקות (נרשם ברשומה).' : ''].filter(Boolean).join('\n');
  }

  function isAllowed(phone: string): boolean {
    return cfg.enabled && allow.has(tail(phone));
  }

  return { isAllowed, handleMedia, handleText, draftFromTokens, withSuggestions, formatDraft, latestDraft, noteGuestActivity, suggestEnabled: () => suggestOn, _loadDrafts: loadDrafts };
}

export type InvoiceIntake = ReturnType<typeof createInvoiceIntake>;
