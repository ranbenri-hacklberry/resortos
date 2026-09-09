import { afterEach, describe, expect, it } from 'vitest';
import {
  hasUnseenKinorotChanges,
  kinorotChangeKey,
  rememberKinorotChanges,
  resetAckedKinorotChanges,
  unseenKinorotChanges
} from './kinorotSyncApi.js';

const sample = {
  created: [{ id: 'kin_1', unit_id: 'k620', guest_name: 'חדש', check_in_date: '2026-09-10', check_out_date: '2026-09-12' }],
  updated: [{
    id: 'kin_2',
    unit_id: 'k621',
    guest_name: 'ישראל',
    check_in_date: '2026-09-11',
    check_out_date: '2026-09-14',
    fields: [{ field: 'check_in', from: '2026-09-10', to: '2026-09-11' }]
  }],
  removed: [{ id: 'kin_3', unit_id: 'k622', guest_name: 'נמחק', check_in_date: '2026-09-20', check_out_date: '2026-09-22' }]
};

afterEach(() => {
  resetAckedKinorotChanges();
});

describe('kinorot change acknowledgements', () => {
  it('hides an acked mismatch and keeps a new one', () => {
    rememberKinorotChanges({ created: sample.created, updated: [], removed: [] }, 'sync-1');
    const next = unseenKinorotChanges({
      created: [
        sample.created[0],
        { id: 'kin_9', unit_id: 'k630', guest_name: 'חדש לגמרי', check_in_date: '2026-09-18', check_out_date: '2026-09-20' }
      ],
      updated: sample.updated,
      removed: []
    });
    expect(next.created.map((row) => row.id)).toEqual(['kin_9']);
    expect(next.updated).toHaveLength(1);
    expect(next.total).toBe(2);
  });

  it('does not reopen the same updated stay after הבנתי', () => {
    rememberKinorotChanges({ created: [], updated: sample.updated, removed: [] }, 'sync-1');
    expect(hasUnseenKinorotChanges({ changeId: 'sync-2', changes: { updated: sample.updated } })).toBe(false);
  });

  it('shows the stay again if Kinorot changed it a second time', () => {
    rememberKinorotChanges({ created: [], updated: sample.updated, removed: [] }, 'sync-1');
    const again = {
      ...sample.updated[0],
      check_out_date: '2026-09-16',
      fields: [
        { field: 'check_in', from: '2026-09-10', to: '2026-09-11' },
        { field: 'check_out', from: '2026-09-14', to: '2026-09-16' }
      ]
    };
    expect(kinorotChangeKey('updated', again)).not.toBe(kinorotChangeKey('updated', sample.updated[0]));
    expect(unseenKinorotChanges({ updated: [again] }).total).toBe(1);
  });
});
