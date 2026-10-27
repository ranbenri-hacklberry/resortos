import { describe, it } from "node:test";
import assert from "node:assert/strict";
const expect = (v) => ({ toBe: (e) => assert.equal(v, e), toEqual: (e) => assert.deepEqual(v, e), toBeNull: () => assert.equal(v, null), not: { toContain: (e) => assert.ok(!String(v).includes(e)) } });
import { decideId, parseIdJson, scanGuestId, israeliIdValid } from './idScan.js';
import { runGuestIdScan } from '../api/checkout/[[path]].js';
// Synthetic data only.
const ex = { document_type: 'israeli_id_biometric', id_number: '000000018', first_name: 'ישראל', last_name: 'ישראלי', first_name_en: null, last_name_en: null, expiry_date: '2030-01-01', confidence: 0.95, issues: [] };
const grok = (content, status = 200) => async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status });
describe('functions idScan', () => {
  it('checksum', () => { expect(israeliIdValid('000000018')).toBe(true); expect(israeliIdValid('000000019')).toBe(false); });
  it('decides accept / review / reject', () => {
    expect(decideId(ex, { bookingGuestName: 'ישראל ישראלי', today: '2026-10-24' }).decision).toBe('accept');
    expect(decideId(ex, { bookingGuestName: 'דנה כהן', today: '2026-10-24' }).decision).toBe('manual_review');
    expect(decideId({ ...ex, id_number: '000000019' }, { today: '2026-10-24' }).decision).toBe('reject');
    expect(decideId({ ...ex, document_type: 'not_an_id' }).decision).toBe('reject');
  });
  it('schema', () => { expect(parseIdJson('x')).toBeNull(); expect(parseIdJson('{"document_type":"passport","confidence":5}')).toBeNull(); });
  it('scan stores no number', async () => {
    const s = await scanGuestId({ XAI_API_KEY: 'test' }, new Uint8Array([1, 2, 3]), 'image/jpeg', 'ישראל ישראלי', grok(ex));
    expect(s.decision).toBe('accept'); expect(s.name).toBe('ישראל ישראלי'); expect(JSON.stringify(s)).not.toContain('000000018');
  });
  it('graceful without key / http error', async () => {
    expect((await scanGuestId({}, new Uint8Array([1]), 'image/jpeg', '')).reasons).toEqual(['grok_not_configured']);
    expect((await scanGuestId({ XAI_API_KEY: 't' }, new Uint8Array([1]), 'image/jpeg', '', grok(ex, 500))).reasons).toEqual(['grok_http_500']);
  });
  it('runGuestIdScan never throws', async () => {
    expect(await runGuestIdScan({}, 'tok', new Uint8Array([1]), 'image/jpeg', '', 'x', async () => { throw new Error('x'); })).toBeNull();
  });
});
