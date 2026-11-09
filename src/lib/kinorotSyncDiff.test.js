import { describe, expect, it } from 'vitest';
import {
  filterKinorotChangesForToday,
  isStaffHoldName,
  isStayIncludingDay,
  kinorotChangeCount,
  summarizeKinorotDiff
} from '../../server/kinorotSyncDiff.js';

describe('kinorot sync diff', () => {
  it('flags new, date overwrite, and board removal', () => {
    const diff = summarizeKinorotDiff({
      today: '2026-09-03',
      incoming: [
        { id: 'kin_620_1', unit_id: 'k620', guest_name: 'חדש', check_in_date: '2026-09-10', check_out_date: '2026-09-12' },
        { id: 'kin_621_2', unit_id: 'k621', guest_name: 'ישראל', check_in_date: '2026-09-11', check_out_date: '2026-09-14' }
      ],
      existing: [
        { id: 'kin_621_2', unit_id: 'k621', guest_name: 'ישראל', check_in_date: '2026-09-10', check_out_date: '2026-09-12', booking_status: 'CONFIRMED' },
        { id: 'kin_622_3', unit_id: 'k622', guest_name: 'נמחק', check_in_date: '2026-09-20', check_out_date: '2026-09-22', booking_status: 'CONFIRMED' }
      ]
    });
    expect(diff.created.map((row) => row.id)).toEqual(['kin_620_1']);
    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0].fields.map((f) => f.field)).toEqual(['check_in', 'check_out']);
    expect(diff.removed.map((row) => row.id)).toEqual(['kin_622_3']);
    expect(kinorotChangeCount(diff)).toBe(3);
  });

  it('treats canceled rows as new when they return', () => {
    const diff = summarizeKinorotDiff({
      today: '2026-09-03',
      incoming: [{ id: 'kin_1', unit_id: 'k1', guest_name: 'רן', check_in_date: '2026-09-10', check_out_date: '2026-09-11' }],
      existing: [{ id: 'kin_1', unit_id: 'k1', guest_name: 'רן', check_in_date: '2026-09-10', check_out_date: '2026-09-11', booking_status: 'CANCELED', deleted_at: '2026-09-01' }]
    });
    expect(diff.created).toHaveLength(1);
    expect(diff.updated).toHaveLength(0);
  });
});

describe('isStayIncludingDay', () => {
  const today = '2026-11-09';

  it('includes stays where check_in <= today <= check_out', () => {
    // Arrival today
    expect(isStayIncludingDay('2026-11-09', '2026-11-10', today)).toBe(true);
    // Departure today
    expect(isStayIncludingDay('2026-11-07', '2026-11-09', today)).toBe(true);
    // Spanning today
    expect(isStayIncludingDay('2026-11-08', '2026-11-11', today)).toBe(true);
  });

  it('excludes past stays where check_out < today', () => {
    expect(isStayIncludingDay('2026-11-07', '2026-11-08', today)).toBe(false);
    expect(isStayIncludingDay('2026-10-15', '2026-10-17', today)).toBe(false);
  });

  it('excludes future stays where check_in > today', () => {
    expect(isStayIncludingDay('2026-11-10', '2026-11-12', today)).toBe(false);
    expect(isStayIncludingDay('2026-12-01', '2026-12-05', today)).toBe(false);
  });
});

describe('isStaffHoldName', () => {
  it('detects operational holds and staff blocks', () => {
    expect(isStaffHoldName('לא נקי')).toBe(true);
    expect(isStaffHoldName('לא זמין')).toBe(true);
    expect(isStaffHoldName('חסום')).toBe(true);
    expect(isStaffHoldName('סגור')).toBe(true);
    expect(isStaffHoldName('תקלה')).toBe(true);
    expect(isStaffHoldName('מגורי צוות')).toBe(true);
    expect(isStaffHoldName('לניקוי')).toBe(true);
    expect(isStaffHoldName('שיפוץ')).toBe(true);
  });

  it('allows genuine guest names', () => {
    expect(isStaffHoldName('לינוי ניסים')).toBe(false);
    expect(isStaffHoldName('Anastasia Tsvetaeva')).toBe(false);
    expect(isStaffHoldName('יוסי כהן')).toBe(false);
  });
});

