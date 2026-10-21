import { describe, it, expect, vi, afterEach } from 'vitest';
import { planNameCrops, rateHebrewName, suggestIdNames, idNameSuggestEnabled, type BoxToken } from './idNameSuggest.js';
import { parseIsraeliIdTokens } from './appleVisionOcr.js';

// Synthetic OCR boxes (labels only, no real person data) — no ID images are used or generated.
const toks: BoxToken[] = [
  { text: 'دولة اسرائيل', x: 0.5, y: 0.9, w: 0.3, h: 0.04 },
  { text: 'اسم العائلة', x: 0.7, y: 0.7, w: 0.2, h: 0.04 },
  { text: 'الاسم الشخصي', x: 0.7, y: 0.55, w: 0.22, h: 0.04 },
  { text: '000000018', x: 0.3, y: 0.8, w: 0.2, h: 0.04 },
];
const ok = { boxes: async () => toks, crop: async (_p: string, c: any[]) => c.map((x) => ({ id: x.id, png: Buffer.from(x.field) })) };

describe('ID name suggestions (flagged, never trusted)', () => {
  afterEach(() => { delete process.env.CHLOE_ID_NAME_SUGGEST; });
  it('is off by default', () => { expect(idNameSuggestEnabled()).toBe(false); process.env.CHLOE_ID_NAME_SUGGEST = '1'; expect(idNameSuggestEnabled()).toBe(true); });
  it('locates Arabic/English name labels and plans value crops beside/below them', () => {
    const c = planNameCrops(toks);
    expect(c.map((x) => x.field).sort()).toEqual(['first', 'last']);
    for (const x of c) { expect(x.y1).toBeGreaterThan(x.y0); expect(x.x1).toBeGreaterThan(x.x0); }
    expect(planNameCrops([{ text: 'Surname', x: 0.1, y: 0.5, w: 0.1, h: 0.03 }])[0].field).toBe('last');
  });
  it('rates names: clean Hebrew → medium, noisy → low, NONE → null', () => {
    expect(rateHebrewName('ישראלי')).toEqual({ name: 'ישראלי', confidence: 'medium' });
    expect(rateHebrewName('שם משפחה: כהן')).toEqual({ name: 'כהן', confidence: 'medium' });
    expect(rateHebrewName('Cohen כהן')).toEqual({ name: 'כהן', confidence: 'low' });
    expect(rateHebrewName('NONE').name).toBeNull();
  });
  it('sequential transcription → suggestion with trusted:false', async () => {
    const order: string[] = [];
    const s = await suggestIdNames('img', { ...ok, transcribe: async (png) => { order.push(png.toString()); return png.toString() === 'first' ? 'ישראל' : 'ישראלי'; } });
    expect(order).toEqual(['first', 'last']);
    expect(s).toMatchObject({ suggested_first_name: 'ישראל', suggested_last_name: 'ישראלי', trusted: false, confidence: { first: 'medium', last: 'medium' } });
  });
  it('gemma error / timeout / guest priority → graceful fallback', async () => {
    expect((await suggestIdNames('img', { ...ok, transcribe: async () => { throw new Error('500'); } })).note).toMatch(/llm_error/);
    const t = await suggestIdNames('img', { ...ok, deadlineMs: 30, transcribe: (_p, _q, sig) => new Promise((_r, rej) => sig.addEventListener('abort', () => rej(new Error('a')))) });
    expect(t.note).toBe('timeout'); expect(t.suggested_first_name).toBeNull();
    const tr = vi.fn();
    expect((await suggestIdNames('img', { ...ok, busy: () => true, transcribe: tr })).note).toBe('skipped_guest_priority');
    expect(tr).not.toHaveBeenCalled();
    expect((await suggestIdNames('img', { boxes: async () => [], crop: ok.crop, transcribe: tr })).note).toBe('labels_not_found');
  });
  it('same text for both fields → low confidence', async () => {
    const s = await suggestIdNames('img', { ...ok, transcribe: async () => 'אבג' });
    expect(s.confidence).toEqual({ first: 'low', last: 'low' });
  });
  it('ID number parsing and check digit are unchanged by the feature', () => {
    const r = parseIsraeliIdTokens([{ text: 'מדינת ישראל', confidence: 1 }, { text: '000000018', confidence: 1 }]);
    expect(r.id_number).toBe('000000018');
    expect(r.name_suggestion).toBeUndefined();
  });
});
