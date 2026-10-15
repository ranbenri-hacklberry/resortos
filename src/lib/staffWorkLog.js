import { israelToday } from './cabinAccess';
import { unitFullName } from './units';
import { listWorkLog } from './opsApi';

export function israelMonthStart(today = israelToday()) {
  return `${String(today || '').slice(0, 7)}-01`;
}

export function israelMonthKey(today = israelToday()) {
  return String(today || '').slice(0, 7);
}

export function isHousekeepingCompletion(row) {
  const domain = String(row?.domain || 'HOUSEKEEPING').toUpperCase();
  if (domain === 'HOUSEKEEPING') return true;
  const reason = String(row?.reason || '');
  return reason.includes('ניקוי') || reason.includes('ביקורת') || reason.includes('חוסר');
}

export function countMonthlyCleans(rows, monthKey = israelMonthKey()) {
  return (rows || []).filter((row) => {
    if (!row?.completed_at || !isHousekeepingCompletion(row)) return false;
    return israelMonthKey(israelToday(new Date(row.completed_at))) === monthKey;
  }).length;
}

export function formatWorkLogTime(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

export function decorateWorkLog(rows, units = []) {
  return (rows || []).map((row) => ({
    ...row,
    unitName: unitFullName(units.find((unit) => unit.id === row.unit_id) || row.unit_id, row.unit_id),
    whenLabel: formatWorkLogTime(row.completed_at)
  }));
}

export async function fetchStaffWorkLog({ monthStart = israelMonthStart() } = {}) {
  try {
    const rows = await listWorkLog();
    const start = Date.parse(`${monthStart}T00:00:00+03:00`);
    return (rows || []).filter((row) => {
      const at = Date.parse(row?.completed_at || '');
      return !start || !at || at >= start;
    });
  } catch (_) {
    return [];
  }
}

export function staffActor(sessionUser) {
  if (!sessionUser?.id) return null;
  return {
    id: String(sessionUser.id),
    name: String(sessionUser.display_name || sessionUser.username || '').trim() || 'צוות שטח'
  };
}
