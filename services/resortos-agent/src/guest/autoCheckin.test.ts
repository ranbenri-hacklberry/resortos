import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type PipelineDeps } from '../pipeline.js';
import type { RoomEntry } from '../config.js';
import { isBookingPaid } from '../integration/resortos.js';

const b1Room: RoomEntry = {
  id: 'k685',
  name: 'נופים בלבן 1',
  property: 'נופים בלבן',
  letterCode: 'B1',
  lockbox: '2810',
  aliases: ['b1', 'נופים 1'],
};

const b2Room: RoomEntry = {
  id: 'k686',
  name: 'נופים בלבן 2',
  property: 'נופים בלבן',
  letterCode: 'B2',
  lockbox: '2820',
  aliases: ['b2', 'נופים 2'],
};

function makeTestDeps(overrides: Partial<PipelineDeps> = {}) {
  const sent: Array<[string, string]> = [];
  const deps: PipelineDeps = {
    cleaners: () => [],
    rooms: () => [b1Room, b2Room],
    send: vi.fn(async (jid: string, text: string) => {
      sent.push([jid, text]);
    }),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation || null,
    transcribe: vi.fn(),
    llm: {
      extractIntent: vi.fn(),
      translateTask: vi.fn(),
    },
    resortos: {
      listUnits: vi.fn(async () => [
        { id: 'k685', operational_status: 'READY' },
        { id: 'k686', operational_status: 'READY' },
      ]),
      listBookings: vi.fn(async () => []),
      markRoomReady: vi.fn(async () => ({ ok: true as const })),
      reportMaintenance: vi.fn(),
      reportSupplies: vi.fn(),
      publishBookingStay: vi.fn(async () => true),
    },
    log: { info() {}, warn() {}, error() {} },
    ...overrides,
  };
  return Object.assign(deps, { sent });
}

const israelToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

