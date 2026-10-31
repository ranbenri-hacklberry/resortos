/**
 * ID scan via Grok vision (Ran 2026-10-24): the image ALWAYS goes to Grok, Grok returns strict JSON,
 * and the system (not the model) decides: accept / manual_review / reject.
 * Privacy: never logs the image, the ID number or names. Nothing is persisted here.
 */
import '../config.js'; // loads .env (XAI_API_KEY) through the existing mechanism
import { validateIsraeliId } from './israeliIdValidator.js';

export type GrokDocType = 'israeli_id_biometric' | 'israeli_id_blue' | 'israeli_driver_license' | 'passport' | 'other' | 'not_an_id';

export interface GrokIdExtraction {
  document_type: GrokDocType;
  id_number: string | null;
  first_name: string | null;
  last_name: string | null;
  first_name_en: string | null;
  last_name_en: string | null;
  date_of_birth: string | null;
  expiry_date: string | null;
  gender: 'M' | 'F' | null;
  nationality: string | null;
  confidence: number;
  issues: string[];
}

export type IdDecision = 'accept' | 'manual_review' | 'reject';

export interface IdScanResult {
  ok: boolean;
  decision: IdDecision;
  reasons: string[];
  extraction: GrokIdExtraction | null;
  checks: {
    schema_valid: boolean;
    is_official: boolean;
    checksum_valid: boolean | null;
    expired: boolean | null;
    name_match: NameMatch | null;
  };
  model: string | null;
  latency_ms: number;
  error?: string;
}

export interface NameMatch { score: number; level: 'exact' | 'partial' | 'none' | 'unknown'; }

