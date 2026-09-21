import { describe, expect, it } from 'vitest';
import {
  buildCleaningChecklistHtml,
  groupChecklistRoomsByComplex,
  listCheckoutChecklistRooms,
  suggestedChecklistCounts
} from './cleaningChecklist.js';

describe('cleaningChecklist', () => {
  const units = [
    { id: 'k808', name: "טאג' מאהל 1", sort_order: 1 },
    { id: 'k809', name: "טאג' מאהל 2", sort_order: 2 },
    { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 3 }
  ];

  const bookings = [
    {
      id: 'b1',
      unit_id: 'k808',
      guest_name: 'דני',
      check_in_date: '2026-09-18',
      check_out_date: '2026-09-21',
      booking_status: 'CONFIRMED',
      adults_count: 2,
      children_count: 1
    },
    {
      id: 'b2',
      unit_id: 'k809',
      guest_name: 'מיכל',
      check_in_date: '2026-09-19',
      check_out_date: '2026-09-21',
      booking_status: 'CONFIRMED',
      adults_count: 2,
      children_count: 0
    },
    {
      id: 'b3',
      unit_id: 'hill-1',
      guest_name: 'יוסי',
      check_in_date: '2026-09-20',
      check_out_date: '2026-09-22',
      booking_status: 'CONFIRMED',
      adults_count: 2,
      children_count: 0
    }
  ];

  it('suggests towel counts from party size', () => {
    expect(suggestedChecklistCounts({ adults: 2, children: 1 })).toEqual({
      bodyTowels: 3,
      faceTowels: 2,
      espressoCapsules: ''
    });
  });

  it('lists checkout rooms for the day and groups by complex', () => {
    const rooms = listCheckoutChecklistRooms({
      bookings,
      units,
      dateStr: '2026-09-21',
      area: 'ramot'
    });
    expect(rooms.map((row) => row.unitId)).toEqual(['k808', 'k809']);
    const groups = groupChecklistRoomsByComplex(rooms);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toContain('טאג');
  });

  it('builds one printed page per selected room', () => {
    const rooms = listCheckoutChecklistRooms({
      bookings,
      units,
      dateStr: '2026-09-21',
      area: 'all'
    }).map((room) => ({ ...room, cleanerName: 'נועה' }));
    const html = buildCleaningChecklistHtml({ rooms, dateStr: '2026-09-21' });
    expect(html).toContain('page-break-after: always');
    expect(html).toContain('חלל שינה');
    expect(html).toContain('בקרת אנרגיה ונעילה');
    expect(html).toContain('חתימת עובד/ת הניקיון');
    expect(html).toContain('נועה');
    expect((html.match(/class="page"/g) || []).length).toBe(2);
  });
});
