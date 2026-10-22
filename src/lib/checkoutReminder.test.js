import { describe, it, expect } from 'vitest';
import {
  normalizeIsraeliMobile, buildCheckoutReminder, dedupeKey, classifyForDate,
  effectiveDepartureDate, checkoutTimeFor, formatReport, isCheckedOut
} from './checkoutReminder.js';

const g = (o = {}) => ({ id: 'b1', unit_id: 'k681', guest_name: 'יובל כהן', guest_phone: '054-5726177',
  check_in_date: '2026-10-21', check_out_date: '2026-10-22', booking_status: 'CHECKED_IN', checkout_token: 'tok_x', stay: {}, ...o });
const D = '2026-10-22';

describe('phone', () => {
  it('normalizes to 972 mobile', () => {
    expect(normalizeIsraeliMobile('054-5726177')).toBe('972545726177');
    expect(normalizeIsraeliMobile('+972 54 572 6177')).toBe('972545726177');
    expect(normalizeIsraeliMobile('0097254-5726177')).toBe('972545726177');
    expect(normalizeIsraeliMobile('03-6123456')).toBeNull();
    expect(normalizeIsraeliMobile('19293334444')).toBeNull();
    expect(normalizeIsraeliMobile('0500000000')).toBeNull();
    expect(normalizeIsraeliMobile('')).toBeNull();
  });
});

describe('skips', () => {
  it('sends to a normal departing guest', () => {
    const r = classifyForDate(g(), D);
    expect(r.send).toBe(true); expect(r.phone).toBe('972545726177');
  });
  it('not departing → null', () => expect(classifyForDate(g({ check_out_date: '2026-10-25' }), D)).toBeNull());
  it.each([
    [{ booking_status: 'CANCELED' }, 'בוטלה'],
    [{ guest_name: 'מגורי צוות' }, 'מגורי צוות'],
    [{ unit_id: 'k678' }, 'מגורי צוות'],
    [{ guest_name: 'לא זמין' }, 'חסימה / לא זמין'],
    [{ guest_name: 'מתחם סגור לא להזמין' }, 'חסימה / לא זמין'],
    [{ guest_name: 'תחזוקה' }, 'חסימה / לא זמין'],
    [{ channel_source: 'Siesta' }, 'סיאסטה'],
    [{ booking_status: 'CHECKED_OUT' }, 'לא נשלח – מסומן CHECKED_OUT בקינרות (עזיבה לא אומתה)'],
    [{ checked_out_at: '2026-10-22T08:00:00Z' }, 'כבר עזב'],
    [{ guest_name: "טאג' מאהל 4 – תפוס" }, 'חסימה / לא זמין'],
    [{ guest_name: 'תפוסה' }, 'חסימה / לא זמין'],
    [{ stay: { self_checked_out_at: '2026-10-22T07:00:00Z' } }, 'כבר עזב'],
    [{ guest_phone: null }, 'אין טלפון'],
    [{ guest_phone: '1929333' }, 'טלפון לא תקין']
  ])('%o → %s', (patch, reason) => {
    const r = classifyForDate(g(patch), D);
    expect(r.send).toBe(false); expect(r.reason).toBe(reason);
  });
  it('keeps wifi quiet-departure rule', () => {
    const now = new Date('2026-10-22T05:30:00Z');
    const r = classifyForDate(g({ wifi_presence_status: 'disconnected', stay: { wifi_disconnected_at: '2026-10-22T04:00:00Z' } }), D, { now });
    expect(r.send).toBe(false);
    const r2 = classifyForDate(g({ wifi_presence_status: 'disconnected', stay: { wifi_disconnected_at: '2026-10-22T05:20:00Z' } }), D, { now });
    expect(r2.send).toBe(true);
  });
});

describe('dedupe', () => {
  it('key format', () => expect(dedupeKey('kin_681', D)).toBe('checkout_reminder:kin_681:2026-10-22'));
  it('already sent → skip', () => {
    const r = classifyForDate(g(), D, { alreadySent: true });
    expect(r.send).toBe(false); expect(r.reason).toBe('כבר נשלח היום');
  });
});

describe('late checkout', () => {
  const late = g({ stay: { late_until: '11:00+1' } });
  it('next-day late moves departure', () => expect(effectiveDepartureDate(late)).toBe('2026-10-23'));
  it('deferred on original day, sent on actual day', () => {
    expect(classifyForDate(late, D).deferred).toBe(true);
    expect(classifyForDate(late, D).send).toBe(false);
    expect(classifyForDate(late, '2026-10-23').send).toBe(true);
  });
  it("'next' value too", () => expect(effectiveDepartureDate(g({ stay: { late_until: 'next' } }))).toBe('2026-10-23'));
  it('same-day late changes time', () => {
    expect(checkoutTimeFor(g({ stay: { late_until: '14:00' } }))).toBe('14:00');
    expect(checkoutTimeFor(g())).toBe('11:00');
  });
});

