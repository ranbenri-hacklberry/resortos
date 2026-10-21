/**
 * Suggested Hebrew names for ID documents (CHLOE_ID_NAME_SUGGEST=1, off by default).
 * Apple Vision (ar-SA/en-US boxes) locates the name LABELS (Arabic / English; Hebrew labels when readable),
 * we crop the value region next to/below the label, and the already-loaded gemma4 transcribes it.
 * The result is a SUGGESTION with a confidence flag — it is never trusted automatically and never replaces
 * first_name / last_name. ID number reading and check-digit validation are untouched.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export interface BoxToken { text: string; confidence?: number; x: number; y: number; w: number; h: number } // Vision: normalized, bottom-left origin
export type NameField = 'first' | 'last';
export interface NameCrop { field: NameField; label: string; x0: number; y0: number; x1: number; y1: number; skx: number; k: number; outH: number; id: string }
export interface IdNameSuggestion {
  suggested_first_name: string | null;
  suggested_last_name: string | null;
  confidence: { first: 'medium' | 'low' | null; last: 'medium' | 'low' | null };
  trusted: false;
  source: 'gemma4-crop-suggestion';
  note?: string;
  latency_ms: number;
}

const LABELS: Record<NameField, RegExp> = {
  first: /שם\s*פרטי|ال[اإ]سم\s*الشخصي|given\s*names?|first\s*name|prénom/i,
  last: /שם\s*(?:ה)?משפחה|[اإ]سم\s*العائلة|surname|last\s*name|family\s*name|nom\b/i,
};

/** Locate label tokens and plan a crop of the value region: same line to the left of the label + the next lines below. */
export function planNameCrops(tokens: BoxToken[], lineHeightPx = 96): NameCrop[] {
  const toks = tokens.filter((t) => t && typeof t.text === 'string');
  if (!toks.length) return [];
  const minX = Math.min(...toks.map((t) => t.x));
  const out: NameCrop[] = [];
  for (const field of ['first', 'last'] as NameField[]) {
    const lab = toks.find((t) => LABELS[field].test(t.text) && !(field === 'first' && LABELS.last.test(t.text) && !LABELS.first.test(t.text)));
    if (!lab) continue;
    const th = lab.h;
    const topUp = lab.y + lab.h + th * 0.4;          // a bit above the label line
    const botUp = Math.max(0, lab.y - th * 2.6);      // value usually on the label line or the 1–2 lines below
    const x0 = Math.max(0, Math.min(minX, lab.x - 0.45) - 0.01);
    const x1 = Math.min(1, lab.x + lab.w + 0.02);
    out.push({ field, label: lab.text, id: `id-${field}`, x0, x1, y0: Math.max(0, 1 - topUp), y1: Math.min(1, 1 - botUp), skx: lab.x, k: 0, outH: lineHeightPx * 3 });
  }
  return out;
}

export const ID_NAME_PROMPT = (field: NameField) =>
  `This is a crop of an Israeli identity document around the ${field === 'first' ? 'FIRST NAME (שם פרטי)' : 'FAMILY NAME (שם משפחה)'} field. ` +
  'Output ONLY the person\'s name exactly as printed in Hebrew letters — not the label, not the Arabic or English version, no explanation. ' +
  'If you cannot read it, output NONE.';

