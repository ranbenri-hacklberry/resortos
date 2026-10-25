import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DisconnectReason, type WAMessage } from '@whiskeysockets/baileys';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import { OllamaClient, normalizeIntent } from './llm/client.js';
import { ResortOSClient, ResortOSError, AWAITING_INSPECTION_REASON } from './integration/resortos.js';
import { decideReconnect } from './whatsapp/monitor.js';
import type { CleanerProfile, RoomEntry } from './config.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

const cleaners: CleanerProfile[] = [
  { phone: '66812345678', name: 'Somchai', language: 'th' },
  { phone: '962791234567', name: 'Khaled', language: 'ar' },
];
const rooms: RoomEntry[] = [
  { id: 'k680', name: 'מול הנוף · בקתה 1', aliases: ['מול הנוף 1', 'มูล 1'] },
  { id: 'k681', name: 'מול הנוף · בקתה 2', aliases: ['מול הנוף 2', 'มูล 2'] },
];

// ---- Mock WhatsApp payloads ----
const thaiVoiceNote = {
  key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false, id: 'A1' },
  message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 4, ptt: true } },
} as unknown as WAMessage;

const arabicMaintenance = {
  key: { remoteJid: '962791234567@s.whatsapp.net', fromMe: false, id: 'B1' },
  message: { conversation: 'מול הנוף 2 المكيف ما بيشتغل وفي تسريب مي بالحمام' },
} as unknown as WAMessage;

function makeDeps(over: Partial<PipelineDeps> = {}): PipelineDeps & { sent: Array<[string, string]> } {
  const sent: Array<[string, string]> = [];
  const deps: PipelineDeps = {
    send: vi.fn(async (jid, text) => void sent.push([jid, text])),
    isAudio: (m) => !!m.message?.audioMessage,
    extractText: (m) => m.message?.conversation ?? null,
    transcribe: vi.fn(async () => ({ text: 'ทำความสะอาด มูล 1 เสร็จแล้วค่ะ', language: 'th', duration_ms: 310 })),
    llm: { extractIntent: vi.fn(), translateTask: vi.fn() },
    resortos: {
      markRoomReady: vi.fn(async () => ({ ok: true as const })),
      startCleaning: vi.fn(async () => ({ ok: true as const })),
      reportMaintenance: vi.fn(async () => ({})),
      reportSupplies: vi.fn(async () => ({})),
    },
    cleaners: () => cleaners,
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
    ...over,
  };
  return Object.assign(deps, { sent });
}

describe('pipeline: Thai voice note', () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
    (deps.llm.extractIntent as any).mockResolvedValue({
      action: 'ROOM_READY',
      room_raw: 'มูล 1',
      room_id: 'k680',
      issue_description_hebrew: null,
      acknowledgement_reply_cleaner_language: 'รับทราบค่ะ มูล 1 พร้อมแล้ว',
    });
  });

  it('transcribes a ready report and waits for confirmation before marking the unit', async () => {
    const pipeline = createPipeline(deps);
    const r = await pipeline.handleInbound(thaiVoiceNote);
    expect(r.handled).toBe(true);
    expect(deps.transcribe).toHaveBeenCalledWith(thaiVoiceNote, 'th');
    expect(deps.resortos.markRoomReady).not.toHaveBeenCalled();
    expect(deps.sent[0][1]).toContain('ยืนยัน');

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: 'כן' },
    } as any);
    expect(deps.resortos.markRoomReady).toHaveBeenCalledWith({
      unitId: 'k680',
      reportedBy: 'Somchai',
      note: 'ทำความสะอาด มูล 1 เสร็จแล้วค่ะ',
    });
    expect(deps.sent[0][1]).toContain('READY');
  });

  it('does not reply with a false confirmation if ResortOS fails', async () => {
    (deps.resortos.markRoomReady as any).mockRejectedValue(new Error('down'));
    const pipeline = createPipeline(deps);
    await pipeline.handleInbound(thaiVoiceNote);
    deps.sent.length = 0;
    const r = await pipeline.handleInbound({
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: 'כן' },
    } as any);
    expect(r.handled).toBe(false);
    expect(deps.sent[0][1]).not.toContain('READY');
  });

  it('does not confirm ready when an open maintenance alert blocks it', async () => {
    (deps.resortos.markRoomReady as any).mockResolvedValue({ ok: false, skipped: 'maintenance_open' });
    const pipeline = createPipeline(deps);
    await pipeline.handleInbound(thaiVoiceNote);
    deps.sent.length = 0;
    const r = await pipeline.handleInbound({
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: 'כן' },
    } as any);
    expect(r.handled).toBe(false);
    expect(deps.sent[0][1]).toContain('תחזוקה');
  });

  it('asks for complex + number instead of guessing when the unit is unresolved', async () => {
    (deps.llm.extractIntent as any).mockResolvedValue({
      action: 'ROOM_READY', room_raw: 'בקתה 1', room_id: null, issue_description_hebrew: null,
      acknowledgement_reply_cleaner_language: 'รับทราบค่ะ พร้อมแล้ว',
    });
    const r = await createPipeline(deps).handleInbound(thaiVoiceNote);
    expect(r.reason).toBe('room unresolved');
    expect(deps.resortos.markRoomReady).not.toHaveBeenCalled();
    expect(deps.sent[0][1]).not.toContain('รับทราบ');
  });
});

describe('pipeline: Arabic maintenance report', () => {
  it('reports maintenance on the unit with a Hebrew description and replies in Arabic', async () => {
    const deps = makeDeps();
    (deps.llm.extractIntent as any).mockResolvedValue({
      action: 'MAINTENANCE_ISSUE',
      room_raw: 'מול הנוף 2',
      room_id: 'k681',
      issue_description_hebrew: 'המזגן לא עובד ויש נזילת מים בשירותים',
      acknowledgement_reply_cleaner_language: 'تمام، سجلت المشكلة وراح نبعت فني.',
    });
    const r = await createPipeline(deps).handleInbound(arabicMaintenance);
    expect(r.handled).toBe(true);
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(deps.resortos.reportMaintenance).toHaveBeenCalledWith({
      unitId: 'k681',
      description: 'המזגן לא עובד ויש נזילת מים בשירותים',
      reportedBy: 'Khaled',
    });
    expect(deps.sent[0][1]).toContain('سجلت');
  });
});

