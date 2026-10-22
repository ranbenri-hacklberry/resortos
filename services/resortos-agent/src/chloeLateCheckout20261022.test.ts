import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPipeline, inBarakForwardWindow, barakForwardText, type PipelineDeps } from './pipeline.js';
import { isLateCheckoutQuestion, isLateCheckoutFollowUp, answerLateCheckout, lateCheckoutManagerSms, whatsappCallbackReply } from './guest/guestKnowledge.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

// Regression for 2026-10-21 (Yuval, מול הנוף 2): late check-out got the generic FAQ, no SMS to Ran, "נחזור טלפונית" after "לא להתקשר".
const GUEST = '972545550000';
const booking = {
  id: 'kin_t1', unit_id: 'k681', guest_name: 'Yuval', guest_phone: '054-5550000',
  check_in_date: '2026-10-20', check_out_date: '2026-10-22', booking_status: 'CONFIRMED', checkout_token: 'tok_t1',
};
function makeDeps(): PipelineDeps & { sent: { jid: string; text: string }[]; sms: string[] } {
  const sent: { jid: string; text: string }[] = [];
  const sms: string[] = [];
  const rooms = ((realRooms as any).rooms || realRooms) as any[];
  return Object.assign({
    send: vi.fn(async (jid: string, text: string) => void sent.push({ jid, text })),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn(async (t: string) => t) },
    resortos: {
      markRoomReady: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn(), requestGuestCall: vi.fn(async () => undefined),
      listUnits: vi.fn(async () => []), listBookings: vi.fn(async () => [booking]),
    },
    notifyManagerSms: vi.fn(async (m: string) => void sms.push(m)),
    barakForwardEnabled: true,
    cleaners: () => [],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  } as any, { sent, sms });
}
const msg = (text: string) => ({ key: { remoteJid: `${GUEST}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }) as any;
const at = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };
const guestReplies = (d: ReturnType<typeof makeDeps>) => d.sent.filter((s) => s.jid.startsWith(GUEST)).map((s) => s.text);
const barak = (d: ReturnType<typeof makeDeps>) => d.sent.filter((s) => s.jid.startsWith('972503934696')).map((s) => s.text);

afterEach(() => { vi.useRealTimers(); });

describe('2026-10-21 late check-out regression', () => {
  it('detects last night\'s exact phrasing, and "ב12:00 אפשרי?" as a follow-up', () => {
    expect(isLateCheckoutQuestion('יש אפשרות לעשות צ׳ק אאוט מחר קצת יותר מאוחר?')).toBe(true);
    expect(isLateCheckoutFollowUp('ב12:00 אפשרי?')).toBe(true);
    expect(isLateCheckoutFollowUp('אפשרי ב-13?')).toBe(true);
    expect(isLateCheckoutFollowUp('אפשר מגבות?')).toBe(false);
  });

  it('after 19:00: "tomorrow morning" reply, never approves/denies, no 125, SMS to Ran each time', async () => {
    at('2026-10-21T19:54:54+03:00');
    const d = makeDeps();
    const p = createPipeline(d);
    await p.handleInbound(msg('יש אפשרות לעשות צ׳ק אאוט מחר קצת יותר מאוחר?'));
    at('2026-10-21T19:55:11+03:00');
    await p.handleInbound(msg('ב12:00 אפשרי?'));
    const r = guestReplies(d);
    expect(r[0]).toBe('Yuval, קיבלתי את הבקשה לצ׳ק־אאוט מאוחר 🙏 העברתי אותה למנהל, ונחזור אליכם מחר בבוקר עם תשובה.');
    expect(r[1]).toBe('Yuval, קיבלתי את הבקשה לצ׳ק־אאוט מאוחר עד השעה 12:00 🙏 העברתי אותה למנהל, ונחזור אליכם מחר בבוקר עם תשובה.');
    for (const t of r) { expect(t).not.toMatch(/125|אישרנו|מאושר|לא ניתן|אין אפשרות|תרצו שנתקשר/); }
    expect(d.sms).toHaveLength(2);
    expect(d.sms[1]).toContain('Yuval');
    expect(d.sms[1]).toContain('22/10');
    expect(d.sms[1]).toContain('12:00');
    expect(d.sms[1]).toContain('"ב12:00 אפשרי?"');
    expect(d.sms[1]).toContain('wa.me/972545550000');
  });

  it('before 19:00: "manager will update you" reply', () => {
    const ctx: any = { unitId: 'k681', roomName: 'מול הנוף 2', booking, guestName: 'Yuval', now: new Date('2026-10-21T15:00:00+03:00') };
    expect(answerLateCheckout('אפשר צ׳ק אאוט מאוחר?', ctx)).toBe('Yuval, קיבלתי את הבקשה לצ׳ק־אאוט מאוחר 🙏 אני מעבירה אותה עכשיו למנהל, והוא יעדכן אתכם בהקדם.');
    expect(lateCheckoutManagerSms('אפשר צ׳ק אאוט מאוחר?', ctx, GUEST)).toContain('מבוקש: לא צוין');
  });

  it('"כן, לא להתקשר, בוואטסאפ" → we get back on WhatsApp, not by phone', async () => {
    at('2026-10-21T18:29:58+03:00');
    const d = makeDeps();
    const p = createPipeline(d);
    await p.handleInbound(msg('בכל מקרה אשמח לקבל אותה חזרה'));
    await p.handleInbound(msg('כן \nלא להתקשר\nבוואטספ'));
    const last = guestReplies(d).at(-1)!;
    expect(last).toContain('בוואטסאפ');
    expect(last).not.toContain('טלפונית');
  });
});

describe('Barak evening forward (Sun–Thu 19:00–21:00)', () => {
  it('window', () => {
    expect(inBarakForwardWindow(new Date('2026-10-21T19:00:00+03:00'))).toBe(true); // Wed
    expect(inBarakForwardWindow(new Date('2026-10-21T20:59:00+03:00'))).toBe(true);
    expect(inBarakForwardWindow(new Date('2026-10-21T21:00:00+03:00'))).toBe(false);
    expect(inBarakForwardWindow(new Date('2026-10-21T18:59:00+03:00'))).toBe(false);
    expect(inBarakForwardWindow(new Date('2026-10-23T19:30:00+03:00'))).toBe(false); // Fri
    expect(inBarakForwardWindow(new Date('2026-10-24T19:30:00+03:00'))).toBe(false); // Sat
    expect(inBarakForwardWindow(new Date('2026-10-25T19:30:00+02:00'))).toBe(true); // Sun (winter time from 25.10)
  });
  it('template', () => {
    expect(barakForwardText({ name: 'Yuval', unit: 'מול הנוף 2', hhmm: '19:54', summary: 'צ׳ק אאוט מאוחר', phone: '972545550000' }))
      .toBe('🌙 פנייה מאורח אחרי 19:00\n👤 Yuval · מול הנוף 2\n🕐 19:54\n💬 צ׳ק אאוט מאוחר\n📲 לענות לאורח: https://wa.me/972545550000');
  });
  it('late check-out (and its "ב12:00 אפשרי?" follow-up) inside the window goes ONLY to Ran by SMS — not Barak, not staff/call desk', async () => {
    at('2026-10-21T19:54:54+03:00');
    const d = makeDeps();
    const p = createPipeline(d);
    await p.handleInbound(msg('יש אפשרות לעשות צ׳ק אאוט מחר קצת יותר מאוחר?'));
    await new Promise((r) => setImmediate(r));
    at('2026-10-21T19:55:11+03:00');
    await p.handleInbound(msg('ב12:00 אפשרי?'));
    await new Promise((r) => setImmediate(r));
    expect(barak(d)).toHaveLength(0);
    expect(d.sent.every((x) => x.jid.startsWith(GUEST))).toBe(true);
    expect(d.resortos.requestGuestCall).not.toHaveBeenCalled();
    expect(d.sms).toHaveLength(2);
  });
  it('forwards other guest messages once per guest per 15 minutes, and not outside the window', async () => {
    at('2026-10-21T19:54:54+03:00');
    const d = makeDeps();
    const p = createPipeline(d);
    await p.handleInbound(msg('איפה המחצלת שהייתה בחניה?'));
    await new Promise((r) => setImmediate(r));
    at('2026-10-21T19:55:11+03:00');
    await p.handleInbound(msg('אשמח לקבל אותה חזרה'));
    await new Promise((r) => setImmediate(r));
    expect(barak(d)).toHaveLength(1);
    expect(barak(d)[0]).toContain('https://wa.me/972545550000');
    expect(barak(d)[0]).toContain('Yuval');
    expect(d.sms).toHaveLength(0);
    at('2026-10-21T21:10:00+03:00');
    await p.handleInbound(msg('תודה'));
    await new Promise((r) => setImmediate(r));
    expect(barak(d)).toHaveLength(1);
  });
});

describe('RU/AR translations (Ran 2026-10-22)', () => {
  const c = (iso: string): any => ({ unitId: 'k681', roomName: 'מול הנוף 2', booking, guestName: 'Yuval', now: new Date(iso) });
  it('late check-out before/after 19:00', () => {
    expect(answerLateCheckout('Можно поздний выезд?', c('2026-10-21T15:00:00+03:00'))).toBe('Yuval, я получила вашу просьбу о позднем выезде 🙏 Сейчас передаю её менеджеру, он скоро с вами свяжется.');
    expect(answerLateCheckout('Можно поздний выезд?', c('2026-10-21T20:00:00+03:00'))).toBe('Yuval, я получила вашу просьбу о позднем выезде 🙏 Я передала её менеджеру, и завтра утром мы ответим вам.');
    expect(answerLateCheckout('ممكن خروج متأخر؟', c('2026-10-21T15:00:00+03:00'))).toBe('Yuval, استلمت طلبكم لتسجيل خروج متأخر 🙏 أحوّله الآن إلى المدير، وسيُبلغكم قريبًا.');
    expect(answerLateCheckout('ممكن خروج متأخر؟', c('2026-10-21T20:00:00+03:00'))).toBe('Yuval, استلمت طلبكم لتسجيل خروج متأخر 🙏 حوّلته إلى المدير، وسنعود إليكم غدًا صباحًا بالإجابة.');
  });
  it('WhatsApp-only callback reply', () => {
    expect(whatsappCallbackReply('ru')).toContain('WhatsApp');
    expect(whatsappCallbackReply('ar')).toContain('واتساب');
    expect(whatsappCallbackReply('he')).toBe('בשמחה! העברנו את הבקשה לצוות המתחם ונחזור אליכם כאן בוואטסאפ בהקדם. 💬');
  });
});

