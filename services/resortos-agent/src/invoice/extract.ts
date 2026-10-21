/**
 * Invoice extraction from Apple Vision OCR tokens (with bounding boxes).
 * Apple Vision cannot read Hebrew on this Mac, so we rely only on digits / layout:
 *  - SKU tokens (e.g. "9-909188") anchor item rows
 *  - numeric tokens are assigned to rows by y (with a fitted page skew)
 *  - (qty, unit_price, line_total) chosen so qty*price = total, qty column found by "1.00" x-positions
 *  - header: invoice no (7-8 digits), date dd/mm/yy, supplier VAT (9 digits), totals (before VAT + VAT = total)
 */
export interface OcrToken { text: string; confidence?: number; x: number; y: number; w: number; h: number }

export interface InvoiceLine {
  line_no: number;
  sku: string;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
  latin: string;
  ok: boolean;
}

export interface InvoiceChecks {
  lines_math_ok: boolean;          // every line qty*price = total
  lines_sum_ok: boolean;           // sum(lines) = subtotal
  vat_ok: boolean;                 // before_vat + vat = total
  rounding_ok: boolean;            // |subtotal - before_vat| <= 1 (rounding / discount)
  all_ok: boolean;
  problems: string[];
}

export interface InvoiceExtraction {
  invoice_no: string | null;
  date: string | null;             // as printed, dd/mm/yy
  date_iso: string | null;
  supplier_vat: string | null;
  customer_no: string | null;
  lines: InvoiceLine[];
  lines_sum: number;
  subtotal: number | null;
  before_vat: number | null;
  vat: number | null;
  total: number | null;
  checks: InvoiceChecks;
  skew: number;
}

/** Our own company id (מיאליס ריזורט בע"מ) — never the supplier. */
export const OWN_COMPANY_IDS = ['517258844'];

const SKU = /(?<![\d-])\d{1,2}-\d{3,6}(?![\d-])/;
const NUMS = /(?<![\d.,])\d{1,3}(?:,\d{3})*(?:\.\d{3})*\.\d{2}(?!\d)/g;

export function parseMoney(s: string): number {
  let t = s.replace(/,/g, '');
  if ((t.match(/\./g) || []).length > 1) {
    const i = t.lastIndexOf('.');
    t = t.slice(0, i).replace(/\./g, '') + '.' + t.slice(i + 1);
  }
  return Number(t);
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const eq = (a: number, b: number, tol = 0.011) => Math.abs(a - b) < tol;

interface T extends OcrToken { cy: number }

function triple(vals: number[]): [number, number, number] | null {
  const vs = [...new Set(vals)];
  let best: [number, number, number] | null = null;
  for (const q of vs) for (const p of vs) {
    if (q === p) continue;
    for (const t of vs) {
      if (eq(q * p, t) && q >= 1 && (q !== 1 || p === t) && Number.isInteger(q)) {
        if (!best || t > best[2]) best = [q, p, t];
      }
    }
  }
  if (!best && vs.length) {
    const p = Math.max(...vs);
    if (vals.filter(v => v === p).length >= 2) best = [1, p, p];
  }
  return best;
}

type Rows = Map<string, { cy: number; x: number; latin: string }>;

function findRows(toks: T[]): Rows {
  const rows: Rows = new Map();
  for (const t of toks) {
    const m = t.text.match(SKU);
    if (m && !rows.has(m[0])) {
      const latin = (t.text.match(/[A-Za-z][A-Za-z0-9&/.'-]*(?:\s+[A-Za-z0-9&/.'-]+)*/g) || [])
        .filter(w => /[A-Za-z]{3,}/.test(w)).join(' ').trim();
      rows.set(m[0], { cy: t.cy, x: t.x, latin });
    }
  }
  return rows;
}

