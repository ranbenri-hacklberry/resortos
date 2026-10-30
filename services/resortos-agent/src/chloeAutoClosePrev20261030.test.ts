import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Ran 2026-10-30: scanning a new room auto-closes the worker's previous open room (ready) + starts the new one in ONE message.
const rooms = ((realRooms as any).rooms || realRooms) as any[];
const TH = '972500000201';
const AR = '972500000202';
const MGR = '972500000203';
const OPS = '972500000204';
const HE = '972500000205';
function makeDeps() {
  const sent: Array<{ jid: string; text: string }> = [];
  const units = new Map<string, any>([
    ['hill-1', { id: 'hill-1', operational_status: 'DIRTY' }],
    ['hill-2', { id: 'hill-2', operational_status: 'DIRTY' }],
  ]);
  const photos: any[] = [];
  const resortos = {
    listUnits: vi.fn(async () => [...units.values()]),
    listBookings: vi.fn(async () => []),
    startCleaning: vi.fn(async (p: any) => { units.set(p.unitId, { id: p.unitId, operational_status: 'IN_PROGRESS', assigned_staff: p.reportedBy, cleaning_started_at: new Date().toISOString() }); return { ok: true }; }),
    markRoomReady: vi.fn(async (p: any) => {
      if (units.get(p.unitId)?.operational_status === 'MAINTENANCE_ALERT') return { ok: false, skipped: 'maintenance_open' };
      units.set(p.unitId, { id: p.unitId, operational_status: 'READY' }); return { ok: true };
    }),
    reportMaintenance: vi.fn(async (p: any) => { units.set(p.unitId, { id: p.unitId, operational_status: 'MAINTENANCE_ALERT' }); }),
    reportSupplies: vi.fn(async (p: any) => { units.set(p.unitId, { id: p.unitId, operational_status: 'DIRTY' }); }),
  };
  const deps = {
    send: vi.fn(async (jid: string, text: string) => void sent.push({ jid, text })),
    sendImage: vi.fn(),
    isAudio: (m: any) => Boolean(m.message?.audioMessage),
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(async () => ({ text: 'المكيف خربان', language: 'ar', duration_ms: 1 })),
    downloadMedia: vi.fn(async (m: any) => ({ buffer: m.__buf as Buffer, mimetype: 'image/png' })),
    storeCleaningPhoto: vi.fn(async (p: any) => { photos.push(p); return `/tmp/${photos.length}.png`; }),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn(async (t: string) => t) },
    resortos,
    cleaners: () => [
      { phone: TH, name: 'นิด', role: 'HOUSEKEEPING', language: 'th' },
      { phone: AR, name: 'سامي', role: 'HOUSEKEEPING', language: 'ar' },
      { phone: MGR, name: 'מנהל', role: 'MANAGER', language: 'he' },
      { phone: OPS, name: 'תפעול', role: 'OPS_MANAGER', language: 'he' },
      { phone: HE, name: 'דנה', role: 'HOUSEKEEPING', language: 'he' },
    ],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  } as any as PipelineDeps;
  return { deps, sent, units, photos, resortos };
}
const txt = (from: string, text: string) => ({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }) as any;
const img = (from: string, buf: Buffer, caption?: string) => ({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { imageMessage: { mimetype: 'image/png', ...(caption ? { caption } : {}) } }, __buf: buf }) as any;
const voice = (from: string) => ({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: {} } }) as any;
const last = (sent: any[]) => sent[sent.length - 1]?.text || '';

const room = (id: string) => rooms.find((x) => x.id === id)!;
const sends = (sent: any[], from: string) => sent.filter((s) => s.jid.startsWith(from));

