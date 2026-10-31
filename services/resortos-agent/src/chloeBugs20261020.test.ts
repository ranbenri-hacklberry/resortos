import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import { stayUrlOf } from './manager/guestLink.js';
import { isStaffOpsQuestion } from './manager/opsQuestion.js';
import { normalizeOutgoingText } from './whatsapp/textSpacing.js';
import { logConversation, redactSecrets } from './conversationLog.js';
import { answerGuestQuestion, isLateCheckoutQuestion } from './guest/guestKnowledge.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

const GUEST = '972501111111';
const MANAGER = '972548317887';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const officeBooking = {
  id: 'po', unit_id: 'pilot-office', guest_name: 'נטשה', guest_phone: '050-1111111',
  check_in_date: '2026-01-01', check_out_date: '2099-12-31', booking_status: 'CONFIRMED', checkout_token: 'tok_pilot_office_demo',
};

function makeDeps(cleaners: any[] = []): PipelineDeps & { sent: string[] } {
  const sent: string[] = [];
  const rooms = ((realRooms as any).rooms || realRooms) as any[];
  return Object.assign({
    send: vi.fn(async (_j: string, t: string) => void sent.push(t)),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn(async (t: string) => t) },
    resortos: {
      markRoomReady: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn(),
      listUnits: vi.fn(async () => []), listBookings: vi.fn(async () => [officeBooking]),
    },
    cleaners: () => cleaners,
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  } as any, { sent });
}
const msg = (from: string, text: string) => ({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }) as any;
const ctx: any = { unitId: 'x1', roomName: 'בקתה', booking: { id: 'b1', unit_id: 'x1', check_in_date: today, check_out_date: '2099-12-31' } };

describe('bug 1: demo / office stay link', () => {
  afterEach(() => { delete process.env.PILOT_OFFICE_STAY_URL; });
  it('never builds a link from the demo token or the office unit', () => {
    expect(stayUrlOf(officeBooking)).toBe('');
    expect(stayUrlOf({ checkout_token: 'tok_real', unit_id: 'k680' }, { id: 'k680', usage: 'OFFICE' })).toBe('');
    expect(stayUrlOf({ checkout_token: 'tok_real', unit_id: 'k680' })).toBe('https://resortos.app/stay/tok_real');
  });
  it('uses a configured real office page instead', () => {
    process.env.PILOT_OFFICE_STAY_URL = 'https://resortos.app/stay/office-real';
    expect(stayUrlOf(officeBooking)).toBe('https://resortos.app/stay/office-real');
  });
  it('guest replies for the office booking omit tok_pilot_office_demo', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    for (const q of ['יש וויפי?', 'בלה בלה שאלה מוזרה', 'Can we check out at 2pm?']) await p.handleInbound(msg(GUEST, q));
    expect(deps.sent.length).toBe(3);
    for (const t of deps.sent) expect(t).not.toContain('tok_pilot_office_demo');
  });
});

