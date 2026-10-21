import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type PipelineDeps } from '../pipeline.js';
import { answerGuestQuestion, answerStaffPlaceQuestion, extensionNightPrice } from './guestKnowledge.js';
import { detectGuestLang } from './i18n.js';
import { isCheckinQuestion, isThanksOnly, isVagueProblem, isComplaint } from './keywords.js';
import { placeMenuFor, PLACE_MENU_FOOTER } from './placeMenu.js';

const ymd = (offset: number) => {
  const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const d = new Date(`${t}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const nofim = { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', lockbox: '2810', aliases: ['b1'] } as any;
const office = { id: 'pilot-office', name: 'משרד', lockbox: '1357#', usage: 'OFFICE', aliases: [] } as any;
const guestJid = '972529876543@s.whatsapp.net';
const strangerJid = '972501112233@s.whatsapp.net';

function makeDeps(over: Partial<PipelineDeps> = {}, bookings?: any[]) {
  const sent: Array<[string, string]> = [];
  const deps: PipelineDeps = {
    send: vi.fn(async (jid, text) => void sent.push([jid, text])),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn() as any,
    llm: { extractIntent: vi.fn(), translateTask: vi.fn() } as any,
    resortos: {
      markRoomReady: vi.fn(async () => ({ ok: true as const })),
      startCleaning: vi.fn(async () => ({ ok: true as const })),
      reportMaintenance: vi.fn(async () => ({})),
      reportSupplies: vi.fn(async () => ({})),
      updateUnitStatus: vi.fn(async () => ({})),
      updateBookingNote: vi.fn(async () => ({})),
      holdNight: vi.fn(async () => ({ ok: true as const, verified: true })),
      setPaymentStatus: vi.fn(async () => ({ ok: true as const })),
      listBookings: vi.fn(async () => bookings ?? [{
        id: 'book-b', unit_id: 'k685', guest_name: 'דניאל כהן', guest_phone: '052-9876543',
        check_in_date: ymd(-1), check_out_date: ymd(2), booking_status: 'CONFIRMED', checkout_token: 'tok_b', payment_status: 'PAID',
      }]) as any,
      requestGuestCall: vi.fn(async () => {}) as any,
    } as any,
    cleaners: () => [],
    rooms: () => [nofim, office],
    log: { info() {}, warn() {}, error() {} },
    notifyManagerSms: vi.fn(async () => {}),
    ...over,
  };
  return Object.assign(deps, { sent });
}
const msg = (text: string, jid = guestJid) => ({ key: { remoteJid: jid, fromMe: false }, message: { conversation: text } } as any);
async function ask(text: string, deps = makeDeps(), jid = guestJid) {
  const before = deps.sent.length;
  await createPipeline(deps).handleInbound(msg(text, jid));
  return deps.sent.slice(before).map((x) => x[1]).join('\n');
}
function noWrites(deps: ReturnType<typeof makeDeps>) {
  const r = deps.resortos as any;
  for (const k of ['markRoomReady', 'startCleaning', 'reportMaintenance', 'reportSupplies', 'updateUnitStatus', 'updateBookingNote', 'holdNight', 'setPaymentStatus']) {
    expect(r[k]).not.toHaveBeenCalled();
  }
}
const ctxNofim = (over: any = {}) => ({
  booking: { id: 'book-b', unit_id: 'k685', guest_name: 'דניאל כהן', check_in_date: ymd(-1), check_out_date: ymd(2), payment_status: 'PAID' } as any,
  unitId: 'k685', roomName: 'נופים בלבן 1', room: nofim, guestName: 'דניאל כהן', stayUrl: 'https://resortos.app/stay/tok_b', ...over,
});

describe('S20: thanks / compliments', () => {
  it('a thank-you gets a short warm reply with no call-back offer', async () => {
    const deps = makeDeps();
    const r = await ask('תודה רבה, הכל מעולה!', deps);
    expect(r).toContain('תודה רבה, משמח לשמוע');
    expect(r).not.toContain('תרצו שנתקשר');
    expect(r).not.toContain('אין לי תשובה מדויקת');
    expect(deps.resortos.requestGuestCall).not.toHaveBeenCalled();
  });
  it('does not trigger when the message also has a question, fault or complaint', () => {
    for (const q of ['תודה, מה הקוד של השער?', 'תודה, אבל המזגן לא עובד', 'תודה, החדר היה מלוכלך', 'תודה! איפה חונים?', 'thanks, what time is checkout?', 'מעולה, אפשר עוד מגבות?']) {
      expect(isThanksOnly(q)).toBe(false);
    }
    for (const q of ['תודה רבה, הכל מעולה!', 'תודה', 'thank you so much!', 'Спасибо, всё отлично!', 'شكرا كتير، كل شي تمام']) {
      expect(isThanksOnly(q)).toBe(true);
    }
    expect(answerGuestQuestion('תודה, אבל המזגן לא עובד', ctxNofim())).toContain('מצטערים על התקלה');
  });
  it('"תודה" right after a call-back offer is not a "yes"', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(msg('יש לכם שירות כביסה?'));
    expect(deps.sent.at(-1)![1]).toContain('אין לי תשובה מדויקת');
    await p.handleInbound(msg('תודה רבה'));
    expect(deps.sent.at(-1)![1]).toContain('משמח לשמוע');
    expect(deps.resortos.requestGuestCall).not.toHaveBeenCalled();
  });
  it('unknown senders are not answered with small talk', () => {
    expect(answerGuestQuestion('תודה רבה', { booking: {} as any, unitId: '', roomName: '' })).toBeNull();
  });
});

describe('S02: check-in time phrasing', () => {
  it('"באיזו שעה אפשר להיכנס לחדר?" answers check-in 15:00', async () => {
    const r = await ask('באיזו שעה אפשר להיכנס לחדר?');
    expect(r).toContain('15:00');
    expect(r).not.toContain('אין לי תשובה מדויקת');
  });
  it('check-in vs check-out vs access do not collide', () => {
    expect(isCheckinQuestion("מתי הצ'ק אין?")).toBe(true);
    expect(isCheckinQuestion('מאיזו שעה נוכל להיכנס?')).toBe(true);
    expect(isCheckinQuestion("מתי הצ'ק אאוט?")).toBe(false);
    expect(isCheckinQuestion('איך נכנסים לחדר?')).toBe(false);
    expect(isCheckinQuestion('מתי נכנסים למעיין?')).toBe(false);
    expect(isCheckinQuestion("מתי אפשר להיכנס לג'קוזי?")).toBe(false);
    const out = answerGuestQuestion("מתי הצ'ק אאוט?", ctxNofim())!;
    expect(out).toContain('11:00');
    expect(out).not.toContain('15:00');
    expect(answerGuestQuestion('איך אני נכנסת לחדר? מה הקוד לכספת?', ctxNofim())).toContain('2810');
  });
  it('shows the arrival date only when check-in is today or later', () => {
    const future = answerGuestQuestion("מתי הצ'ק אין?", ctxNofim({ booking: { id: 'x', check_in_date: ymd(3), check_out_date: ymd(5) } }))!;
    const [, m, d] = ymd(3).split('-');
    expect(future).toContain(`${d}/${m}`);
    expect(answerGuestQuestion("מתי הצ'ק אין?", ctxNofim())).not.toMatch(/ההגעה שלכם/);
  });
});

describe('S14: restaurant list numbering and follow-up', () => {
  it('items are numbered, footer matches the numeric follow-up, dinner drops breakfast-only', async () => {
    const menu = (await placeMenuFor('תמליצי על מסעדה טובה לארוחת ערב קרוב לכאן?'))!;
    expect(menu.text).toMatch(/^1\. /m);
    expect(menu.text).toMatch(/^2\. /m);
    expect(menu.text).toContain(PLACE_MENU_FOOTER);
    expect(menu.text).not.toContain('המטבח');
    expect(menu.ids).not.toContain('food_hamitbach');
    expect((await placeMenuFor('איפה אפשר לאכול?'))!.ids).toContain('food_hamitbach');
  });
  it('"1)" after the menu returns the place detail', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(msg('תמליצי על מסעדה טובה לארוחת ערב?'));
    await p.handleInbound(msg('1)'));
    const last = deps.sent.at(-1)![1];
    expect(last).not.toContain('המספר לא ברשימה');
    expect(last.length).toBeGreaterThan(10);
  });
});

describe('Payment grammar', () => {
  it('fully paid reads "שולמה במלואה"', () => {
    const r = answerGuestQuestion('כמה נשאר לי לשלם?', ctxNofim())!;
    expect(r).toContain('שולמה במלואה');
    expect(r).not.toContain('במלואו');
  });
});

describe('Gate code only for identified guests', () => {
  it('identified guest gets #2464', async () => {
    expect(await ask('מה הקוד של שער הישוב?')).toContain('#2464');
  });
  it('unidentified sender gets no code', async () => {
    const r = await ask('מה הקוד של שער הישוב?', makeDeps(), strangerJid);
    expect(r).not.toContain('2464');
    expect(r).toContain('לאורחים רשומים');
    for (const lang of ['What is the gate code?', 'Какой код ворот?', 'شو رمز البوابة؟']) {
      const x = answerGuestQuestion(lang, { booking: {} as any, unitId: '', roomName: '' })!;
      expect(x).not.toContain('2464');
    }
  });
  it('staff place answers keep the gate code', () => {
    expect(answerStaffPlaceQuestion('מה הקוד של השער?', {})).toContain('#2464');
  });
});

describe('S15: extension (availability + price list, no booking change)', () => {
  it('free night quotes the unit price-list rate and offers a manager call-back', async () => {
    const deps = makeDeps();
    const r = await ask('אפשר להאריך את השהות שלנו בלילה נוסף?', deps);
    const price = extensionNightPrice('k685', ymd(2))!;
    expect([750, 1200]).toContain(price.ils);
    expect(r).toContain(`₪${price.ils.toLocaleString('he-IL')}`);
    expect(r).toContain('פנוי');
    expect(r).toContain('אישור של מנהל המתחם');
    expect(deps.resortos.requestGuestCall).not.toHaveBeenCalled();
    expect(deps.notifyManagerSms).not.toHaveBeenCalled();
    noWrites(deps);
  });
  it('taken night says so without a price', async () => {
    const deps = makeDeps({}, [
      { id: 'book-b', unit_id: 'k685', guest_name: 'דניאל כהן', guest_phone: '052-9876543', check_in_date: ymd(-1), check_out_date: ymd(2), booking_status: 'CONFIRMED' },
      { id: 'next', unit_id: 'k685', guest_name: 'אחר', guest_phone: '050-0000000', check_in_date: ymd(2), check_out_date: ymd(4), booking_status: 'CONFIRMED' },
    ]);
    const r = await ask('Can we extend one more night?', deps);
    expect(r).toContain('already booked');
    expect(r).not.toMatch(/₪\d/);
    noWrites(deps);
  });
  it('weekend = Thursday/Friday nights per the price list; units without a rate get no invented price', () => {
    expect(extensionNightPrice('k685', '2026-10-22')).toEqual({ ils: 1200, weekend: true }); // Thursday
    expect(extensionNightPrice('k685', '2026-10-25')).toEqual({ ils: 750, weekend: false }); // Sunday
    expect(extensionNightPrice('k999-unknown', '2026-10-25')).toBeNull();
    const r = answerGuestQuestion('אפשר להאריך בעוד לילה?', { booking: { id: 'o', check_in_date: ymd(-1), check_out_date: ymd(5) } as any, unitId: 'k999-unknown', roomName: 'יחידה', bookings: [] })!;
    expect(r).toContain('המחיר לפי המחירון');
    expect(r).not.toMatch(/₪\d/);
  });
  it('extension is not a late check-out (no manager SMS path)', async () => {
    const { isLateCheckoutQuestion } = await import('./guestKnowledge.js');
    expect(isLateCheckoutQuestion('אפשר להישאר עוד לילה?')).toBe(false);
    expect(isLateCheckoutQuestion("אפשר לעשות צ'ק אאוט מאוחר מחר?")).toBe(true);
  });
});

describe('S13 parking, S18 dogs, S07 cleaning', () => {
  it('parking: adjacent to every complex', async () => {
    expect(await ask('איפה חונים?')).toContain('חניה צמודה למתחם');
  });
  it('dogs: allowed, +100 ₪ per dog per night, with the stay total', async () => {
    const r = await ask('מותר להביא כלב קטן?');
    expect(r).toContain('100 ₪ לכל כלב ללילה');
    expect(r).toContain('3 לילות');
    expect(r).toContain('300 ₪');
  });
  it('mid-stay cleaning: free for every stay, no staff dispatch', async () => {
    const deps = makeDeps();
    const r = await ask('אפשר לקבל ניקיון לחדר היום?', deps);
    expect(r).toContain('ללא עלות');
    expect(r).not.toMatch(/100\s*₪|₪\s*100/);
    expect(deps.resortos.requestGuestCall).not.toHaveBeenCalled();
    noWrites(deps);
  });
});

describe('S09/S10/S11 complaints, vague problems, fault tickets (flag)', () => {
  it('complaint gets empathy and a manager call-back offer, not the cheerful generic sign-off', async () => {
    const deps = makeDeps();
    const r = await ask('החדר לא היה נקי כשהגעתי, אני מאוד מאוכזבת', deps);
    expect(r).toContain('מצטערת לשמוע');
    expect(r).not.toContain('שהות נעימה ושלווה');
    expect(r).not.toContain('אין לי תשובה מדויקת');
    noWrites(deps);
  });
  it('"יש בעיה" asks what happened; "עם המים החמים" is then treated as the fault', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(msg('יש בעיה'));
    expect(deps.sent.at(-1)![1]).toContain('מה קרה');
    await p.handleInbound(msg('עם המים החמים'));
    expect(deps.sent.at(-1)![1]).toContain('מצטערים על התקלה');
    expect(deps.resortos.requestGuestCall).not.toHaveBeenCalled();
    noWrites(deps);
    expect(isVagueProblem('יש לנו בעיה')).toBe(true);
    expect(isVagueProblem('יש בעיה עם המזגן')).toBe(false);
  });
  it('fault ticket is OFF by default; ON writes only for the demo booking via an explicit method', async () => {
    const open = vi.fn(async () => ({}));
    const off = makeDeps();
    (off.resortos as any).openGuestFaultTicket = open;
    await ask('המזגן לא עובד', off);
    expect(open).not.toHaveBeenCalled();

    const other = makeDeps({ guestFaultTickets: true });
    (other.resortos as any).openGuestFaultTicket = open;
    await ask('המזגן לא עובד', other);
    expect(open).not.toHaveBeenCalled();

    const demo = makeDeps({ guestFaultTickets: true }, [{ id: 'b_demo_pilot_office', unit_id: 'pilot-office', guest_name: 'נטשה', guest_phone: '052-9876543', check_in_date: ymd(-1), check_out_date: ymd(10), booking_status: 'CONFIRMED' }]);
    (demo.resortos as any).openGuestFaultTicket = open;
    await ask('המזגן לא עובד', demo);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toMatchObject({ bookingId: 'b_demo_pilot_office', status: 'OPEN', assignedStaff: null, kind: 'fault' });
    expect(demo.resortos.requestGuestCall).not.toHaveBeenCalled();
    expect(demo.resortos.reportMaintenance).not.toHaveBeenCalled();
  });
});

describe('Language detection', () => {
  it('detects by script; Hebrew default', () => {
    expect(detectGuestLang('Hi, what time is checkout?')).toBe('en');
    expect(detectGuestLang('Во сколько выезд?')).toBe('ru');
    expect(detectGuestLang('متى تسجيل الخروج؟')).toBe('ar');
    expect(detectGuestLang('מה הסיסמה ל-WiFi?')).toBe('he');
    expect(detectGuestLang('123')).toBe('he');
  });
});

describe('S17 English replies', () => {
  const ctx = () => ctxNofim();
  it('check-out in English, no check-in time', async () => {
    const r = await ask('Hi, what time is checkout?');
    expect(r).toContain('Check-out is by 11:00');
    expect(r).not.toMatch(/15:00|3:00 PM|check-in/i);
    expect(r).not.toMatch(/[\u0590-\u05FF]{3,}/);
  });
  it('check-in, Wi-Fi, gate, lockbox, payment, fallback in English', async () => {
    expect(answerGuestQuestion('What time is check-in?', ctx())).toContain('from 3:00 PM');
    expect(answerGuestQuestion('What is the wifi password?', ctx())).toContain('*Password:* 15107312');
    expect(answerGuestQuestion('What is the gate code?', ctx())).toContain('#2464');
    expect(answerGuestQuestion('What is the key box code?', ctx())).toContain('2810');
    expect(answerGuestQuestion('Is my booking paid?', ctx())).toContain('fully paid');
    expect(answerGuestQuestion('Where can we park?', ctx())).toContain('parking right next to the complex');
    expect(answerGuestQuestion('Can we bring our dog?', ctx())).toContain('₪100 per dog per night');
    const fb = await ask('Do you have a laundry service?');
    expect(fb).toContain("I don't have an exact answer");
    expect(fb).toContain('Reply *yes*');
  });
  it('"coffee" is not a payment question', () => {
    expect(answerGuestQuestion('coffee', ctx()) || '').not.toContain('Payment');
  });
});

describe('Russian replies', () => {
  const ctx = () => ctxNofim();
  it.each([
    ['Во сколько выезд?', 'Выезд до 11:00'],
    ['Какой пароль от вай-фай?', 'Пароль:* 15107312'],
    ['Можно приехать с собакой?', '100 ₪ за собаку за ночь'],
    ['Во сколько заезд?', 'с 15:00'],
    ['Какой код ворот?', '#2464'],
    ['Какой код от сейфа с ключом?', '2810'],
    ['Где парковка?', 'парковка рядом с комплексом'],
    ['Можно сделать уборку в номере?', 'бесплатна'],
    ['Бронирование оплачено?', 'полностью оплачено'],
    ['Кондиционер не работает', 'Извините за неполадку'],
    ['Номер грязный, я разочарована', 'Мне очень жаль'],
    ['Спасибо, всё отлично!', 'Большое спасибо'],
  ])('%s', (q, expected) => {
    const r = answerGuestQuestion(q, ctx())!;
    expect(r).toContain(expected);
    expect(r.split('נופים בלבן 1').join('')).not.toMatch(/[\u0590-\u05FF]/);
  });
  it('check-out answer has no check-in; extension and fallback in Russian', async () => {
    expect(answerGuestQuestion('Во сколько выезд?', ctx())).not.toMatch(/15:00|заезд/i);
    expect(await ask('Можно продлить ещё одну ночь?')).toContain('свободен');
    expect(await ask('У вас есть прачечная?')).toContain('нет точного ответа');
  });
});

describe('Arabic replies', () => {
  const ctx = () => ctxNofim();
  it.each([
    ['متى تسجيل الخروج؟', 'تسجيل الخروج حتى الساعة 11:00'],
    ['وين الموقف؟', 'موقف سيارات ملاصق للمجمع'],
    ['شو رمز البوابة؟', '#2464'],
    ['شو كلمة السر للواي فاي؟', 'كلمة السر:* 15107312'],
    ['متى تسجيل الدخول؟', 'من الساعة 15:00'],
    ['مسموح نجيب الكلب؟', '100 ₪ لكل كلب'],
    ['ممكن تنظيف للغرفة؟', 'التنظيف خلال الإقامة مجاني'],
    ['هل تم الدفع؟', 'تم دفع الحجز بالكامل'],
    ['المكيف ما بيشتغل', 'نأسف على العطل'],
    ['الغرفة وسخة، أنا مستاءة', 'يؤسفني جدًا'],
    ['شكرا كتير، كل شي تمام', 'شكرًا جزيلًا'],
  ])('%s', (q, expected) => {
    expect(answerGuestQuestion(q, ctx())).toContain(expected);
  });
  it('gate: identified guest gets the code, unidentified does not (pipeline)', async () => {
    expect(await ask('شو رمز البوابة؟')).toContain('#2464');
    const r = await ask('شو رمز البوابة؟', makeDeps(), strangerJid);
    expect(r).not.toContain('2464');
    expect(r).toContain('للضيوف المسجلين فقط');
  });
  it('check-out has no check-in; Arabic "نعم" confirms a call-back', async () => {
    expect(answerGuestQuestion('متى تسجيل الخروج؟', ctx())).not.toContain('15:00');
    const deps = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(msg('عندكم غسيل ملابس؟'));
    expect(deps.sent.at(-1)![1]).toContain('ليس لدي جواب دقيق');
    await p.handleInbound(msg('نعم'));
    expect(deps.sent.at(-1)![1]).toContain('سنتصل بكم');
    expect(deps.resortos.requestGuestCall).toHaveBeenCalledTimes(1);
  });
  it('complaint detection is not triggered by neutral text', () => {
    expect(isComplaint('נורא נהנינו')).toBe(false);
    expect(isComplaint('The room was dirty')).toBe(true);
  });
});

describe('Office demo rate (Ran 2026-10-19 13:04)', () => {
  it('demo booking extension quote shows 1 ₪ (weekday and weekend), no writes or calls', async () => {
    expect(extensionNightPrice('pilot-office', '2026-10-25')).toEqual({ ils: 1, weekend: false });
    expect(extensionNightPrice('pilot-office', '2026-10-22')).toEqual({ ils: 1, weekend: true });
    const deps = makeDeps({}, [{ id: 'b_demo_pilot_office', unit_id: 'pilot-office', guest_name: 'נטשה', guest_phone: '052-9876543', check_in_date: ymd(-1), check_out_date: ymd(13), booking_status: 'CONFIRMED', checkout_token: 'tok_pilot_office_demo' }]);
    const r = await ask('אפשר להאריך את השהות שלנו בלילה נוסף?', deps);
    expect(r).toContain('₪1*');
    expect(r).toContain('פנוי');
    expect(r).not.toContain('המחיר לפי המחירון של היחידה');
    noWrites(deps);
    expect(deps.resortos.requestGuestCall).not.toHaveBeenCalled();
    expect(deps.notifyManagerSms).not.toHaveBeenCalled();
  });
});

describe('Multi-intent info questions (QA 13:26)', () => {
  const ctx = () => ctxNofim();
  const links = (r: string) => (r.match(/https:\/\/resortos\.app\/stay\//g) || []).length;
  it.each([
    ['Hello! Can we bring our dog, and where do we park?', ['parking right next to the complex', '₪100 per dog per night']],
    ['What is the wifi password and what time is checkout?', ['Check-out is by 11:00', '15107312']],
    ['איפה חונים ומה הקוד של השער?', ['חניה צמודה למתחם', '#2464']],
    ['מה הסיסמה לוויפי ומתי הצ׳ק אאוט?', ['15107312', 'עד 11:00']],
    ['Где парковка и можно ли с собакой?', ['парковка рядом с комплексом', '100 ₪ за собаку']],
    ['شو كلمة السر للواي فاي ومتى تسجيل الخروج؟', ['15107312', 'تسجيل الخروج حتى الساعة 11:00']],
    ['وين الموقف وشو رمز البوابة؟', ['موقف سيارات', '#2464']],
  ])('%s → all parts, one link', (q, parts) => {
    const r = answerGuestQuestion(q, ctx())!;
    for (const p of parts) expect(r).toContain(p);
    expect(links(r)).toBe(1);
    expect(r.trim().endsWith('tok_b')).toBe(true);
  });
  it('order: check-in before check-out; check-out-only never mentions check-in', () => {
    const r = answerGuestQuestion("מתי הצ'ק אין ומתי הצ'ק אאוט?", ctx())!;
    expect(r.indexOf('15:00')).toBeLessThan(r.indexOf('11:00'));
    expect(answerGuestQuestion("מתי הצ'ק אאוט?", ctx())).not.toContain('15:00');
  });
  it('a single intent keeps its original reply', () => {
    expect(answerGuestQuestion('איפה חונים?', ctx())).toBe(
      `🚗 בכל המתחמים שלנו יש חניה צמודה למתחם, אפשר לחנות ממש ליד.\n\n📱 דף האורח שלכם:\nhttps://resortos.app/stay/tok_b`);
  });
  it('gate stays identified-only inside a combined reply', () => {
    const r = answerGuestQuestion('Where do we park and what is the gate code?', { booking: {} as any, unitId: '', roomName: '' })!;
    expect(r).toContain('parking right next to the complex');
    expect(r).not.toContain('2464');
    expect(r).toContain('registered guests only');
  });
  it('complaint/fault win over info intents (own flow, no merge)', async () => {
    const c = answerGuestQuestion('The room was dirty and where do we park?', ctx())!;
    expect(c).toContain("I'm really sorry");
    expect(c).not.toContain('parking right next');
    const f = answerGuestQuestion('המזגן לא עובד, ואיפה חונים?', ctx())!;
    expect(f).toContain('מצטערים על התקלה');
    expect(f).not.toContain('חניה צמודה');
  });
  it('pipeline: EN dog+parking gets one combined reply', async () => {
    const r = await ask('Hello! Can we bring our dog, and where do we park?');
    expect(r).toContain('parking right next to the complex');
    expect(r).toContain('₪100 per dog per night');
  });
});

