/**
 * Suggested Hebrew names for NEW invoice SKUs.
 * Apple Vision gives boxes (not Hebrew). We crop each tight description cell (deskewed, ~96 px per text line,
 * including a wrapped 2nd line), then ask the already-loaded gemma4 to transcribe it. Suggestions are NEVER
 * trusted automatically: the manager must accept them ("אשר שמות" / "אשר שם <שורה>") or edit them.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import type { OcrToken } from './extract.js';

const SKU = /(?<![\d-])\d{1,2}-\d{3,6}(?![\d-])/;
const MONEY = /\d+[.,]\d{2}(?!\d)/;
const LONGDIGITS = /\d{5,}/;

export interface CropSpec { id: string; sku: string; x0: number; y0: number; x1: number; y1: number; skx: number; k: number; outH: number; lines: number }

/** Plan crops (normalized, top-left origin) for the given SKUs. `skew` = extractInvoice().skew */
export function planCrops(tokens: OcrToken[], skus: string[], skew: number, lineHeightPx = 96): CropSpec[] {
  const toks = tokens.filter((t) => t && typeof t.text === 'string');
  const rows = new Map<string, OcrToken>();
  for (const t of toks) { const m = t.text.match(SKU); if (m && !rows.has(m[0])) rows.set(m[0], t); }
  const cyUp = (t: OcrToken) => t.y + t.h / 2;
  // all rows ordered top→bottom (larger y-up = higher on page)
  const all = [...rows.entries()].sort((a, b) => cyUp(b[1]) - cyUp(a[1]));
  const out: CropSpec[] = [];
  for (const sku of skus) {
    const t = rows.get(sku); if (!t) continue;
    const idx = all.findIndex(([s]) => s === sku);
    const cy = cyUp(t), th = t.h;
    const expectedAt = (x: number) => cy + skew * (x - t.x);           // row baseline at x (y-up)
    const next = all[idx + 1]?.[1]; const prev = all[idx - 1]?.[1];
    const nextCy = next ? cyUp(next) + skew * (t.x - next.x) : -Infinity; // next row centre, measured at this row's x
    const prevCy = prev ? cyUp(prev) + skew * (t.x - prev.x) : Infinity;
    let x0 = t.x, x1 = t.x + t.w;
    let lowest = cy; // y-up centre of lowest included text line (at x = t.x)
    for (const u of toks) {
      if (u === t || SKU.test(u.text) || MONEY.test(u.text) || LONGDIGITS.test(u.text) || !/\p{L}/u.test(u.text)) continue;
      const ux = u.x + u.w / 2;
      if (ux < t.x || ux > t.x + t.w) continue;                          // inside the description column
      if (u.h > th * 1.6) continue;
      const below = expectedAt(u.x) - cyUp(u);                           // how far below this row's line (y-up units)
      if (below < th * 0.45 || below > th * 1.3) continue;               // a wrapped line sits ~1 line height below
      const uCyAtRow = cyUp(u) + skew * (t.x - u.x);
      if (next && uCyAtRow < nextCy + th * 0.6) continue;                // that's the next row, not a wrap
      lowest = Math.min(lowest, uCyAtRow);
      x0 = Math.min(x0, u.x); x1 = Math.max(x1, u.x + u.w);
    }
    const lines = lowest < cy ? 2 : 1;
    const half = th * 0.7;
    let topUp = Math.min(cy + half, prev ? prevCy - th * 0.55 : cy + half);
    let botUp = Math.max(lowest - half, next ? nextCy + th * 0.55 : lowest - half);
    if (botUp > lowest - th * 0.4) botUp = lowest - th * 0.4;           // never cut the text itself
    if (topUp < cy + th * 0.4) topUp = cy + th * 0.4;
    const pad = 0.01;
    out.push({
      id: sku.replace(/[^\w-]/g, ''), sku, lines,
      x0: Math.max(0, x0 - pad), x1: Math.min(1, x1 + pad),
      y0: Math.max(0, 1 - topUp), y1: Math.min(1, 1 - botUp),
      skx: t.x, k: skew, outH: lineHeightPx * lines,
    });
  }
  return out;
}