function build(toks: T[], rows: Rows, k: number) {
  const ys = [...rows.values()].map(v => v.cy).sort((a, b) => a - b);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]).filter(g => g > 0);
  const gap = gaps.length ? Math.min(...gaps) : 0.02;
  const b = new Map<string, Array<[number, number]>>();
  for (const s of rows.keys()) b.set(s, []);
  for (const t of toks) {
    if (SKU.test(t.text)) continue;
    const vals = (t.text.match(NUMS) || []).map(parseMoney);
    if (!vals.length) continue;
    let bestS = '', bestD = Infinity;
    for (const [s, r] of rows) {
      const d = Math.abs(r.cy + k * (t.x - r.x) - t.cy);
      if (d < bestD) { bestD = d; bestS = s; }
    }
    if (bestS && bestD < gap * 0.5) for (const v of vals) b.get(bestS)!.push([v, t.x]);
  }
  const ones = [...b.values()].flat().filter(([v]) => v === 1).map(([, x]) => x).sort((a, c) => a - c);
  const qx = ones.length ? ones[Math.floor(ones.length / 2)] : null;
  const out = new Map<string, [number, number, number] | null>();
  for (const [s, v] of b) {
    let tr = triple(v.map(([a]) => a));
    if (tr && qx !== null) {
      const [q, p, tt] = tr;
      const xq = v.filter(([a]) => a === q).map(([, x]) => x);
      const xp = v.filter(([a]) => a === p).map(([, x]) => x);
      const near = (xs: number[]) => Math.min(...xs.map(z => Math.abs(z - qx)));
      if (xq.length && xp.length && near(xp) < near(xq)) tr = [p, q, tt];
      if (!Number.isInteger(tr[0])) tr = [tr[1], tr[0], tr[2]];
    }
    out.set(s, tr);
  }
  return out;
}