describe('Check-in wording mid-stay (QA 13:26)', () => {
  it('ongoing stay: time only, no "we\'ll send entry details"', () => {
    const r = answerGuestQuestion('באיזו שעה אפשר להיכנס לחדר?', ctxNofim({ today: ymd(0) }))!;
    expect(r).toContain('15:00');
    expect(r).not.toContain('נשלח לכם כאן את פרטי הכניסה');
    expect(answerGuestQuestion('What time is check-in?', ctxNofim())).not.toContain('entry details');
    expect(answerGuestQuestion('Во сколько заезд?', ctxNofim())).not.toContain('данные для входа');
    expect(answerGuestQuestion('متى تسجيل الدخول؟', ctxNofim())).not.toContain('تفاصيل الدخول');
  });
  it('upcoming stay keeps the arrival date and the entry-details line', () => {
    const r = answerGuestQuestion("מתי הצ'ק אין?", ctxNofim({ booking: { id: 'x', check_in_date: ymd(3), check_out_date: ymd(5) } }))!;
    expect(r).toContain('נשלח לכם כאן את פרטי הכניסה');
  });
});

describe('Late check-out in EN/RU/AR (QA 13:26)', () => {
  it.each([
    ['Can we do a late check-out?', "the first hour is free of charge, and from the second hour it's ₪125 per hour"],
    ['Можно поздний выезд?', 'первый час бесплатно, со второго часа — 125 ₪ в час'],
    ['ممكن خروج متأخر؟', 'الساعة الأولى بدون رسوم، ومن الساعة الثانية 125 ₪ للساعة'],
  ])('%s', (q, expected) => {
    const r = answerGuestQuestion(q, ctxNofim({ bookings: [] }))!;
    expect(r).toContain(expected);
    expect(r).not.toContain('15:00');
  });
  it('Hebrew late check-out text is unchanged', () => {
    const r = answerGuestQuestion("אפשר לעשות צ'ק אאוט מאוחר?", ctxNofim({ bookings: [] }))!;
    expect(r).toContain('בשמחה נבדוק עבורכם! 🌿\nצ׳ק-אאוט מאוחר אפשרי רק באישור מנהל המתחם ובכפוף לזמינות: השעה הראשונה ללא חיוב, ומהשעה השנייה 125 ₪ לשעה. גם השעה הראשונה וגם כל זמן נוסף מחייבים אישור של המנהל.');
    expect(r).toContain('עד לקבלת אישור, שעת הצ׳ק-אאוט נשארת עד 11:00');
    expect(r).not.toContain('15:00');
  });
  it('the manager-SMS trigger covers HE/EN/RU/AR late check-out (Ran 13:31)', async () => {
    const { isLateCheckoutSmsTrigger } = await import('./guestKnowledge.js');
    expect(isLateCheckoutSmsTrigger('Можно поздний выезд?')).toBe(true);
    expect(isLateCheckoutSmsTrigger('ممكن خروج متأخر؟')).toBe(true);
    expect(isLateCheckoutSmsTrigger('Можно продлить ещё одну ночь?')).toBe(false);
    expect(isLateCheckoutSmsTrigger('Во сколько выезд?')).toBe(false);
    expect(isLateCheckoutSmsTrigger("אפשר צ'ק אאוט מאוחר?")).toBe(true);
    expect(isLateCheckoutSmsTrigger('late checkout please')).toBe(true);
  });
});

