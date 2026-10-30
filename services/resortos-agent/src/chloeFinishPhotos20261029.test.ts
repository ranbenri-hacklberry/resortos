import { describe, it, expect, vi, beforeAll } from 'vitest';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import { parseFinishChoice, finishLang, normalizeDigits } from './staff/finishFlow.js';
import { decodeQrFromImage, startCommandFromQr } from './staff/qrDecode.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Ran 2026-10-29: finish by photos → 1/2/3, close-previous-first, managers without photos, QR-sticker photos.
const rooms = ((realRooms as any).rooms || realRooms) as any[];
const TH = '972500000201'; // Thai worker
const AR = '972500000202'; // Arabic worker
const MGR = '972500000203'; // manager
const OPS = '972500000204'; // ops manager

let QR_HILL1: Buffer; let QR_HILL2: Buffer; let PLAIN: Buffer; let FOREIGN_QR: Buffer;
beforeAll(async () => {
  QR_HILL1 = await QRCode.toBuffer('https://wa.me/972515262612?text=START_hill_1', { width: 600 });
  QR_HILL2 = await QRCode.toBuffer('START_hill_2', { width: 600 });
  FOREIGN_QR = await QRCode.toBuffer('https://example.com/invoice/123', { width: 600 });
  PLAIN = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 180, b: 150 } } }).png().toBuffer();
});

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

describe('parsing (all languages)', () => {
  it('digits incl. Thai and Arabic-Indic', () => {
    expect(normalizeDigits('๑٢۳')).toBe('123');
    expect(['1', '1.', '๑', '١', '۱'].map(parseFinishChoice)).toEqual(Array(5).fill('ready'));
    expect(['2', '๒', '٢'].map(parseFinishChoice)).toEqual(Array(3).fill('repair'));
    expect(['3', '๓', '٣'].map(parseFinishChoice)).toEqual(Array(3).fill('missing'));
  });
  it('words he/th/ar/en', () => {
    for (const w of ['מוכן', 'พร้อม', 'جاهز', 'ready']) expect(parseFinishChoice(w)).toBe('ready');
    for (const w of ['תיקון', 'ซ่อม', 'تصليح', 'repair']) expect(parseFinishChoice(w)).toBe('repair');
    for (const w of ['חוסר', 'ขาด', 'ناقص', 'missing']) expect(parseFinishChoice(w)).toBe('missing');
    expect(parseFinishChoice('4')).toBeNull();
    expect(parseFinishChoice('מה קורה')).toBeNull();
  });
  it('language: script of the message wins, else profile', () => {
    expect(finishLang('he', 'พร้อม')).toBe('th');
    expect(finishLang('th', 'جاهز')).toBe('ar');
    expect(finishLang('th', 'ready')).toBe('en');
    expect(finishLang('ar', '1')).toBe('ar');
  });
});

describe('QR decode (generated images)', () => {
  it('decodes wa.me and plain START payloads; non-QR → null', async () => {
    expect(startCommandFromQr(await decodeQrFromImage(QR_HILL1))).toBe('START_hill_1');
    expect(startCommandFromQr(await decodeQrFromImage(QR_HILL2))).toBe('START_hill_2');
    expect(await decodeQrFromImage(PLAIN)).toBeNull();
    expect(startCommandFromQr(await decodeQrFromImage(FOREIGN_QR))).toBeNull();
  });
});

describe('worker finish by photos', () => {
  it('Thai worker: START → photo burst → ONE question → 1 → ready, photos stored', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(txt(TH, 'START_hill_1'));
    expect(t.units.get('hill-1').operational_status).toBe('IN_PROGRESS');
    const before = t.sent.length;
    for (let i = 0; i < 4; i++) await p.handleInbound(img(TH, PLAIN));
    const asked = t.sent.slice(before);
    expect(asked).toHaveLength(1);
    expect(asked[0].text).toContain('1 - พร้อม');
    expect(t.photos).toHaveLength(4);
    expect(t.photos.every((x) => x.roomId === 'hill-1' && x.kind === 'finish')).toBe(true);
    await p.handleInbound(txt(TH, '๑'));
    expect(t.resortos.markRoomReady).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'hill-1' }));
    expect(last(t.sent)).toContain('ขอบคุณค่ะ');
  });
  it('Arabic worker: 2 → asks photo+explanation → photo + voice → maintenance alert', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(txt(AR, 'START_hill_1'));
    await p.handleInbound(img(AR, PLAIN));
    await p.handleInbound(txt(AR, '٢'));
    expect(last(t.sent)).toContain('صورة للعطل');
    await p.handleInbound(img(AR, PLAIN));
    expect(t.resortos.reportMaintenance).not.toHaveBeenCalled();
    await p.handleInbound(voice(AR));
    expect(t.resortos.reportMaintenance).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'hill-1', description: expect.stringContaining('المكيف خربان') }));
    expect(t.photos.map((x) => x.kind)).toEqual(['finish', 'problem']);
    expect(last(t.sent)).toContain('تسجّل');
  });
  it('3 (missing) with explanation first, then photo with caption → supplies report', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(txt(TH, 'START_hill_1'));
    await p.handleInbound(img(TH, PLAIN));
    await p.handleInbound(txt(TH, 'ขาด'));
    await p.handleInbound(txt(TH, 'ผ้าเช็ดตัว 2'));
    expect(last(t.sent)).toContain('ส่งรูป');
    await p.handleInbound(img(TH, PLAIN));
    expect(t.resortos.reportSupplies).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'hill-1', description: expect.stringContaining('ผ้าเช็ดตัว 2') }));
  });
  it('ready on a room with an open maintenance alert is not overridden', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(txt(TH, 'START_hill_1'));
    await p.handleInbound(img(TH, PLAIN));
    t.units.set('hill-1', { id: 'hill-1', operational_status: 'MAINTENANCE_ALERT' });
    await p.handleInbound(txt(TH, '1'));
    expect(t.units.get('hill-1').operational_status).toBe('MAINTENANCE_ALERT');
    expect(last(t.sent)).toContain('ซ่อม');
  });
  it('unknown answer re-asks in the worker language', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(txt(AR, 'START_hill_1'));
    await p.handleInbound(img(AR, PLAIN));
    await p.handleInbound(txt(AR, 'شو؟'));
    expect(last(t.sent)).toContain('ما فهمت');
  });
  it('rescanning the same room still opens the existing exit menu', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(txt(TH, 'START_hill_1'));
    await p.handleInbound(txt(TH, 'START_hill_1'));
    expect(last(t.sent)).toContain('ปิดไฟ');
  });
});