const DOC_TYPES: GrokDocType[] = ['israeli_id_biometric', 'israeli_id_blue', 'israeli_driver_license', 'passport', 'other', 'not_an_id'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function buildGrokIdPrompt(): string {
  return [
    'You are an identity-document data extractor for a hotel check-in in Israel.',
    'Read the document in the image and return STRICT JSON only (no markdown, no prose) with exactly these keys:',
    '{"document_type":"israeli_id_biometric"|"israeli_id_blue"|"israeli_driver_license"|"passport"|"other"|"not_an_id",',
    '"id_number":string|null,"first_name":string|null,"last_name":string|null,"first_name_en":string|null,"last_name_en":string|null,',
    '"date_of_birth":"YYYY-MM-DD"|null,"expiry_date":"YYYY-MM-DD"|null,"gender":"M"|"F"|null,"nationality":string|null,',
    '"confidence":number,"issues":string[]}',
    'Rules:',
    '- "id_number": Israeli ID = the 9-digit מספר זהות (digits only, keep leading zeros). Driver license: the holder ID number (not the license number). Passport: passport number.',
    '- first_name/last_name exactly as printed in the original script (Hebrew if Hebrew is printed). *_en = Latin-script names if printed (passport MRZ / English line), else null.',
    '- Dates as YYYY-MM-DD. Israeli cards print DD.MM.YYYY - convert. Unreadable = null. NEVER guess or invent digits or letters.',
    '- "not_an_id" for credit cards, club/loyalty/gym cards, Rav-Kav, student/employee badges, screenshots of text, or no document. "other" for a different official ID (foreign national ID).',
    '- "confidence" 0..1 = how sure you are that ALL extracted fields are read correctly.',
    '- "issues": short English codes for problems, e.g. "blurry","glare","cropped","partially_hidden","photo_of_screen","possible_tampering","back_side_only","multiple_documents". Empty array if none.',
  ].join('\n');
}

const str = (v: unknown, max = 80): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
};
const date = (v: unknown): string | null => {
  const s = str(v, 10);
  if (!s || !DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

/** Strict schema validation of Grok's JSON. Returns null + errors when the shape is wrong. */
export function validateGrokIdJson(text: string): { value: GrokIdExtraction | null; errors: string[] } {
  const errors: string[] = [];
  let data: any;
  try {
    const t = String(text || '').trim();
    const m = t.match(/\{[\s\S]*\}/);
    data = JSON.parse(m ? m[0] : t);
  } catch {
    return { value: null, errors: ['invalid_json'] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { value: null, errors: ['not_an_object'] };
  if (!DOC_TYPES.includes(data.document_type)) errors.push('bad_document_type');
  const conf = Number(data.confidence);
  if (typeof data.confidence !== 'number' || !Number.isFinite(conf) || conf < 0 || conf > 1) errors.push('bad_confidence');
  if (data.issues != null && !Array.isArray(data.issues)) errors.push('bad_issues');
  for (const k of ['date_of_birth', 'expiry_date']) if (data[k] != null && data[k] !== '' && !date(data[k])) errors.push(`bad_${k}`);
  if (data.gender != null && !['M', 'F'].includes(data.gender)) errors.push('bad_gender');
  if (errors.includes('bad_document_type') || errors.includes('bad_confidence')) return { value: null, errors };
  const rawId = str(data.id_number, 20);
  const value: GrokIdExtraction = {
    document_type: data.document_type,
    id_number: rawId ? (data.document_type === 'passport' || data.document_type === 'other' ? rawId.replace(/[\s-]/g, '').toUpperCase() : rawId.replace(/\D/g, '') || null) : null,
    first_name: str(data.first_name), last_name: str(data.last_name),
    first_name_en: str(data.first_name_en), last_name_en: str(data.last_name_en),
    date_of_birth: date(data.date_of_birth), expiry_date: date(data.expiry_date),
    gender: data.gender === 'M' || data.gender === 'F' ? data.gender : null,
    nationality: str(data.nationality, 40),
    confidence: conf,
    issues: Array.isArray(data.issues) ? data.issues.map((i: unknown) => str(i, 40)).filter(Boolean).slice(0, 10) as string[] : [],
  };
  return { value, errors };
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0591-\u05C7]/g, '').replace(/[\u0300-\u036f]/g, '')
  .replace(/[׳'"`״.\-_,]/g, ' ').replace(/[ךםןףץ]/g, (c) => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' } as Record<string, string>)[c]).split(/\s+/).filter((w) => w.length > 1);

/** Compare booking guest name to the names on the document (Hebrew or English). */
export function matchGuestName(ex: Pick<GrokIdExtraction, 'first_name' | 'last_name' | 'first_name_en' | 'last_name_en'>, bookingName?: string | null): NameMatch {
  const b = norm(String(bookingName || ''));
  if (!b.length) return { score: 0, level: 'unknown' };
  const sets = [[ex.first_name, ex.last_name], [ex.first_name_en, ex.last_name_en]]
    .map((p) => norm(p.filter(Boolean).join(' '))).filter((w) => w.length);
  if (!sets.length) return { score: 0, level: 'unknown' };
  let best = 0;
  for (const words of sets) {
    const hit = b.filter((w) => words.includes(w)).length;
    best = Math.max(best, hit / Math.max(1, Math.min(b.length, words.length)));
  }
  return { score: Math.round(best * 100) / 100, level: best >= 0.99 ? 'exact' : best > 0 ? 'partial' : 'none' };
}

export interface DecideOpts { bookingGuestName?: string | null; today?: string; minConfidence?: number; }

/** System-side decision from the JSON only. The model never decides. */
export function decideIdScan(ex: GrokIdExtraction, opts: DecideOpts = {}): { decision: IdDecision; reasons: string[]; checks: IdScanResult['checks'] } {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const minConf = opts.minConfidence ?? 0.8;
  const reasons: string[] = [];
  const isIsraeli = ex.document_type.startsWith('israeli_');
  const isOfficial = ex.document_type !== 'not_an_id';
  const checksum = isIsraeli && ex.id_number ? validateIsraeliId(ex.id_number).isValid : isIsraeli ? false : null;
  const expired = ex.expiry_date ? ex.expiry_date < today : null;
  const name = matchGuestName(ex, opts.bookingGuestName);
  const checks = { schema_valid: true, is_official: isOfficial, checksum_valid: checksum, expired, name_match: name };

  if (!isOfficial) return { decision: 'reject', reasons: ['not_an_official_id'], checks };
  const serious = ex.issues.filter((i) => /tamper|screen|multiple/.test(i));
  if (serious.length) reasons.push(...serious.map((i) => `issue:${i}`));
  if (!ex.id_number) reasons.push('id_number_missing');
  if (isIsraeli && ex.id_number && checksum === false) reasons.push('israeli_id_checksum_failed');
  if (!ex.first_name && !ex.first_name_en) reasons.push('name_missing');
  if (expired) reasons.push('document_expired');
  if (ex.confidence < minConf) reasons.push('low_confidence');
  if (ex.issues.some((i) => /blur|glare|crop|hidden|back_side/.test(i))) reasons.push('image_quality');
  if (ex.document_type === 'other') reasons.push('unsupported_document_type');
  if (name.level === 'none') reasons.push('name_mismatch_with_booking');
  if (name.level === 'partial') reasons.push('name_partial_match');
  // Checksum failure on a clearly-read Israeli ID and tampering are hard rejects; everything else goes to a human.
  if ((checksum === false && ex.id_number && ex.confidence >= minConf) || serious.some((i) => /tamper/.test(i))) {
    return { decision: 'reject', reasons, checks };
  }
  return { decision: reasons.length ? 'manual_review' : 'accept', reasons, checks };
}

export interface GrokIdCfg { apiKey?: string; model?: string; url?: string; timeoutMs?: number; fetchImpl?: typeof fetch; }

function failure(error: string, t0: number, model: string | null = null): IdScanResult {
  return { ok: false, decision: 'manual_review', reasons: [error], extraction: null,
    checks: { schema_valid: false, is_official: false, checksum_valid: null, expired: null, name_match: null },
    model, latency_ms: Date.now() - t0, error };
}

/** Send the image to Grok vision and decide. Errors never throw: they return manual_review with an error code. */
export async function scanIdWithGrok(image: Buffer, mime: string, opts: DecideOpts = {}, cfg: GrokIdCfg = {}): Promise<IdScanResult> {
  const t0 = Date.now();
  const apiKey = cfg.apiKey ?? process.env.XAI_API_KEY ?? '';
  const model = cfg.model || process.env.ID_SCAN_GROK_MODEL || 'grok-4.7';
  if (!apiKey) return failure('grok_not_configured', t0);
  if (!image?.length) return failure('empty_image', t0);
  if (image.length > MAX_IMAGE_BYTES) return failure('image_too_large', t0);
  const type = /png/i.test(mime) ? 'image/png' : /webp/i.test(mime) ? 'image/webp' : 'image/jpeg';
  const f = cfg.fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 90_000);
  try {
    const r = await f(cfg.url || 'https://api.x.ai/v1/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, temperature: 0, reasoning_effort: 'low', response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${type};base64,${image.toString('base64')}`, detail: 'high' } },
          { type: 'text', text: buildGrokIdPrompt() },
        ] }],
      }),
    });
    if (!r.ok) return failure(`grok_http_${r.status}`, t0, model);
    const data: any = await r.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
    const { value, errors } = validateGrokIdJson(text);
    if (!value) return { ...failure('grok_bad_json', t0, data?.model || model), reasons: ['grok_bad_json', ...errors] };
    const d = decideIdScan(value, opts);
    if (errors.length) d.reasons.push(...errors.map((e) => `schema:${e}`));
    const decision = errors.length && d.decision === 'accept' ? 'manual_review' : d.decision;
    return { ok: true, decision, reasons: d.reasons, extraction: value, checks: d.checks, model: data?.model || model, latency_ms: Date.now() - t0 };
  } catch (e: any) {
    return failure(e?.name === 'AbortError' ? 'grok_timeout' : 'grok_network_error', t0, model);
  } finally {
    clearTimeout(timer);
  }
}