describe('Late check-out manager SMS for RU/AR (mocked, Ran 13:31)', () => {
  const withNext = () => [
    { id: 'book-b', unit_id: 'k685', guest_name: 'דניאל כהן', guest_phone: '052-9876543', check_in_date: ymd(-1), check_out_date: ymd(2), booking_status: 'CONFIRMED', checkout_token: 'tok_b' },
    { id: 'next', unit_id: 'k685', guest_name: 'אחר', guest_phone: '050-0000000', check_in_date: ymd(2), check_out_date: ymd(4), booking_status: 'CONFIRMED' },
  ];
  it.each(['Можно поздний выезд?', 'ممكن خروج متأخر؟'])('%s → one SMS when the room is free; dedupe holds on repeat', async (q) => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(msg(q));
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.notifyManagerSms).toHaveBeenCalledTimes(1);
    const sms = (deps.notifyManagerSms as any).mock.calls[0][0] as string;
    expect(sms).toContain('בקשת צ׳ק-אאוט מאוחר');
    expect(sms).not.toMatch(/2464|2810|05\d-?\d{7}/);
    await p.handleInbound(msg(q));
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.notifyManagerSms).toHaveBeenCalledTimes(1);
    expect(deps.resortos.requestGuestCall).not.toHaveBeenCalled();
    noWrites(deps);
  });
  it('no SMS when the room is taken on the checkout day', async () => {
    const deps = makeDeps({}, withNext());
    await ask('Можно поздний выезд?', deps);
    await ask('ممكن خروج متأخر؟', deps);
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.notifyManagerSms).not.toHaveBeenCalled();
  });
  it.each(['Во сколько выезд?', 'Где парковка?', 'Можно продлить ещё одну ночь?', 'متى تسجيل الخروج؟', 'وين الموقف؟', 'نمدد ليلة إضافية؟', 'Кондиционер не работает', 'Спасибо, всё отлично!'])('no SMS for other intents: %s', async (q) => {
    const deps = makeDeps();
    await ask(q, deps);
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.notifyManagerSms).not.toHaveBeenCalled();
  });
});

