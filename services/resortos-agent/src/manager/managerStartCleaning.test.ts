import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type PipelineDeps } from '../pipeline.js';
import type { CleanerProfile, RoomEntry } from '../config.js';
import { CLEANER_EXIT_MENU } from '../llm/prompts.js';

// Ran 2026-10-24: managers and ops managers can start cleaning after a room scan (option 7),
// in addition to all existing options, then continue with the same cleaner flow. Local simulation only.
const rooms: RoomEntry[] = [
  { id: 'k690', name: 'חצר מוזיקלית 1', property: 'חצר מוזיקלית', letterCode: 'D1', lockbox: '4321', aliases: ['d1'] } as any,
];

function makeDeps(who: CleanerProfile) {
  const sent: string[] = [];
  let status = 'DIRTY';
  const resortos = {
    markRoomReady: vi.fn(async () => ({ ok: true as const })),
    startCleaning: vi.fn(async () => { status = 'IN_PROGRESS'; return { ok: true as const }; }),
    reportMaintenance: vi.fn(async () => ({})),
    reportSupplies: vi.fn(async () => ({})),
    listUnits: vi.fn(async () => [{ id: 'k690', operational_status: status, staff_occupancy: 'VACANT' }]),
    listBookings: vi.fn(async () => []),
  };
  const deps: PipelineDeps = {
    send: vi.fn(async (_jid, text) => void sent.push(text)),
    isAudio: (m) => !!m.message?.audioMessage,
    extractText: (m) => m.message?.conversation ?? null,
    transcribe: vi.fn(async () => ({ text: '', language: 'he', duration_ms: 1 })),
    llm: { extractIntent: vi.fn(), translateTask: vi.fn() },
    resortos: resortos as any,
    cleaners: () => [who],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  };
  return { deps, sent, resortos };
}
const say = (p: any, from: string, text: string) =>
  p.handleInbound({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } } as any);

describe.each(['MANAGER', 'OPS_MANAGER'])('%s scan -> start cleaning (option 7)', (role) => {
  it('keeps options 1-6, adds 7, starts cleaning, then same exit flow', async () => {
    const who = { phone: '972500000001', name: 'בודק', role, language: 'he' } as any;
    const { deps, sent, resortos } = makeDeps(who);
    const p = createPipeline(deps);
    await say(p, who.phone, 'START_D1');
    const card = sent.at(-1)!;
    for (const opt of ['1 - שנה סטטוס', '2 - הוסף הערה', '3 - דווח אחזקה או חוסר', '4 - שליחת קישור לאורח', '5 - פרטי לקוח', '6 - פרטי רשת WiFi', '7 - התחל / סיים ניקיון']) {
      expect(card).toContain(opt);
    }
    expect(resortos.startCleaning).not.toHaveBeenCalled();
    await say(p, who.phone, '7');
    expect(resortos.startCleaning).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'k690' }));
    expect(sent.at(-1)).toContain('נרשם שהתחלת לנקות');
    await say(p, who.phone, 'START_D1');
    expect(sent.at(-1)).toContain('7 - התחל / סיים ניקיון');
    await say(p, who.phone, '7');
    expect(sent.at(-1)).toBe(CLEANER_EXIT_MENU.he('חצר מוזיקלית 1'));
    expect(resortos.startCleaning).toHaveBeenCalledTimes(1);
  });
});
