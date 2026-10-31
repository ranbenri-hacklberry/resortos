import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Ran 2026-10-28: "כניסות מחר" → "על איזה מתחם?" → "כולם" must answer, not ask again.
const MANAGER = '972548317887';
function makeDeps(bookings: any[] = []): PipelineDeps & { sent: string[] } {
  const sent: string[] = [];
  const rooms = ((realRooms as any).rooms || realRooms) as any[];
  return Object.assign({
    send: vi.fn(async (_j: string, t: string) => void sent.push(t)),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn(async (t: string) => t) },
    resortos: { markRoomReady: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn(), listUnits: vi.fn(async () => []), listBookings: vi.fn(async () => bookings) },
    cleaners: () => [{ phone: MANAGER, name: 'רני', role: 'MANAGER', language: 'he' }],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  } as any, { sent });
}
const msg = (text: string) => ({ key: { remoteJid: `${MANAGER}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }) as any;

describe('pending "על איזה מתחם?" query', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['כולם', 'הכל', 'כל המתחמים', 'בכל המתחמים'])('"%s" gives the all-complexes arrivals list', async (reply) => {
    const deps = makeDeps(); const p = createPipeline(deps);
    await p.handleInbound(msg('כניסות מחר'));
    expect(deps.sent[0]).toContain('על איזה מתחם');
    await p.handleInbound(msg(reply));
    expect(deps.sent[1]).toBe('אין כניסות מחר.');
  });
  it('a complex name answers for that complex only', async () => {
    const deps = makeDeps(); const p = createPipeline(deps);
    await p.handleInbound(msg('כניסות מחר'));
    await p.handleInbound(msg('בתי נורית'));
    expect(deps.sent[1]).toContain('אין כניסות בבתי נורית');
    expect(deps.sent[1]).not.toContain('מאיה');
  });
  it('"כולם" lists only rooms/complexes with arrivals', async () => {
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(Date.now() + 864e5));
    const deps = makeDeps([{ id: 'b1', unit_id: 'k671', check_in_date: tomorrow, check_out_date: '2099-12-31', booking_status: 'CONFIRMED', adults_count: 2 }]);
    const p = createPipeline(deps);
    await p.handleInbound(msg('כניסות מחר'));
    await p.handleInbound(msg('כולם'));
    expect(deps.sent[1]).toContain('📋 *כניסות בבתי נורית (מחר):*');
    expect(deps.sent[1]).toContain('• בתי נורית 1: כניסה');
    expect(deps.sent[1]).not.toContain('אין כניסה');
    expect((deps.sent[1].match(/📋/g) || []).length).toBe(1);
  });
  it('an unrelated reply falls through and the pending query is dropped', async () => {
    const deps = makeDeps(); const p = createPipeline(deps);
    await p.handleInbound(msg('כניסות מחר'));
    await p.handleInbound(msg('שלום'));
    expect(deps.sent[1] || '').not.toContain('📋');
    const n = deps.sent.length;
    await p.handleInbound(msg('כולם'));
    expect(deps.sent.slice(n).join('\n')).not.toContain('📋 *כניסות');
  });
  it('expired pending query (>10 min) is ignored', async () => {
    const deps = makeDeps(); const p = createPipeline(deps);
    const t0 = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(t0);
    await p.handleInbound(msg('כניסות מחר'));
    spy.mockReturnValue(t0 + 11 * 60 * 1000);
    await p.handleInbound(msg('כולם'));
    expect(deps.sent.slice(1).join('\n')).not.toContain('📋 *כניסות');
  });
});
