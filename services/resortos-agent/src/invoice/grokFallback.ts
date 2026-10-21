/**
 * Grok (xAI) fallback for invoice lines the local OCR / vision model could not name.
 * Reconstructed 2026-10-21 from the running dist (dist/invoice/grokFallback.js); behaviour identical.
 * Suggestions only — the manager still has to confirm every name.
 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export interface GrokTarget { line_no: number; sku: string; latin?: string | null; qty?: number | null; unit_price?: number | null }
export interface GrokLine { line_no: number; sku: string; name: string; qty: number | null; unit: string | null; unit_price: number | null; supplier: string | null; category: string | null }
export interface GrokCfg { apiKey: string; model?: string; url?: string; timeoutMs?: number; fetchImpl?: typeof fetch }

export function buildPrompt(targets: GrokTarget[]): string {
  const rows = targets.map((t) => `- line ${t.line_no}: sku "${t.sku}"${t.latin ? `, printed text "${t.latin}"` : ''}${t.qty != null ? `, qty ${t.qty}` : ''}${t.unit_price != null ? `, unit price ${t.unit_price}` : ''}`).join('\n');
  return [
    'This is an Israeli supplier invoice (Hebrew). For EACH listed invoice line, read the product description from the image.',
    'Return STRICT JSON only, no prose: {"lines":[{"line_no":number,"sku":string,"name":string,"qty":number|null,"unit":string|null,"unit_price":number|null,"supplier":string|null,"category":string|null}]}',
    '"name" = the product name in Hebrew exactly as printed (short, no SKU, no price). "unit" in Hebrew (e.g. יח׳, חבילה, קרטון, ליטר).',
    '"category" one of: ניקיון, מצעים, מזון, משקאות, תחזוקה, כללי. If you cannot read a line, omit it. Do not invent lines.',
    'Lines:', rows,
  ].join('\n');
}

function num(v: unknown): number | null { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n; }
function str(v: unknown, max = 120): string | null { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; return s ? s.slice(0, max) : null; }

export function parseGrokJson(text: string, targets: GrokTarget[]): Map<string, GrokLine> {
  const out = new Map<string, GrokLine>();
  let data: any = null;
  const m = String(text || '').match(/\{[\s\S]*\}/);
  try {
    data = JSON.parse(m ? m[0] : text);
  } catch {
    return out;
  }
  const list: any[] = Array.isArray(data?.lines) ? data.lines : Array.isArray(data) ? data : [];
  const bySku = new Map(targets.map((t) => [t.sku, t]));
  const byLine = new Map(targets.map((t) => [t.line_no, t]));
  for (const r of list) {
    const t = bySku.get(String(r?.sku ?? '').trim()) || byLine.get(Number(r?.line_no));
    const name = str(r?.name, 80);
    if (!t || !name || out.has(t.sku)) continue; // only lines we asked about; SKU always ours, never Grok's
    out.set(t.sku, { line_no: t.line_no, sku: t.sku, name, qty: num(r?.qty), unit: str(r?.unit, 20), unit_price: num(r?.unit_price), supplier: str(r?.supplier, 80), category: str(r?.category, 30) });
  }
  return out;
}

export async function grokInvoiceLines(cfg: GrokCfg, image: Buffer, mime: string, targets: GrokTarget[]): Promise<{ lines: Map<string, GrokLine>; usage: unknown; ms: number; model: string } | null> {
  if (!cfg.apiKey || !targets.length || !image?.length || image.length > MAX_IMAGE_BYTES) return null;
  const model = cfg.model || 'grok-4.7';
  const f = cfg.fetchImpl || fetch;
  const ctrl = new AbortController();
  const t0 = Date.now();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 20_000);
  try {
    const r = await f(cfg.url || 'https://api.x.ai/v1/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model, temperature: 0, reasoning_effort: 'low', response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${/png/i.test(mime) ? 'image/png' : 'image/jpeg'};base64,${image.toString('base64')}`, detail: 'high' } },
          { type: 'text', text: buildPrompt(targets) },
        ] }],
      }),
    });
    if (!r.ok) throw new Error(`xai HTTP ${r.status}`);
    const data: any = await r.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    return { lines: parseGrokJson(typeof text === 'string' ? text : JSON.stringify(text), targets), usage: data?.usage, ms: Date.now() - t0, model: data?.model || model };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Full-invoice fallback (Ran 2026-10-21): handwritten / manual invoices ----------
// Used ONLY when the local Apple Vision path found no SKU rows. The whole image goes to Grok;
// the result is a draft that still needs the manager's explicit "אשר חשבונית" (and name approval).

export interface GrokInvoiceItem { line_no: number; sku: string | null; name: string; qty: number | null; unit: string | null; unit_price: number | null; line_total: number | null }
export interface GrokInvoice {
  is_invoice: boolean;
  handwritten: boolean;
  invoice_no: string | null;
  date: string | null;      // dd/mm/yy as printed (normalised)
  date_iso: string | null;  // yyyy-mm-dd
  supplier: string | null;
  supplier_vat: string | null;
  before_vat: number | null;
  vat: number | null;
  total: number | null;
  items: GrokInvoiceItem[];
  /** 4 paper corners, normalized 0..1, top-left origin (TL,TR,BR,BL) — used to crop when local edge detection fails. */
  corners: Array<[number, number]> | null;
}