describe('pipeline: guards & dispatch', () => {
  it('ignores unknown senders', async () => {
    const deps = makeDeps();
    const msg = { ...arabicMaintenance, key: { remoteJid: '1999@s.whatsapp.net', fromMe: false } } as WAMessage;
    expect((await createPipeline(deps).handleInbound(msg)).handled).toBe(false);
    expect(deps.llm.extractIntent).not.toHaveBeenCalled();
  });

  it('translates Hebrew dispatch to the cleaner language and sends it', async () => {
    const deps = makeDeps();
    deps.rooms = () => [
      { id: 'k680', name: 'מול הנוף 1', property: 'מול הנוף', letterCode: 'A1', lockbox: '2910', aliases: ['מול 1'] },
    ];
    (deps.llm.translateTask as any).mockResolvedValue('เปลี่ยนผ้าปูที่นอนที่ มูล 1 แขกคนต่อไปมาถึงเวลา 15:00 ค่ะ');
    const out = await createPipeline(deps).handleDispatch({
      cleaner_phone: '+66 81 234 5678',
      message_he: 'להחליף מצעים ב-A1, אורח הבא ב-15:00',
    });
    expect(out.sent).toBe(true);
    expect(deps.sent[0][0]).toBe('66812345678@s.whatsapp.net');
  });

  it('attaches lockbox code when manager dispatches to a specific room', async () => {
    const deps = makeDeps();
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1', 'נופים 1'] },
    ];
    (deps.llm.translateTask as any).mockImplementation((text: string) => text);
    await createPipeline(deps).handleDispatch({
      cleaner_phone: '66812345678',
      message_he: 'נא לנקות את B1 דחוף',
    });
    expect(deps.sent[0][1]).toContain('2810');
  });

  it('returns key safe code when asked by a worker', async () => {
    const deps = makeDeps();
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1', 'נופים 1'] },
    ];
    (deps.llm.extractIntent as any).mockResolvedValue({
      action: 'QUERY_STATUS', room_raw: 'B1', room_id: 'k685', issue_description_hebrew: null,
      acknowledgement_reply_cleaner_language: '',
    });
    const msg = {
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: 'ขอรหัสตู้เซฟ B1 หน่อย' },
    } as any;
    const r = await createPipeline(deps).handleInbound(msg);
    expect(r.handled).toBe(true);
    expect(deps.sent[0][1]).toContain('2810');
    expect(deps.sent[0][1]).toContain('B1');
  });

  it('offers a housekeeper start-cleaning or a fault after a pool scan', async () => {
    const deps = makeDeps();
    deps.resortos.getGroundStatus = vi.fn(async () => ({ status: 'ok' }));
    deps.resortos.setGroundStatus = vi.fn(async () => ({ ok: true }));
    const pipeline = createPipeline(deps);
    const scan = {
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_POOL_nurit' },
    } as any;
    const opened = await pipeline.handleInbound(scan);
    expect(opened.handled).toBe(true);
    expect(deps.resortos.startCleaning).not.toHaveBeenCalled();
    expect(deps.sent[0][1]).toContain('התחלת ניקיון');
    expect(deps.sent[0][1]).toContain('דיווח על תקלה');

    deps.sent.length = 0;
    const picked = await pipeline.handleInbound({
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: '1' },
    } as any);
    expect(picked.handled).toBe(true);
    expect(deps.resortos.setGroundStatus).toHaveBeenCalledWith({
      id: 'pool:nurit',
      status: 'ok',
      reportedBy: 'Somchai',
      note: 'התחלת ניקיון',
    });
  });

  it('shows a manager every room in the complex after a yard scan', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [{ phone: '972506983399', name: 'רני', role: 'MANAGER', language: 'he' }];
    deps.rooms = () => [
      { id: 'k671', name: 'בתי נורית 1', aliases: [] },
      { id: 'k673', name: 'בתי נורית 2', aliases: [] },
    ];
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k671', operational_status: 'READY' },
      { id: 'k673', operational_status: 'DIRTY' },
    ]);
    deps.resortos.listBookings = vi.fn(async () => []);
    const pipeline = createPipeline(deps);
    const opened = await pipeline.handleInbound({
      key: { remoteJid: '972506983399@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_YARD_nurit' },
    } as any);
    expect(opened.handled).toBe(true);
    expect(deps.sent[0][1]).toContain('מצב החדרים במתחם');
    expect(deps.sent[0][1]).toContain('בתי נורית 1');
    expect(deps.sent[0][1]).toContain('מוכן לאורח');
    expect(deps.sent[0][1]).toContain('ממתין לניקיון');
  });

  it('explains the pool and sends the guest page when a guest scans it', async () => {
    const deps = makeDeps();
    deps.resortos.listBookings = vi.fn(async () => [{
      id: 'b1',
      unit_id: 'k671',
      guest_name: 'משה',
      guest_phone: '972501112233',
      check_in_date: '2020-01-01',
      check_out_date: '2099-01-01',
      booking_status: 'CHECKED_IN',
      checkout_token: 'tok_nurit',
    }]);
    deps.resortos.logGuestComm = vi.fn(async () => {});
    const pipeline = createPipeline(deps);
    const opened = await pipeline.handleInbound({
      key: { remoteJid: '972501112233@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_POOL_nurit' },
    } as any);
    expect(opened.handled).toBe(true);
    expect(deps.sent[0][1]).toContain('הבריכה משותפת');
    expect(deps.sent[0][1]).toContain('https://resortos.app/stay/tok_nurit');
  });

  it('handles instant QR scan (START_B1) with zero LLM calls, starts cleaning, and returns lockbox', async () => {
    const deps = makeDeps();
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    const msg = {
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any;
    const r = await createPipeline(deps).handleInbound(msg);
    expect(r.handled).toBe(true);
    expect(deps.llm.extractIntent).not.toHaveBeenCalled();
    expect(deps.resortos.startCleaning).toHaveBeenCalledWith({ unitId: 'k685', reportedBy: 'Somchai' });
    expect(deps.sent[0][1]).toContain('2810');
  });

  it('sends QR image when requested by a manager', async () => {
    const deps = makeDeps();
    const sentImages: Array<[string, Buffer, string | undefined]> = [];
    deps.sendImage = vi.fn(async (jid, buf, cap) => { sentImages.push([jid, buf, cap]); });
    deps.cleaners = () => [
      { phone: '972506983399', name: 'רני', role: 'MANAGER', language: 'he' },
    ];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    const msg = {
      key: { remoteJid: '972506983399@s.whatsapp.net', fromMe: false },
      message: { conversation: 'שלח QR של B1' },
    } as any;
    const r = await createPipeline(deps).handleInbound(msg);
    expect(r.handled).toBe(true);
    expect(deps.sendImage).toHaveBeenCalled();
    expect(sentImages[0][2]).toContain('B1');
    expect(sentImages[0][2]).toContain('2810');
  });

  it('delivers complete room dossier to a manager upon scanning QR or querying a room', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [
      { phone: '972548317887', name: 'רני', role: 'MANAGER', language: 'he' },
    ];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k685', operational_status: 'IN_PROGRESS', assigned_staff: 'Somchai', custom_reason: 'בניקיון יסודי' },
    ]);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'book-1',
        unit_id: 'k685',
        guest_name: 'ישראל ישראלי',
        guest_phone: '050-1234567',
        check_in_date: today,
        check_out_date: '2026-10-20',
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        checkout_token: 'tok_abc123',
        adults_count: 2,
        children_count: 1,
      },
    ]);

    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any;

    const r = await createPipeline(deps).handleInbound(msg);
    expect(r.handled).toBe(true);
    // Manager scan does NOT call startCleaning!
    expect(deps.resortos.startCleaning).not.toHaveBeenCalled();
    const reply = deps.sent[0][1];
    expect(reply).toContain('נופים בלבן 1');
    expect(reply).toContain('2810');
    expect(reply).toContain('בנקיון 🟡');
    expect(reply).toContain('צ׳ק אין היום (ישראל ישראלי)');
  });

  it('allows manager to quickly approve room via "מוכן B1"', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [
      { phone: '972548317887', name: 'רני', role: 'MANAGER', language: 'he' },
    ];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    deps.resortos.approveRoomByManager = vi.fn(async () => ({ ok: true as const }));

    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מוכן B1' },
    } as any;

    const pipeline = createPipeline(deps);
    const r = await pipeline.handleInbound(msg);
    expect(r.handled).toBe(true);
    expect(deps.resortos.approveRoomByManager).not.toHaveBeenCalled();
    expect(deps.sent[0][1]).toContain('הבנתי');
    expect(deps.sent[0][1]).toContain('נופים בלבן 1');

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'כן' },
    } as any);
    expect(deps.resortos.approveRoomByManager).toHaveBeenCalledWith({
      unitId: 'k685',
      reportedBy: 'רני',
      note: 'מוכן B1',
    });
    expect(deps.sent[0][1]).toContain('אושר בהצלחה כמוכן לאורח (READY)');
  });

  it('delivers comprehensive daily status report to manager with occupancy, turnovers, checkins, and clean names', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [
      { phone: '972548317887', name: 'רני', role: 'MANAGER', language: 'he' },
    ];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן · בקתה 1', property: 'נופים בלבן', letterCode: 'B1', aliases: ['b1'] },
      { id: 'k690', name: 'חצר מוסיקלית · בקתה 1', property: 'חצר מוסיקלית', letterCode: 'D1', aliases: ['d1'] },
      { id: 'pilot-office', name: 'משרד', property: 'משרד', aliases: ['משרד'] },
    ];
    deps.resortos.listUnits = async () => [
      { id: 'k685', operational_status: 'READY' },
      { id: 'k690', operational_status: 'IN_PROGRESS', assigned_staff: 'אוסנת' },
      { id: 'pilot-office', operational_status: 'READY' },
    ];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    deps.resortos.listBookings = async () => [
      // k685 has checkout today AND checkin today => turnover!
      { id: 'b1', unit_id: 'k685', check_in_date: '2026-10-10', check_out_date: today, booking_status: 'CONFIRMED' },
      { id: 'b2', unit_id: 'k685', check_in_date: today, check_out_date: '2029-10-20', booking_status: 'CONFIRMED' },
    ];
    deps.llm.extractIntent = vi.fn(async () => ({
      action: 'QUERY_STATUS',
      room_id: null,
      room_raw: null,
      issue_description_hebrew: null,
      acknowledgement_reply_cleaner_language: '',
    }));

    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'תמונת מצב' },
    } as any;

    const r = await createPipeline(deps).handleInbound(msg);
    expect(r.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('פנויים להיום');
    expect(reply).toContain('חצר מוזיקלית 1');
    expect(reply).not.toContain('נופים בלבן 1');
    expect(reply).not.toContain('משרד');
    expect(reply).not.toContain('תמונת מצב יומית');
    expect(reply).not.toContain('k685');
    expect(reply).not.toContain('k690');
  });

  it('delivers key safe code, instructions, and stay link to a guest when room is READY', async () => {
    const deps = makeDeps();
    deps.cleaners = () => []; // not a staff member
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k685', operational_status: 'READY' },
    ]);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'book-99',
        unit_id: 'k685',
        guest_name: 'דניאל כהן',
        guest_phone: '052-9876543',
        check_in_date: today,
        check_out_date: '2099-12-31',
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        checkout_token: 'tok_guest_777',
      },
    ]);

    const msg = {
      key: { remoteJid: '972529876543@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any;

    const r = await createPipeline(deps).handleInbound(msg);
    expect(r.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).not.toContain('שלום');
    expect(reply).toContain('ברוכים הבאים');
    expect(reply).toContain('2810');
    expect(reply).toContain('הוראות פתיחת הכספת');
    expect(reply).toContain('ערבלו את הגלגלות');
    expect(reply).toContain('https://resortos.app/stay/tok_guest_777');
  });

  it('informs guest if room is still being cleaned (IN_PROGRESS) and provides digital stay link', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k685', operational_status: 'IN_PROGRESS' },
    ]);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'book-99',
        unit_id: 'k685',
        guest_name: 'דניאל כהן',
        guest_phone: '052-9876543',
        check_in_date: today,
        check_out_date: '2099-12-31',
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        checkout_token: 'tok_guest_777',
      },
    ]);

    const msg = {
      key: { remoteJid: '972529876543@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any;

    const r = await createPipeline(deps).handleInbound(msg);
    expect(r.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('בהכנה');
    expect(reply).not.toContain('15:00'); // No rigid 15:00 barrier per Natasha policy
    expect(reply).not.toContain('2810'); // Must NOT leak key code yet!
    expect(reply).toContain('https://resortos.app/stay/tok_guest_777');
  });

  it('redirects guest if they scan the wrong cabin QR code', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
      { id: 'k686', name: 'נופים בלבן 2', property: 'נופים בלבן', letterCode: 'B2', lockbox: '2820', aliases: ['b2'] },
    ];
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'book-99',
        unit_id: 'k685', // booked for B1
        guest_name: 'דניאל כהן',
        guest_phone: '052-9876543',
        check_in_date: '2026-10-15',
        check_out_date: '2026-10-18',
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        checkout_token: 'tok_guest_777',
      },
    ]);

    // Guest scans B2 by mistake!
    const msg = {
      key: { remoteJid: '972529876543@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B2' },
    } as any;

    const r = await createPipeline(deps).handleInbound(msg);
    expect(r.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('שאינה תואמת להזמנה');
    expect(reply).toContain('מטעמי ביטחון ופרטיות');
    expect(reply).not.toContain('2810'); // Security: Never leak lockbox code
    expect(reply).not.toContain('2820');
  });

  it('politely informs unrecognized sender scanning QR to reply in chat without exposing private phone numbers', async () => {
    const deps = makeDeps();
    deps.getBookings = async () => []; // No bookings found for this number

    const msg = {
      key: { remoteJid: '972599999999@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any;

    const r = await createPipeline(deps).handleInbound(msg);
    expect(r.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('רגע, אני בודקת את ההזמנה שלך');
    expect(reply).toContain('שם מלא ותאריכי הגעה');
    expect(reply).not.toContain('לא זוהתה הזמנה');
    expect(reply).not.toContain('054-831-7887');
  });

  it('rejects dispatch for unknown cleaner', async () => {
    await expect(createPipeline(makeDeps()).handleDispatch({ cleaner_phone: '1', message_he: 'x' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('ResortOS API contract (server/opsGateway.js)', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('marks READY as awaiting manager inspection via PUT /api/ops/units/:id with bearer token', async () => {
    const calls: Array<[string, RequestInit]> = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return init.method === 'GET' ? json({ units: [{ id: 'k680', operational_status: 'DIRTY' }] }) : json({ unit: {} });
    });
    const c = new ResortOSClient(f as any);
    expect(await c.markRoomReady({ unitId: 'k680', reportedBy: 'Somchai' })).toEqual({ ok: true });
    const [url, init] = calls[1];
    expect(url).toMatch(/\/api\/ops\/units\/k680$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toMatchObject({ operational_status: 'READY', custom_reason: AWAITING_INSPECTION_REASON });
  });

  it('only writes fields agents are allowed to change', async () => {
    const allowed = new Set(['operational_status', 'operational_domain', 'custom_reason', 'quality_inspections', 'cleaning_started_at', 'assigned_staff', 'staff_occupancy', 'is_escalated', 'room_log_note']);
    const bodies: any[] = [];
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      if (init.method === 'PUT') bodies.push(JSON.parse(init.body as string));
      return json({ units: [{ id: 'k681', operational_status: 'IN_PROGRESS' }] });
    });
    const c = new ResortOSClient(f as any);
    await c.markRoomReady({ unitId: 'k681', reportedBy: 'x' });
    await c.reportMaintenance({ unitId: 'k681', description: 'מזגן', reportedBy: 'x' });
    await c.reportSupplies({ unitId: 'k681', description: 'מגבות', reportedBy: 'x' });
    expect(bodies).toHaveLength(3);
    for (const b of bodies) for (const k of Object.keys(b)) expect(allowed.has(k)).toBe(true);
    expect(bodies[1]).toMatchObject({ operational_status: 'MAINTENANCE_ALERT', operational_domain: 'MAINTENANCE', is_escalated: true });
    expect(bodies[2]).toMatchObject({ operational_status: 'IN_PROGRESS', custom_reason: 'חוסר: מגבות' });
  });

  it('never overrides an open maintenance alert with READY', async () => {
    const f = vi.fn(async () => json({ units: [{ id: 'k680', operational_status: 'MAINTENANCE_ALERT' }] }));
    const r = await new ResortOSClient(f as any).markRoomReady({ unitId: 'k680', reportedBy: 'x' });
    expect(r).toEqual({ ok: false, skipped: 'maintenance_open' });
    expect(f).toHaveBeenCalledTimes(1); // GET only, no PUT
  });

  it('surfaces STATUS_NOT_VERIFIED (409) as an error', async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) =>
      init.method === 'GET' ? json({ units: [{ id: 'k680', operational_status: 'DIRTY' }] }) : json({ error: 'STATUS_NOT_VERIFIED' }, 409));
    await expect(new ResortOSClient(f as any).markRoomReady({ unitId: 'k680', reportedBy: 'x' })).rejects.toBeInstanceOf(ResortOSError);
  });
});

describe('llm client', () => {
  it('sends schema-constrained request and validates output (hallucinated room id dropped, alias fallback used)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: { content: JSON.stringify({
        action: 'ROOM_READY', room_raw: 'מול הנוף 1', room_id: 'made-up-id',
        issue_description_hebrew: null, acknowledgement_reply_cleaner_language: 'ok',
      }) } })),
    );
    const client = new OllamaClient(fetchMock as unknown as typeof fetch);
    const intent = await client.extractIntent('מול הנוף 1 מוכנה', 'he', rooms);
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.format.properties.action.enum).toContain('ROOM_READY');
    expect(body.stream).toBe(false);
    expect(intent.room_id).toBe('k680');
  });

  it('never guesses a unit from a bare number', () => {
    expect(normalizeIntent({ action: 'ROOM_READY', room_raw: '1', room_id: null }, rooms).room_id).toBeNull();
    expect(normalizeIntent({ action: 'ROOM_READY', room_raw: 'בקתה 1', room_id: null }, realRooms as RoomEntry[]).room_id).toBeNull();
  });

  it('normalizes garbage to UNKNOWN', () => {
    expect(normalizeIntent({ action: 'DROP_TABLE' }, rooms).action).toBe('UNKNOWN');
  });

  it('translateTask skips the LLM for Hebrew', async () => {
    const fetchMock = vi.fn();
    expect(await new OllamaClient(fetchMock as any).translateTask('שלום', 'he')).toBe('שלום');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('data/rooms.json (generated from the ResortOS catalog)', () => {
  const list = realRooms as RoomEntry[];
  it('covers the live inventory and has unique ids', () => {
    expect(list.length).toBeGreaterThanOrEqual(40);
    expect(new Set(list.map((r) => r.id)).size).toBe(list.length);
    for (const id of ['k680', 'k690', 'k808', 'k671', 'k687']) expect(list.some((r) => r.id === id)).toBe(true);
  });
  it('no alias resolves to more than one unit', () => {
    const seen = new Map<string, string>();
    for (const r of list) for (const a of r.aliases) {
      const k = a.toLowerCase().replace(/[\s'׳"״\-_.,·]+/g, '');
      expect(seen.get(k) ?? r.id, `alias "${a}"`).toBe(r.id);
      seen.set(k, r.id);
    }
  });
  it('resolves spoken complex+number aliases in Hebrew and Thai', () => {
    const f = (raw: string) => normalizeIntent({ action: 'ROOM_READY', room_raw: raw, room_id: null }, list).room_id;
    expect(f('מול הנוף 3')).toBe('k682');
    expect(f("טאג' 2")).toBe('k809');
    expect(f('חליל')).toBe('k690');
  });
});

describe('reconnect policy', () => {
  it('stops with fatal on loggedOut', () => {
    expect(decideReconnect(DisconnectReason.loggedOut, 0)).toMatchObject({ action: 'stop', level: 'fatal' });
  });
  it('reconnects immediately on restartRequired and quietly on connectionLost', () => {
    expect(decideReconnect(DisconnectReason.restartRequired, 0)).toMatchObject({ action: 'reconnect', delayMs: 0 });
    expect(decideReconnect(DisconnectReason.connectionLost, 2)).toMatchObject({ action: 'reconnect', level: 'debug', delayMs: 4000 });
  });
});

describe('cleaner exit state machine & numeric fast-path', () => {
  it('sends 1/2/3 exit menu in cleaner native language upon triggerRoomExit', async () => {
    const deps = makeDeps();
    const pipeline = createPipeline(deps);
    const res = await pipeline.triggerRoomExit({ cleanerPhone: '66812345678', roomId: 'k680' });
    expect(res.ok).toBe(true);
    expect(deps.sent).toHaveLength(1);
    expect(deps.sent[0][0]).toBe('66812345678@s.whatsapp.net');
    expect(deps.sent[0][1]).toContain('1 - เรียบร้อยสมบูรณ์ ปิดไฟ/แอร์แล้ว 🟢');
    expect(deps.sent[0][1]).toContain('2 - ขาดของ / ผ้าปู / ผ้าเช็ดตัว 🟡');
    expect(deps.sent[0][1]).toContain('3 - มีจุดชำรุดเสียหายต้องซ่อม 🔴');
    expect(pipeline.getSession('66812345678')).toEqual({
      role: 'CLEANER',
      state: 'AWAITING_STATUS',
      roomId: 'k680',
    });
  });

  it('cleaner fast-path 1: marks room ready without calling LLM or Whisper, sends thank you, clears state', async () => {
    const deps = makeDeps();
    const pipeline = createPipeline(deps);
    await pipeline.triggerRoomExit({ cleanerPhone: '66812345678', roomId: 'k680' });
    deps.sent.length = 0; // reset sent list

    const msg = {
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: '1' },
    } as any;

    const r = await pipeline.handleInbound(msg);
    expect(r.handled).toBe(true);
    expect(deps.llm.extractIntent).not.toHaveBeenCalled();
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(deps.resortos.markRoomReady).toHaveBeenCalledWith({ unitId: 'k680', reportedBy: 'Somchai' });
    expect(deps.sent[0][1]).toContain('ขอบคุณมากค่ะ! อัปเดตห้องเป็นพร้อมใช้งาน (READY)');
    expect(pipeline.getSession('66812345678')).toBeUndefined();
  });

  it('cleaner fast-path thumbs up emoji: marks room ready and sends thank you', async () => {
    const deps = makeDeps();
    const pipeline = createPipeline(deps);
    await pipeline.triggerRoomExit({ cleanerPhone: '66812345678', roomId: 'k680' });
    deps.sent.length = 0;

    const msg = {
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: '👍' },
    } as any;

    const r = await pipeline.handleInbound(msg);
    expect(r.handled).toBe(true);
    expect(deps.resortos.markRoomReady).toHaveBeenCalledWith({ unitId: 'k680', reportedBy: 'Somchai' });
    expect(deps.sent[0][1]).toContain('ขอบคุณมากค่ะ! อัปเดตห้องเป็นพร้อมใช้งาน (READY)');
    expect(pipeline.getSession('66812345678')).toBeUndefined();
  });

  it('cleaner option 2: transitions to AWAITING_SUPPLIES, prompts for details, reports supplies upon response', async () => {
    const deps = makeDeps();
    const pipeline = createPipeline(deps);
    await pipeline.triggerRoomExit({ cleanerPhone: '66812345678', roomId: 'k680' });
    deps.sent.length = 0;

    // Cleaner presses 2
    const msg2 = {
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: '2' },
    } as any;
    const r2 = await pipeline.handleInbound(msg2);
    expect(r2.handled).toBe(true);
    expect(deps.sent[0][1]).toContain('ขาดอะไรบ้างคะ?');
    expect(pipeline.getSession('66812345678')).toEqual({
      role: 'CLEANER',
      state: 'AWAITING_SUPPLIES',
      roomId: 'k680',
    });

    // Cleaner responds with what is missing
    deps.sent.length = 0;
    const msgSupplies = {
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: 'ผ้าปูที่นอน 2 ผืน' },
    } as any;
    const r3 = await pipeline.handleInbound(msgSupplies);
    expect(r3.handled).toBe(true);
    expect(deps.resortos.reportSupplies).toHaveBeenCalledWith({
      unitId: 'k680',
      description: 'ผ้าปูที่นอน 2 ผืน',
      reportedBy: 'Somchai',
    });
    expect(deps.sent[0][1]).toContain('รับทราบค่ะ! บันทึกรายการของที่ขาดเรียบร้อยแล้ว');
    expect(pipeline.getSession('66812345678')).toBeUndefined();
  });

  it('cleaner option 3: transitions to AWAITING_MAINTENANCE, prompts for details, reports maintenance upon response', async () => {
    const deps = makeDeps();
    const pipeline = createPipeline(deps);
    await pipeline.triggerRoomExit({ cleanerPhone: '962791234567', roomId: 'k681' });
    deps.sent.length = 0;

    // Arabic cleaner Khaled presses 3
    const msg3 = {
      key: { remoteJid: '962791234567@s.whatsapp.net', fromMe: false },
      message: { conversation: '3' },
    } as any;
    const r3 = await pipeline.handleInbound(msg3);
    expect(r3.handled).toBe(true);
    expect(deps.sent[0][1]).toContain('شو العطل؟');
    expect(pipeline.getSession('962791234567')).toEqual({
      role: 'CLEANER',
      state: 'AWAITING_MAINTENANCE',
      roomId: 'k681',
    });

    // Khaled replies with the issue
    deps.sent.length = 0;
    const msgMaint = {
      key: { remoteJid: '962791234567@s.whatsapp.net', fromMe: false },
      message: { conversation: 'تسريب مياه تحت المغسلة' },
    } as any;
    const rMaint = await pipeline.handleInbound(msgMaint);
    expect(rMaint.handled).toBe(true);
    expect(deps.resortos.reportMaintenance).toHaveBeenCalledWith({
      unitId: 'k681',
      description: 'تسريب مياه تحت المغسلة',
      reportedBy: 'Khaled',
    });
    expect(deps.sent[0][1]).toContain('تم فتح بلاغ صيانة');
    expect(pipeline.getSession('962791234567')).toBeUndefined();
  });

  it('worker scanning QR when unit is already IN_PROGRESS triggers exit menu directly', async () => {
    const deps = makeDeps();
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k685', operational_status: 'IN_PROGRESS', assigned_staff: 'Somchai' },
    ]);
    const pipeline = createPipeline(deps);

    const msg = {
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any;

    const r = await pipeline.handleInbound(msg);
    expect(r.handled).toBe(true);
    expect(deps.sent[0][1]).toContain('ทำความสะอาด B1 เสร็จแล้ว:');
    expect(deps.sent[0][1]).toContain('1 - เรียบร้อยสมบูรณ์ ปิดไฟ/แอร์แล้ว 🟢');
    expect(pipeline.getSession('66812345678')).toEqual({
      role: 'CLEANER',
      state: 'AWAITING_STATUS',
      roomId: 'k685',
    });
  });

  it('worker typing "סיום B1" or "EXIT B1" triggers exit menu', async () => {
    const deps = makeDeps();
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    const pipeline = createPipeline(deps);

    const msg = {
      key: { remoteJid: '66812345678@s.whatsapp.net', fromMe: false },
      message: { conversation: 'סיום B1' },
    } as any;

    const r = await pipeline.handleInbound(msg);
    expect(r.handled).toBe(true);
    expect(deps.sent[0][1]).toContain('ทำความสะอาด B1 เสร็จแล้ว:');
    expect(pipeline.getSession('66812345678')?.state).toBe('AWAITING_STATUS');
  });
});

