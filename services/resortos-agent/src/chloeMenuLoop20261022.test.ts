import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Menu-loop regression (Ran 2026-10-22): "נורית 4" → "3" opened Nurit 3 instead of option 3 for Nurit 4,
// because roomMenuShownAt was stored by phone tail but read by the channel-prefixed session key.
const MANAGER = '972548317887';
const LID = '170600000000001@lid';

function makeDeps(): PipelineDeps & { sent: string[] } {
  const sent: string[] = [];
  const rooms = ((realRooms as any).rooms || realRooms) as any[];
  return Object.assign({
    send: vi.fn(async (_j: string, t: string) => void sent.push(t)),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn(async (t: string) => t) },
    resortos: {
      markRoomReady: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn(), updateUnitStatus: vi.fn(),
      listUnits: vi.fn(async () => []), listBookings: vi.fn(async () => []),
    },
    cleaners: () => [{ phone: MANAGER, name: 'רני', role: 'MANAGER', language: 'he' }],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  } as any, { sent });
}
const lidMsg = (text: string) => ({
  key: { remoteJid: LID, fromMe: false, senderPn: `${MANAGER}@s.whatsapp.net` },
  message: { conversation: text },
}) as any;

async function run(choice: string) {
  const deps = makeDeps();
  const p = createPipeline(deps);
  await p.handleInbound(lidMsg('נורית 4'), 'resortos' as any);
  const first = deps.sent.join('\n');
  const nurit4 = (p.getSession(MANAGER) as any)?.roomId;
  deps.sent.length = 0;
  await p.handleInbound(lidMsg(choice), 'resortos' as any);
  return { first, reply: deps.sent.join('\n'), nurit4, session: p.getSession(MANAGER) as any, deps };
}

describe('menu loop: @lid manager answers the room menu with a bare number', () => {
  it('"נורית 4" → "3" opens the issue menu for Nurit 4', async () => {
    const { first, reply, nurit4, session } = await run('3');
    expect(first).toContain('בתי נורית 4');
    expect(nurit4).toBeTruthy();
    expect(reply).not.toContain('נבחר: *בתי נורית 3*');
    expect(reply).toContain('מה לדווח על בתי נורית 4');
    expect(session).toMatchObject({ state: 'AWAITING_ISSUE_KIND', roomId: nurit4 });
  });
  it('"1" opens the status picker for Nurit 4', async () => {
    const { reply, nurit4, session, deps } = await run('1');
    expect(reply).not.toContain('נבחר: *בתי נורית 1*');
    expect(reply).toContain('בחר סטטוס חדש לחדר בתי נורית 4');
    expect(session).toMatchObject({ state: 'SELECT_STATUS', roomId: nurit4 });
    expect(deps.resortos.updateUnitStatus).not.toHaveBeenCalled();
  });
  it('"2" asks for a note on Nurit 4', async () => {
    const { reply, nurit4, session } = await run('2');
    expect(reply).not.toContain('נבחר: *בתי נורית 2*');
    expect(reply).toContain('בתי נורית 4');
    expect(session).toMatchObject({ state: 'AWAITING_ROOM_NOTE', roomId: nurit4 });
  });
  it('"4" starts the guest link for Nurit 4, not Nurit 4 re-selected or another room', async () => {
    const { reply } = await run('4');
    expect(reply).not.toContain('נבחר:');
    expect(reply).not.toContain('זיהיתי:');
  });
});

describe('bug A with a real channel-prefixed session key', () => {
  it('session is stored under the "resortos:" key and a bare number still answers the last menu', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    for (const q of ['נורית', '1', '1']) await p.handleInbound(lidMsg(q), 'resortos' as any);
    deps.sent.length = 0;
    await p.handleInbound(lidMsg('נורית 3'), 'resortos' as any);
    const nurit3 = (p.getSession(MANAGER) as any)?.roomId;
    deps.sent.length = 0;
    await p.handleInbound(lidMsg('1'), 'resortos' as any);
    expect(deps.sent.join('\n')).toContain('בחר סטטוס חדש לחדר בתי נורית 3');
    expect(p.getSession(MANAGER)).toMatchObject({ roomId: nurit3 });
  });
});
