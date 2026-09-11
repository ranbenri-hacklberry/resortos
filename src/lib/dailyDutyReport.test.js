import { describe, expect, it } from 'vitest';
import { bookingGuestHeadcount, bookingHasCrib, buildDailyDutyHtml, dailyDutyCounts, dutyPrintAreaOf, guestCardFirstName, unitMatchesBoardArea } from './dailyDutyReport.js';

const units = [
  { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 1 },
  { id: 'k826', name: 'קאסה נובה · Aura', sort_order: 2 },
  { id: 'k671', name: 'בתי נורית 1', sort_order: 3 }
];

const bookings = [
  { id: 'a', unit_id: 'hill-1', guest_name: 'גבעה', check_in_date: '2026-08-26', check_out_date: '2026-08-27', booking_status: 'CONFIRMED' },
  { id: 'b', unit_id: 'k826', guest_name: 'קאסה', check_in_date: '2026-08-26', check_out_date: '2026-08-27', booking_status: 'CONFIRMED' },
  { id: 'c', unit_id: 'k671', guest_name: 'רמות', check_in_date: '2026-08-26', check_out_date: '2026-08-27', booking_status: 'CONFIRMED' },
  { id: 'd', unit_id: 'k687', guest_name: 'נשאר', check_in_date: '2026-08-24', check_out_date: '2026-08-28', booking_status: 'CONFIRMED' }
];

describe('calendar card guest bits', () => {
  it('shows a first name and a total without splitting adults and children', () => {
    expect(guestCardFirstName('עומר קרס')).toBe('עומר');
    expect(guestCardFirstName('Mohamad Jabare')).toBe('Mohamad');
    expect(bookingGuestHeadcount({
      adults_count: 2,
      children_count: 0,
      special_requests: 'kinorot:1|pax:2+2+1'
    })).toBe(4);
    expect(bookingHasCrib({
      adults_count: 2,
      special_requests: 'kinorot:72988|pax:2+0+1|in:15:00'
    })).toBe(true);
    expect(bookingHasCrib({ adults_count: 2, children_count: 1 })).toBe(false);
  });
});

describe('duty print areas', () => {
  it('puts hill, dome, mialees and casa nova in givat and the rest in ramot', () => {
    expect(dutyPrintAreaOf('hill-1')).toBe('givat');
    expect(dutyPrintAreaOf('dome-blue')).toBe('givat');
    expect(dutyPrintAreaOf('mialis-villa')).toBe('givat');
    expect(dutyPrintAreaOf('suite-green')).toBe('givat');
    expect(dutyPrintAreaOf('k826')).toBe('givat');
    expect(dutyPrintAreaOf('k671')).toBe('ramot');
    expect(unitMatchesBoardArea({ id: 'k826' }, 'all')).toBe(true);
    expect(unitMatchesBoardArea({ id: 'k826' }, 'givat')).toBe(true);
    expect(unitMatchesBoardArea({ id: 'k671' }, 'givat')).toBe(false);
    expect(unitMatchesBoardArea({ id: 'k671' }, 'ramot')).toBe(true);
  });

  it('filters the daily report by the selected area', () => {
    expect(dailyDutyCounts(bookings, units, '2026-08-26', 'givat')).toEqual({ checkouts: 0, checkins: 2, occupying: 2 });
    expect(dailyDutyCounts(bookings, units, '2026-08-26', 'ramot')).toEqual({ checkouts: 0, checkins: 1, occupying: 2 });
    const html = buildDailyDutyHtml({
      dateStr: '2026-08-26',
      kind: 'checkins',
      bookings,
      units,
      area: 'givat'
    });
    expect(html).toContain('גבעה');
    expect(html).toContain('קאסה');
    expect(html).not.toContain('רמות');
    expect(html).toContain('גבעה · כיפה · מיאליס · קאסה נובה');
    expect(dailyDutyCounts(bookings, units, '2026-08-26', 'all')).toEqual({ checkouts: 0, checkins: 3, occupying: 4 });
    expect(html).not.toContain('נשארים');
    const ramotHtml = buildDailyDutyHtml({
      dateStr: '2026-08-26',
      kind: 'checkins',
      bookings,
      units,
      area: 'ramot'
    });
    expect(ramotHtml).toContain('1 כניסות');
    expect(ramotHtml).not.toContain('נשארים');
    expect(ramotHtml).not.toContain('נשאר');
  });

  it('prints the Kinorot checkout hour on the departures report', () => {
    const html = buildDailyDutyHtml({
      dateStr: '2026-08-27',
      kind: 'checkouts',
      bookings: [
        {
          id: 'kin_697_1',
          unit_id: 'hill-1',
          guest_name: 'נטשה',
          check_in_date: '2026-08-26',
          check_out_date: '2026-08-27',
          booking_status: 'CONFIRMED',
          special_requests: 'kinorot:1|pax:2+0+0|out:13:00|in:15:00'
        }
      ],
      units,
      area: 'givat'
    });
    expect(html).toContain('שעת יציאה לפי הזמנה');
    expect(html).toContain('13:00');
    expect(html).toContain('<th>שעה</th>');
  });
});
