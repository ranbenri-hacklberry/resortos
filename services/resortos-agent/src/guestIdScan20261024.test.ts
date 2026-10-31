import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scanMock = vi.fn();
vi.mock('./idValidation/grokIdScan.js', () => ({ scanIdWithGrok: (...a: unknown[]) => scanMock(...a) }));
import { createPipeline, type PipelineDeps } from './pipeline.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Fictitious booking + synthetic image bytes only.
const PHONE = '972500000001';
const jid = `${PHONE}@s.whatsapp.net`;
const room = (realRooms as any[])[0];
const today = new Date().toISOString().slice(0, 10);
const booking = { id: 'test_idscan_1', unit_id: room.id, guest_name: 'ישראל ישראלי', guest_phone: '0500000001', check_in_date: today, check_out_date: '2099-01-01', booking_status: 'CONFIRMED' };
const accept = { ok: true, decision: 'accept', reasons: [], extraction: { document_type: 'israeli_id_biometric', id_number: '000000018', first_name: 'ישראל', last_name: 'ישראלי' }, checks: { is_official: true } };

function makeDeps() {
  const sent: Array<[string, string]> = [];
  const deps = {
    send: vi.fn(async (j: string, t: string) => void sent.push([j, t])),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? m.message?.imageMessage?.caption ?? null,
    transcribe: vi.fn(), llm: { extractIntent: vi.fn(), translateTask: vi.fn() },
    resortos: { listBookings: vi.fn(async () => [booking]) } as any,
    downloadMedia: vi.fn(async () => ({ buffer: Buffer.from('synthetic'), mimetype: 'image/jpeg' })),
    cleaners: () => [], rooms: () => realRooms as any, log: { info() {}, warn() {}, error() {} },
  } as unknown as PipelineDeps;
  return Object.assign(deps, { sent });
}
const textMsg = (t: string) => ({ key: { remoteJid: jid, fromMe: false, id: Math.random().toString(36) }, message: { conversation: t } }) as any;
const imgMsg = () => ({ key: { remoteJid: jid, fromMe: false, id: Math.random().toString(36) }, message: { imageMessage: { mimetype: 'image/jpeg' } } }) as any;

describe('guest ID scan via WhatsApp (Ran 2026-10-24)', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'idscan-')); process.env.GUEST_ID_STORE_DIR = dir; process.env.CHLOE_GUEST_ID_SCAN = '1'; scanMock.mockReset(); });

  it('identified guest without ID is asked once to photograph it', async () => {
    vi.useFakeTimers();
    const d = makeDeps(); const p = createPipeline(d);
    await p.handleInbound(textMsg('מה הקוד לוויפי?'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(d.sent.filter(([, t]) => t.includes('תעודת הזהות')).length).toBe(1);
    await p.handleInbound(textMsg('תודה'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(d.sent.filter(([, t]) => t.includes('תעודת הזהות')).length).toBe(1);
    vi.useRealTimers();
  });
  it('ID photo is scanned, stored as decision+name only, guest thanked', async () => {
    scanMock.mockResolvedValue(accept);
    const d = makeDeps(); const p = createPipeline(d);
    const r = await p.handleInbound(imgMsg());
    expect(r.reason).toBe('guest_id_scan');
    expect(d.sent.at(-1)?.[1]).toContain('אומתה');
    const store = readFileSync(path.join(dir, 'guest-id-scans.json'), 'utf8');
    expect(JSON.parse(store)[booking.id]).toMatchObject({ decision: 'accept', name: 'ישראל ישראלי' });
    expect(store).not.toContain('000000018');
  });
  it('feature flag off → no scan, no ask', async () => {
    process.env.CHLOE_GUEST_ID_SCAN = '0';
    const d = makeDeps(); const p = createPipeline(d);
    await p.handleInbound(textMsg('שלום'));
    expect(scanMock).not.toHaveBeenCalled();
    expect(existsSync(path.join(dir, 'guest-id-scans.json'))).toBe(false);
  });
});
