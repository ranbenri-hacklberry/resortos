import { describe, expect, it } from 'vitest';
import { canonicalFieldPhrase, fieldStaffCounts, guessFieldSourceLang, isCatalogFieldReason, isFieldOpsHost, isFieldStaffMode, isFieldStaffPath, listFieldStaffTasks, translateFieldReason } from './fieldStaff.js';

describe('field staff view', () => {
  it('matches /staff and /ops', () => {
    expect(isFieldStaffPath('/staff')).toBe(true);
    expect(isFieldStaffPath('/ops/')).toBe(true);
    expect(isFieldStaffPath('/')).toBe(false);
  });

  it('treats the public ops host as field mode even on /', () => {
    expect(isFieldOpsHost('ops.resortos.app')).toBe(true);
    expect(isFieldOpsHost('random.trycloudflare.com')).toBe(true);
    expect(isFieldStaffMode('/', 'ops.resortos.app')).toBe(true);
    expect(isFieldStaffMode('/', '100.127.14.15')).toBe(false);
  });

  it('lists open housekeeping and waiting inspection separately', () => {
    const units = [
      { id: 'k688', name: 'טוסקנה · פירנצה 2', is_active: true, operational_status: 'DIRTY', custom_reason: 'ניקוי לאחר יציאה והכנה לכניסה' },
      { id: 'k671', name: 'בתי נורית 1', is_active: true, operational_status: 'READY', custom_reason: 'ממתין לביקורת מנהל', quality_inspections: [{ at: '2026-09-02T08:00:00.000Z', source: 'calendar', ratings: {}, reopened: false }] },
      { id: 'k675', name: 'בתי נורית 4', is_active: true, operational_status: 'READY' }
    ];
    const bookings = [
      { id: 'out-688', unit_id: 'k688', check_in_date: '2026-08-31', check_out_date: '2026-09-02', booking_status: 'CHECKED_OUT' },
      { id: 'out-671', unit_id: 'k671', check_in_date: '2026-08-31', check_out_date: '2026-09-02', booking_status: 'CHECKED_OUT' }
    ];
    const tasks = listFieldStaffTasks(units, bookings, '2026-09-02');
    expect(tasks.map((row) => row.id)).toEqual(['k671', 'k688']);
    expect(fieldStaffCounts(tasks)).toEqual({ open: 1, inspect: 1 });
  });

  it('lists a clean room that still needs restock completions', () => {
    const units = [{
      id: 'k685',
      name: 'נופים בלבן · בקתה 1',
      is_active: true,
      operational_status: 'NEEDS_COMPLETIONS',
      custom_reason: 'נקי · השלמות · מגבות',
      sop_progress: { completions: [{ id: 'c1', text: 'מגבות', done: false }] }
    }];
    const tasks = listFieldStaffTasks(units, [{
      id: 'in',
      unit_id: 'k685',
      check_in_date: '2026-09-17',
      check_out_date: '2026-09-19',
      booking_status: 'CONFIRMED'
    }], '2026-09-17');
    expect(tasks[0]).toMatchObject({ id: 'k685', kind: 'completions', open: true });
  });

  it('drops a cabin from tasks after the manager inspection passes', () => {
    const units = [
      {
        id: 'k671',
        name: 'בתי נורית 1',
        is_active: true,
        operational_status: 'READY',
        custom_reason: '',
        quality_inspections: [{
          at: '2026-09-16T10:00:00.000Z',
          ratings: { clean: 5, showerToilets: 4, linens: 5, orderLook: 5 },
          reopened: false
        }]
      }
    ];
    expect(listFieldStaffTasks(units, [{
      id: 'in-671',
      unit_id: 'k671',
      check_in_date: '2026-09-16',
      check_out_date: '2026-09-18',
      booking_status: 'CONFIRMED'
    }], '2026-09-16')).toEqual([]);
  });

  it('keeps treated maintenance visible so it can be reopened', () => {
    const units = [
      { id: 'k688', name: 'טוסקנה · פירנצה 2', is_active: true, operational_status: 'READY', custom_reason: 'טופל', operational_domain: 'MAINTENANCE' }
    ];
    const tasks = listFieldStaffTasks(units, [], '2026-09-02');
    expect(tasks[0]).toMatchObject({ id: 'k688', kind: 'done', open: false });
    expect(fieldStaffCounts(tasks)).toEqual({ open: 0, inspect: 1 });
  });

  it('puts guest counts and key-safe code on cleaning cards', () => {
    const units = [
      { id: 'k688', name: 'טוסקנה · פירנצה 2', is_active: true, operational_status: 'DIRTY' }
    ];
    const bookings = [{
      id: 'b1',
      unit_id: 'k688',
      check_in_date: '2026-09-04',
      check_out_date: '2026-09-06',
      adults_count: 2,
      children_count: 1,
      infants_count: 1,
      booking_status: 'CONFIRMED'
    }];
    const [task] = listFieldStaffTasks(units, bookings, '2026-09-04');
    expect(task.cleaning).toBe(true);
    expect(task.guests).toEqual({ adults: 2, children: 1, infants: 1, total: 4 });
    expect(task.peopleLabel).toBe('2 מבוגרים · 1 ילד · 1 תינוק');
    expect(task.needsCrib).toBe(true);
    expect(task.lockbox).toBe('2720');
  });

  it('hides leftover cleaning while the cabin is occupied', () => {
    const units = [
      { id: 'k618', name: 'סייסטה · משפחתית 1', is_active: true, operational_status: 'DIRTY' }
    ];
    const bookings = [{
      id: 'stay',
      unit_id: 'k618',
      check_in_date: '2026-09-02',
      check_out_date: '2026-09-06',
      booking_status: 'CHECKED_IN'
    }];
    expect(listFieldStaffTasks(units, bookings, '2026-09-04')).toEqual([]);
  });

  it('scopes tasks to allowed units', () => {
    const units = [
      { id: 'k688', name: 'טוסקנה · פירנצה 2', is_active: true, operational_status: 'DIRTY' },
      { id: 'k671', name: 'בתי נורית 1', is_active: true, operational_status: 'DIRTY' }
    ];
    const bookings = [
      { id: 'out', unit_id: 'k688', check_in_date: '2026-08-31', check_out_date: '2026-09-02', booking_status: 'CHECKED_OUT' }
    ];
    const tasks = listFieldStaffTasks(units, bookings, '2026-09-02', ['k688']);
    expect(tasks.map((row) => row.id)).toEqual(['k688']);
  });

  it('translates stored Hebrew report phrases', () => {
    const t = (key) => ({
      FIELD_CHIP_TOWELS: 'Towels',
      FIELD_SHORTAGE_PREFIX: 'Shortage',
      FIELD_REASON_TURNOVER: 'Turnover clean after checkout'
    }[key] || key);
    expect(translateFieldReason('חוסר: מגבות', t)).toBe('Shortage: Towels');
    expect(translateFieldReason('ניקוי לאחר יציאה והכנה לכניסה', t)).toBe('Turnover clean after checkout');
    expect(canonicalFieldPhrase('Towels', undefined, t)).toBe('מגבות');
  });

  it('detects free-text Hebrew notes that need live translation', () => {
    expect(isCatalogFieldReason('מגבות')).toBe(true);
    expect(isCatalogFieldReason('הדלת חורקת במקלחת')).toBe(false);
    expect(guessFieldSourceLang('הדלת חורקת במקלחת', 'th')).toBe('he');
    expect(guessFieldSourceLang('ประตูมีเสียงดัง', 'he')).toBe('th');
  });
});