/** Keep the first line(s) of the model output and strip SKUs, prices, barcodes/phones and line numbers. */
export function cleanSuggestion(raw: string, lines = 1): string | null {
  let s = String(raw || '').replace(/```[a-z]*|```/g, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, lines).join(' ');
  const skus = [...s.matchAll(new RegExp(SKU.source, 'g'))];
  if (skus.length >= 2) s = s.slice(0, skus[1].index);                 // bleed from the next row
  s = s.replace(new RegExp(`(?:(?<![\\d/.,])\\d{1,2}\\s+)?${SKU.source}(?:\\s+\\d{1,2}(?![\\d/.,]))?`, 'g'), ' ')
    .replace(/(?<![\d/.,])\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/g, ' ')
    .replace(/[\d-]{7,}/g, ' ')
    .replace(/^["'\s:–—-]+|["'\s:–—-]+$/g, '');
  let words = s.split(/\s+/).filter(Boolean)
    .filter((w) => !/\d[-–]\d|\d\/\d+[-–]/.test(w))      // mirrored / partial SKUs like "17/60-5"
    .filter((w) => !/^[/\\|]?\d{0,2}[/\\|]\d{0,2}$/.test(w) || /^\d{1,3}\/\d{1,3}$/.test(w)); // stray "/8" (keep sizes like 1/32, 50/80)
  while (words.length && /^\d{1,2}$/.test(words[0])) words.shift();
  while (words.length && /^\d{1,2}$/.test(words[words.length - 1])) words.pop();
  s = words.join(' ').trim();
  if (s.length < 2 || !/\p{L}{2,}/u.test(s) || s.length > 120) return null;
  return s;
}

export const TRANSCRIBE_PROMPT =
  'This image is a cropped line from an Israeli supplier invoice. Transcribe EXACTLY the product description text you see, ' +
  'in its original language (Hebrew and/or Latin letters and digits). Do not translate, do not explain, do not add anything. ' +
  'Output only the text.';

export interface OllamaVisionCfg { url: string; model: string; keepAlive: string; numCtx: number }
export function ollamaTranscriber(cfg: OllamaVisionCfg, fetchImpl: typeof fetch = fetch) {
  return async (png: Buffer, signal: AbortSignal): Promise<string> => {
    const r = await fetchImpl(`${cfg.url}/api/chat`, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model, stream: false, think: false, keep_alive: cfg.keepAlive,
        options: { temperature: 0, num_ctx: cfg.numCtx, num_predict: 100 },
        messages: [{ role: 'user', content: TRANSCRIBE_PROMPT, images: [png.toString('base64')] }],
      }),
    });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    const d = (await r.json()) as any;
    return String(d?.message?.content || '');
  };
}

export function swiftCropper(bin: string, outDir: string) {
  return (imagePath: string, specs: CropSpec[]): Promise<Array<{ id: string; png: Buffer }>> => new Promise((resolve, reject) => {
    const p = execFile(bin, [imagePath, outDir], { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }, async (err, stdout) => {
      if (err) return reject(err);
      try {
        const res = JSON.parse(String(stdout)) as Array<{ id: string; path: string }>;
        resolve(await Promise.all(res.map(async (r) => ({ id: r.id, png: await readFile(r.path) }))));
      } catch (e) { reject(e); }
    });
    p.stdin?.end(JSON.stringify(specs));
  });
}

export interface SuggestJobDeps {
  crop: (imagePath: string, specs: CropSpec[]) => Promise<Array<{ id: string; png: Buffer }>>;
  transcribe: (png: Buffer, signal: AbortSignal) => Promise<string>;
  /** ms timestamp of the last guest inbound (guest priority) */
  lastGuestAt: () => number;
  /** register the in-flight abort controller so guest activity can abort it */
  setCurrent: (c: AbortController | null) => void;
  now?: () => number;
  deadlineMs?: number;   // total budget (default 60 s)
  quietMs?: number;      // wait this long after a guest message before (re)trying (default 8 s)
  log?: { warn: (...a: any[]) => void };
}
export interface SuggestOutcome { suggestions: Map<string, string>; failed: string[]; aborted: 'timeout' | 'errors' | null; guestPauses: number }

/** Sequentially transcribe crops; guest messages pause/abort the current call; total deadline; graceful fallback. */
export async function runSuggestJob(imagePath: string, specs: CropSpec[], d: SuggestJobDeps): Promise<SuggestOutcome> {
  const now = d.now || (() => Date.now());
  const start = now();
  const deadline = start + (d.deadlineMs ?? 60_000);
  const quiet = d.quietMs ?? 8_000;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const out: SuggestOutcome = { suggestions: new Map(), failed: [], aborted: null, guestPauses: 0 };
  let crops: Array<{ id: string; png: Buffer }> = [];
  try { crops = await d.crop(imagePath, specs); } catch (e) { d.log?.warn({ err: String(e) }, 'invoice name crop failed'); out.failed = specs.map((s) => s.sku); out.aborted = 'errors'; return out; }
  const byId = new Map(crops.map((c) => [c.id, c.png]));
  let consecutiveErrors = 0;
  for (const s of specs) {
    const png = byId.get(s.id);
    if (!png) { out.failed.push(s.sku); continue; }
    let done = false;
    while (!done) {
      // guest priority: wait until guests have been quiet for `quiet` ms
      while (now() - d.lastGuestAt() < quiet && now() < deadline) await sleep(Math.min(250, quiet));
      const left = deadline - now();
      if (left <= 0) { out.aborted = 'timeout'; break; }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(new Error('timeout')), left);
      d.setCurrent(ac);
      const guestBefore = d.lastGuestAt();
      try {
        const raw = await d.transcribe(png, ac.signal);
        const c = cleanSuggestion(raw, s.lines);
        if (c) out.suggestions.set(s.sku, c); else out.failed.push(s.sku);
        consecutiveErrors = 0; done = true;
      } catch (e) {
        if (d.lastGuestAt() !== guestBefore && now() < deadline) { out.guestPauses++; continue; } // aborted for a guest → retry later
        if (now() >= deadline) { out.aborted = 'timeout'; break; }
        d.log?.warn({ err: String(e), sku: s.sku }, 'invoice name transcription failed');
        out.failed.push(s.sku); consecutiveErrors++; done = true;
      } finally { clearTimeout(timer); d.setCurrent(null); }
    }
    if (out.aborted) break;
    if (consecutiveErrors >= 2) { out.aborted = 'errors'; break; }
  }
  for (const s of specs) if (!out.suggestions.has(s.sku) && !out.failed.includes(s.sku)) out.failed.push(s.sku);
  return out;
}