describe('filterKinorotChangesForToday', () => {
  const today = '2026-11-09';

  it('drops past stays (stay 7.11–8.11, today 9.11)', () => {
    const changes = {
      created: [{ id: 'k1', guest_name: 'יוסי', check_in_date: '2026-11-07', check_out_date: '2026-11-08' }],
      updated: [],
      removed: [{ id: 'k2', guest_name: 'משה', check_in_date: '2026-11-06', check_out_date: '2026-11-08' }]
    };
    const result = filterKinorotChangesForToday(changes, today);
    expect(result.created).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('drops self-made staff changes ("לא נקי", "לא זמין")', () => {
    const changes = {
      created: [{ id: 'k1', guest_name: 'לא נקי', check_in_date: '2026-11-09', check_out_date: '2026-11-10' }],
      updated: [{
        id: 'k2',
        guest_name: 'לא זמין',
        check_in_date: '2026-11-09',
        check_out_date: '2026-11-10',
        fields: [{ field: 'unit', from: 'k620', to: 'k621' }]
      }],
      removed: [{ id: 'k3', guest_name: 'לא נקי', check_in_date: '2026-11-08', check_out_date: '2026-11-09' }]
    };
    const result = filterKinorotChangesForToday(changes, today);
    expect(result.created).toHaveLength(0);
    expect(result.updated).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('drops future bookings across the month (stay in December, today 9.11)', () => {
    const changes = {
      created: [{ id: 'k1', guest_name: 'דוד', check_in_date: '2026-12-01', check_out_date: '2026-12-04' }],
      updated: [{
        id: 'k2',
        guest_name: 'רוני',
        check_in_date: '2026-11-20',
        check_out_date: '2026-11-22',
        fields: [{ field: 'unit', from: 'k620', to: 'k621' }]
      }],
      removed: [{ id: 'k3', guest_name: 'שרה', check_in_date: '2026-12-15', check_out_date: '2026-12-18' }]
    };
    const result = filterKinorotChangesForToday(changes, today);
    expect(result.created).toHaveLength(0);
    expect(result.updated).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('keeps genuine stays that include today', () => {
    const changes = {
      created: [
        { id: 'k1', guest_name: 'לינוי ניסים', check_in_date: '2026-11-08', check_out_date: '2026-11-10' },
        { id: 'k2', guest_name: 'אבי', check_in_date: '2026-11-09', check_out_date: '2026-11-11' }
      ],
      updated: [],
      removed: [{ id: 'k3', guest_name: 'יוסי', check_in_date: '2026-11-07', check_out_date: '2026-11-09' }]
    };
    const result = filterKinorotChangesForToday(changes, today);
    expect(result.created.map((r) => r.id)).toEqual(['k1', 'k2']);
    expect(result.removed.map((r) => r.id)).toEqual(['k3']);
    expect(result.total).toBe(3);
  });

  it('keeps updates moved onto or off today', () => {
    const changes = {
      created: [],
      updated: [
        // Moved from today (9.11) to next week (16.11)
        {
          id: 'k1',
          guest_name: 'רוני',
          check_in_date: '2026-11-16',
          check_out_date: '2026-11-18',
          fields: [
            { field: 'check_in', from: '2026-11-09', to: '2026-11-16' },
            { field: 'check_out', from: '2026-11-11', to: '2026-11-18' }
          ]
        },
        // Moved from next month onto today
        {
          id: 'k2',
          guest_name: 'מיכל',
          check_in_date: '2026-11-09',
          check_out_date: '2026-11-11',
          fields: [
            { field: 'check_in', from: '2026-12-01', to: '2026-11-09' },
            { field: 'check_out', from: '2026-12-03', to: '2026-11-11' }
          ]
        }
      ],
      removed: []
    };
    const result = filterKinorotChangesForToday(changes, today);
    expect(result.updated.map((r) => r.id)).toEqual(['k1', 'k2']);
    expect(result.total).toBe(2);
  });
});