describe('bug 2: ops / occupancy questions', () => {
  it('detects staff ops phrasing but not guest booking inquiries', () => {
    for (const q of ['מי נכנס לבתי נורית בסופ״ש?', 'כניסות היום', 'מה התפוסה בסופ״ש?', 'כמה אורחים יש בנורית 3?', 'who is arriving this weekend?']) expect(isStaffOpsQuestion(q)).toBe(true);
    for (const q of ['יש מקום בסופ״ש?', 'יש חניה?', 'מתי אפשר להיכנס?', 'כמה אורחים אפשר בבקתה?']) expect(isStaffOpsQuestion(q)).toBe(false);
  });
  it('non-staff number gets a staff-only reply, no call-back fallback, no blurb', async () => {
    const deps = makeDeps();
    await createPipeline(deps).handleInbound(msg(GUEST, 'מי נכנס לבתי נורית בסופ״ש?'));
    expect(deps.sent).toHaveLength(1);
    expect(deps.sent[0]).toContain('שאלה תפעולית');
    expect(deps.sent[0]).not.toMatch(/תרצו שנתקשר|WiFi|ג'קוזי|stay\//);
  });
  it('manager gets per-complex arrivals, not a room picker or all units', async () => {
    const deps = makeDeps([{ phone: MANAGER, name: 'רני', role: 'MANAGER', language: 'he' }]);
    await createPipeline(deps).handleInbound(msg(MANAGER, 'מי נכנס לבתי נורית בסופ״ש?'));
    expect(deps.sent[0]).toContain('כניסות בבתי נורית');
    expect(deps.sent[0]).not.toContain('השב במספר הבחירה');
    expect(deps.sent[0]).not.toMatch(/מול הנוף|טאג|טוסקנה/);
  });
});

describe('bug 3: late check-out, same policy in all languages', () => {
  const phrasings = ['Можно ли поздно выехать?', 'Можно выехать в 13:00?', 'Can we leave at 1pm?', 'Can we check out at 2pm?', 'Is a late checkout possible?', 'ممكن نطلع الساعة 1؟', 'ممكن خروج متأخر؟', 'אפשר לצאת ב-13:00?', 'אפשר צ׳ק אאוט מאוחר?'];
  // Ran 2026-10-22: same hand-to-manager reply in every language; no fee, never approve/deny.
  it.each(phrasings)('"%s" hits the deterministic late-checkout path and hands it to the manager (no fee)', (q) => {
    expect(isLateCheckoutQuestion(q)).toBe(true);
    const a = answerGuestQuestion(q, ctx)!;
    expect(a).not.toMatch(/125|₪/);
    expect(a).toMatch(/למנהל|manager|менеджеру|المدير/);
  });
  it('does not treat ordinary questions as late check-out', () => {
    for (const q of ['Can 2 people leave luggage?', 'When is check out?', 'Is check-out at 11?', 'מתי הצ׳ק אאוט?']) expect(isLateCheckoutQuestion(q)).toBe(false);
  });
});

describe('bug 4: dog + parking', () => {
  it.each(['Hello! Can we bring our dog, and where do we park?', 'היי, אפשר להביא את הכלב? ואיפה חונים?'])('answers both parts of "%s"', async (q) => {
    const deps = makeDeps();
    await createPipeline(deps).handleInbound(msg(GUEST, q));
    expect(deps.sent[0]).toMatch(/🐶/);
    expect(deps.sent[0]).toMatch(/🚗/);
  });
  it('answers a Hebrew dog-only question', () => {
    expect(answerGuestQuestion('אפשר להביא את הכלב?', ctx)).toMatch(/כלבים מתקבלים/);
  });
});

describe('bug 5: outgoing spacing', () => {
  it('adds spaces after ")" and around glued emoji', () => {
    expect(normalizeOutgoingText('בהקדם 📞)בינתיים')).toBe('בהקדם 📞) בינתיים');
    expect(normalizeOutgoingText('שלום📞בינתיים')).toBe('שלום 📞 בינתיים');
  });
  it('leaves URLs, codes, times and prices alone', () => {
    const t = 'קוד #2464 עד 11:00, 125 ₪ (לשעה).\nhttps://resortos.app/stay/abc(1)def?x=a)b';
    expect(normalizeOutgoingText(t)).toBe(t);
  });
  it('fallback reply keeps the paragraph break after the call-back question', async () => {
    const deps = makeDeps();
    await createPipeline(deps).handleInbound(msg(GUEST, 'בלה בלה שאלה מוזרה'));
    expect(deps.sent[0]).toContain('📞)\n\n');
  });
});

describe('fix 6: conversation log with full content', () => {
  it('writes inbound and outbound text with timestamp, phone, direction and route; redacts secrets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chloe-log-'));
    process.env.CHLOE_CONVERSATION_LOG_DIR = dir;
    try {
      const deps = makeDeps();
      await createPipeline(deps).handleInbound(msg(GUEST, 'יש חניה?'));
      const file = readdirSync(dir).find((f) => /^conversations-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))!;
      const rows = readFileSync(join(dir, file), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      const inbound = rows.find((r) => r.direction === 'inbound');
      const outbound = rows.find((r) => r.direction === 'outbound');
      expect(inbound).toMatchObject({ from: `${GUEST}@s.whatsapp.net`, text: 'יש חניה?', route: 'guest' });
      expect(outbound.text).toContain('חניה');
      expect(outbound.to).toBe(`${GUEST}@s.whatsapp.net`);
      expect(inbound.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      logConversation({ direction: 'inbound', jid: 'x', text: 'key sk-abcdefghijklmnopqrstuvwx and Bearer abcdefghijklmnopqrstuvwxyz' });
      expect(readFileSync(join(dir, file), 'utf8')).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    } finally {
      delete process.env.CHLOE_CONVERSATION_LOG_DIR;
    }
  });
  it('redactSecrets keeps ordinary text', () => {
    expect(redactSecrets('קוד #2464')).toBe('קוד #2464');
  });
});