describe('template', () => {
  it('full', () => {
    expect(buildCheckoutReminder({ guestName: 'יובל כהן', unitName: 'מול הנוף 2', checkoutTime: '11:00', stayUrl: 'https://resortos.app/stay/tok' }))
      .toBe('בוקר טוב יובל! היום יום העזיבה ממול הנוף 2. העזיבה עד 11:00. אפשר לסמן צ׳ק-אאוט או לבקש צ׳ק-אאוט מאוחר בדף האירוח: https://resortos.app/stay/tok. תודה שהתארחתם!');
  });
  it('no name, no link, default time', () => {
    expect(buildCheckoutReminder({ unitName: 'טוסקנה 1' }))
      .toBe('בוקר טוב! היום יום העזיבה מטוסקנה 1. העזיבה עד 11:00. תודה שהתארחתם!');
  });
});

describe('report', () => {
  it('splits out / not yet, ignores non-guests', () => {
    const items = [classifyForDate(g({ id: 'a', checked_out_at: '2026-10-22T08:00:00Z' }), D), classifyForDate(g({ id: 'b' }), D), classifyForDate(g({ id: 'c', guest_name: 'לא זמין' }), D)];
    const t = formatReport(D, items, (u) => u);
    expect(t).toContain('עזבו: 1'); expect(t).toContain('עוד לא עזבו: 1');
  });
});

import { smsUnitName, fromUnit } from './checkoutReminder.js';
describe('sms unit name (Ran 2026-10-21)', () => {
  it('drops · and doubled בקתה', () => {
    expect(smsUnitName('טוסקנה · 2')).toBe('טוסקנה 2');
    expect(smsUnitName('מול הנוף · בקתה 5')).toBe('מול הנוף 5');
    expect(smsUnitName('בקתות מאיה · בקתה 1')).toBe('בקתות מאיה 1');
    expect(smsUnitName("טאג' מאהל · בקתה 3")).toBe("טאג' מאהל 3");
    expect(smsUnitName('בתי נורית 4')).toBe('בתי נורית 4');
    expect(smsUnitName('קאסה נובה · Aura')).toBe('קאסה נובה Aura');
  });
  it('from-prefix', () => {
    expect(fromUnit('טוסקנה · 2')).toBe('מטוסקנה 2');
    expect(fromUnit('מול הנוף · בקתה 5')).toBe('ממול הנוף 5');
    expect(fromUnit('בקתות מאיה · בקתה 1')).toBe('מבקתות מאיה 1');
    expect(fromUnit('')).toBe('מהבקתה');
  });
  it('template uses clean name', () => {
    const t = buildCheckoutReminder({ guestName: 'יוליה', unitName: 'טוסקנה · 2', stayUrl: 'https://x' });
    expect(t).toContain('היום יום העזיבה מטוסקנה 2.');
    expect(t).not.toContain('·');
    const m = buildCheckoutReminder({ guestName: 'משה', unitName: 'בקתות מאיה · בקתה 1' });
    expect(m).toContain('מבקתות מאיה 1.');
    expect(m).not.toMatch(/בקתה בקתות|מבקתה/);
  });
});

describe('real departures (Ran 2026-10-22)', () => {
  it('today + CHECKED_OUT only → not departed, SMS still skipped (unchanged)', () => {
    const b = g({ booking_status: 'CHECKED_OUT' });
    expect(isCheckedOut(b, { date: D })).toBe(false);
    expect(classifyForDate(b, D).send).toBe(false);
  });
  it('SMS recipient set identical to legacy rule', () => {
    const legacy = (b) => b.booking_status === 'CHECKED_OUT' || Boolean(b.checked_out_at || b.stay?.self_checked_out_at);
    const rows = [g({ id: '1', booking_status: 'CHECKED_OUT' }), g({ id: '2' }), g({ id: '3', checked_out_at: 'x' }),
      g({ id: '4', booking_status: 'CHECKED_OUT', check_out_date: '2026-10-21' }), g({ id: '5', stay: { self_checked_out_at: 'x' } }), g({ id: '6', guest_phone: '052-1234567' })];
    const now = rows.map((b) => classifyForDate(b, D)).filter((i) => i?.send).map((i) => i.booking.id);
    const old = rows.filter((b) => b.check_out_date === D && !legacy(b)).map((b) => b.id);
    expect(now).toEqual(old);
  });
  it('today + checked_out_at → departed', () => {
    expect(isCheckedOut(g({ booking_status: 'CHECKED_OUT', checked_out_at: '2026-10-22T08:00:00Z' }), { date: D })).toBe(true);
  });
  it('earlier check-out date + CHECKED_OUT → departed', () => {
    expect(isCheckedOut(g({ booking_status: 'CHECKED_OUT', check_out_date: '2026-10-21' }), { date: D })).toBe(true);
  });
  it('report: CHECKED_OUT-only today is "not yet", תפוס ignored', () => {
    const items = [classifyForDate(g({ id: 'a', booking_status: 'CHECKED_OUT' }), D), classifyForDate(g({ id: 'b', stay: { self_checked_out_at: '2026-10-22T07:00:00Z' } }), D), classifyForDate(g({ id: 'c', guest_name: "טאג' מאהל 4 – תפוס" }), D)];
    const t = formatReport(D, items, (u) => u);
    expect(t).toContain('עזבו: 1'); expect(t).toContain('עוד לא עזבו: 1'); expect(t).not.toContain('תפוס');
  });
});
