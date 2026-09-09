import { israelToday } from './cabinAccess';
import { supabase } from './supabaseClient';
import { unitFullName } from './units';

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

export async function fetchStaffWorkLog({ tenantId, staffId, monthStart = israelMonthStart() }) {
  if (!tenantId || !staffId || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('resort_operations')
      .select('id, unit_id, domain, reason, status, completed_at, completed_by, completed_by_name, assigned_staff')
      .eq('tenant_id', tenantId)
      .eq('status', 'DONE')
      .not('completed_at', 'is', null)
      .gte('completed_at', `${monthStart}T00:00:00+03:00`)
      .eq('completed_by', String(staffId))
      .order('completed_at', { ascending: false })
      .limit(120);
    if (error || !Array.isArray(data)) {
      if (error) console.warn('[STAFF WORK LOG]', error.message);
      return [];
    }
    return data;
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