export function buildFullPrompt(): string {
  return [
    'You are reading a photo sent by a hotel manager in Israel. It may be a supplier invoice / delivery note, often HANDWRITTEN in Hebrew.',
    'Return STRICT JSON only, no prose:',
    '{"is_invoice":boolean,"handwritten":boolean,"invoice_no":string|null,"date":"dd/mm/yyyy"|null,"supplier":string|null,"supplier_vat":string|null,',
    '"before_vat":number|null,"vat":number|null,"total":number|null,',
    '"items":[{"line_no":number,"sku":string|null,"name":string,"qty":number|null,"unit":string|null,"unit_price":number|null,"line_total":number|null}],',
    '"corners":[[x,y],[x,y],[x,y],[x,y]]|null}  (corners = the 4 corners of the paper document in the photo, normalized 0..1 from top-left, order TL,TR,BR,BL)',
    'Rules: "is_invoice" false if this is not an invoice / delivery note / receipt from a supplier (e.g. a check, a room photo) — then items=[].',
    '"name" = product name in Hebrew as written. "sku" only if a catalogue number is clearly written, else null. "supplier_vat" = 9-digit ח.פ / עוסק מורשה of the SUPPLIER (never 517258844).',
    'Numbers as plain numbers (no ₪, no commas). If a value is unreadable use null. Never invent lines or values.',
  ].join('\n');
}

function isoFrom(s: string | null): { date: string | null; iso: string | null } {
  const m = String(s || '').match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return { date: null, iso: null };
  const d = Number(m[1]), mo = Number(m[2]);
  let y = Number(m[3]); if (y < 100) y += 2000;
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2000 || y > 2100) return { date: null, iso: null };
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${p(d)}/${p(mo)}/${String(y).slice(2)}`, iso: `${y}-${p(mo)}-${p(d)}` };
}

export function parseGrokInvoice(text: string): GrokInvoice | null {
  let data: any;
  const m = String(text || '').match(/\{[\s\S]*\}/);
  try { data = JSON.parse(m ? m[0] : text); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const items: GrokInvoiceItem[] = [];
  const list: any[] = Array.isArray(data.items) ? data.items : [];
  for (const r of list) {
    const name = str(r?.name, 80);
    if (!name) continue;
    const sku = str(r?.sku, 30);
    items.push({ line_no: items.length + 1, sku: sku && /\d/.test(sku) ? sku.replace(/\s+/g, '') : null, name, qty: num(r?.qty), unit: str(r?.unit, 20), unit_price: num(r?.unit_price), line_total: num(r?.line_total) });
    if (items.length >= 60) break;
  }
  const vatRaw = String(data.supplier_vat ?? '').replace(/\D/g, '');
  const invRaw = String(data.invoice_no ?? '').replace(/\D/g, '');
  const dt = isoFrom(str(data.date, 20));
  return {
    is_invoice: data.is_invoice === true,
    handwritten: data.handwritten === true,
    invoice_no: invRaw.length >= 1 && invRaw.length <= 12 ? invRaw : null,
    date: dt.date, date_iso: dt.iso,
    supplier: str(data.supplier, 80),
    supplier_vat: vatRaw.length === 9 && vatRaw !== '517258844' ? vatRaw : null,
    before_vat: num(data.before_vat), vat: num(data.vat), total: num(data.total),
    items,
    corners: parseCorners(data.corners),
  };
}

function parseCorners(v: unknown): Array<[number, number]> | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const out: Array<[number, number]> = [];
  for (const p of v) {
    const x = Array.isArray(p) ? Number(p[0]) : Number((p as any)?.x), y = Array.isArray(p) ? Number(p[1]) : Number((p as any)?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) return null;
    out.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
  }
  return out;
}

export async function grokFullInvoice(cfg: GrokCfg, image: Buffer, mime: string): Promise<{ invoice: GrokInvoice | null; usage: unknown; ms: number; model: string } | null> {
  if (!cfg.apiKey || !image?.length || image.length > MAX_IMAGE_BYTES) return null;
  const model = cfg.model || 'grok-4.7';
  const f = cfg.fetchImpl || fetch;
  const ctrl = new AbortController();
  const t0 = Date.now();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 45_000);
  try {
    const r = await f(cfg.url || 'https://api.x.ai/v1/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model, temperature: 0, reasoning_effort: 'low', response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${/png/i.test(mime) ? 'image/png' : 'image/jpeg'};base64,${image.toString('base64')}`, detail: 'high' } },
          { type: 'text', text: buildFullPrompt() },
        ] }],
      }),
    });
    if (!r.ok) throw new Error(`xai HTTP ${r.status}`);
    const data: any = await r.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    return { invoice: parseGrokInvoice(typeof text === 'string' ? text : JSON.stringify(text)), usage: data?.usage, ms: Date.now() - t0, model: data?.model || model };
  } finally {
    clearTimeout(timer);
  }
}