describe('Late check-out: first hour free, approval always required (Ran 13:35/13:36)', () => {
  it.each([
    ["אפשר לעשות צ'ק אאוט מאוחר?", 'השעה הראשונה ללא חיוב', 'מהשעה השנייה 125 ₪ לשעה', 'שעת הצ׳ק-אאוט נשארת עד 11:00',
      ['רק באישור מנהל המתחם', 'גם השעה הראשונה וגם כל זמן נוסף מחייבים אישור של המנהל']],
    ['Can we do a late check-out?', 'the first hour is free of charge', "from the second hour it's ₪125 per hour", 'check-out stays at 11:00',
      ["only with the site manager's approval", "Both the free first hour and any extra paid time need the manager's approval"]],
    ['Можно поздний выезд?', 'первый час бесплатно', 'со второго часа — 125 ₪ в час', 'выезд остаётся до 11:00',
      ['только с согласия менеджера', 'И бесплатный первый час, и любое дополнительное время требуют согласия менеджера']],
    ['ممكن خروج متأخر؟', 'الساعة الأولى بدون رسوم', 'ومن الساعة الثانية 125 ₪ للساعة', 'يبقى تسجيل الخروج حتى الساعة 11:00',
      ['فقط بموافقة مدير المجمع', 'الساعة الأولى المجانية وأي وقت إضافي مدفوع يحتاجان موافقة المدير']],
  ])('%s', (q, free, fee, stays, approval) => {
    const r = answerGuestQuestion(q, ctxNofim({ bookings: [] }))!;
    for (const x of [free, fee, stays, ...(approval as string[])]) expect(r).toContain(x);
    expect(r).not.toMatch(/15:00|3:00 PM/);
    // no-booking variant states the same policy, approval included
    const nb = answerGuestQuestion(q, { booking: {} as any, unitId: '', roomName: '' })!;
    for (const x of [free, fee, ...(approval as string[])]) expect(nb).toContain(x);
  });
  it('manager SMS (mocked) states the new pricing and that the free hour needs approval, once', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(msg('Можно поздний выезд?'));
    await new Promise((r) => setTimeout(r, 0));
    await p.handleInbound(msg('Можно поздний выезд?'));
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.notifyManagerSms).toHaveBeenCalledTimes(1);
    const sms = (deps.notifyManagerSms as any).mock.calls[0][0] as string;
    expect(sms).toContain('ממתין לאישורך (גם לשעה הראשונה ללא חיוב; מהשעה השנייה 125 ₪ לשעה)');
  });
});

