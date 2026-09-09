import { describe, expect, it } from 'vitest';
import { kinorotChangeCount, summarizeKinorotDiff } from '../../server/kinorotSyncDiff.js';

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
