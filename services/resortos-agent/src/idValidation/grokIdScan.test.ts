import { describe, it, expect } from 'vitest';
import { scanIdWithGrok, validateGrokIdJson, decideIdScan, matchGuestName } from './grokIdScan.js';

// Synthetic data only (test ID 000000018 is checksum-valid, not a real person).
const base = { document_type: 'israeli_id_biometric', id_number: '000000018', first_name: 'ישראל', last_name: 'ישראלי',
  first_name_en: 'ISRAEL', last_name_en: 'ISRAELI', date_of_birth: '1990-01-01', expiry_date: '2030-01-01', gender: 'M',
  nationality: 'ISR', confidence: 0.95, issues: [] };
const mock = (body: unknown, status = 200) => (async () => new Response(JSON.stringify({ model: 'grok-test', choices: [{ message: { content: typeof body === 'string' ? body : JSON.stringify(body) } }] }), { status })) as unknown as typeof fetch;
const img = Buffer.from('synthetic');
const cfg = (b: unknown, s = 200) => ({ apiKey: 'test', fetchImpl: mock(b, s) });

describe('grokIdScan', () => {
  it('accepts a clean Israeli ID matching the booking', async () => {
    const r = await scanIdWithGrok(img, 'image/jpeg', { bookingGuestName: 'ישראל ישראלי', today: '2026-10-24' }, cfg(base));
    expect(r.decision).toBe('accept');
    expect(r.checks.checksum_valid).toBe(true);
    expect(r.checks.name_match?.level).toBe('exact');
  });
  it('matches English booking name against Hebrew card via *_en', () => {
    expect(matchGuestName(base as any, 'Israel Israeli').level).toBe('exact');
    expect(matchGuestName(base as any, 'Dana Cohen').level).toBe('none');
  });
  it('rejects a checksum failure on a clearly read ID', async () => {
    const r = await scanIdWithGrok(img, 'image/jpeg', { today: '2026-10-24' }, cfg({ ...base, id_number: '000000019' }));
    expect(r.decision).toBe('reject');
    expect(r.reasons).toContain('israeli_id_checksum_failed');
  });
  it('sends name mismatch / expired / low confidence to manual review', async () => {
    const r = await scanIdWithGrok(img, 'image/jpeg', { bookingGuestName: 'דנה כהן', today: '2031-01-01' }, cfg({ ...base, confidence: 0.5 }));
    expect(r.decision).toBe('manual_review');
    expect(r.reasons).toEqual(expect.arrayContaining(['document_expired', 'low_confidence', 'name_mismatch_with_booking']));
  });
  it('rejects non-ID cards', async () => {
    const r = await scanIdWithGrok(img, 'image/jpeg', {}, cfg({ ...base, document_type: 'not_an_id', id_number: null }));
    expect(r.decision).toBe('reject');
  });
  it('passport skips Israeli checksum', () => {
    const d = decideIdScan({ ...(base as any), document_type: 'passport', id_number: 'AB1234567' }, { today: '2026-10-24' });
    expect(d.checks.checksum_valid).toBeNull();
    expect(d.decision).toBe('accept');
  });
  it('schema validation rejects garbage', () => {
    expect(validateGrokIdJson('not json').value).toBeNull();
    expect(validateGrokIdJson('{"document_type":"x","confidence":2}').value).toBeNull();
    expect(validateGrokIdJson('{"document_type":"passport","confidence":0.9,"date_of_birth":"01.01.1990"}').errors).toContain('bad_date_of_birth');
  });
  it('errors are graceful (manual review, no throw)', async () => {
    expect((await scanIdWithGrok(img, 'image/jpeg', {}, cfg(base, 500))).error).toBe('grok_http_500');
    expect((await scanIdWithGrok(img, 'image/jpeg', {}, cfg('oops'))).reasons[0]).toBe('grok_bad_json');
    expect((await scanIdWithGrok(img, 'image/jpeg', {}, { apiKey: '' })).error).toBe('grok_not_configured');
    const boom = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    const r = await scanIdWithGrok(img, 'image/jpeg', {}, { apiKey: 'x', fetchImpl: boom });
    expect(r.decision).toBe('manual_review');
  });
});