describe("Thai language detection and clean Arabic templates (no Hebrew letters)", () => {
  it("detects Thai script and returns Thai responses", () => {
    const thaiQuestions = [
      "มีเตียงกี่เตียง นอนได้กี่คน และมีแอร์กี่เครื่อง",
      "มีแอร์กี่เครื่องและทีวีกี่เครื่อง มี YES ไหม",
      "ห้องนอนได้กี่คน มีทีวีกี่เครื่อง",
      "ห้องเรามีซาวน่าส่วนตัวไหม",
      "ในห้องมีเตียงกี่เตียง เป็นแบบไหนบ้าง",
      "ในห้องมีโซฟาเบดไหม",
      "ในห้องมีไดร์เป่าผมไหม",
    ];
    for (const q of thaiQuestions) {
      expect(detectGuestLang(q)).toBe("th");
      const reply = answerGuestQuestion(q, ctxNofim());
      expect(reply).toBeTruthy();
      expect(reply).toMatch(/[฀-๿]/);
    }
  });

  it("ensures no Arabic response contains Hebrew characters", () => {
    const arabicQuestions = [
      "كم سريرًا يوجد في الغرفة وما نوعها؟",
      "كم شخصًا يمكنه النوم في الكوخ؟",
      "كم مكيفًا وكم تلفازًا في الكوخ؟ هل يوجد YES؟",
      "هل توجد كنبة سرير في الغرفة؟",
      "هل توجد ساونا خاصة في غرفتنا؟",
      "هل يوجد مكواة في الغرفة؟",
      "كم سريرًا وكم مكيفًا وكم تلفازًا؟",
      "كم شخصًا ينام هنا وهل يوجد سرير أريكة؟",
    ];
    for (const q of arabicQuestions) {
      expect(detectGuestLang(q)).toBe("ar");
      const reply = answerGuestQuestion(q, ctxNofim());
      expect(reply).toBeTruthy();
      expect(reply).not.toMatch(/[֐-׿]/);
    }
  });
});

