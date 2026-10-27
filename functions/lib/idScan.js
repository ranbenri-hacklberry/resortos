// Guest ID scan via Grok vision (Ran 2026-10-24). Mirrors services/resortos-agent/src/idValidation/grokIdScan.ts.
// Grok returns strict JSON; the system decides. Stores only decision + name + reasons (never number or image).
const DOC_TYPES = ['israeli_id_biometric', 'israeli_id_blue', 'israeli_driver_license', 'passport', 'other', 'not_an_id'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function idScanPrompt() {
  return [
    'You are an identity-document data extractor for a hotel check-in in Israel.',
    'Read the document in the image and return STRICT JSON only (no markdown, no prose) with exactly these keys:',
    '{"document_type":"israeli_id_biometric"|"israeli_id_blue"|"israeli_driver_license"|"passport"|"other"|"not_an_id",',
    '"id_number":string|null,"first_name":string|null,"last_name":string|null,"first_name_en":string|null,"last_name_en":string|null,',
    '"date_of_birth":"YYYY-MM-DD"|null,"expiry_date":"YYYY-MM-DD"|null,"gender":"M"|"F"|null,"nationality":string|null,',
    '"confidence":number,"issues":string[]}',
    'Rules:',
    '- "id_number": Israeli ID = the 9-digit מספר זהות (digits only, keep leading zeros). Driver license: the holder ID number. Passport: passport number.',
    '- first_name/last_name exactly as printed in the original script. *_en = Latin-script names if printed, else null.',
    '- Dates as YYYY-MM-DD (Israeli cards print DD.MM.YYYY). Unreadable = null. NEVER guess digits or letters.',
    '- "not_an_id" for credit/club/gym/loyalty cards, Rav-Kav, badges, or no document. "other" for a different official ID.',
    '- "confidence" 0..1 for ALL fields. "issues": short codes e.g. "blurry","glare","cropped","partially_hidden","photo_of_screen","possible_tampering","back_side_only","multiple_documents"; [] if none.',
  ].join('\n');
}

export function israeliIdValid(id) {
  const d = String(id || '').replace(/\D/g, '');
  if (!d || d.length > 9 || /^0+$/.test(d)) return false;
  const p = d.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) { let v = Number(p[i]) * (i % 2 ? 2 : 1); if (v > 9) v -= 9; sum += v; }
  return sum % 10 === 0;
}