describe('manager short status & numeric action menu', () => {
  const managerProfile: CleanerProfile = {
    phone: '972548317887',
    name: 'רני',
    role: 'MANAGER',
    language: 'he',
  };

  it('delivers concise initial card with occupancy, cleaning status, and lockbox without menu clutter', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k685', operational_status: 'DIRTY', assigned_staff: null },
    ]);
    deps.resortos.listBookings = vi.fn(async () => []); // Vacant

    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any;

    const r = await pipeline.handleInbound(msg);
    expect(r.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('נופים בלבן 1');
    expect(reply).toContain('2810');
    expect(reply).toContain('סטטוס ניקיון: ממתין לניקיון 🔴');
    expect(reply).toContain('סטטוס תפוסה: פנוי ⚪');
    expect(reply).toContain('1 - שנה סטטוס');
    expect(reply).toContain('2 - הוסף הערה');
    expect(reply).toContain('3 - דווח אחזקה או חוסר');
    expect(reply).toContain('4 - שליחת קישור לאורח');
    expect(pipeline.getSession('972548317887')).toMatchObject({
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
    });
  });

  it('manager action 1: presents status sub-menu, manager selects 1 (READY) -> status updated', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    deps.resortos.updateUnitStatus = vi.fn(async () => ({ ok: true }));

    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', {
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
    });

    // Manager presses 1
    const msg1 = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '1' },
    } as any;
    await pipeline.handleInbound(msg1);
    expect(deps.sent[0][1]).toContain('בחר סטטוס חדש לחדר נופים בלבן 1');
    expect(deps.sent[0][1]).toContain('1 - מוכן לאורח (READY) 🟢');
    expect(pipeline.getSession('972548317887')?.state).toBe('SELECT_STATUS');

    // Manager selects 1 (READY)
    deps.sent.length = 0;
    const msgSelectReady = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '1' },
    } as any;
    await pipeline.handleInbound(msgSelectReady);
    expect(deps.resortos.updateUnitStatus).toHaveBeenCalledWith({
      unitId: 'k685',
      status: 'READY',
      reason: 'מוכן לאורח',
      reportedBy: 'רני',
    });
    expect(deps.sent[0][1]).toContain('סטטוס חדר נופים בלבן 1 עודכן בהצלחה ל: מוכן לאורח (READY) 🟢');
    expect(pipeline.getSession('972548317887')).toBeUndefined();
  });

  it('manager action 2: prompts for a room note and saves it', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    deps.resortos.updateUnitNote = vi.fn(async () => {});

    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', {
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
    });

    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '2' },
    } as any);
    expect(deps.sent[0][1]).toContain('רני, כתוב את ההערה עבור חדר נופים בלבן 1');
    expect(pipeline.getSession('972548317887')?.state).toBe('AWAITING_ROOM_NOTE');

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'לוודא בקבוק יין במקרר' },
    } as any);
    expect(deps.resortos.updateUnitNote).toHaveBeenCalledWith({
      unitId: 'k685',
      note: 'לוודא בקבוק יין במקרר',
      reportedBy: 'רני',
    });
    expect(deps.sent[0][1]).toContain('הערה נשמרה בהצלחה');
  });

  it('manager action 3: prompts for maintenance and opens ticket', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', {
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
    });

    const msg3 = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '3' },
    } as any;
    await pipeline.handleInbound(msg3);
    expect(deps.sent[0][1]).toContain('1 - אחזקה');
    expect(deps.sent[0][1]).toContain('2 - חוסר');
    expect(pipeline.getSession('972548317887')?.state).toBe('AWAITING_ISSUE_KIND');

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '1' },
    } as any);
    expect(deps.sent[0][1]).toContain('רני, מה התקלה בחדר נופים בלבן 1?');
    expect(pipeline.getSession('972548317887')?.state).toBe('AWAITING_MAINTENANCE');

    // Manager replies with description
    deps.sent.length = 0;
    const msgDesc = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'הג׳קוזי לא מחמם' },
    } as any;
    await pipeline.handleInbound(msgDesc);
    expect(deps.resortos.reportMaintenance).toHaveBeenCalledWith({
      unitId: 'k685',
      description: 'הג׳קוזי לא מחמם',
      reportedBy: 'רני',
    });
    expect(deps.sent[0][1]).toContain('נפתחה קריאת תחזוקה');
    expect(pipeline.getSession('972548317887')).toBeUndefined();
  });

  it('manager action 4: confirms the guest phone and then sends the stay link by SMS', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'b-in-1',
        unit_id: 'k685',
        guest_name: 'יוסי כהן',
        guest_phone: '0541112233',
        check_in_date: today,
        check_out_date: '2026-10-20',
        checkout_token: 'tok-yossi',
        booking_status: 'CONFIRMED',
      } as any,
    ]);
    deps.resortos.sendGuestLinkSms = vi.fn(async () => ({ ok: true as const }));
    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', {
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
    });

    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '4' },
    } as any);
    expect(deps.sent[0][1]).toContain('0541112233');
    expect(deps.sent[0][1]).toContain('יוסי כהן');
    expect(deps.resortos.sendGuestLinkSms).not.toHaveBeenCalled();
    expect(pipeline.getSession('972548317887')?.state).toBe('AWAITING_GUEST_LINK');

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '0503934696' },
    } as any);
    expect(deps.resortos.sendGuestLinkSms).not.toHaveBeenCalled();
    expect(deps.sent[0][1]).toContain('0503934696');

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'כן' },
    } as any);
    expect(deps.resortos.sendGuestLinkSms).toHaveBeenCalledWith({
      bookingId: 'b-in-1',
      phone: '0503934696',
      message: expect.stringContaining('https://resortos.app/stay/tok-yossi'),
      reportedBy: 'רני',
    });
    expect(deps.sent[0][1]).toContain('נשלח בסמס');
    expect(pipeline.getSession('972548317887')?.state).toBe('AWAITING_ACTION');
  });

  it('manager action 5: prompts for guest note and saves it', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    deps.resortos.updateBookingNote = vi.fn(async () => {});
    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', {
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
      bookingId: 'book-456',
    });

    // Manager presses 5
    const msg5 = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'הערת אורח' },
    } as any;
    await pipeline.handleInbound(msg5);
    expect(deps.sent[0][1]).toContain('רני, כתוב את ההערה עבור אורח חדר נופים בלבן 1');
    expect(pipeline.getSession('972548317887')?.state).toBe('AWAITING_GUEST_NOTE');

    // Manager writes note
    deps.sent.length = 0;
    const msgNote = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'אורח VIP חוגג יום נישואין' },
    } as any;
    await pipeline.handleInbound(msgNote);
    expect(deps.resortos.updateBookingNote).toHaveBeenCalledWith({
      bookingId: 'book-456',
      note: 'אורח VIP חוגג יום נישואין',
      reportedBy: 'רני',
    });
    expect(deps.sent[0][1]).toContain('הערה נשמרה בהצלחה עבור אורח');
    expect(pipeline.getSession('972548317887')).toBeUndefined();
  });

  it('manager asks "מי נכנס היום?" and receives check-in details while keeping room context', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'b-in-1',
        unit_id: 'k685',
        guest_name: 'יוסי כהן',
        guest_phone: '0541112233',
        check_in_date: today,
        check_out_date: '2026-10-20',
        payment_status: 'PAID',
        adults_count: 2,
        children_count: 1,
        checkout_token: 'tok-yossi',
      } as any,
    ]);

    const pipeline = createPipeline(deps);
    // Manager has scanned B1 and is in room context
    pipeline.setSession('972548317887', {
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
    });

    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מי נכנס היום?' },
    } as any;
    await pipeline.handleInbound(msg);

    expect(deps.sent).toHaveLength(1);
    const reply = deps.sent[0][1];
    expect(reply).toContain('פרטי כניסה היום');
    expect(reply).toContain('יוסי כהן');
    expect(reply).toContain('0541112233');
    expect(reply).toContain('שולם במלואו ✅');
    expect(reply).toContain('https://resortos.app/stay/tok-yossi');
    // Crucial: session is NOT deleted! Manager can continue asking questions
    expect(pipeline.getSession('972548317887')?.roomId).toBe('k685');
  });

  it('manager asks "מי יצא היום?" and receives departure details', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'b-out-1',
        unit_id: 'k685',
        guest_name: 'מיכל לוי',
        guest_phone: '0529998877',
        check_in_date: '2026-10-14',
        check_out_date: today,
        payment_status: 'PAID',
        checkout_token: 'tok-michal',
      } as any,
    ]);

    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', {
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
    });

    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מי יצא היום?' },
    } as any;
    await pipeline.handleInbound(msg);

    expect(deps.sent).toHaveLength(1);
    const reply = deps.sent[0][1];
    expect(reply).toContain('פרטי יציאה היום');
    expect(reply).toContain('מיכל לוי');
    expect(reply).toContain('0529998877');
    expect(pipeline.getSession('972548317887')?.roomId).toBe('k685');
  });

  it('manager asks "האם שולם?" and receives payment state in context', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'b-in-1',
        unit_id: 'k685',
        guest_name: 'דן גרין',
        check_in_date: today,
        check_out_date: '2026-10-18',
        payment_status: 'PENDING',
      } as any,
    ]);

    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', {
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
    });

    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'האם שולם?' },
    } as any;
    await pipeline.handleInbound(msg);

    expect(deps.sent).toHaveLength(1);
    const reply = deps.sent[0][1];
    expect(reply).toContain('סטטוס תשלום');
    expect(reply).toContain('דן גרין');
    expect(reply).toContain('ממתין לתשלום ⏳');
    expect(pipeline.getSession('972548317887')?.roomId).toBe('k685');
  });

  it('manager types "מוכן" while in room context and approves room without needing room alias', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] },
    ];
    deps.resortos.approveRoomByManager = vi.fn(async () => ({ ok: true as const }));

    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', {
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
    });

    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מוכן' },
    } as any;
    await pipeline.handleInbound(msg);

    expect(deps.resortos.approveRoomByManager).not.toHaveBeenCalled();
    expect(deps.sent[0][1]).toContain('לעדכן?');
    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'כן' },
    } as any);
    expect(deps.resortos.approveRoomByManager).toHaveBeenCalledWith({
      unitId: 'k685',
      reportedBy: 'רני',
      note: 'מוכן',
    });
    expect(deps.sent[0][1]).toContain('אושר בהצלחה כמוכן לאורח (READY)');
  });
});

