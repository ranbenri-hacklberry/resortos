import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import { resolveRoomByAlias } from './llm/client.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Ran 2026-10-28 ("כן תחילי"): workers with allowed_units only see/get their units; empty = as before.
const ABU = '972500000101';
const TAO = '972500000102';
const RAMOT = ['k671','k673','k674','k675','k676','k677','k678','k679','k808','k809','k810','k811','k680','k681','k682','k683','k684','k685','k686','k687','k688','k689','k690','k691','k692','k693','k694','k695'];
const rooms = ((realRooms as any).rooms || realRooms) as any[];
const aliasOf = (id: string) => { const r = rooms.find((x) => x.id === id); return [r?.name, ...(r?.aliases || [])].find((a: string) => a && resolveRoomByAlias(a, rooms) === id) as string; };
function makeDeps(): PipelineDeps & { sent: Array<{ jid: string; text: string }> } {
  const sent: Array<{ jid: string; text: string }> = [];
  return Object.assign({
    send: vi.fn(async (jid: string, text: string) => void sent.push({ jid, text })),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn(async (t: string) => t) },
    resortos: { markRoomReady: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn(), listUnits: vi.fn(async () => []), listBookings: vi.fn(async () => []) },
    cleaners: () => [
      { phone: ABU, name: 'אבו', role: 'WORK_LEAD', language: 'he', allowedUnits: RAMOT },
      { phone: TAO, name: 'טאו', role: 'HOUSEKEEPING', language: 'he' },
    ],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  } as any, { sent });
}
const msg = (from: string, text: string) => ({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }) as any;

describe('worker allowed_units scope', () => {
  it('scoped worker (אבו, Ramot) is refused a non-Ramot room', async () => {
    const deps = makeDeps(); const p = createPipeline(deps);
    await p.handleInbound(msg(ABU, aliasOf('suite-1')));
    expect(deps.sent[0].text).toContain('לא באזור האחריות שלך');
  });
  it('scoped worker still gets a Ramot room normally', async () => {
    const deps = makeDeps(); const p = createPipeline(deps);
    await p.handleInbound(msg(ABU, aliasOf('k693')));
    expect(deps.sent.map((s) => s.text).join('\n')).not.toContain('לא באזור האחריות שלך');
  });
  it('unscoped worker (טאו) behaves as before for the same non-Ramot room', async () => {
    const deps = makeDeps(); const p = createPipeline(deps);
    await p.handleInbound(msg(TAO, aliasOf('suite-1')));
    expect(deps.sent.map((s) => s.text).join('\n')).not.toContain('לא באזור האחריות שלך');
  });
  it('dispatch of a non-Ramot room to a scoped worker is blocked; unscoped worker gets it', async () => {
    const deps = makeDeps(); const p = createPipeline(deps);
    await expect(p.handleDispatch({ cleaner_phone: ABU, message_he: aliasOf('suite-1') })).rejects.toMatchObject({ status: 409 });
    expect(deps.sent).toHaveLength(0);
    await p.handleDispatch({ cleaner_phone: ABU, message_he: aliasOf('k693') });
    await p.handleDispatch({ cleaner_phone: TAO, message_he: aliasOf('suite-1') });
    expect(deps.sent).toHaveLength(2);
  });
});
