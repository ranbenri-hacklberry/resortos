import { describe, expect, it } from 'vitest';
import { bookingGuestHeadcount, bookingHasCrib, buildDailyDutyHtml, buildHousekeepingWhatsAppText, collectHousekeepingDutyJobs, dailyDutyCounts, dutyPrintAreaOf, guestCardFirstName, listDutyBoardRows, sortDutyBoardRows, turnaroundUnitIds, unitMatchesBoardArea } from './dailyDutyReport.js';

const units = [
  { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 1 },
  { id: 'hill-2', name: 'צימר בגבעה 2', sort_order: 1.5 },
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

describe('listDutyBoardRows', () => {
  const boardBookings = [
    { id: 'out', unit_id: 'hill-1', guest_name: 'יצא', check_in_date: '2026-08-25', check_out_date: '2026-08-26', booking_status: 'CONFIRMED' },
    { id: 'in', unit_id: 'hill-1', guest_name: 'נכנס', check_in_date: '2026-08-26', check_out_date: '2026-08-28', booking_status: 'CONFIRMED' },
    { id: 'stay', unit_id: 'k671', guest_name: 'נשאר', check_in_date: '2026-08-24', check_out_date: '2026-08-28', booking_status: 'CONFIRMED' },
    { id: 'only-in', unit_id: 'k826', guest_name: 'כניסה', check_in_date: '2026-08-26', check_out_date: '2026-08-27', booking_status: 'CONFIRMED' },
    { id: 'only-out', unit_id: 'hill-2', guest_name: 'יצא בלבד', check_in_date: '2026-08-24', check_out_date: '2026-08-26', booking_status: 'CONFIRMED' }
  ];

  it('splits checkouts, checkins, and occupied without double-counting turnovers', () => {
    expect(listDutyBoardRows({ bookings: boardBookings, units, dateStr: '2026-08-26', tab: 'checkouts' }).map((r) => r.guest))
      .toEqual(['יצא בלבד']);
    expect(listDutyBoardRows({ bookings: boardBookings, units, dateStr: '2026-08-26', tab: 'checkins' }).map((r) => r.guest))
      .toEqual(['נכנס', 'כניסה']);
    expect(listDutyBoardRows({ bookings: boardBookings, units, dateStr: '2026-08-26', tab: 'checkouts' }).map((r) => r.unitId))
      .not.toContain('hill-1');
    expect(listDutyBoardRows({ bookings: boardBookings, units, dateStr: '2026-08-26', tab: 'occupied' }).map((r) => r.guest))
      .toEqual(['נשאר']);
    expect(listDutyBoardRows({ bookings: boardBookings, units, dateStr: '2026-08-26', tab: 'midstays' }).map((r) => r.guest))
      .toEqual(['נשאר']);
    expect([...turnaroundUnitIds(boardBookings, '2026-08-26')]).toEqual(['hill-1']);
    // vacant = not effectively occupied
    expect(listDutyBoardRows({ bookings: boardBookings, units, dateStr: '2026-08-26', tab: 'vacant' }).map((r) => r.unitId))
      .toEqual(['hill-2']);
    expect(listDutyBoardRows({
      bookings: boardBookings.filter((b) => b.id !== 'in' && b.id !== 'only-in' && b.id !== 'stay'),
      units,
      dateStr: '2026-08-26',
      tab: 'vacant'
    }).map((r) => r.unitId).sort()).toEqual(['hill-1', 'hill-2', 'k671', 'k826']);
  });

  it('drops ready cabins below dirty ones on the day board', () => {
    const rows = [
      { unitId: 'a', unitName: 'נורית 1', sort: 1 },
      { unitId: 'b', unitName: 'נורית 3', sort: 3 },
      { unitId: 'c', unitName: 'נורית 2', sort: 2 }
    ];
    const status = { a: 'READY', b: 'DIRTY', c: 'READY' };
    expect(sortDutyBoardRows(rows, (row) => status[row.unitId]).map((row) => row.unitId)).toEqual(['b', 'a', 'c']);
  });

  it('keeps today check-ins on checkins even after staff marks occupied', () => {
    const unitsWithOcc = [
      { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 1 },
      { id: 'k826', name: 'קאסה נובה · Aura', sort_order: 2, staff_occupancy: 'OCCUPIED' },
      { id: 'k671', name: 'בתי נורית 1', sort_order: 3 }
    ];
    expect(listDutyBoardRows({ bookings: boardBookings, units: unitsWithOcc, dateStr: '2026-08-26', tab: 'checkins' }).map((r) => r.guest))
      .toEqual(['נכנס', 'כניסה']);
    expect(listDutyBoardRows({ bookings: boardBookings, units: unitsWithOcc, dateStr: '2026-08-26', tab: 'occupied' }).map((r) => r.guest))
      .toEqual(['נשאר']);
  });

  it('keeps a same-day turnaround in checkins while the morning guest still occupies the cabin', () => {
    const unitsWithOcc = [
      { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 1, staff_occupancy: 'OCCUPIED' },
      { id: 'k826', name: 'קאסה נובה · Aura', sort_order: 2 },
      { id: 'k671', name: 'בתי נורית 1', sort_order: 3 }
    ];
    expect(listDutyBoardRows({ bookings: boardBookings, units: unitsWithOcc, dateStr: '2026-08-26', tab: 'checkouts' }).map((r) => r.guest))
      .toEqual(['יצא בלבד']);
    expect(listDutyBoardRows({ bookings: boardBookings, units: unitsWithOcc, dateStr: '2026-08-26', tab: 'checkins' }).map((r) => r.guest))
      .toEqual(['נכנס', 'כניסה']);
  });

  it('keeps a not-yet-arrived check-in on the daily board after manager inspection', () => {
    const inspected = [
      {
        id: 'k826',
        name: 'קאסה נובה · Aura',
        sort_order: 2,
        operational_status: 'READY',
        custom_reason: '',
        quality_inspections: [{
          at: '2026-08-26T10:00:00.000Z',
          ratings: { clean: 5 },
          reopened: false
        }]
      },
      { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 1 },
      { id: 'k671', name: 'בתי נורית 1', sort_order: 3 }
    ];
    expect(listDutyBoardRows({ bookings: boardBookings, units: inspected, dateStr: '2026-08-26', tab: 'checkins' }).map((r) => r.guest))
      .toContain('כניסה');
    expect(listDutyBoardRows({ bookings: boardBookings, units: inspected, dateStr: '2026-08-26', tab: 'checkins' }).map((r) => r.unitId))
      .toContain('k826');
  });

  it('fills default stay hours on duty rows when Kinorot notes have none', () => {
    const rows = listDutyBoardRows({ bookings: boardBookings, units, dateStr: '2026-08-26', tab: 'checkins' });
    const arrival = rows.find((row) => row.guest === 'כניסה');
    expect(arrival?.checkinHour).toBe('15:00');
    expect(arrival?.checkoutHour).toBe('11:00');
    const leaving = listDutyBoardRows({ bookings: boardBookings, units, dateStr: '2026-08-26', tab: 'checkouts' })
      .find((row) => row.guest === 'יצא בלבד');
    expect(leaving?.checkoutHour).toBe('11:00');
  });
});

describe('housekeeping WhatsApp', () => {
  const hkUnits = [
    { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 1 },
    { id: 'k671', name: 'Ⓖ23 בתי נורית 1', sort_order: 2 },
    { id: 'k808', name: "Ⓔ27 טאג' מאהל · בקתה 1", sort_order: 3, operational_status: 'READY' },
    { id: 'k809', name: "Ⓔ27 טאג' מאהל · בקתה 2", sort_order: 4, operational_status: 'DIRTY', staff_occupancy: 'VACANT' },
    { id: 'k810', name: "Ⓔ27 טאג' מאהל · בקתה 3", sort_order: 5 }
  ];
  const hkBookings = [
    { id: 'out', unit_id: 'k671', guest_name: 'יצא', check_in_date: '2026-08-25', check_out_date: '2026-08-26', booking_status: 'CONFIRMED', special_requests: '|pax:2+1+0' },
    { id: 'turn-out', unit_id: 'hill-1', guest_name: 'יצא גבעה', check_in_date: '2026-08-25', check_out_date: '2026-08-26', booking_status: 'CONFIRMED', special_requests: '|out:11:00|in:15:00|pax:2+0+0' },
    { id: 'turn-in', unit_id: 'hill-1', guest_name: 'נכנס גבעה', check_in_date: '2026-08-26', check_out_date: '2026-08-28', booking_status: 'CONFIRMED', special_requests: '|in:15:00|pax:2+1+1' },
    { id: 'ready-in', unit_id: 'k808', guest_name: 'נכנס נקי', check_in_date: '2026-08-26', check_out_date: '2026-08-27', booking_status: 'CONFIRMED' },
    { id: 'left-yesterday', unit_id: 'k809', guest_name: 'יצא אתמול', check_in_date: '2026-08-24', check_out_date: '2026-08-25', booking_status: 'CHECKED_OUT' },
    { id: 'dirty-in', unit_id: 'k809', guest_name: 'נכנס למלוכלך', check_in_date: '2026-08-26', check_out_date: '2026-08-27', booking_status: 'CONFIRMED', special_requests: '|in:15:00|pax:2+0+1' },
    { id: 'taj-out', unit_id: 'k810', guest_name: 'יציאה טאג', check_in_date: '2026-08-25', check_out_date: '2026-08-26', booking_status: 'CONFIRMED', special_requests: '|out:11:00|pax:3+0+0' }
  ];

  it('puts leftover dirty vacant check-ins first and skips already-clean arrivals', () => {
    const jobs = collectHousekeepingDutyJobs({
      bookings: hkBookings,
      units: hkUnits,
      dateStr: '2026-08-26'
    });
    expect(jobs.map((row) => `${row.kind}:${row.unitId}:${row.lockbox}`)).toEqual([
      'leftover_in:k809:2520',
      'turnover:hill-1:3041',
      'checkout:k671:2310',
      'checkout:k810:2530'
    ]);
  });

  it('formats WhatsApp by complex and can filter by assigned rooms', () => {
    const text = buildHousekeepingWhatsAppText({
      bookings: hkBookings,
      units: hkUnits,
      dateStr: '2026-08-26'
    });
    expect(text).toContain('סה״כ 4 בקתות לניקיון');
    expect(text).not.toContain('קודם —');
    expect(text).not.toContain('כניסה');
    expect(text.match(/טאג' מאהל · רמות/g)).toEqual(["טאג' מאהל · רמות"]);
    expect(text.indexOf("טאג' 2")).toBeLessThan(text.indexOf("טאג' 3"));
    expect(text.indexOf("טאג' מאהל")).toBeLessThan(text.indexOf('גבעת יואב'));
    expect(text).toMatch(/טאג' 3\nיציאה ב-11 · כספת מפתח 2530\n3 מבוגרים/);
    expect(text).toMatch(/גבעה 1\nיציאה ב-11 · כספת מפתח 3041\n2 מבוגרים · 1 ילד · 1 תינוק · מיטת תינוק/);
    expect(text).toMatch(/נורית 1\nיציאה ב-11 · כספת מפתח 2310\n2 מבוגרים · 1 ילד/);
    expect(text).toContain('מלוכלך ופנוי · כספת מפתח 2520');
    expect(text).toContain('2 מבוגרים · 1 תינוק · מיטת תינוק');
    expect(text).not.toContain('נכנס נקי');
    const teamText = buildHousekeepingWhatsAppText({
      bookings: hkBookings,
      units: hkUnits,
      dateStr: '2026-08-26',
      unitIds: ['k809'],
      teamName: 'צוות רמות'
    });
    expect(teamText).toContain('צוות רמות');
    expect(teamText).toContain('סה״כ 1 בקתות לניקיון');
    expect(teamText).not.toContain('צימר בגבעה');
    expect(teamText).toContain("טאג' 2");
  });
});