describe('guest knowledge & digital stay Q&A', () => {
  const guestPhone = '0521234567';
  const guestJid = '972521234567@s.whatsapp.net';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

  const mockGuestBooking = {
    id: 'b-guest-1',
    unit_id: 'k685',
    guest_name: 'דניאל כהן',
    guest_phone: guestPhone,
    check_in_date: today,
    check_out_date: today,
    checkout_token: 'token-dan-123',
    booking_status: 'CONFIRMED',
  };

  const guestRooms: RoomEntry[] = [
    {
      id: 'k685',
      name: 'נופים בלבן 1',
      property: 'נופים בלבן',
      letterCode: 'B1',
      lockbox: '2810',
      aliases: ['b1', 'נופים 1'],
    },
  ];

  function setupGuestDeps() {
    const deps = makeDeps();
    deps.cleaners = () => []; // not a staff member
    deps.rooms = () => guestRooms;
    deps.resortos.listBookings = vi.fn(async () => [mockGuestBooking as any]);
    return deps;
  }

  it('answers WiFi inquiry with correct complex SSID, password, and stayUrl', async () => {
    const deps = setupGuestDeps();
    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: guestJid, fromMe: false },
      message: { conversation: 'מה הסיסמה לוויפי בחדר?' },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    expect(deps.sent).toHaveLength(1);
    const reply = deps.sent[0][1];
    expect(reply).toContain('TP-Link_FA30_5G');
    expect(reply).toContain('15107312');
    expect(reply).toContain('https://resortos.app/stay/token-dan-123');
  });

  it('answers Jacuzzi inquiry with 4 steps including rubber plug and water level above jets', async () => {
    const deps = setupGuestDeps();
    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: guestJid, fromMe: false },
      message: { conversation: 'איך מפעילים את הג׳קוזי?' },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('פקק הגומי');
    expect(reply).toContain('סילונים');
    expect(reply).toContain('המתג בקיר');
    expect(reply).toContain('https://resortos.app/stay/token-dan-123');
  });

  it('answers gate code inquiry with moshav code #2464', async () => {
    const deps = setupGuestDeps();
    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: guestJid, fromMe: false },
      message: { conversation: 'מה קוד השער למושב?' },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('#2464');
  });

  it('answers food and restaurant inquiries with local recommendations', async () => {
    const deps = setupGuestDeps();
    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: guestJid, fromMe: false },
      message: { conversation: 'איפה יש מסעדה טובה או בשר באזור?' },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('מושבוץ');
    expect(reply).toContain('בשרים ומטבח מקומי');
    expect(reply).toContain('מרינדו');
    expect(reply).toContain('השיבו במספר מהרשימה');
  });

  it('answers checkout inquiry with 11:00 and digital self check-out', async () => {
    const deps = setupGuestDeps();
    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: guestJid, fromMe: false },
      message: { conversation: 'מתי שעת העזיבה והצ׳ק אאוט?' },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('11:00');
    expect(reply).toContain('08:00');
    expect(reply).toContain('https://resortos.app/stay/token-dan-123');
  });

  it('handles general question with polite greeting and link to digital stay card', async () => {
    const deps = setupGuestDeps();
    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: guestJid, fromMe: false },
      message: { conversation: 'שלום, מתי אפשר לקבל עוד מגבות לבריכה?' },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('דניאל,');
    expect(reply).not.toContain('שלום');
    expect(reply).toContain('https://resortos.app/stay/token-dan-123');
  });
});