describe('Natasha — Chloe Automatic Check-In Training & Policy Enforcement', () => {
  it('Scenario 1: Early arrival + Room READY + Fully PAID → Immediate entry, warm welcome, no 15:00 waiting period', async () => {
    const deps = makeTestDeps();
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'book-early-1',
        unit_id: 'k685',
        guest_name: 'דניאל כהן',
        guest_phone: '052-9876543',
        check_in_date: israelToday,
        check_out_date: '2099-12-31',
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        checkout_token: 'tok_dan_early',
      },
    ]);
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k685', operational_status: 'READY' },
    ]);

    const pipeline = createPipeline(deps);
    const result = await pipeline.handleInbound({
      key: { remoteJid: '972529876543@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any);

    expect(result.handled).toBe(true);
    expect(deps.sent.length).toBe(1);
    const reply = deps.sent[0][1];

    // Warm, natural greeting as mandated by Natasha
    expect(reply).toContain('ברוכים הבאים');
    expect(reply).toContain('החדר שלכם מוכן ואפשר להיכנס כבר עכשיו');
    expect(reply).toContain('איזה כיף שהגעתם');

    // Authoritative access details returned by ResortOS
    expect(reply).toContain('2810');
    expect(reply).toContain('הוראות פתיחת הכספת');
    expect(reply).toContain('https://resortos.app/stay/tok_dan_early');

    // Never force a 15:00 waiting barrier when room is ready early
    expect(reply).not.toContain('החל מ-15:00');
    expect(reply).not.toContain('שעת צ\'ק-אין היא מ-15:00');
    expect(deps.resortos.publishBookingStay).toHaveBeenCalledTimes(1);
  });

  it('Scenario 2: Early arrival + Room NOT READY (cleaning in progress) → Polite update, no lockbox code, no rigid 15:00 barrier', async () => {
    const deps = makeTestDeps();
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'book-cleaning-1',
        unit_id: 'k685',
        guest_name: 'מאיה שרון',
        guest_phone: '052-1112233',
        check_in_date: israelToday,
        check_out_date: '2099-12-31',
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        checkout_token: 'tok_maya_clean',
      },
    ]);
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k685', operational_status: 'IN_PROGRESS' },
    ]);

    const pipeline = createPipeline(deps);
    const result = await pipeline.handleInbound({
      key: { remoteJid: '972521112233@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any);

    expect(result.handled).toBe(true);
    expect(deps.sent.length).toBe(1);
    const reply = deps.sent[0][1];

    // Explains politely that the room is still being prepared
    expect(reply).toContain('בהכנה וניקיון עבורכם');
    expect(reply).toContain('ברגע שהבקתה תהיה מוכנה ומאושרת');

    // CRITICAL SECURITY: Never leak lockbox code when room is not ready!
    expect(reply).not.toContain('2810');

    // No bureaucratic rigid "must wait until 15:00" barrier
    expect(reply).not.toContain('שעת צ\'ק-אין היא מ-15:00');
  });

  it('Scenario 3: Room is READY but Reservation is UNPAID → Access blocked, payment link sent, manager escalation offered', async () => {
    const deps = makeTestDeps();
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'book-unpaid-1',
        unit_id: 'k685',
        guest_name: 'רוני ברק',
        guest_phone: '052-4445566',
        check_in_date: israelToday,
        check_out_date: '2099-12-31',
        booking_status: 'CONFIRMED',
        payment_status: 'PENDING',
        total_price_agorot: 150000,
        deposit_agorot: 50000,
        checkout_token: 'tok_roni_unpaid',
      },
    ]);
    deps.resortos.listUnits = vi.fn(async () => [
      { id: 'k685', operational_status: 'READY' },
    ]);

    const pipeline = createPipeline(deps);
    const result = await pipeline.handleInbound({
      key: { remoteJid: '972524445566@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any);

    expect(result.handled).toBe(true);
    expect(deps.sent.length).toBe(1);
    const reply = deps.sent[0][1];

    // Explain that payment confirmation is required
    expect(reply).toContain('נדרש להשלים את אישור התשלום');
    expect(reply).toContain('https://resortos.app/stay/tok_roni_unpaid');
    expect(reply).toContain('מנהל');

    // CRITICAL SECURITY: Never give lockbox code for unpaid booking
    expect(reply).not.toContain('2810');
  });

  it('Scenario 4: Mismatched WhatsApp phone number → Never leak booking info or codes, manual verification requested', async () => {
    const deps = makeTestDeps();
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'book-secret-1',
        unit_id: 'k685',
        guest_name: 'ישראל ישראלי',
        guest_phone: '052-9999999',
        check_in_date: israelToday,
        check_out_date: '2099-12-31',
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        checkout_token: 'tok_secret',
      },
    ]);

    const pipeline = createPipeline(deps);
    // Unrecognized stranger scans QR
    const result = await pipeline.handleInbound({
      key: { remoteJid: '972500000000@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any);

    expect(result.handled).toBe(true);
    const reply = deps.sent[0][1];

    // Does not reveal booking info or codes
    expect(reply).not.toContain('2810');
    expect(reply).not.toContain('ישראל ישראלי');
    expect(reply).not.toContain('tok_secret');
    expect(reply).toMatch(/טלפון|שם מלא ותאריכי הגעה/);
  });

  it('Scenario 5: Guest scans WRONG room QR code → Never disclose assigned room lockbox code or open the wrong lockbox', async () => {
    const deps = makeTestDeps();
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'book-wrong-room-1',
        unit_id: 'k685', // Booked for B1
        guest_name: 'יעל כהן',
        guest_phone: '052-7778899',
        check_in_date: israelToday,
        check_out_date: '2099-12-31',
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        checkout_token: 'tok_yael_b1',
      },
    ]);

    const pipeline = createPipeline(deps);
    // Guest stands at B2 lockbox and scans B2 QR!
    const result = await pipeline.handleInbound({
      key: { remoteJid: '972527778899@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B2' },
    } as any);

    expect(result.handled).toBe(true);
    const reply = deps.sent[0][1];

    // Security check: Never leak lockbox code for either room
    expect(reply).not.toContain('2810');
    expect(reply).not.toContain('2820');
    expect(reply).toContain('שאינה תואמת להזמנה');
    expect(reply).toContain('מטעמי ביטחון ופרטיות');
  });

  it('Scenario 6: Repeated QR scan during active stay → Warm welcome back with reminder of access details', async () => {
    const deps = makeTestDeps();
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'book-repeat-1',
        unit_id: 'k685',
        guest_name: 'דניאל כהן',
        guest_phone: '052-9876543',
        check_in_date: israelToday,
        check_out_date: '2099-12-31',
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        checkout_token: 'tok_dan_rep',
      },
    ]);

    const pipeline = createPipeline(deps);

    // Initial check-in scan
    await pipeline.handleInbound({
      key: { remoteJid: '972529876543@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any);
    expect(deps.sent[0][1]).toContain('החדר שלכם מוכן ואפשר להיכנס כבר עכשיו');

    // Repeated scan during stay
    await pipeline.handleInbound({
      key: { remoteJid: '972529876543@s.whatsapp.net', fromMe: false },
      message: { conversation: 'START_B1' },
    } as any);

    const repeatedReply = deps.sent[1][1];
    expect(repeatedReply).toContain('ברוכים השבים');
    expect(repeatedReply).toContain('תזכורת לפרטי הכניסה');
    expect(repeatedReply).toContain('2810');
    expect(repeatedReply).toContain('https://resortos.app/stay/tok_dan_rep');
  });

  it('Scenario 7: Multilingual Automatic Check-In in English', async () => {
    const deps = makeTestDeps();
    deps.resortos.listBookings = vi.fn(async () => [
      {
        id: 'book-en-1',
        unit_id: 'k685',
        guest_name: 'John Smith',
        guest_phone: '052-1239999',
        check_in_date: israelToday,
        check_out_date: '2099-12-31',
        booking_status: 'CONFIRMED',
        payment_status: 'PAID',
        checkout_token: 'tok_john',
      },
    ]);

    const pipeline = createPipeline(deps);
    const result = await pipeline.handleInbound({
      key: { remoteJid: '972521239999@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Hello, we arrived! START_B1' },
    } as any);

    expect(result.handled).toBe(true);
    const reply = deps.sent[0][1];

    expect(reply).toContain('Welcome to נופים בלבן');
    expect(reply).toContain('Your room (נופים בלבן 1) is ready and you can enter right now');
    expect(reply).toContain('2810');
    expect(reply).toContain('Lockbox opening instructions');
    expect(reply).toContain('https://resortos.app/stay/tok_john');
  });

  it('Scenario 8: isBookingPaid authoritative rule verification', () => {
    expect(isBookingPaid({ id: '1', unit_id: 'u', payment_status: 'PAID' })).toBe(true);
    expect(isBookingPaid({ id: '1', unit_id: 'u', financial_status: 'PAID' })).toBe(true);
    expect(isBookingPaid({ id: '1', unit_id: 'u', payment_status: 'PENDING', total_price_agorot: 1000, deposit_agorot: 1000 })).toBe(true);
    expect(isBookingPaid({ id: '1', unit_id: 'u', payment_status: 'PENDING', total_price_agorot: 1000, deposit_agorot: 500 })).toBe(false);
    expect(isBookingPaid({ id: '1', unit_id: 'u', payment_status: 'UNPAID' })).toBe(false);
    expect(isBookingPaid(null)).toBe(false);
  });
});