describe('auto-close previous room on a new scan (Ran 2026-10-30)', () => {
  it('Thai worker: closes hill-1 as ready and starts hill-2 in ONE message', async () => {
    const { deps, sent, units, resortos } = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(txt(TH, 'START_hill_1'));
    const before = sent.length;
    await p.handleInbound(txt(TH, 'START_hill_2'));
    expect(sent.length - before).toBe(1);
    const m = last(sent);
    const a = room('hill-1').letterCode || room('hill-1').name; const b = room('hill-2').letterCode || room('hill-2').name;
    expect(m).toContain(`✅ ห้อง ${a} ปิดงานแล้ว`);
    expect(m).toContain(`เริ่มทำความสะอาดห้อง ${b}`);
    expect(m).toContain('ตอบ 2 (ต้องซ่อม) หรือ 3 (ของขาด)');
    expect(resortos.markRoomReady).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'hill-1' }));
    expect(units.get('hill-1').operational_status).toBe('READY');
    expect(units.get('hill-2').operational_status).toBe('IN_PROGRESS');
  });

  it('Hebrew worker: exact combined text', async () => {
    const { deps, sent } = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(txt(HE, 'START_hill_1'));
    await p.handleInbound(txt(HE, 'START_hill_2'));
    const a = room('hill-1').name; const b = room('hill-2').name; const code = room('hill-2').lockbox || '1357#';
    expect(last(sent)).toBe(`✅ חדר ${a} נסגר כמוכן.\n🧹 התחלת לנקות את ${b} ✅\n🔑 קוד כספת: ${code}\nאם בחדר ${a} יש תקלה או חסר משהו – ענו 2 (תקלה) או 3 (חסר ציוד).`);
  });

  it('reply 2 → repair flow for the PREVIOUS room; hill-2 stays in progress', async () => {
    const { deps, sent, units, resortos } = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(txt(HE, 'START_hill_1'));
    await p.handleInbound(txt(HE, 'START_hill_2'));
    await p.handleInbound(txt(HE, '2'));
    await p.handleInbound(txt(HE, 'המזגן לא עובד'));
    if (!resortos.reportMaintenance.mock.calls.length) {
      // worker must add a problem photo (same rules as the regular 2/3 flow)
      await p.handleInbound({ key: { remoteJid: `${HE}@s.whatsapp.net`, fromMe: false }, message: { imageMessage: { mimetype: 'image/png' } }, __buf: Buffer.from('x') } as any);
    }
    expect(resortos.reportMaintenance).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'hill-1' }));
    expect(units.get('hill-1').operational_status).toBe('MAINTENANCE_ALERT');
    expect(units.get('hill-2').operational_status).toBe('IN_PROGRESS');
    expect(last(sent)).toContain(room('hill-1').name);
  });

  it('reply 3 → missing-supplies flow for the PREVIOUS room', async () => {
    const { deps, units, resortos } = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(txt(TH, 'START_hill_1'));
    await p.handleInbound(txt(TH, 'START_hill_2'));
    await p.handleInbound(txt(TH, '3'));
    await p.handleInbound(txt(TH, 'ผ้าเช็ดตัวขาด'));
    if (!resortos.reportSupplies.mock.calls.length) {
      await p.handleInbound({ key: { remoteJid: `${TH}@s.whatsapp.net`, fromMe: false }, message: { imageMessage: { mimetype: 'image/png' } }, __buf: Buffer.from('x') } as any);
    }
    expect(resortos.reportSupplies).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'hill-1' }));
    expect(units.get('hill-2').operational_status).toBe('IN_PROGRESS');
  });

  it('after auto-close, re-scanning the active room gives the regular exit menu for it', async () => {
    const { deps, sent } = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(txt(HE, 'START_hill_1'));
    await p.handleInbound(txt(HE, 'START_hill_2'));
    await p.handleInbound(txt(HE, 'START_hill_2'));
    expect(last(sent)).toContain(room('hill-2').name);
    expect(last(sent)).not.toContain('נסגר כמוכן');
  });

  it('same-room rescan (no other room) → existing exit menu, nothing auto-closed', async () => {
    const { deps, sent, resortos } = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(txt(TH, 'START_hill_1'));
    await p.handleInbound(txt(TH, 'START_hill_1'));
    expect(resortos.markRoomReady).not.toHaveBeenCalled();
    expect(last(sent)).not.toContain('ปิดงานแล้ว');
  });

  it('no previous room → the old start message, unchanged', async () => {
    const { deps, sent } = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(txt(HE, 'START_hill_2'));
    const code = room('hill-2').lockbox || '1357#';
    expect(last(sent)).toBe(`נרשם שהתחלת לנקות את ${room('hill-2').name} ✅\n🔑 קוד כספת מפתח: ${code}\n\n📲 בסיום הניקיון, יש לסרוק את ה-QR שוב כדי לעדכן סיום ולבדוק כיבוי אורות ומזגנים.`);
  });

  it("does not close a room another worker started", async () => {
    const { deps, units, resortos } = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(txt(AR, 'START_hill_1'));
    await p.handleInbound(txt(TH, 'START_hill_2'));
    expect(resortos.markRoomReady).not.toHaveBeenCalled();
    expect(units.get('hill-1').operational_status).toBe('IN_PROGRESS');
  });

  it('a reply other than 2/3 after auto-close → normal flow, room stays ready', async () => {
    const { deps, units, resortos } = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(txt(HE, 'START_hill_1'));
    await p.handleInbound(txt(HE, 'START_hill_2'));
    await p.handleInbound(txt(HE, 'מה קורה'));
    await p.handleInbound(txt(HE, '2'));
    expect(resortos.reportMaintenance).not.toHaveBeenCalled();
    expect(units.get('hill-1').operational_status).toBe('READY');
  });

  it('manager scanning a second room: unchanged (asks to close first, no auto-close)', async () => {
    const { deps, resortos } = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(txt(OPS, 'START_hill_1'));
    await p.handleInbound(txt(OPS, 'START_hill_2'));
    expect(resortos.markRoomReady).not.toHaveBeenCalled();
  });
});