describe('manager fuzzy room matching & dictation handling', () => {
  const managerProfile: CleanerProfile = {
    phone: '972548317887',
    name: 'רני',
    role: 'MANAGER',
    language: 'he',
  };

  it('manager asks "מה המצב בתזמורת 1?" -> resolves to D1 (k690) with confirmation badge', async () => {
    const deps = makeDeps();
    deps.rooms = () => realRooms;
    deps.cleaners = () => [managerProfile];
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k690', operational_status: 'READY', assigned_staff: null },
    ]);
    deps.resortos.listBookings = vi.fn(async () => []);

    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מה המצב בתזמורת 1?' },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('🔍 זיהיתי: *חצר מוזיקלית 1*');
    expect(reply).toContain('מוכן לאורח 🟢');
    expect(pipeline.getSession('972548317887')).toMatchObject({
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k690',
    });
  });

  it('answers a greeting in the same words, with the name', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    const pipeline = createPipeline(deps);
    const morning = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'בוקר טוב' },
    } as any;
    await pipeline.handleInbound(morning);
    expect(deps.sent[0][1]).toBe('בוקר טוב רני, במה אוכל לעזור לך היום?');
    expect(deps.llm.extractIntent).not.toHaveBeenCalled();

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'היי!' },
    } as any);
    expect(deps.sent[0][1]).toBe('היי רני, במה אוכל לעזור לך היום?');
  });

  it('asks before recording cash collected inside the room', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k693', name: 'בקתות מאיה 1', property: 'בקתות מאיה', letterCode: 'F1', lockbox: '2410', aliases: ['מאיה 1'] },
    ];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    const shift = (days: number) => {
      const date = new Date(`${today}T12:00:00+03:00`);
      date.setDate(date.getDate() + days);
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
    };
    deps.resortos.listBookings = vi.fn(async () => [{
      id: 'b1',
      unit_id: 'k693',
      guest_name: 'נועה לוי',
      check_in_date: shift(-1),
      check_out_date: shift(1),
      booking_status: 'CONFIRMED',
    }]);
    deps.resortos.collectCash = vi.fn(async () => ({ ok: true as const, guest_name: 'נועה לוי', amount_agorot: 100000 }));
    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', { role: 'MANAGER', state: 'AWAITING_ACTION', roomId: 'k693' });
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'גביתי 1000 מזומן' },
    } as any);
    expect(deps.resortos.collectCash).not.toHaveBeenCalled();
    expect(deps.sent[0][1]).toContain('הבנתי');
    expect(deps.sent[0][1]).toContain('₪1,000');
    expect(deps.sent[0][1]).toContain('נועה לוי');

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'כן' },
    } as any);
    expect(deps.resortos.collectCash).toHaveBeenCalledWith({
      unitId: 'k693',
      amountAgorot: 100000,
      reportedBy: 'רני',
      note: 'גביתי 1000 מזומן',
    });
    expect(deps.sent[0][1]).toContain('נרשמה גביית מזומן');
    expect(deps.sent[0][1]).toContain('נועה לוי');
    expect(deps.sent[0][1]).toContain('שולם חלקית');
    expect(deps.sent[0][1]).toContain('רני,');

    deps.resortos.setPaymentStatus = vi.fn(async () => ({ ok: true as const, guest_name: 'נועה לוי', payment_status: 'PARTIAL' }));
    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '1' },
    } as any);
    expect(deps.resortos.setPaymentStatus).toHaveBeenCalledWith({
      unitId: 'k693',
      status: 'PARTIAL',
      reportedBy: 'רני',
    });
    expect(deps.sent[0][1]).toContain('שולם חלקית');
  });

  it('asks before blocking a room for one night, then reports the calendar result', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k693', name: 'בקתות מאיה 1', property: 'בקתות מאיה', letterCode: 'F1', lockbox: '2410', aliases: ['מאיה 1'] },
    ];
    let finish: (value: { ok: true; verified: boolean }) => void = () => {};
    deps.resortos.holdNight = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', { role: 'MANAGER', state: 'AWAITING_ACTION', roomId: 'k693' });
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'לא זמין' },
    } as any);
    expect(deps.resortos.holdNight).not.toHaveBeenCalled();
    expect(deps.sent[0][1]).toContain('חסימה ללילה אחד');
    expect(deps.sent[0][1]).toContain('כן');

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'כן' },
    } as any);
    expect(deps.resortos.holdNight).toHaveBeenCalledWith({ unitId: 'k693', reportedBy: 'רני' });
    expect(deps.sent[0][1]).toContain('בתהליך');
    expect(deps.sent.some((row) => String(row[1]).includes('יומן כינורות'))).toBe(false);

    finish({ ok: true, verified: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deps.sent.some((row) => String(row[1]).includes('חסום ללילה ביומן כינורות'))).toBe(true);
  });

  it('answers a manager with the same area and cabin information a guest gets', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k693', name: 'בקתות מאיה 1', property: 'בקתות מאיה', letterCode: 'F1', lockbox: '2410', aliases: ['מאיה 1'] },
    ];
    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', { role: 'MANAGER', state: 'AWAITING_ACTION', roomId: 'k693' });
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'איפה שותים קפה עכשיו?' },
    } as any);
    expect(deps.sent[0][1]).toContain('המטבח');
    expect(deps.sent[0][1]).toContain('1.');
    expect(deps.sent[0][1]).not.toContain('resortos.app/stay');
    expect(deps.llm.extractIntent).not.toHaveBeenCalled();

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מה יש בתוך הבקתה?' },
    } as any);
    expect(deps.sent[0][1]).toContain('בריכה פרטית');
    expect(deps.sent[0][1]).toContain('ג׳קוזי');
    expect(pipeline.getSession('972548317887')?.roomId).toBe('k693');
  });

  it('opens a numbered shop list and then the chosen place', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [managerProfile];
    deps.rooms = () => [
      { id: 'k693', name: 'בקתות מאיה 1', property: 'בקתות מאיה', letterCode: 'F1', lockbox: '2410', aliases: ['מאיה 1'] },
    ];
    const pipeline = createPipeline(deps);
    pipeline.setSession('972548317887', { role: 'MANAGER', state: 'AWAITING_ACTION', roomId: 'k693' });
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'איפה קונים חלב' },
    } as any);
    expect(deps.sent[0][1]).toContain('1. *סופרמרקט וגלריה · רמות*');
    expect(deps.llm.extractIntent).not.toHaveBeenCalled();

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '1' },
    } as any);
    expect(deps.sent[0][1]).toContain('04-673-1408');
    expect(deps.sent[0][1]).toContain('וויז:');
    expect(deps.sent[0][1]).toContain('גוגל מפות:');
    expect(deps.sent[0][1]).toMatch(/פתוח עכשיו|סגור עכשיו/);
    expect(pipeline.getSession('972548317887')?.state).toBe('AWAITING_PLACE');
  });

  it('answers a cleaner about the jacuzzi without a guest link', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [{ phone: '972500000001', name: 'עדי', role: 'HOUSEKEEPING', language: 'he' }];
    const pipeline = createPipeline(deps);
    await pipeline.handleInbound({
      key: { remoteJid: '972500000001@s.whatsapp.net', fromMe: false },
      message: { conversation: 'איך מפעילים את הג׳קוזי?' },
    } as any);
    expect(deps.sent[0][1]).toContain('פקק הגומי');
    expect(deps.sent[0][1]).not.toContain('resortos.app/stay');
    expect(deps.llm.extractIntent).not.toHaveBeenCalled();
  });

  it('manager asks "מה הקוד כספת של תזמורת 1?" -> answers with lockbox code for D1', async () => {
    const deps = makeDeps();
    deps.rooms = () => realRooms;
    deps.cleaners = () => [managerProfile];
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k690', operational_status: 'READY', assigned_staff: null },
    ]);
    deps.resortos.listBookings = vi.fn(async () => []);

    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מה הקוד כספת של תזמורת 1?' },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('🔍 זיהיתי: *חצר מוזיקלית 1*');
    expect(reply).toContain('2610');
  });

  it('manager asks with voice dictation "מה המצב בטאג\' שלוש?" -> resolves to E3 (k810)', async () => {
    const deps = makeDeps();
    deps.rooms = () => realRooms;
    deps.cleaners = () => [managerProfile];
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k810', operational_status: 'DIRTY', assigned_staff: null },
    ]);
    deps.resortos.listBookings = vi.fn(async () => []);

    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: "מה המצב בטאג' שלוש?" },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain("🔍 זיהיתי: *טאג' מאהל 3*");
    expect(reply).toContain('ממתין לניקיון 🔴');
    expect(pipeline.getSession('972548317887')).toMatchObject({
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k810',
    });
  });

  it('manager asks "מה קורה בתזמורת?" -> triggers complex clarification prompt for D1, D2, D3', async () => {
    const deps = makeDeps();
    deps.rooms = () => realRooms;
    deps.cleaners = () => [managerProfile];
    deps.resortos.listUnits = vi.fn(async () => []);
    deps.resortos.listBookings = vi.fn(async () => []);

    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מה קורה בתזמורת?' },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('חצר מוזיקלית');
    expect(reply).toContain('*1* - חצר מוזיקלית 1');
    expect(reply).toContain('*2* - חצר מוזיקלית 2');
    expect(reply).toContain('*3* - חצר מוזיקלית 3');
    expect(reply).toContain('*4* - חצר');
    expect(reply).toContain('*5* - בריכה');
    expect(pipeline.getSession('972548317887')).toEqual({
      role: 'MANAGER',
      state: 'AWAITING_CLARIFICATION',
      candidateRoomIds: ['k690', 'k691', 'k692', 'yard:musical', 'pool:musical'],
      pendingQuestion: 'מה קורה בתזמורת?',
    });

    // Manager replies "2"
    deps.sent.length = 0;
    const msgChoice = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '2' },
    } as any;

    const res2 = await pipeline.handleInbound(msgChoice);
    expect(res2.handled).toBe(true);
    const reply2 = deps.sent[0][1];
    expect(reply2).toContain('🔍 נבחר: *חצר מוזיקלית 2*');
    expect(pipeline.getSession('972548317887')).toMatchObject({
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k691',
    });
  });

  it('offers the pool status when the manager picks it from the complex list', async () => {
    const deps = makeDeps();
    deps.rooms = () => realRooms;
    deps.cleaners = () => [managerProfile];
    deps.resortos.getGroundStatus = vi.fn(async () => ({ status: 'inspect', updatedBy: 'עדי' }));
    const pipeline = createPipeline(deps);
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מה קורה בתזמורת?' },
    } as any);
    deps.sent.length = 0;
    const picked = await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '5' },
    } as any);
    expect(picked.handled).toBe(true);
    expect(deps.sent[0][1]).toContain('בריכה · החצר המוסיקלית');
    expect(deps.sent[0][1]).toContain('לבדיקה');
    expect(deps.sent[0][1]).toContain('עדי');
  });

  it('manager asks "מי נכנס היום לתזמורת?" -> clarifies, manager picks 1 -> answers check-in for D1', async () => {
    const deps = makeDeps();
    deps.rooms = () => realRooms;
    deps.cleaners = () => [managerProfile];
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k690', operational_status: 'READY', assigned_staff: null },
    ]);
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'b-d1',
        unit_id: 'k690',
        guest_name: 'יוסי כהן',
        guest_phone: '0501112233',
        check_in_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()),
        check_out_date: '2026-10-18',
        num_guests: 2,
        num_children: 0,
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        financial_status: 'PAID',
      },
    ]);

    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מי נכנס היום לתזמורת?' },
    } as any;

    await pipeline.handleInbound(msg);
    expect(pipeline.getSession('972548317887')?.state).toBe('AWAITING_CLARIFICATION');

    // Manager selects 1
    deps.sent.length = 0;
    const msgPick = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '1' },
    } as any;

    const resPick = await pipeline.handleInbound(msgPick);
    expect(resPick.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('🔍 נבחר: *חצר מוזיקלית 1*');
    expect(reply).toContain('יוסי כהן');
    expect(reply).toContain('0501112233');
    expect(pipeline.getSession('972548317887')).toMatchObject({
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k690',
    });
  });

  it('keeps the complex: "2" after מאיה 1 opens מאיה 2 after menu TTL', async () => {
    vi.useFakeTimers();
    try {
      const deps = makeDeps();
      deps.rooms = () => realRooms as RoomEntry[];
      deps.cleaners = () => [managerProfile];
      deps.resortos.listUnits = vi.fn(async () => []);
      deps.resortos.listBookings = vi.fn(async () => []);
      deps.resortos.approveRoomByManager = vi.fn(async () => ({ ok: true as const }));

      const pipeline = createPipeline(deps);
      await pipeline.handleInbound({
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'מאיה 1' },
      } as any);

      // Advance clock past 10-minute action menu TTL
      vi.setSystemTime(Date.now() + 11 * 60 * 1000);

      deps.sent.length = 0;
      const res = await pipeline.handleInbound({
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: '2' },
      } as any);

      expect(res.handled).toBe(true);
      expect(deps.sent[0][1]).toContain('בקתות מאיה 2');
      expect(deps.sent[0][1]).not.toContain('לאיזה מתחם');
      expect(deps.resortos.approveRoomByManager).not.toHaveBeenCalled();
      expect(pipeline.getSession('972548317887')).toMatchObject({ roomId: 'k694' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('remembers the number when the complex arrives on the next message', async () => {
    const deps = makeDeps();
    deps.rooms = () => realRooms as RoomEntry[];
    deps.cleaners = () => [managerProfile];
    deps.resortos.listUnits = vi.fn(async () => []);
    deps.resortos.listBookings = vi.fn(async () => []);

    const pipeline = createPipeline(deps);
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '2' },
    } as any);
    expect(deps.sent[0][1]).toContain('לאיזה מתחם');

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מאיה' },
    } as any);

    expect(deps.sent[0][1]).toContain('בקתות מאיה 2');
    expect(deps.sent[0][1]).not.toContain('באיזו יחידה');
    expect(pipeline.getSession('972548317887')).toMatchObject({ roomId: 'k694' });
  });

  it('manager asks ambiguous "בקתה 1" -> triggers number clarification prompt', async () => {
    const deps = makeDeps();
    deps.rooms = () => realRooms;
    deps.cleaners = () => [managerProfile];

    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'בקתה 1' },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    const reply = deps.sent[0][1];
    expect(reply).toContain('ישנן מספר יחידות עם המספר *1*');
    expect(reply).toContain('לאיזה מתחם התכוונת?');
    expect(pipeline.getSession('972548317887')?.state).toBe('AWAITING_CLARIFICATION');
  });

  it('manager does quick approval with slang "מוכן תזמורת 1" -> marks k690 ready', async () => {
    const deps = makeDeps();
    deps.rooms = () => realRooms;
    deps.cleaners = () => [managerProfile];
    deps.resortos.approveRoomByManager = vi.fn(async () => ({ ok: true as const }));

    const pipeline = createPipeline(deps);
    const msg = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'מוכן תזמורת 1' },
    } as any;

    const res = await pipeline.handleInbound(msg);
    expect(res.handled).toBe(true);
    expect(deps.resortos.approveRoomByManager).not.toHaveBeenCalled();
    expect(deps.sent[0][1]).toContain('הבנתי');
    expect(deps.sent[0][1]).toContain('חצר מוזיקלית 1');
    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'כן' },
    } as any);
    expect(deps.resortos.approveRoomByManager).toHaveBeenCalledWith({
      unitId: 'k690',
      reportedBy: 'רני',
      note: 'מוכן תזמורת 1',
    });
    expect(deps.sent[0][1]).toContain('אושר בהצלחה כמוכן לאורח (READY)');
  });

  describe('Bug 8: manager unit action menu context and options routing', () => {
    it('unit -> "1" goes to status change for the same unit', async () => {
      const deps = makeDeps();
      deps.rooms = () => realRooms as RoomEntry[];
      deps.cleaners = () => [managerProfile];
      deps.resortos.listUnits = vi.fn(async () => []);
      deps.resortos.listBookings = vi.fn(async () => []);

      const pipeline = createPipeline(deps);
      await pipeline.handleInbound({
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'נורית 5' },
      } as any);

      expect(pipeline.getSession('972548317887')?.roomId).toBe('k676');

      deps.sent.length = 0;
      const res = await pipeline.handleInbound({
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: '1' },
      } as any);

      expect(res.handled).toBe(true);
      expect(deps.sent[0][1]).toContain('בחר סטטוס חדש לחדר בתי נורית 5');
      expect(pipeline.getSession('972548317887')).toMatchObject({
        role: 'MANAGER',
        state: 'SELECT_STATUS',
        roomId: 'k676',
      });
    });

    it('unit -> "2" goes to add room note for the same unit', async () => {
      const deps = makeDeps();
      deps.rooms = () => realRooms as RoomEntry[];
      deps.cleaners = () => [managerProfile];
      deps.resortos.listUnits = vi.fn(async () => []);
      deps.resortos.listBookings = vi.fn(async () => []);

      const pipeline = createPipeline(deps);
      await pipeline.handleInbound({
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'נורית 5' },
      } as any);

      deps.sent.length = 0;
      const res = await pipeline.handleInbound({
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: '2' },
      } as any);

      expect(res.handled).toBe(true);
      expect(deps.sent[0][1]).toContain('כתוב את ההערה עבור חדר בתי נורית 5: 📝');
      expect(pipeline.getSession('972548317887')).toMatchObject({
        role: 'MANAGER',
        state: 'AWAITING_ROOM_NOTE',
        roomId: 'k676',
      });
    });

    it('a new unit name overrides pending menu', async () => {
      const deps = makeDeps();
      deps.rooms = () => realRooms as RoomEntry[];
      deps.cleaners = () => [managerProfile];
      deps.resortos.listUnits = vi.fn(async () => []);
      deps.resortos.listBookings = vi.fn(async () => []);

      const pipeline = createPipeline(deps);
      await pipeline.handleInbound({
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'נורית 5' },
      } as any);

      deps.sent.length = 0;
      const res = await pipeline.handleInbound({
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'נורית 2' },
      } as any);

      expect(res.handled).toBe(true);
      expect(deps.sent[0][1]).toContain('בתי נורית 2');
      expect(pipeline.getSession('972548317887')).toMatchObject({
        role: 'MANAGER',
        state: 'AWAITING_ACTION',
        roomId: 'k673',
      });
    });

    it('after TTL a digit falls back to current behavior', async () => {
      vi.useFakeTimers();
      try {
        const deps = makeDeps();
        deps.rooms = () => realRooms as RoomEntry[];
        deps.cleaners = () => [managerProfile];
        deps.resortos.listUnits = vi.fn(async () => []);
        deps.resortos.listBookings = vi.fn(async () => []);

        const pipeline = createPipeline(deps);
        await pipeline.handleInbound({
          key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
          message: { conversation: 'נורית 5' },
        } as any);

        // Advance 11 minutes (past 10 min TTL)
        vi.setSystemTime(Date.now() + 11 * 60 * 1000);

        deps.sent.length = 0;
        const res = await pipeline.handleInbound({
          key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
          message: { conversation: '1' },
        } as any);

        expect(res.handled).toBe(true);
        // Falls back to opening unit 1 in Nurit
        expect(deps.sent[0][1]).toContain('בתי נורית 1');
        expect(pipeline.getSession('972548317887')).toMatchObject({
          role: 'MANAGER',
          state: 'AWAITING_ACTION',
          roomId: 'k671',
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('staff accommodation & space classification guards', () => {
    it('protects staff accommodation from unauthenticated guest scan and does not reveal lockbox', async () => {
      const deps = makeDeps();
      deps.rooms = () => realRooms;
      deps.cleaners = () => []; // Unregistered / prospective guest
      const pipeline = createPipeline(deps);

      const msg = {
        key: { remoteJid: '972509999999@s.whatsapp.net', fromMe: false },
        message: { conversation: 'START_k678' },
      } as any;

      const res = await pipeline.handleInbound(msg);
      expect(res.handled).toBe(true);
      const reply = deps.sent[0][1];
      expect(reply).toContain('מגורי צוות');
      expect(reply).toContain('לא יחידת אירוח');
      expect(reply).not.toContain('2370'); // Lockbox code must NOT be leaked
    });

    it('informs guest inquiring about staff accommodation units that they are staff housing', async () => {
      const deps = makeDeps();
      deps.rooms = () => realRooms;
      deps.cleaners = () => [];
      const pipeline = createPipeline(deps);

      const msg = {
        key: { remoteJid: '972509999999@s.whatsapp.net', fromMe: false },
        message: { conversation: 'שלום, אפשר להזמין את בתי נורית 7 לסוף שבוע?' },
      } as any;

      const res = await pipeline.handleInbound(msg);
      expect(res.handled).toBe(true);
      const reply = deps.sent[0][1];
      expect(reply).toContain('מגורי צוות');
      expect(reply).toContain('בקתות האירוח לאורחים במתחם הן בקתות 1 עד 6');
    });

    it('manager scanning k678 receives initial card indicating staff accommodation', async () => {
      const deps = makeDeps();
      deps.rooms = () => realRooms;
      deps.cleaners = () => [managerProfile];
      const pipeline = createPipeline(deps);

      const msg = {
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'START_G7' },
      } as any;

      const res = await pipeline.handleInbound(msg);
      expect(res.handled).toBe(true);
      const reply = deps.sent[0][1];
      expect(reply).toContain('מגורי עובדים (סגור לאורחים)');
      expect(reply).toContain('2370'); // Manager CAN see the lockbox
    });
  });

  describe('strict financial data access control (RBAC)', () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

    const managerProfile: CleanerProfile = {
      phone: '972548317887',
      name: 'דניאל',
      role: 'MANAGER',
      language: 'he',
    };

    const cleanerProfile: CleanerProfile = {
      phone: '972503934696',
      name: 'ברק',
      role: 'HOUSEKEEPING',
      language: 'he',
    };

    const bookingWithFinances = {
      id: 'book-fin-1',
      unit_id: 'k690',
      guest_name: 'יוסי כהן',
      guest_phone: '052-1112233',
      check_in_date: today,
      check_out_date: '2026-10-25',
      booking_status: 'CONFIRMED',
      payment_status: 'PENDING',
      total_price_agorot: 250000, // 2,500 NIS
      deposit_agorot: 50000,     // 500 NIS
      checkout_token: 'tok_yossi_123',
    };

    it('manager receives complete financial breakdown (status, total, deposit, balance)', async () => {
      const deps = makeDeps();
      deps.cleaners = () => [managerProfile];
      deps.resortos.listBookings = vi.fn(async () => [bookingWithFinances]);
      const pipeline = createPipeline(deps);

      // Manager queries room D1
      await pipeline.handleInbound({
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'D1' },
      } as any);

      // Manager asks about payments in context
      await pipeline.handleInbound({
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'האם שולם?' },
      } as any);

      const reply = deps.sent[deps.sent.length - 1][1];
      expect(reply).toContain('מידע פיננסי');
      expect(reply).toContain('ממתין לתשלום');
      expect(reply).toContain('2,500'); // Total price
      expect(reply).toContain('500');   // Deposit paid
      expect(reply).toContain('2,000'); // Balance due
    });

    it('cleaner/worker asking about payments or money is strictly blocked', async () => {
      const deps = makeDeps();
      deps.cleaners = () => [cleanerProfile];
      const pipeline = createPipeline(deps);

      const msg = {
        key: { remoteJid: '972503934696@s.whatsapp.net', fromMe: false },
        message: { conversation: 'כמה שילמו על החדר?' },
      } as any;

      const res = await pipeline.handleInbound(msg);
      expect(res.handled).toBe(true);
      const reply = deps.sent[0][1];
      expect(reply).toContain('מידע פיננסי, עלויות וסטטוס תשלומים נגישים למנהלי המערכת בלבד');
      // No financial numbers leaked
      expect(reply).not.toContain('2500');
    });

    it('verified guest asking about payment receives only their own booking details and stay URL', async () => {
      const deps = makeDeps();
      deps.resortos.listBookings = vi.fn(async () => [bookingWithFinances]);
      const pipeline = createPipeline(deps);

      const msg = {
        key: { remoteJid: '972521112233@s.whatsapp.net', fromMe: false },
        message: { conversation: 'שלום, כמה עלי לשלם עבור השהות?' },
      } as any;

      const res = await pipeline.handleInbound(msg);
      expect(res.handled).toBe(true);
      const reply = deps.sent[0][1];
      expect(reply).toContain('פרטי תשלום עבור הזמנתכם');
      expect(reply).toContain('קיימת יתרה לתשלום');
      expect(reply).toContain('2,500');
      expect(reply).toContain('500');
      expect(reply).toContain('2,000');
      expect(reply).toContain('https://resortos.app/stay/tok_yossi_123');
    });

    it('guest inquiring about another room payments is strictly blocked', async () => {
      const deps = makeDeps();
      deps.resortos.listBookings = vi.fn(async () => [bookingWithFinances]);
      const pipeline = createPipeline(deps);

      const msg = {
        key: { remoteJid: '972521112233@s.whatsapp.net', fromMe: false },
        message: { conversation: 'כמה שילמו האורחים בטוסקנה 1?' },
      } as any;

      const res = await pipeline.handleInbound(msg);
      expect(res.handled).toBe(true);
      const reply = deps.sent[0][1];
      expect(reply).toContain('פרטי הזמנות, תשלומים ומחירים של אורחים אחרים הינם חסויים לחלוטין');
    });
  });

  describe('manager inspection & cleaning status queries', () => {
    it('manager asking "מה ממתין לבדיקה" returns rooms awaiting inspection with quick approve shortcuts', async () => {
      const deps = makeDeps();
      deps.cleaners = () => [managerProfile];
      deps.rooms = () => realRooms as RoomEntry[];
      deps.resortos.listUnits = vi.fn(async () => [
        { id: 'k690', operational_status: 'READY', custom_reason: 'ממתין לביקורת מנהל', assigned_staff: 'ברק' },
        { id: 'k680', operational_status: 'READY', custom_reason: 'אושר ע״י מנהל', assigned_staff: 'רני' },
        { id: 'k681', operational_status: 'DIRTY', custom_reason: 'ניקוי לאחר יציאה' },
      ]);
      const pipeline = createPipeline(deps);

      const msg = {
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'מה ממתין לבדיקה' },
      } as any;

      const res = await pipeline.handleInbound(msg);
      expect(res.handled).toBe(true);
      const reply = deps.sent[0][1];
      expect(reply).toContain('חדרים שממתינים לביקורת מנהל (1)');
      expect(reply).toContain('חצר מוסיקלית · בקתה 1');
      expect(reply).toContain('נוקה ע״י ברק');
      expect(reply).toContain('מוכן D1');
      // k680 (already approved) and k681 (dirty) must NOT appear in inspection list
      expect(reply).not.toContain('מול הנוף · בקתה 1');
      expect(reply).not.toContain('מול הנוף · בקתה 2');
    });

    it('manager asking "מה ממתין לבדיקה" when none awaiting returns clear zero-state', async () => {
      const deps = makeDeps();
      deps.cleaners = () => [managerProfile];
      deps.rooms = () => realRooms as RoomEntry[];
      deps.resortos.listUnits = vi.fn(async () => [
        { id: 'k680', operational_status: 'READY', custom_reason: 'אושר ע״י מנהל' },
      ]);
      const pipeline = createPipeline(deps);

      const msg = {
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'מה צריך לבדוק?' },
      } as any;

      const res = await pipeline.handleInbound(msg);
      expect(res.handled).toBe(true);
      const reply = deps.sent[0][1];
      expect(reply).toContain('אין כרגע חדרים שממתינים לביקורת');
    });

    it('manager asking "מה ממתין לניקיון" returns dirty rooms list and current in-progress cleanings', async () => {
      const deps = makeDeps();
      deps.cleaners = () => [managerProfile];
      deps.rooms = () => realRooms as RoomEntry[];
      deps.resortos.listUnits = vi.fn(async () => [
        { id: 'k681', operational_status: 'DIRTY', custom_reason: 'ניקוי לאחר יציאה' },
        { id: 'k682', operational_status: 'IN_PROGRESS', assigned_staff: 'שיבה' },
        { id: 'k680', operational_status: 'READY', custom_reason: 'אושר ע״י מנהל' },
      ]);
      const pipeline = createPipeline(deps);

      const msg = {
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'מה ממתין לניקיון?' },
      } as any;

      const res = await pipeline.handleInbound(msg);
      expect(res.handled).toBe(true);
      const reply = deps.sent[0][1];
      expect(reply).toContain('סטטוס ניקיונות למנהל');
      expect(reply).toContain('בנקיון כרגע (1)');
      expect(reply).toContain('מנקה: שיבה');
      expect(reply).toContain('ממתינים לניקיון (1)');
      expect(reply).toContain('מול הנוף 2');
      // READY room must not be in dirty list
      expect(reply).not.toContain('מול הנוף 1');
    });

    it('daily status report cleanly separates awaiting inspection from fully ready and includes checkout turnovers', async () => {
      const deps = makeDeps();
      deps.cleaners = () => [managerProfile];
      deps.rooms = () => realRooms as RoomEntry[];
      deps.llm.extractIntent = vi.fn(async () => ({ action: 'QUERY_STATUS', room_id: null, room_raw: 'סטטוס', issue_description_hebrew: null }));
      deps.resortos.listUnits = vi.fn(async () => [
        { id: 'k690', operational_status: 'READY', custom_reason: 'ממתין לביקורת מנהל' },
        { id: 'k680', operational_status: 'READY', custom_reason: 'אושר ע״י מנהל' },
        { id: 'k681', operational_status: 'IN_PROGRESS', assigned_staff: 'ברק' },
        { id: 'k682', operational_status: 'DIRTY' },
      ]);
      const pipeline = createPipeline(deps);

      const msg = {
        key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
        message: { conversation: 'סטטוס יומי' },
      } as any;

      const res = await pipeline.handleInbound(msg);
      expect(res.handled).toBe(true);
      const reply = deps.sent[0][1];
      expect(reply).toContain('פנויים להיום');
      expect(reply).not.toContain('תמונת מצב יומית');
      expect(reply).not.toContain('ממתינים לביקורת מנהל');
    });
  });
});

