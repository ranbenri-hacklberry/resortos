import { describe, it, expect, vi } from 'vitest';
import { createPipeline } from './pipeline.js';

// Ran 2026-10-22: unidentified-sender verification. Mocked only — no real SMS/WhatsApp.
const STAFF = '972500000001';
const ADAM = '972500000002';
const rooms = [
  { id: 'tz1', name: 'בדיקה 1', property: 'מתחם בדיקה', letterCode: 'Z1', lockbox: '4321#', aliases: ['z1'] },
  { id: 'tz3', name: 'בדיקה 3', property: 'מתחם בדיקה', letterCode: 'Z3', lockbox: null, aliases: ['z3'] },
];
const booking = (o: any = {}) => ({ id: 'bk-v', unit_id: 'tz1', guest_name: 'אורח בדיקה', guest_phone: '0500000099',
  check_in_date: '2000-01-01', check_out_date: '2999-12-31', booking_status: 'CONFIRMED', payment_status: 'PAID', checkout_token: 'tok_v', ...o });

function mk(bookings: any[] = [booking()]) {
  const sent: [string, string][] = [];
  const sms: any[] = [];
  const managerSms: string[] = [];
  const deps: any = {
    send: vi.fn(async (j: string, t: string) => void sent.push([j, t])),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(),
    notifyManagerSms: vi.fn(async (m: string) => void managerSms.push(m)),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn(async (t: string) => t) },
    resortos: {
      markRoomReady: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn(), updateUnitStatus: vi.fn(),
      listUnits: vi.fn(async () => rooms.map((r) => ({ id: r.id, operational_status: 'READY' }))),
      listBookings: vi.fn(async () => bookings),
      sendGuestLinkSms: vi.fn(async (p: any) => { sms.push(p); return { ok: true }; }),
    },
    cleaners: () => [
      { phone: STAFF, name: 'מנהל', role: 'MANAGER', language: 'he' },
      { phone: ADAM, name: 'אדם', role: 'MANAGER', language: 'he', noAlerts: true },
    ],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  };
  const p = createPipeline(deps);
  const jid = '999988887777666@lid';
  const say = (t: string, j = jid) => p.handleInbound({ key: { remoteJid: j, fromMe: false }, message: { conversation: t } } as any);
  const g = () => sent.filter(([j]) => j === jid).map(([, t]) => t);
  return { deps, sent, sms, managerSms, say, g };
}

describe('unidentified sender verification (Ran 2026-10-22)', () => {
  it('phone mismatch → OTP to the booking phone; correct OTP → verified and normal check-in proceeds', async () => {
    const { say, g, sms } = mk();
    await say('START_Z1');
    await say('כן');
    await say('052-1112222');
    expect(g().at(-1)).toContain('קוד אימות');
    expect(sms).toHaveLength(1);
    expect(sms[0].phone).toBe('0500000099');
    const code = String(sms[0].message).match(/\d{6}/)![0];
    expect(g().join('\n')).not.toContain(code); // OTP never echoed in WhatsApp
    await say(code);
    const all = g().join('\n');
    expect(all).toContain('אומת');
    expect(all).toContain('4321#');
  });

  it('wrong OTP 3 times → handoff SMS to Ran only, no code', async () => {
    const { say, g, managerSms, sent } = mk();
    await say('START_Z1'); await say('כן'); await say('052-1112222');
    await say('000000'); await say('000001'); await say('000002');
    expect(g().at(-1)).toContain('מנהל המתחם יחזור');
    expect(g().join('\n')).not.toContain('4321');
    expect(managerSms).toHaveLength(1);
    expect(sent.some(([j]) => j.startsWith(ADAM))).toBe(false);
  });

  it('"לא" (no booking) → handoff to Ran by SMS; repeated within 15 min is not re-sent', async () => {
    const { say, managerSms, g } = mk();
    await say('START_Z1'); await say('לא');
    await say('START_Z1'); await say('לא');
    expect(g().filter((t) => t.includes('מנהל המתחם יחזור'))).toHaveLength(2);
    expect(managerSms).toHaveLength(1);
    expect(managerSms[0]).toContain('בדיקה 1');
    expect(managerSms[0]).not.toContain('אורח בדיקה'); // never other guests' info
  });

  it('general question from an unknown sender is never dropped', async () => {
    const { say, g, managerSms } = mk([]);
    const r = await say('יודעים אם יש תפילות כאן?');
    expect(r.handled).toBe(true);
    expect(g()[0]).toContain('יש לכם הזמנה');
    await say('לא');
    expect(g()[1]).toContain('מנהל המתחם יחזור');
    expect(managerSms[0]).toContain('תפילות');
  });

  it('typed phone matching the booking → link by SMS to the booking phone, nothing sensitive in WhatsApp', async () => {
    const { say, g, sms } = mk();
    await say('START_Z1'); await say('כן'); await say('050-0000099');
    expect(g().at(-1)).toContain('ב-SMS למספר שאיתו בוצעה ההזמנה');
    expect(sms[0]).toMatchObject({ phone: '0500000099' });
    expect(g().join('\n')).not.toMatch(/4321|tok_v/);
  });

  it('identified guest in a room without a configured code → manager handoff, never 1357#', async () => {
    const { say, managerSms, sent } = mk([booking({ unit_id: 'tz3' })]);
    await say('START_Z3', '972500000099@s.whatsapp.net');
    const reply = sent.filter(([j]) => j.startsWith('972500000099')).map(([, t]) => t).join('\n');
    expect(reply).toContain('מנהל המתחם יעדכן');
    expect(reply).not.toMatch(/1357|קוד כספת/);
    expect(managerSms).toHaveLength(1);
  });
});