function toIsoDate(d: string): string | null {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function extractInvoice(raw: OcrToken[]): InvoiceExtraction {
  const toks: T[] = raw.filter(t => t && typeof t.text === 'string').map(t => ({ ...t, cy: t.y + t.h / 2 }));
  const topDown = [...toks].sort((a, b) => b.cy - a.cy);
  const rows = findRows(toks);

  // Fit page skew: maximize number of consistent rows.
  let bestK = 0, bestScore = -1, best = new Map<string, [number, number, number] | null>();
  if (rows.size) {
    for (let i = -40; i <= 40; i++) {
      const k = i * 0.0025;
      const res = build(toks, rows, k);
      const sc = [...res.values()].filter(v => v && eq(v[0] * v[1], v[2])).length;
      if (sc > bestScore) { bestScore = sc; bestK = k; best = res; }
    }
  }
  // Order lines top-down (as printed). Keep only rows with some numbers.
  const ordered = [...rows.entries()].sort((a, b) => b[1].cy - a[1].cy);
  const lines: InvoiceLine[] = [];
  for (const [sku, r] of ordered) {
    const tr = best.get(sku) || null;
    if (!tr) continue;
    lines.push({
      line_no: lines.length + 1, sku,
      qty: tr[0], unit_price: tr[1], line_total: tr[2],
      latin: r.latin, ok: eq(tr[0] * tr[1], tr[2]),
    });
  }
  const linesSum = r2(lines.reduce((s, l) => s + (l.line_total || 0), 0));
  const lowestRowY = ordered.length ? Math.min(...ordered.map(([, r]) => r.cy)) : 1;

  // Header
  let invoice_no: string | null = null;
  const invCands: Array<{ n: string; withText: boolean; cy: number }> = [];
  for (const t of topDown) {
    if (t.cy < 0.5) continue;
    for (const m of t.text.matchAll(/(?<![\d/.,-])(\d{7,8})(?![\d/.,-])/g)) {
      if (m[1].startsWith('0')) continue;
      invCands.push({ n: m[1], withText: /[^\d\s]/.test(t.text.replace(m[1], '')), cy: t.cy });
    }
  }
  invoice_no = (invCands.find(c => c.withText) || invCands[0])?.n || null;

  let date: string | null = null;
  for (const t of topDown) { const m = t.text.match(/(?<!\d)(\d{1,2}\/\d{1,2}\/\d{2,4})(?!\d)/); if (m) { date = m[1]; break; } }

  const vatCount = new Map<string, { c: number; first: number }>();
  topDown.forEach((t, i) => {
    if (t.cy < 0.5) return;
    for (const m of t.text.matchAll(/(?<!\d)(\d{9})(?!\d)/g)) {
      if (m[1].startsWith('0') || OWN_COMPANY_IDS.includes(m[1])) continue;
      const e = vatCount.get(m[1]) || { c: 0, first: i }; e.c++; vatCount.set(m[1], e);
    }
  });
  const supplier_vat = [...vatCount.entries()].sort((a, b) => b[1].c - a[1].c || a[1].first - b[1].first)[0]?.[0] || null;

  let customer_no: string | null = null;
  for (const t of topDown) { if (t.cy < 0.5) continue; const m = t.text.trim().match(/^(\d{6})$/); if (m) { customer_no = m[1]; break; } }

  // Totals: numbers below the item rows
  const below = toks.filter(t => t.cy < lowestRowY - 0.004 && !SKU.test(t.text));
  const money = below.flatMap(t => (t.text.match(NUMS) || []).map(parseMoney));
  let before_vat: number | null = null, vat: number | null = null, total: number | null = null;
  for (const b of money) for (const v of money) for (const t of money) {
    if (b > 0 && v > 0 && eq(b + v, t) && v / b > 0.15 && v / b < 0.19) {
      if (total === null || t > total) { before_vat = b; vat = v; total = t; }
    }
  }
  const subtotal = linesSum > 0 ? (money.find(m => eq(m, linesSum)) ?? null) : null;

  const problems: string[] = [];
  const bad = lines.filter(l => !l.ok);
  const lines_math_ok = lines.length > 0 && bad.length === 0;
  if (!lines.length) problems.push('לא זוהו שורות פריטים');
  for (const l of bad) problems.push(`שורה ${l.line_no}: כמות×מחיר לא שווה לסה"כ שורה`);
  const lines_sum_ok = subtotal !== null;
  if (!lines_sum_ok) problems.push(`סכום השורות ${linesSum.toFixed(2)} לא נמצא כסיכום ביניים בחשבונית`);
  const vat_ok = before_vat !== null && vat !== null && total !== null;
  if (!vat_ok) problems.push('לא זוהה סה"כ + מע"מ תקין (לפני מע"מ + מע"מ = סה"כ)');
  const rounding_ok = vat_ok && Math.abs((subtotal ?? linesSum) - (before_vat as number)) <= 1;
  if (vat_ok && !rounding_ok) problems.push(`פער בין סכום השורות ${linesSum.toFixed(2)} לסכום לפני מע"מ ${before_vat!.toFixed(2)}`);
  return {
    invoice_no, date, date_iso: date ? toIsoDate(date) : null, supplier_vat, customer_no,
    lines, lines_sum: linesSum, subtotal, before_vat, vat, total,
    checks: { lines_math_ok, lines_sum_ok, vat_ok, rounding_ok, all_ok: lines_math_ok && lines_sum_ok && vat_ok && rounding_ok, problems },
    skew: bestK,
  };
}

/** Is this image an invoice? Digits/layout only (Hebrew is unreadable by Vision here). */
export function classifyInvoice(x: InvoiceExtraction, tokens: OcrToken[]): { isInvoice: boolean; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const okLines = x.lines.filter(l => l.ok).length;
  if (okLines >= 1) { score += 2; reasons.push(`${okLines} שורות מק"ט עם כמות×מחיר=סה"כ`); }
  if (x.supplier_vat) { score += 1; reasons.push('ח.פ/עוסק 9 ספרות'); }
  if (x.checks.vat_ok) { score += 2; reasons.push('לפני מע"מ + מע"מ = סה"כ'); }
  if (x.invoice_no) { score += 1; reasons.push('מספר חשבונית'); }
  if (x.date) { score += 0.5; reasons.push('תאריך'); }
  if (tokens.some(t => /invoice|tax|vat|חשבונית|מע"מ/i.test(t.text))) { score += 1; reasons.push('מילת מפתח'); }
  return { isInvoice: okLines >= 1 && score >= 4, score, reasons };
}