/** Normalize model output to a Hebrew name and rate it; never 'high'. */
export function rateHebrewName(raw: string): { name: string | null; confidence: 'medium' | 'low' | null } {
  let s = String(raw || '').split(/\r?\n/)[0].trim().replace(/^["'`]+|["'`.]+$/g, '').trim();
  if (!s || /^none$/i.test(s)) return { name: null, confidence: null };
  s = s.replace(/^(?:שם\s*פרטי|שם\s*משפחה)\s*[:\-]?\s*/, '').replace(/\s+/g, ' ').trim();
  const heb = s.replace(/[^\u05D0-\u05EA\s'"׳״\-]/g, '').replace(/\s+/g, ' ').trim();
  if (heb.length < 2) return { name: null, confidence: null };
  const words = heb.split(' ').filter(Boolean);
  const clean = heb === s && words.length >= 1 && words.length <= 3 && heb.length <= 30;
  return { name: heb, confidence: clean ? 'medium' : 'low' };
}

function binPath(name: string): string {
  const c = [fileURLToPath(new URL(`../../bin/${name}`, import.meta.url)), `${process.cwd()}/bin/${name}`];
  return c.find((p) => existsSync(p)) || c[0];
}
function run(bin: string, args: string[], stdin: string | null, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = execFile(bin, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (e, out) => (e ? reject(e) : resolve(String(out))));
    if (stdin !== null) p.stdin?.end(stdin);
  });
}

export interface IdSuggestDeps {
  boxes?: (imagePath: string) => Promise<BoxToken[]>;
  crop?: (imagePath: string, crops: NameCrop[]) => Promise<Array<{ id: string; png: Buffer }>>;
  transcribe?: (png: Buffer, prompt: string, signal: AbortSignal) => Promise<string>;
  /** guest priority hook (e.g. Chloe busy) — when true the job is skipped / aborted */
  busy?: () => boolean;
  deadlineMs?: number;
  ollamaUrl?: string;
  model?: string;
}

export function idNameSuggestEnabled(): boolean {
  return ['1', 'true', 'on', 'yes'].includes(String(process.env.CHLOE_ID_NAME_SUGGEST || '0').toLowerCase());
}

export async function suggestIdNames(imagePath: string, deps: IdSuggestDeps = {}): Promise<IdNameSuggestion> {
  const t0 = Date.now();
  const res: IdNameSuggestion = { suggested_first_name: null, suggested_last_name: null, confidence: { first: null, last: null }, trusted: false, source: 'gemma4-crop-suggestion', latency_ms: 0 };
  const deadline = t0 + (deps.deadlineMs ?? 20_000);
  const ollamaUrl = (deps.ollamaUrl || process.env.CHLOE_ID_NAME_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const model = deps.model || process.env.CHLOE_ID_NAME_MODEL || 'gemma4:12b';
  const boxes = deps.boxes || (async (p: string) => JSON.parse(await run(binPath('apple-vision-ocr-boxes'), [p], null, 15_000)) as BoxToken[]);
  const crop = deps.crop || (async (p: string, c: NameCrop[]) => {
    const r = JSON.parse(await run(binPath('invoice-crop'), [p, tmpdir()], JSON.stringify(c), 15_000)) as Array<{ id: string; path: string }>;
    return Promise.all(r.map(async (x) => ({ id: x.id, png: await readFile(x.path) })));
  });
  const transcribe = deps.transcribe || (async (png: Buffer, prompt: string, signal: AbortSignal) => {
    const r = await fetch(`${ollamaUrl}/api/chat`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, think: false, keep_alive: '24h', options: { temperature: 0, num_ctx: 4096, num_predict: 40 },
        messages: [{ role: 'user', content: prompt, images: [png.toString('base64')] }] }) });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    return String(((await r.json()) as any)?.message?.content || '');
  });
  try {
    if (deps.busy?.()) { res.note = 'skipped_guest_priority'; return res; }
    const crops = planNameCrops(await boxes(imagePath));
    if (!crops.length) { res.note = 'labels_not_found'; return res; }
    const pngs = new Map((await crop(imagePath, crops)).map((c) => [c.id, c.png]));
    for (const c of crops) {                                   // sequential
      const left = deadline - Date.now();
      if (left <= 0) { res.note = 'timeout'; break; }
      if (deps.busy?.()) { res.note = 'aborted_guest_priority'; break; }
      const png = pngs.get(c.id); if (!png) continue;
      const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), left);
      try {
        const r = rateHebrewName(await transcribe(png, ID_NAME_PROMPT(c.field), ac.signal));
        if (c.field === 'first') { res.suggested_first_name = r.name; res.confidence.first = r.confidence; }
        else { res.suggested_last_name = r.name; res.confidence.last = r.confidence; }
      } catch (e) { res.note = ac.signal.aborted ? 'timeout' : `llm_error: ${String((e as Error)?.message || e).slice(0, 80)}`; break; }
      finally { clearTimeout(timer); }
    }
    if (res.suggested_first_name && res.suggested_first_name === res.suggested_last_name) {   // same text for both → not reliable
      res.confidence = { first: 'low', last: 'low' };
    }
  } catch (e) {
    res.note = `error: ${String((e as Error)?.message || e).slice(0, 80)}`;
  } finally { res.latency_ms = Date.now() - t0; }
  return res;
}
