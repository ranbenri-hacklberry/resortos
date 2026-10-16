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

  it('transcribes, marks the unit ready, and replies in Thai', async () => {
    const r = await createPipeline(deps).handleInbound(thaiVoiceNote);
    expect(r.handled).toBe(true);
    expect(deps.transcribe).toHaveBeenCalledWith(thaiVoiceNote, 'th');
    expect(deps.resortos.markRoomReady).toHaveBeenCalledWith({ unitId: 'k680', reportedBy: 'Somchai' });
    expect(deps.sent).toEqual([['66812345678@s.whatsapp.net', 'รับทราบค่ะ มูล 1 พร้อมแล้ว']]);
  });

  it('does not reply with a false confirmation if ResortOS fails', async () => {
    (deps.resortos.markRoomReady as any).mockRejectedValue(new Error('down'));
    const r = await createPipeline(deps).handleInbound(thaiVoiceNote);
    expect(r.handled).toBe(false);
    expect(deps.sent).toHaveLength(0);
  });

  it('does not confirm ready when an open maintenance alert blocks it', async () => {
    (deps.resortos.markRoomReady as any).mockResolvedValue({ ok: false, skipped: 'maintenance_open' });
    const r = await createPipeline(deps).handleInbound(thaiVoiceNote);
    expect(r).toMatchObject({ handled: false, reason: 'maintenance_open' });
    expect(deps.sent).toHaveLength(0);
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
    expect(reply).toContain('בניקיון 🟡');
    expect(reply).toContain('כניסה היום (ישראל ישראלי)');
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

    const r = await createPipeline(deps).handleInbound(msg);
    expect(r.handled).toBe(true);
    expect(deps.resortos.approveRoomByManager).toHaveBeenCalledWith({ unitId: 'k685', reportedBy: 'רני' });
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
      { id: 'b2', unit_id: 'k685', check_in_date: today, check_out_date: '2026-10-20', booking_status: 'CONFIRMED' },
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
    expect(reply).toContain('תמונת מצב יומית למנהל');
    expect(reply).toContain('תפוסה להיום: 50%'); // 1 occupied out of 2 rentable rooms (office excluded)
    expect(reply).toContain('החלפות (יוצא ונכנס): 1');
    expect(reply).toContain('כניסות להיום: 1');
    expect(reply).toContain('יציאות להיום: 1');
    expect(reply).toContain('נופים בלבן 1');
    expect(reply).toContain('חצר מוזיקלית 1 (אוסנת)');
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
        check_out_date: '2026-10-18',
        booking_status: 'CONFIRMED',
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
    expect(reply).toContain('דניאל כהן');
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
        check_out_date: '2026-10-18',
        booking_status: 'CONFIRMED',
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
    expect(reply).toContain('עוברת כרגע ניקיון והכנה');
    expect(reply).toContain('15:00');
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
    expect(reply).toContain('סרקת את כספת חדר נופים בלבן 2');
    expect(reply).toContain('אך ההזמנה שלך היא עבור נופים בלבן 1');
    expect(reply).toContain('2810');
    expect(reply).toContain('https://resortos.app/stay/tok_guest_777');
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
    expect(reply).toContain('לא זוהתה הזמנה פעילה עבור מספר טלפון זה');
    expect(reply).toContain('אנא השבו להודעה זו');
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
    const allowed = new Set(['operational_status', 'operational_domain', 'custom_reason', 'quality_inspections', 'cleaning_started_at', 'assigned_staff', 'is_escalated']);
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
    expect(deps.sent[0][1]).toContain('1 - เรียบร้อยสมบูรณ์ทุกอย่าง 🟢');
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
    expect(deps.sent[0][1]).toContain('1 - เรียบร้อยสมบูรณ์ทุกอย่าง 🟢');
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
    // Does NOT contain giant menu
    expect(reply).not.toContain('1 - עדכון סטטוס חדר');
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

  it('manager action 2: performs direct manager inspection approval', async () => {
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

    // Manager presses 2
    const msg2 = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '2' },
    } as any;
    await pipeline.handleInbound(msg2);
    expect(deps.resortos.approveRoomByManager).toHaveBeenCalledWith({
      unitId: 'k685',
      reportedBy: 'רני',
    });
    expect(deps.sent[0][1]).toContain('אושר בהצלחה כמוכן לאורח (READY)');
    expect(pipeline.getSession('972548317887')).toBeUndefined();
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

    // Manager presses 3
    const msg3 = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '3' },
    } as any;
    await pipeline.handleInbound(msg3);
    expect(deps.sent[0][1]).toContain('מה התקלה בחדר נופים בלבן 1?');
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

  it('manager action 4: prompts for room note and saves it', async () => {
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

    // Manager presses 4
    const msg4 = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: '4' },
    } as any;
    await pipeline.handleInbound(msg4);
    expect(deps.sent[0][1]).toContain('אנא כתוב את ההערה עבור חדר נופים בלבן 1');
    expect(pipeline.getSession('972548317887')?.state).toBe('AWAITING_ROOM_NOTE');

    // Manager writes note
    deps.sent.length = 0;
    const msgNote = {
      key: { remoteJid: '972548317887@s.whatsapp.net', fromMe: false },
      message: { conversation: 'לוודא בקבוק יין במקרר' },
    } as any;
    await pipeline.handleInbound(msgNote);
    expect(deps.resortos.updateUnitNote).toHaveBeenCalledWith({
      unitId: 'k685',
      note: 'לוודא בקבוק יין במקרר',
      reportedBy: 'רני',
    });
    expect(deps.sent[0][1]).toContain('הערה נשמרה בהצלחה');
    expect(pipeline.getSession('972548317887')).toBeUndefined();
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
      message: { conversation: '5' },
    } as any;
    await pipeline.handleInbound(msg5);
    expect(deps.sent[0][1]).toContain('אנא כתוב את ההערה עבור אורח חדר נופים בלבן 1');
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

    expect(deps.resortos.approveRoomByManager).toHaveBeenCalledWith({
      unitId: 'k685',
      reportedBy: 'רני',
    });
    expect(deps.sent[0][1]).toContain('אושר בהצלחה כמוכן לאורח (READY)');
    expect(pipeline.getSession('972548317887')).toBeUndefined();
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
    expect(reply).toContain('TP-LINK_FA30');
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
    expect(reply).toContain('מרינדו');
    expect(reply).toContain('מוייזה');
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
    expect(reply).toContain('שלום דניאל כהן');
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
    expect(pipeline.getSession('972548317887')).toEqual({
      role: 'MANAGER',
      state: 'AWAITING_CLARIFICATION',
      candidateRoomIds: ['k690', 'k691', 'k692'],
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
        check_in_date: '2026-10-16',
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
    expect(deps.resortos.approveRoomByManager).toHaveBeenCalledWith({
      unitId: 'k690',
      reportedBy: 'רני',
    });
    expect(deps.sent[0][1]).toContain('אושר בהצלחה כמוכן לאורח (READY)');
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
      expect(reply).toContain('אינו מיועד לאירוח אורחים');
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
      expect(reply).toContain('בניקיון כרגע (1)');
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
      expect(reply).toContain('📊 תמונת מצב יומית למנהל:');
      expect(reply).toContain('ממתינים לביקורת מנהל (1): חצר מוזיקלית 1');
      expect(reply).toContain('מוכנים ומאושרים לאורח (1): מול הנוף 1');
      expect(reply).toContain('בניקיון (1): מול הנוף 2 (ברק)');
      expect(reply).toContain('ממתינים לניקיון (1): מול הנוף 3');
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
    expect(reply).toContain('פרטית');
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
});