describe('rack rate price list for all staff', () => {
  const housekeeper: CleanerProfile = {
    phone: '972503934696',
    name: 'ברק',
    role: 'HOUSEKEEPING',
    language: 'he',
  };
  const manager: CleanerProfile = {
    phone: '972548317887',
    name: 'דניאל',
    role: 'MANAGER',
    language: 'he',
  };

  it('answers a unit price to housekeeping without calling the model', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [housekeeper];
    deps.rooms = () => realRooms as RoomEntry[];
    const pipeline = createPipeline(deps);

    const res = await pipeline.handleInbound({
      key: { remoteJid: '972503934696@s.whatsapp.net', fromMe: false },
      message: { conversation: 'כמה עולה מאיה 1' },
    } as any);

    expect(res.handled).toBe(true);
    expect(deps.llm.extractIntent).not.toHaveBeenCalled();
    const reply = deps.sent[0][1];
    expect(reply).toContain('750');
    expect(reply).toContain('1,300');
    expect(reply).toContain('אמצ״ש');
    expect(reply).toContain('סופ״ש');
    expect(reply).not.toContain('בריכה');
  });

  it('still hides guest payment details from housekeeping', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [housekeeper];
    deps.rooms = () => realRooms as RoomEntry[];
    const pipeline = createPipeline(deps);

    await pipeline.handleInbound({
      key: { remoteJid: '972503934696@s.whatsapp.net', fromMe: false },
      message: { conversation: 'כמה שילמו על מאיה 1?' },
    } as any);

    expect(deps.sent[0][1]).toContain('נגישים למנהלי המערכת בלבד');
    expect(deps.sent[0][1]).not.toContain('750');
  });

  it('answers the current room rack rate when a manager asks for the price', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [manager];
    deps.rooms = () => realRooms as RoomEntry[];
    const pipeline = createPipeline(deps);
    const jid = '972548317887@s.whatsapp.net';

    await pipeline.handleInbound({
      key: { remoteJid: jid, fromMe: false },
      message: { conversation: 'D1' },
    } as any);
    await pipeline.handleInbound({
      key: { remoteJid: jid, fromMe: false },
      message: { conversation: 'מה המחיר' },
    } as any);

    const reply = deps.sent[deps.sent.length - 1][1];
    expect(reply).toContain('600');
    expect(reply).toContain('900');
    expect(reply).not.toContain('סטטוס תשלום');
    expect(deps.llm.extractIntent).not.toHaveBeenCalled();
  });

  it('returns the gate code on the exact phrase without calling the model', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [housekeeper];
    deps.rooms = () => realRooms as RoomEntry[];
    const pipeline = createPipeline(deps);

    const res = await pipeline.handleInbound({
      key: { remoteJid: '972503934696@s.whatsapp.net', fromMe: false },
      message: { conversation: 'קוד השער' },
    } as any);

    expect(res.handled).toBe(true);
    expect(deps.sent[0][1]).toContain('#2464');
    expect(deps.llm.extractIntent).not.toHaveBeenCalled();
  });

  it('recognizes a manager messaging from a WhatsApp @lid JID and returns full room details for "משרד"', async () => {
    const deps = makeDeps();
    const raniManager: CleanerProfile = {
      phone: '972548317887',
      lid: '170626836910125',
      name: 'רני',
      role: 'MANAGER',
      language: 'he',
    };
    deps.cleaners = () => [raniManager];
    deps.rooms = () => realRooms as RoomEntry[];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'pilot-office', name: 'משרד', operational_status: 'READY', custom_reason: 'אושר ע״י מנהל' },
    ]);
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'b_demo_pilot_office',
        unit_id: 'pilot-office',
        guest_name: 'רני',
        guest_phone: '0548317887',
        check_in_date: today,
        check_out_date: '2026-11-01',
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        checkout_token: 'tok_pilot_office_demo',
      },
    ]);

    const pipeline = createPipeline(deps);

    // 1. Send "משרד" from Rani's LID JID
    const res1 = await pipeline.handleInbound({
      key: { remoteJid: '170626836910125@lid', fromMe: false },
      message: { conversation: 'משרד' },
    } as any);

    expect(res1.handled).toBe(true);
    expect(deps.sent).toHaveLength(1);
    const reply1 = deps.sent[0][1];
    expect(reply1).toContain('📋 *משרד*');
    expect(reply1).toContain('🔑 קוד כספת: *1357#*');
    expect(reply1).toContain('צ׳ק אין היום (רני)');
    expect(pipeline.getSession('972548317887')?.roomId).toBe('pilot-office');

    // 2. Ask for customer details while in משרד context from LID JID
    deps.sent.length = 0;
    const res2 = await pipeline.handleInbound({
      key: { remoteJid: '170626836910125@lid', fromMe: false },
      message: { conversation: 'פרטי לקוח' },
    } as any);

    expect(res2.handled).toBe(true);
    expect(deps.sent).toHaveLength(1);
    expect(deps.sent[0][1]).toContain('פרטי לקוח · משרד');
    expect(deps.sent[0][1]).toContain('רני');

    // 3. Switch to B1 and then back to "במשרד"
    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '170626836910125@lid', fromMe: false },
      message: { conversation: 'B1' },
    } as any);
    expect(pipeline.getSession('972548317887')?.roomId).toBe('k685');

    deps.sent.length = 0;
    await pipeline.handleInbound({
      key: { remoteJid: '170626836910125@lid', fromMe: false },
      message: { conversation: 'במשרד' },
    } as any);
    expect(pipeline.getSession('972548317887')?.roomId).toBe('pilot-office');
    expect(deps.sent[0][1]).toContain('📋 *משרד*');
  });
});





