import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

const MANAGER = '972548317887';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

function makeDeps(units: any[] = [], bookings: any[] = []): PipelineDeps & { sent: string[] } {
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
      listUnits: vi.fn(async () => units), listBookings: vi.fn(async () => bookings),
    },
    cleaners: () => [{ phone: MANAGER, name: 'רני', role: 'MANAGER', language: 'he' }],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  } as any, { sent });
}
const msg = (text: string) => ({ key: { remoteJid: `${MANAGER}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }) as any;

describe('bug A: a number answers the most recent menu', () => {
  it('"נורית" → 1 → 1 → "נורית 3" → "1" opens the status picker for Nurit 3', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    const replies: string[] = [];
    for (const q of ['נורית', '1', '1', 'נורית 3', '1']) {
      deps.sent.length = 0;
      await p.handleInbound(msg(q));
      replies.push(deps.sent.join('\n'));
    }
    expect(replies[0]).toContain('באיזו יחידה');
    expect(replies[1]).toContain('בתי נורית 1');
    expect(replies[2]).toContain('בחר סטטוס חדש לחדר בתי נורית 1');
    expect(replies[3]).toContain('בתי נורית 3');
    expect(replies[4]).toContain('בחר סטטוס חדש לחדר בתי נורית 3');
    expect(replies[4]).not.toContain('נבחר: *בתי נורית 1*');
    expect(p.getSession(MANAGER)).toMatchObject({ roomId: 'k674' });
    expect(deps.resortos.updateUnitStatus).not.toHaveBeenCalled();
  });
});

describe('bug B: complex unit list shows the current status', () => {
  it('shows "בשהייה" / cleaning status next to units, and nothing when unknown', async () => {
    const deps = makeDeps(
      [{ id: 'k673', operational_status: 'DIRTY' }],
      [{ id: 'b1', unit_id: 'k671', guest_name: 'אורח', check_in_date: '2000-01-01', check_out_date: '2099-12-31', booking_status: 'CONFIRMED' }],
    );
    await createPipeline(deps).handleInbound(msg('נורית'));
    const t = deps.sent[0];
    expect(t).toContain('*1* - בתי נורית 1 · בשהייה');
    expect(t).toContain('*2* - בתי נורית 2 · ממתין לניקיון');
    expect(t).toMatch(/\*3\* - בתי נורית 3\n/);
  });
  it('omits statuses gracefully when the data source fails', async () => {
    const deps = makeDeps();
    (deps.resortos as any).listUnits = vi.fn(async () => { throw new Error('401'); });
    await createPipeline(deps).handleInbound(msg('נורית'));
    expect(deps.sent[0]).toMatch(/\*1\* - בתי נורית 1\n/);
  });
});
void today;
