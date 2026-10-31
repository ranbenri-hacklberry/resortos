import { describe, it, expect } from 'vitest';
import { formatManagerInitialCard, getRoomOccupancy } from './managerQuestions.js';

const today = '2026-10-22';
const vacant = getRoomOccupancy('k1', [], today);
const card = (unit: any, occ = vacant) => formatManagerInitialCard('חדר', '0000', { id: 'k1', ...unit }, occ);
const staying = getRoomOccupancy('k1', [{ id: 's', unit_id: 'k1', guest_name: 'שוהה', check_in_date: '2026-10-21', check_out_date: '2026-10-24', booking_status: 'CONFIRMED' } as any], today);
const arriving = getRoomOccupancy('k1', [{ id: 'a', unit_id: 'k1', guest_name: 'מגיע', check_in_date: today, check_out_date: '2026-10-23', booking_status: 'CONFIRMED' } as any], today);

describe('single "סטטוס:" line (Ran 2026-10-22)', () => {
  it.each([
    [{ operational_status: 'READY' }, 'מוכן לאורח 🟢'],
    [{ operational_status: 'DIRTY' }, 'ממתין לניקיון 🔴'],
    [{ operational_status: 'IN_PROGRESS', assigned_staff: 'סומצ׳אי' }, 'בנקיון 🟡 | סומצ׳אי'],
    [{ operational_status: 'NEEDS_COMPLETIONS' }, 'ממתין לבדיקה 🔍'],
    [{ operational_status: 'READY', custom_reason: 'ממתין לביקורת מנהל' }, 'ממתין לבדיקה 🔍'],
    [{ operational_status: 'MAINTENANCE_ALERT' }, 'תקלה ⚠️'],
    [{ operational_status: 'GARDENING' }, 'עבודת גינון 🌿'],
    [{ operational_status: 'OUT_OF_ORDER' }, 'לא זמין ⛔'],
    [{ operational_status: 'UNAVAILABLE' }, 'לא זמין ⛔'],
    [{ operational_status: 'BLOCKED' }, 'לא זמין ⛔'],
    [{ operational_status: 'SOMETHING_NEW' }, 'SOMETHING_NEW ❔'],
  ])('%o → %s', (unit, label) => {
    const c = card(unit);
    expect(c).toContain(`סטטוס: ${label}`);
    expect(c).not.toContain('סטטוס ניקיון');
    expect(c).not.toContain('סטטוס תפוסה');
  });
  it('unknown status never says מוכן לאורח', () => {
    expect(card({ operational_status: 'SOMETHING_NEW' })).not.toContain('מוכן לאורח');
    expect(card({})).not.toContain('מוכן לאורח');
  });
  it('occupied wins over fault / unavailable', () => {
    expect(card({ operational_status: 'MAINTENANCE_ALERT', staff_occupancy: 'OCCUPIED' }, staying)).toContain('סטטוס: 🏠 מאוכלס (שוהה)');
    expect(card({ operational_status: 'OUT_OF_ORDER' }, staying)).toContain('סטטוס: 🏠 מאוכלס (שוהה)');
  });
  it('checked-in today → מאוכלס; not checked in yet → status + צ׳ק אין היום', () => {
    const inn = card({ operational_status: 'READY', staff_occupancy: 'OCCUPIED' }, arriving);
    expect(inn).toContain('סטטוס: 🏠 מאוכלס (מגיע)');
    expect(inn).not.toContain('צ׳ק אין היום');
    const notYet = card({ operational_status: 'READY' }, arriving);
    expect(notYet).toContain('סטטוס: מוכן לאורח 🟢');
    expect(notYet).toContain('🟢 צ׳ק אין היום (מגיע)');
  });
});