describe('previous room must be closed before a new START', () => {
  // Ran 2026-10-30 (approved): workers' new scan auto-closes the previous room as ready and starts the new one.
  it('worker: new scan auto-closes previous room (ready) and starts the new room in one message', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(txt(TH, 'START_hill_1'));
    await p.handleInbound(txt(TH, 'START_hill_2'));
    expect(last(t.sent)).toContain('ปิดงานแล้ว');
    expect(t.units.get('hill-1').operational_status).toBe('READY');
    expect(t.units.get('hill-2').operational_status).toBe('IN_PROGRESS');
  });
  it('worker: 2 after auto-close → repair flow (photo+explanation) on the previous room; new room stays open', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(txt(AR, 'START_hill_1'));
    await p.handleInbound(txt(AR, 'START_hill_2'));
    expect(t.units.get('hill-2').operational_status).toBe('IN_PROGRESS');
    await p.handleInbound(txt(AR, '2'));
    await p.handleInbound(txt(AR, 'الحنفية بتنقط'));
    await p.handleInbound(img(AR, PLAIN));
    expect(t.units.get('hill-1').operational_status).toBe('MAINTENANCE_ALERT');
    expect(t.units.get('hill-2').operational_status).toBe('IN_PROGRESS');
  });
});

describe('managers / ops managers: no photos required', () => {
  it('manager cleaning: "סיימתי" → 1/2/3 directly → 1 → ready', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await t.resortos.startCleaning({ unitId: 'hill-1', reportedBy: 'מנהל' });
    await p.handleInbound(txt(MGR, 'סיימתי'));
    expect(last(t.sent)).toContain('1 - מוכן');
    await p.handleInbound(txt(MGR, '1'));
    expect(t.units.get('hill-1').operational_status).toBe('READY');
  });
  it('ops manager: new scan while open → close with 3 + text only → new room card opens', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await t.resortos.startCleaning({ unitId: 'hill-1', reportedBy: 'תפעול' });
    await p.handleInbound(txt(OPS, 'START_hill_2'));
    expect(last(t.sent)).toContain('לפני שמתחילים');
    await p.handleInbound(txt(OPS, '3'));
    expect(last(t.sent)).toContain('אפשר גם תמונה');
    await p.handleInbound(txt(OPS, 'חסרות 2 מגבות'));
    expect(t.resortos.reportSupplies).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'hill-1' }));
    // Managers' START opens the manager room card (existing flow) for the new room once the previous one is closed.
    expect(last(t.sent)).toContain('צימר בגבעה 2');
  });
  it('manager image without open room / without room QR is left to the existing flow', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(img(MGR, FOREIGN_QR));
    expect(t.photos).toHaveLength(0);
  });
});

describe('QR sticker photo = scan', () => {
  it('photo of a QR starts the room like START_', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(img(TH, QR_HILL1));
    expect(t.units.get('hill-1').operational_status).toBe('IN_PROGRESS');
    expect(t.photos).toHaveLength(0);
  });
  it('with a room open, a QR photo of another room is a scan (auto-close previous), a normal photo is a finish photo', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(txt(TH, 'START_hill_1'));
    await p.handleInbound(img(TH, QR_HILL2));
    expect(t.photos).toHaveLength(0);
    expect(last(t.sent)).toContain('ปิดงานแล้ว');
    expect(t.units.get('hill-1').operational_status).toBe('READY');
    expect(t.units.get('hill-2').operational_status).toBe('IN_PROGRESS');
    await p.handleInbound(img(TH, PLAIN));
    expect(t.photos).toHaveLength(1);
    await p.handleInbound(txt(TH, '1'));
    expect(t.units.get('hill-2').operational_status).toBe('READY');
  });
  it('unreadable sticker photo with no room open → asks for clearer photo / room code (worker language)', async () => {
    const t = makeDeps(); const p = createPipeline(t.deps);
    await p.handleInbound(img(AR, PLAIN));
    expect(last(t.sent)).toContain('ما قدرت أقرأ الباركود');
    expect(t.photos).toHaveLength(0);
  });
});
