import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import { applyLiveRoles } from './staff/liveStaff.js';
import { resolveRoomByAlias } from './llm/client.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Ran 2026-10-28: managers see only their ResortOS allowed_units (empty = everything).
const BARAK = '972515262609';
const RANI = '972548317887';
const RAMOT = ['k671','k673','k674','k675','k676','k677','k678','k679','k808','k809','k810','k811','k680','k681','k682','k683','k684','k685','k686','k687','k688','k689','k690','k691','k692','k693','k694','k695'];
const rooms = ((realRooms as any).rooms || realRooms) as any[];
const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(Date.now() + 864e5));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const bookings = [
  { id: 'b1', unit_id: 'k693', check_in_date: tomorrow, check_out_date: '2099-12-31', booking_status: 'CONFIRMED', adults_count: 2 },
  { id: 'b2', unit_id: 'suite-1', check_in_date: tomorrow, check_out_date: '2099-12-31', booking_status: 'CONFIRMED', adults_count: 2 },
];
const units = [
  { id: 'k693', operational_status: 'DIRTY' },
  { id: 'suite-1', operational_status: 'DIRTY' },
];
function makeDeps(): PipelineDeps & { sent: string[] } {
  const sent: string[] = [];
  return Object.assign({
    send: vi.fn(async (_j: string, t: string) => void sent.push(t)),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn(async (t: string) => t) },
    resortos: { markRoomReady: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn(), listUnits: vi.fn(async () => units), listBookings: vi.fn(async () => bookings) },
    cleaners: () => [
      { phone: BARAK, name: 'ברק', role: 'OPS_MANAGER', language: 'he', allowedUnits: RAMOT },
      { phone: RANI, name: 'רני', role: 'MANAGER', language: 'he' },
    ],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  } as any, { sent });
}
const msg = (from: string, text: string) => ({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }) as any;

describe('allowed_units scope', () => {
  it('Barak (Ramot only): "כולם" lists only Ramot arrivals', async () => {
    const deps = makeDeps(); const p = createPipeline(deps);
    await p.handleInbound(msg(BARAK, 'כניסות מחר'));
    await p.handleInbound(msg(BARAK, 'כולם'));
    expect(deps.sent[1]).toContain('כניסות בבקתות מאיה');
    expect(deps.sent[1]).not.toMatch(/מיאליס|סוויטה/);
  });
  it('Barak asking about a non-Ramot complex is refused politely', async () => {
    const deps = makeDeps(); const p = createPipeline(deps);
    await p.handleInbound(msg(BARAK, 'כניסות מחר במיאליס'));
    expect(deps.sent[0]).toContain('לא באזור האחריות שלך');
  });
  it('Barak asking for a non-Ramot room card is refused', async () => {
    const suite = rooms.find((r) => r.id === 'suite-1');
    const alias = [suite?.name, ...(suite?.aliases || [])].find((a: string) => a && resolveRoomByAlias(a, rooms) === 'suite-1');
    expect(alias).toBeTruthy();
    const deps = makeDeps(); const p = createPipeline(deps);
    await p.handleInbound(msg(BARAK, alias));
    expect(deps.sent[0]).toContain('לא באזור האחריות שלך');
  });
  it('Barak cleaning status shows only Ramot units', async () => {
    const deps = makeDeps(); const p = createPipeline(deps);
    await p.handleInbound(msg(BARAK, 'מה ממתין לניקיון'));
    expect(deps.sent[0]).toContain('סטטוס ניקיונות');
    expect(deps.sent[0]).toMatch(/מאיה/);
    expect(deps.sent[0]).not.toMatch(/סוויטה|מיאליס/);
  });
  it('full-access manager (no allowed_units) still sees everything', async () => {
    const deps = makeDeps(); const p = createPipeline(deps);
    await p.handleInbound(msg(RANI, 'כניסות מחר'));
    await p.handleInbound(msg(RANI, 'כולם'));
    expect(deps.sent[1]).toContain('כניסות בבקתות מאיה');
    expect(deps.sent[1]).toMatch(/מיאליס/);
    await p.handleInbound(msg(RANI, 'מה ממתין לניקיון'));
    expect(deps.sent[2]).toMatch(/סוויטה|מיאליס/);
  });
  it('live staff: allowed_units copied; empty list means no scope', () => {
    const merged = applyLiveRoles(
      [{ phone: BARAK, name: 'ברק', language: 'he' } as any, { phone: RANI, name: 'רני', language: 'he' } as any],
      [{ id: '1', name: 'ברק', role: 'OPS_MANAGER', phones: ['0515262609'], allowed_units: RAMOT }, { id: '2', name: 'רני', role: 'MANAGER', phones: ['0548317887'], allowed_units: [] }],
    );
    expect(merged[0].allowedUnits).toEqual(RAMOT);
    expect(merged[1].allowedUnits).toBeUndefined();
  });
});