describe('manager explicit room hold (אשר סגירה)', () => {
  const manager: CleanerProfile = { phone: '972548317887', name: 'רני', role: 'MANAGER', language: 'he' };
  const housekeeper: CleanerProfile = { phone: '972503934696', name: 'ברק', role: 'HOUSEKEEPING', language: 'he' };
  const rooms = () => [
    { id: 'k674', name: 'בתי נורית 3', property: 'בתי נורית', letterCode: 'G3', lockbox: '', aliases: ['בתי נורית 3', 'נורית 3'] },
  ];
  const msg = (from: string, text: string) => ({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } } as any);
  process.env.ROOM_HOLD_AUDIT_PATH = '/tmp/room-hold-audit.test.jsonl';
  // keep the call-desk lookup off the live bridge
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    return () => { vi.unstubAllGlobals(); };
  });

  it('manager: preview, then holds only after the explicit confirm word', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [manager];
    deps.rooms = rooms as any;
    const held: any[] = [];
    deps.resortos.listBookings = vi.fn(async () => held);
    deps.resortos.holdNight = vi.fn(async () => {
      const night = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
      const out = new Date(`${night}T12:00:00Z`); out.setUTCDate(out.getUTCDate() + 1);
      held.push({ id: 'kin_1_81234', unit_id: 'k674', guest_name: 'לא זמין', check_in_date: night, check_out_date: out.toISOString().slice(0, 10) });
      return { ok: true as const, verified: true, resId: '81234' };
    });
    const pipeline = createPipeline(deps);
    await pipeline.handleInbound(msg('972548317887', 'תסגרי את נורית 3 להיום'));
    expect(deps.resortos.holdNight).not.toHaveBeenCalled();
    expect(deps.sent.at(-1)![1]).toContain('אשר סגירה');
    await pipeline.handleInbound(msg('972548317887', 'אשר סגירה'));
    expect(deps.resortos.holdNight).toHaveBeenCalledWith({ unitId: 'k674', reportedBy: 'רני' });
    expect(deps.sent.at(-1)![1]).toContain('81234');
  });

  it('non-manager never reaches the hold', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [housekeeper];
    deps.rooms = rooms as any;
    deps.resortos.listBookings = vi.fn(async () => []);
    deps.resortos.holdNight = vi.fn(async () => ({ ok: true as const, verified: true, resId: '1' }));
    const pipeline = createPipeline(deps);
    await pipeline.handleInbound(msg('972503934696', 'תסגרי את נורית 3 להיום'));
    await pipeline.handleInbound(msg('972503934696', 'אשר סגירה'));
    expect(deps.resortos.holdNight).not.toHaveBeenCalled();
    expect(deps.sent.some((r) => String(r[1]).includes('אשר סגירה'))).toBe(false);
  });
});

describe('S01: @lid guest identification and Wi-Fi without placeholders', () => {
  const officeRoom = { id: 'pilot-office', name: 'משרד', property: 'משרד ראשי', letterCode: 'Office', lockbox: '1357#', aliases: ['משרד', 'המשרד'] } as any;
  const officeBooking = {
    id: 'b_demo_pilot_office',
    unit_id: 'pilot-office',
    guest_name: 'נטשה',
    guest_phone: '0548076123',
    check_in_date: '2000-01-01',
    check_out_date: '2999-12-31',
    booking_status: 'CONFIRMED',
    checkout_token: 'tok_office_test',
  };
  const wifiQ = 'היי שלום, אני נטשה ואני מתארחת בחדר המשרד. מה הסיסמה לווייפי?';

  it('matches the booking via key.senderPn for an @lid sender and returns the office Wi-Fi to the original jid', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [];
    deps.rooms = () => [officeRoom];
    deps.resortos.listBookings = vi.fn(async () => [officeBooking]) as any;
    const info = vi.fn();
    deps.log = { info, warn() {}, error() {} };
    const msg = {
      key: { remoteJid: '27020092284969@lid', senderPn: '972548076123@s.whatsapp.net', fromMe: false },
      message: { conversation: wifiQ },
    } as any;
    const r = await createPipeline(deps).handleInbound(msg);
    expect(r.handled).toBe(true);
    expect(deps.sent).toHaveLength(1);
    expect(deps.sent[0][0]).toBe('27020092284969@lid');
    const reply = deps.sent[0][1];
    expect(reply).toContain('ResortOS_5G');
    expect(reply).toContain('0506102416');
    expect(reply).toContain('משרד');
    expect(reply).toContain('https://resortos.app/stay/tok_office_test');
    expect(reply).not.toContain('Guest_WiFi');
    expect(reply).not.toContain('Ask_Reception');
    const logged = info.mock.calls.find((c) => c[1] === 'inbound @lid sender');
    expect(logged?.[0]).toMatchObject({ hasSenderPn: true, senderPnTail: '6123' });
    expect(JSON.stringify(logged?.[0])).not.toContain('548076123');
  });

  it('an unknown sender asking for Wi-Fi never gets placeholder credentials', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [];
    deps.rooms = () => [officeRoom];
    deps.resortos.listBookings = vi.fn(async () => [officeBooking]) as any;
    const msg = {
      key: { remoteJid: '99999999999999@lid', fromMe: false },
      message: { conversation: wifiQ },
    } as any;
    await createPipeline(deps).handleInbound(msg);
    const all = deps.sent.map((s) => s[1]).join('\n');
    expect(all).not.toContain('Guest_WiFi');
    expect(all).not.toContain('Ask_Reception');
    expect(all).not.toContain('ResortOS_5G');
    expect(all).toContain('מספר הטלפון');
  });
});

