import { afterEach, describe, expect, it } from 'vitest';
import {
  hasUnseenKinorotChanges,
  kinorotChangeKey,
  rememberKinorotChanges,
  resetAckedKinorotChanges,
  sameDayKinorotChanges,
  unseenKinorotChanges
} from './kinorotSyncApi.js';

const testDay = '2026-09-11';
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
        { id: 'kin_9', unit_id: 'k630', guest_name: 'חדש לגמרי', check_in_date: '2026-09-11', check_out_date: '2026-09-13' }
      ],
      updated: sample.updated,
      removed: []
    }, undefined, testDay);
    expect(next.created.map((row) => row.id)).toEqual(['kin_9']);
    expect(next.updated).toHaveLength(1);
    expect(next.total).toBe(2);
  });

  it('does not reopen the same updated stay after הבנתי', () => {
    rememberKinorotChanges({ created: [], updated: sample.updated, removed: [] }, 'sync-1');
    expect(hasUnseenKinorotChanges({ changeId: 'sync-2', changes: { updated: sample.updated } }, testDay)).toBe(false);
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
    expect(unseenKinorotChanges({ updated: [again] }, undefined, testDay).total).toBe(1);
  });
});

describe('kinorot popup rules (Nov 9 regression suite)', () => {
  const today = '2026-11-09';

  it('1. drops past changes (stay 7.11–8.11, "לא נקי" or any guest, when today is 9.11)', () => {
    const changes = {
      created: [
        { id: 'kin_690_76163', unit_id: 'k690', guest_name: 'לא נקי', check_in_date: '2026-11-07', check_out_date: '2026-11-08' },
        { id: 'kin_past', unit_id: 'k691', guest_name: 'יוסי', check_in_date: '2026-11-06', check_out_date: '2026-11-08' }
      ],
      updated: [],
      removed: [
        { id: 'kin_689_76163', unit_id: 'k689', guest_name: 'לא נקי', check_in_date: '2026-11-07', check_out_date: '2026-11-08' }
      ]
    };
    const scoped = sameDayKinorotChanges(changes, today);
    expect(scoped.total).toBe(0);
    expect(hasUnseenKinorotChanges({ changeId: 'stale', changes }, today)).toBe(false);
  });

  it('2. drops self-made staff changes ("לא נקי", "לא זמין") even if date is today', () => {
    const changes = {
      created: [
        { id: 'kin_hold_1', unit_id: 'k690', guest_name: 'לא נקי', check_in_date: '2026-11-09', check_out_date: '2026-11-10' },
        { id: 'kin_hold_2', unit_id: 'k691', guest_name: 'לא זמין', check_in_date: '2026-11-08', check_out_date: '2026-11-10' }
      ],
      updated: [
        {
          id: 'kin_hold_3',
          unit_id: 'k692',
          guest_name: 'לא נקי',
          check_in_date: '2026-11-09',
          check_out_date: '2026-11-10',
          fields: [{ field: 'unit', from: 'k691', to: 'k692' }]
        }
      ],
      removed: []
    };
    const scoped = sameDayKinorotChanges(changes, today);
    expect(scoped.total).toBe(0);
    expect(hasUnseenKinorotChanges({ changeId: 'hold', changes }, today)).toBe(false);
  });

  it('3. drops changes for all future bookings across the month', () => {
    const changes = {
      created: [
        { id: 'kin_future_1', unit_id: 'k690', guest_name: 'דוד כהן', check_in_date: '2026-12-01', check_out_date: '2026-12-04' }
      ],
      updated: [
        {
          id: 'kin_future_2',
          unit_id: 'k691',
          guest_name: 'שרה לוי',
          check_in_date: '2026-11-25',
          check_out_date: '2026-11-28',
          fields: [{ field: 'unit', from: 'k690', to: 'k691' }]
        }
      ],
      removed: [
        { id: 'kin_future_3', unit_id: 'k692', guest_name: 'משה', check_in_date: '2026-12-10', check_out_date: '2026-12-12' }
      ]
    };
    const scoped = sameDayKinorotChanges(changes, today);
    expect(scoped.total).toBe(0);
    expect(hasUnseenKinorotChanges({ changeId: 'future', changes }, today)).toBe(false);
  });

  it('keeps genuine guest changes whose stay includes today', () => {
    const changes = {
      created: [
        { id: 'kin_today_in', unit_id: 'k690', guest_name: 'לינוי ניסים', check_in_date: '2026-11-09', check_out_date: '2026-11-11' }
      ],
      updated: [],
      removed: [
        { id: 'kin_today_out', unit_id: 'k691', guest_name: 'רוני ברק', check_in_date: '2026-11-07', check_out_date: '2026-11-09' }
      ]
    };
    const scoped = sameDayKinorotChanges(changes, today);
    expect(scoped.total).toBe(2);
    expect(hasUnseenKinorotChanges({ changeId: 'live', changes }, today)).toBe(true);

    // After ack ("הבנתי"), changes never reopen
    rememberKinorotChanges(scoped, 'live');
    expect(hasUnseenKinorotChanges({ changeId: 'live', changes }, today)).toBe(false);
  });
});