const str = (v, max = 80) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);
const date = (v) => {
  const s = str(v, 10);
  if (!s || !DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

export function parseIdJson(text) {
  let data;
  try { const t = String(text || '').trim(); const m = t.match(/\{[\s\S]*\}/); data = JSON.parse(m ? m[0] : t); } catch { return null; }
  if (!data || typeof data !== 'object' || !DOC_TYPES.includes(data.document_type)) return null;
  const conf = Number(data.confidence);
  if (typeof data.confidence !== 'number' || !(conf >= 0 && conf <= 1)) return null;
  const raw = str(data.id_number, 20);
  const foreign = data.document_type === 'passport' || data.document_type === 'other';
  return {
    document_type: data.document_type,
    id_number: raw ? (foreign ? raw.replace(/[\s-]/g, '').toUpperCase() : raw.replace(/\D/g, '') || null) : null,
    first_name: str(data.first_name), last_name: str(data.last_name),
    first_name_en: str(data.first_name_en), last_name_en: str(data.last_name_en),
    date_of_birth: date(data.date_of_birth), expiry_date: date(data.expiry_date),
    confidence: conf,
    issues: Array.isArray(data.issues) ? data.issues.map((i) => str(i, 40)).filter(Boolean).slice(0, 10) : []
  };
}

const FINAL = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0591-\u05C7\u0300-\u036f]/g, '')
  .replace(/[׳'"`״.\-_,]/g, ' ').replace(/[ךםןףץ]/g, (c) => FINAL[c]).split(/\s+/).filter((w) => w.length > 1);

export function nameMatch(ex, bookingName) {
  const b = words(bookingName);
  if (!b.length) return 'unknown';
  const sets = [[ex.first_name, ex.last_name], [ex.first_name_en, ex.last_name_en]].map((p) => words(p.filter(Boolean).join(' '))).filter((w) => w.length);
  if (!sets.length) return 'unknown';
  let best = 0;
  for (const w of sets) best = Math.max(best, b.filter((x) => w.includes(x)).length / Math.max(1, Math.min(b.length, w.length)));
  return best >= 0.99 ? 'exact' : best > 0 ? 'partial' : 'none';
}

export function decideId(ex, { bookingGuestName = '', today = new Date().toISOString().slice(0, 10), minConfidence = 0.8 } = {}) {
  const reasons = [];
  if (ex.document_type === 'not_an_id') return { decision: 'reject', reasons: ['not_an_official_id'] };
  const israeli = ex.document_type.startsWith('israeli_');
  const checksum = israeli ? Boolean(ex.id_number && israeliIdValid(ex.id_number)) : null;
  const serious = ex.issues.filter((i) => /tamper|screen|multiple/.test(i));
  reasons.push(...serious.map((i) => `issue:${i}`));
  if (!ex.id_number) reasons.push('id_number_missing');
  if (israeli && ex.id_number && checksum === false) reasons.push('israeli_id_checksum_failed');
  if (!ex.first_name && !ex.first_name_en) reasons.push('name_missing');
  if (ex.expiry_date && ex.expiry_date < today) reasons.push('document_expired');
  if (ex.confidence < minConfidence) reasons.push('low_confidence');
  if (ex.issues.some((i) => /blur|glare|crop|hidden|back_side/.test(i))) reasons.push('image_quality');
  if (ex.document_type === 'other') reasons.push('unsupported_document_type');
  const nm = nameMatch(ex, bookingGuestName);
  if (nm === 'none') reasons.push('name_mismatch_with_booking');
  if (nm === 'partial') reasons.push('name_partial_match');
  if ((checksum === false && ex.id_number && ex.confidence >= minConfidence) || serious.some((i) => /tamper/.test(i))) return { decision: 'reject', reasons, name_match: nm };
  return { decision: reasons.length ? 'manual_review' : 'accept', reasons, name_match: nm };
}

function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }

/** Returns the stored summary: { decision, name, reasons, name_match, document_type, scanned_at }. Never throws. */
export async function scanGuestId(env, bytes, mime, bookingGuestName, fetchImpl = fetch) {
  const at = new Date().toISOString();
  const fail = (code) => ({ decision: 'manual_review', name: null, reasons: [code], name_match: 'unknown', document_type: null, scanned_at: at });
  const key = env?.XAI_API_KEY;
  if (!key) return fail('grok_not_configured');
  if (!bytes?.length) return fail('empty_image');
  try {
    const r = await fetchImpl('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(60000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env.ID_SCAN_GROK_MODEL || 'grok-4.7', temperature: 0, reasoning_effort: 'low', response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${mime || 'image/jpeg'};base64,${b64(bytes)}`, detail: 'high' } },
          { type: 'text', text: idScanPrompt() }
        ] }]
      })
    });
    if (!r.ok) return fail(`grok_http_${r.status}`);
    const data = await r.json().catch(() => null);
    const c = data?.choices?.[0]?.message?.content;
    const ex = parseIdJson(typeof c === 'string' ? c : JSON.stringify(c ?? ''));
    if (!ex) return fail('grok_bad_json');
    const d = decideId(ex, { bookingGuestName });
    const name = [ex.first_name || ex.first_name_en, ex.last_name || ex.last_name_en].filter(Boolean).join(' ') || null;
    return { decision: d.decision, name, reasons: d.reasons.slice(0, 8), name_match: d.name_match || 'unknown', document_type: ex.document_type, scanned_at: at };
  } catch (e) {
    return fail(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'grok_timeout' : 'grok_network_error');
  }
}
