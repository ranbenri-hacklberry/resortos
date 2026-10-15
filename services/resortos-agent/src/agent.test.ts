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
    expect(reply).toContain('כרטיס חדר מנהל');
    expect(reply).toContain('2810');
    expect(reply).toContain('בניקיון');
    expect(reply).toContain('Somchai');
    expect(reply).toContain('ישראל ישראלי');
    expect(reply).toContain('050-1234567');
    expect(reply).toContain('שולם במלואו');
    expect(reply).toContain('מוכן B1');
    expect(reply).toContain('מוכן נופים בלבן 1');
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
    deps.resortos.listBookings = async () => [
      // k685 has checkout today AND checkin today => turnover!
      { id: 'b1', unit_id: 'k685', check_in_date: '2026-10-10', check_out_date: '2026-10-15', booking_status: 'CONFIRMED' },
      { id: 'b2', unit_id: 'k685', check_in_date: '2026-10-15', check_out_date: '2026-10-20', booking_status: 'CONFIRMED' },
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