describe("Confirmed Jacuzzi and Sauna facts (Ran 2026-10-20)", () => {
  const ctxUnit = (unitId: string, name: string) => ({
    booking: { id: "test", unit_id: unitId, guest_name: "Test" } as any,
    unitId,
    roomName: name,
    bookings: [],
  });

  it("Sauna: Toscana 3 (k689) is Yes; Toscana 1 (k687) is No", () => {
    const toscana3 = ctxUnit("k689", "טוסקנה 3");
    const toscana1 = ctxUnit("k687", "טוסקנה 1");

    expect(answerGuestQuestion("is there a sauna", toscana3)).toBe("Yes, there is a private sauna in the cabin.");
    expect(answerGuestQuestion("is there a sauna", toscana1)).toBe("No, there is no private sauna in this cabin.");

    expect(answerGuestQuestion("יש סאונה בחדר?", toscana3)).toBe("כן, יש סאונה יבשה פרטית בבקתה.");
    expect(answerGuestQuestion("יש סאונה בחדר?", toscana1)).toBe("לא, אין סאונה פרטית בבקתה זו.");

    const ar3 = answerGuestQuestion("هل توجد ساونا خاصة؟", toscana3)!;
    const ar1 = answerGuestQuestion("هل توجد ساونا خاصة؟", toscana1)!;
    expect(ar3).toBe("نعم، توجد ساونا خاصة في الكوخ.");
    expect(ar1).toBe("لا، لا توجد ساونا خاصة في هذا الكوخ.");
    expect(ar3).not.toMatch(/[֐-׿]/);
    expect(ar1).not.toMatch(/[֐-׿]/);

    const th3 = answerGuestQuestion("ห้องเรามีซาวน่าส่วนตัวไหม", toscana3)!;
    const th1 = answerGuestQuestion("ห้องเรามีซาวน่าส่วนตัวไหม", toscana1)!;
    expect(th3).toBe("ใช่ครับ มีห้องซาวน่าส่วนตัวในห้องพัก");
    expect(th1).toBe("ไม่มีห้องซาวน่าส่วนตัวในห้องพักนี้ครับ");
    expect(th3).toMatch(/[฀-๿]/);
    expect(th1).toMatch(/[฀-๿]/);
  });

  it("Outdoor Jacuzzi: Toscana 1 (k687) is Yes; Mul HaNof (k680) is No", () => {
    const toscana1 = ctxUnit("k687", "טוסקנה 1");
    const mul1 = ctxUnit("k680", "מול הנוף 1");

    expect(answerGuestQuestion("is there an outdoor jacuzzi", toscana1)).toBe("Yes, there is an outdoor jacuzzi in the complex.");
    expect(answerGuestQuestion("is there an outdoor jacuzzi", mul1)).toBe("No, there is no outdoor jacuzzi in this complex.");

    expect(answerGuestQuestion("יש ג'קוזי חיצוני במתחם?", toscana1)).toBe("כן, במתחם יש ג׳קוזי חיצוני.");
    expect(answerGuestQuestion("יש ג'קוזי חיצוני במתחם?", mul1)).toBe("לא, אין ג׳קוזי חיצוני במתחם זה.");

    const arTos = answerGuestQuestion("هل يوجد جاكوزي خارجي؟", toscana1)!;
    const arMul = answerGuestQuestion("هل يوجد جاكوزي خارجي؟", mul1)!;
    expect(arTos).toBe("نعم، يوجد جاكوزي خارجي في المجمع.");
    expect(arMul).toBe("لا، لا يوجد جاكوزي خارجي في هذا المجمع.");
    expect(arTos).not.toMatch(/[֐-׿]/);
    expect(arMul).not.toMatch(/[֐-׿]/);

    const thTos = answerGuestQuestion("มีอ่างจากุซซี่กลางแจ้งไหม", toscana1)!;
    const thMul = answerGuestQuestion("มีอ่างจากุซซี่กลางแจ้งไหม", mul1)!;
    expect(thTos).toBe("ใช่ครับ มีอ่างจากุซซี่กลางแจ้งในบริเวณที่พัก");
    expect(thMul).toBe("ไม่มีอ่างจากุซซี่กลางแจ้งในบริเวณที่พักนี้ครับ");
    expect(thTos).toMatch(/[฀-๿]/);
    expect(thMul).toMatch(/[฀-๿]/);
  });

  it("Indoor Jacuzzi: Maya 2 (k694) is Yes", () => {
    const maya2 = ctxUnit("k694", "בקתות מאיה 2");

    expect(answerGuestQuestion("is there a jacuzzi in the room", maya2)).toBe("Yes, there is an indoor jacuzzi in the cabin.");
    expect(answerGuestQuestion("יש ג'קוזי בחדר?", maya2)).toBe("כן, יש ג׳קוזי פנימי בבקתה.");

    const arMaya = answerGuestQuestion("هل يوجد جاكوزي في الغرفة؟", maya2)!;
    expect(arMaya).toBe("نعم، يوجد جاكوزي داخلي في الكوخ.");
    expect(arMaya).not.toMatch(/[֐-׿]/);

    const thMaya = answerGuestQuestion("มีอ่างจากุซซี่ในห้องไหม", maya2)!;
    expect(thMaya).toBe("ใช่ครับ มีอ่างจากุซซี่ในห้องพัก");
    expect(thMaya).toMatch(/[฀-๿]/);
  });
});