describe('S03/S04: late check-out policy, checkout FAQ, office as guest room', () => {
  const ymd = (offset: number) => {
    const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    const d = new Date(`${t}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const officeRoom = realRooms.find((r: any) => r.id === 'pilot-office') as any;
  const nofim = { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] } as any;
  const guestJid = '972529876543@s.whatsapp.net';
  const mkBooking = (over: any = {}) => ({
    id: 'book-lc', unit_id: 'k685', guest_name: 'דניאל כהן', guest_phone: '052-9876543',
    check_in_date: ymd(-1), check_out_date: ymd(1), booking_status: 'CONFIRMED', checkout_token: 'tok_lc', ...over,
  });
  async function ask(text: string, roomsList: any[], bookings: any[]) {
    const deps = makeDeps();
    deps.cleaners = () => [];
    deps.rooms = () => roomsList;
    deps.resortos.listBookings = vi.fn(async () => bookings) as any;
    await createPipeline(deps).handleInbound({ key: { remoteJid: guestJid, fromMe: false }, message: { conversation: text } } as any);
    expect(deps.send).toHaveBeenCalledTimes(1);
    return { reply: deps.sent[0][1], deps };
  }

  it('late check-out, room free: policy (manager approval, first hour free then 125 ₪/hour, availability), no confirmation', async () => {
    const { reply } = await ask("אפשר לעשות צ'ק אאוט מאוחר מחר?", [nofim], [mkBooking()]);
    expect(reply).toContain('מנהל המתחם');
    expect(reply).toContain('125 ₪');
    expect(reply).toContain('זמינות');
    expect(reply).toContain('נחזור אליכם');
    expect(reply).not.toContain('15:00');
    expect(reply).not.toMatch(/מאושר|אושר|confirmed/);
    expect(reply).not.toContain('לפי ההזמנה שלכם'); // asked for tomorrow = actual checkout
  });

  it('late check-out, next booking starts on the checkout day: politely not possible', async () => {
    const next = mkBooking({ id: 'book-next', guest_name: 'אחר', guest_phone: '0501111111', check_in_date: ymd(1), check_out_date: ymd(3) });
    const { reply } = await ask('late checkout tomorrow please', [nofim], [mkBooking(), next]);
    expect(reply).toContain('already booked'); // English message → English reply (S17)
    expect(reply).toContain(dm(ymd(1)));
    expect(reply).not.toContain('125 ₪');
    expect(reply).not.toContain('אחר'); // no other guest's details
  });

  it('late check-out on a different day than the booking: states the real checkout date', async () => {
    const { reply } = await ask('אפשר להישאר עוד קצת מחר?', [nofim], [mkBooking({ check_out_date: ymd(5) })]);
    expect(reply).toContain(`הצ׳ק-אאוט הוא ב־${dm(ymd(5))}`);
    expect(reply).toContain('125 ₪');
  });

  it('generic checkout answer never mentions the check-in time', async () => {
    const { reply } = await ask('מתי הצ׳ק אאוט?', [nofim], [mkBooking()]);
    expect(reply).toContain('11:00');
    expect(reply).not.toContain('15:00');
    expect(reply).not.toContain('צ׳ק-אין');
  });

  it('pilot-office booking gets the normal entry / lockbox flow with 1357# from rooms.json', async () => {
    expect(officeRoom?.lockbox).toBe('1357#');
    const { reply } = await ask('איך אני נכנסת לחדר? מה הקוד לכספת?', [officeRoom],
      [mkBooking({ id: 'b_any_office', unit_id: 'pilot-office', check_out_date: ymd(10) })]);
    expect(reply).toContain('1357#');
    expect(reply).toContain('הוראות פתיחה');
    expect(reply).not.toContain('אזור תפעולי');
    expect(reply).not.toContain('שם המזמין');
  });

  it('another OFFICE-usage unit keeps the operational-area reply and does not ask a known guest for the booking name', async () => {
    const otherOffice = { id: 'office-2', name: 'משרד 2', usage: 'OFFICE', lockbox: '9999', aliases: [] } as any;
    const { reply } = await ask('מה הקוד לכספת?', [otherOffice], [mkBooking({ unit_id: 'office-2' })]);
    expect(reply).toContain('אזור תפעולי');
    expect(reply).not.toContain('9999');
    expect(reply).not.toContain('שם המזמין');
  });
});

describe('S03 alert + S05 fault priority and word-boundary keywords', () => {
  const ymd = (offset: number) => {
    const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    const d = new Date(`${t}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const nofim = { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] } as any;
  const guestJid = '972529876543@s.whatsapp.net';
  const mkBooking = (over: any = {}) => ({
    id: 'book-s05', unit_id: 'k685', guest_name: 'דניאל כהן', guest_phone: '052-9876543',
    check_in_date: ymd(-1), check_out_date: ymd(1), booking_status: 'CONFIRMED', checkout_token: 'tok_s05', ...over,
  });
  function mk(bookings: any[]) {
    const deps = makeDeps();
    deps.cleaners = () => [];
    deps.rooms = () => [nofim];
    deps.resortos.listBookings = vi.fn(async () => bookings) as any;
    deps.resortos.requestGuestCall = vi.fn(async () => {}) as any;
    deps.notifyManagerSms = vi.fn(async () => {});
    const pipeline = createPipeline(deps);
    const say = async (text: string) => {
      deps.sent.length = 0;
      await pipeline.handleInbound({ key: { remoteJid: guestJid, fromMe: false }, message: { conversation: text } } as any);
      return deps.sent.map((x) => x[1]).join('\n');
    };
    return { deps, say };
  }

  it('late check-out with a free room sends ONE manager SMS (deduped per booking/day), with no codes or phones', async () => {
    const { deps, say } = mk([mkBooking()]);
    await say("אפשר לעשות צ'ק אאוט מאוחר מחר?");
    await say('late checkout please');
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.notifyManagerSms).toHaveBeenCalledTimes(1);
    const sms = (deps.notifyManagerSms as any).mock.calls[0][0] as string;
    expect(sms).toContain('דניאל כהן');
    expect(sms).toContain('נופים בלבן 1');
    expect(sms).toContain(`${ymd(1).slice(8, 10)}/${ymd(1).slice(5, 7)}`);
    expect(sms).toContain('צ׳ק-אאוט מאוחר');
    expect(sms).toContain('פנוי');
    expect(sms).not.toContain('2810');
    expect(sms).not.toContain('#2464');
    expect(sms).not.toMatch(/05\d[- ]?\d{7}|9725\d{8}/);
    expect(deps.send).toHaveBeenCalledTimes(2); // guest replies only; no WhatsApp to staff
    expect(deps.sent.every(([jid]) => jid === guestJid)).toBe(true);
  });

  it('late check-out with the room taken sends no manager SMS', async () => {
    const next = mkBooking({ id: 'book-next', guest_phone: '0501111111', check_in_date: ymd(1), check_out_date: ymd(2) });
    const { deps, say } = mk([mkBooking(), next]);
    await say("אפשר צ'ק אאוט מאוחר?");
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.notifyManagerSms).not.toHaveBeenCalled();
  });

  it('"הטלוויזיה לא נדלקת" is a TV fault (unit TV steps + call offer), not the fuel list', async () => {
    const { deps, say } = mk([mkBooking()]);
    const reply = await say('הטלוויזיה לא נדלקת, מה עושים?');
    expect(reply).not.toContain('מתדלקים');
    expect(reply).toContain('מצטערים על התקלה');
    expect(reply).toContain('YES'); // from data/tvGuides.json (guestProfileSeed)
    expect(reply).toContain('תרצו שנתקשר אליכם');
    // existing call-back path continues
    const yes = await say('כן');
    expect(yes).toContain('נחזור אליכם טלפונית');
    expect(deps.resortos.requestGuestCall).toHaveBeenCalledTimes(1);
  });

  it('a non-TV fault gets a warm acknowledgement + call offer, without invented instructions', async () => {
    const { say } = mk([mkBooking()]);
    const reply = await say('המזגן לא עובד');
    expect(reply).toContain('מצטערים על התקלה');
    expect(reply).toContain('תרצו שנתקשר אליכם');
    expect(reply).not.toContain('1.');
  });

  it('"איפה מתדלקים" still gives the fuel list', async () => {
    const { say } = mk([mkBooking()]);
    expect(await say('איפה מתדלקים?')).toContain('איפה מתדלקים');
  });

  it('keyword collisions no longer fire inside other words', async () => {
    const { placeMenuFor } = await import('./guest/placeMenu.js');
    const { answerGuestQuestion } = await import('./guest/guestKnowledge.js');
    const ctx = { booking: { id: 'x' } as any, unitId: 'k685', roomName: 'נופים בלבן 1', room: nofim };
    // "יין" inside "עדיין", "חוף" inside "דחוף", "eat" inside "great/weather", "מים" inside "מתאימים"
    expect(await placeMenuFor('עדיין לא הגענו')).toBeNull();
    expect(await placeMenuFor('זה דחוף')).toBeNull();
    expect(await placeMenuFor('great weather today')).toBeNull();
    expect(answerGuestQuestion('עדיין לא הגענו', ctx)).toBeNull();
    expect(answerGuestQuestion('זה דחוף', ctx)).toBeNull();
    expect(answerGuestQuestion('המיטות מתאימות? אנחנו מתאימים', ctx)).toBeNull();
    // real keywords with Hebrew prefixes still match
    expect(answerGuestQuestion('מה הסיסמה לווייפי?', ctx)).toContain('TP-Link_FA30_5G');
    expect(answerGuestQuestion('יש חוף קרוב?', ctx)).toContain('חופי כנרת');
    expect((await placeMenuFor('איפה יש סופר?'))?.text).toContain('איפה קונים');
    expect((await placeMenuFor('בא לנו יין טוב'))?.text).toContain('אטרקציות');
    expect(answerGuestQuestion('הכספת לא נפתחת', ctx)).toContain('2810');
  });
});

describe('S08: broader fault intent, groceries need shopping words', () => {
  const ymd = (offset: number) => {
    const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    const d = new Date(`${t}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const nofim = { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] } as any;
  const guestJid = '972529876543@s.whatsapp.net';
  async function say(text: string) {
    const deps = makeDeps();
    deps.cleaners = () => [];
    deps.rooms = () => [nofim];
    deps.resortos.listBookings = vi.fn(async () => [{
      id: 'book-s08', unit_id: 'k685', guest_name: 'דניאל כהן', guest_phone: '052-9876543',
      check_in_date: ymd(-1), check_out_date: ymd(1), booking_status: 'CONFIRMED', checkout_token: 'tok_s08',
    }]) as any;
    deps.resortos.requestGuestCall = vi.fn(async () => {}) as any;
    deps.notifyManagerSms = vi.fn(async () => {});
    await createPipeline(deps).handleInbound({ key: { remoteJid: guestJid, fromMe: false }, message: { conversation: text } } as any);
    expect(deps.resortos.requestGuestCall).not.toHaveBeenCalled(); // nothing escalates before the guest says "כן"
    return deps.sent.map((x) => x[1]).join('\n');
  }
  const isFault = (r: string) => r.includes('מצטערים על התקלה') && r.includes('תרצו שנתקשר אליכם');
  const isGrocery = (r: string) => r.includes('איפה קונים') || r.includes('סופרמרקטים וקניות');

  it.each([
    'המזגן מטפטף מים על הרצפה',
    'אין מים חמים',
    'האסלה סתומה',
    'המים קרים',
    'החשמל קפץ',
    'הדלת נתקעה',
    'יש נזילה מהברז',
  ])('"%s" is a fault (not groceries/FAQ)', async (text) => {
    const r = await say(text);
    expect(isFault(r)).toBe(true);
    expect(isGrocery(r)).toBe(false);
  });

  it.each(['איפה הסופר הקרוב?', 'אפשר לקנות מים?'])('"%s" is groceries', async (text) => {
    const r = await say(text);
    expect(isGrocery(r)).toBe(true);
    expect(r).not.toContain('מצטערים על התקלה');
  });

  it('"מים" / "חלב" alone and "נגיע בערב" no longer trigger groceries or food', async () => {
    const { answerGuestQuestion } = await import('./guest/guestKnowledge.js');
    const { placeMenuFor } = await import('./guest/placeMenu.js');
    const ctx = { booking: { id: 'x' } as any, unitId: 'k685', roomName: 'נופים בלבן 1', room: nofim };
    for (const q of ['נגיע בערב', 'יש מים בבקתה?', 'נגיע בצהריים']) {
      expect(answerGuestQuestion(q, ctx)).toBeNull();
      expect(await placeMenuFor(q)).toBeNull();
    }
    expect(await placeMenuFor('מה מומלץ לארוחת ערב?')).not.toBeNull();
  });

  it('non-faults stay non-faults; Wi-Fi and lockbox trouble keep their specific answers', async () => {
    const { isFaultReport } = await import('./guest/keywords.js');
    for (const q of ['נגיע מאוחר בערב', 'נתקענו בפקק, נגיע בעוד שעה', 'אין נוזל כלים', 'מה הסיסמה לווייפי?', 'אפשר לקנות מים קרים?', 'עדיין לא הגענו']) {
      expect(isFaultReport(q)).toBe(false);
    }
    const { answerGuestQuestion } = await import('./guest/guestKnowledge.js');
    const ctx = { booking: { id: 'x' } as any, unitId: 'k685', roomName: 'נופים בלבן 1', room: nofim };
    expect(answerGuestQuestion('האינטרנט לא עובד', ctx)).toContain('TP-Link_FA30_5G');
    expect(answerGuestQuestion('הכספת לא נפתחת', ctx)).toContain('2810');
  });
});
