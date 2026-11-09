import { israelToday } from './cabinAccess';
import { getStoredToken } from './staffAuth';
import { isUnavailableHoldText } from './unavailableHold';

function ymd(value) {
  return String(value || '').slice(0, 10);
}

function normName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/** Check if stay includes the given Israel day: check_in <= day <= check_out */
export function isStayIncludingDay(checkIn, checkOut, day) {
  const d = ymd(day);
  const cin = ymd(checkIn);
  const cout = ymd(checkOut);
  if (!d || !cin || !cout) return false;
  return cin <= d && d <= cout;
}

/** Detect self-made staff operational hold/status names created in ResortOS (not genuine guests from Kinorot). */
export function isStaffHoldName(name) {
  const norm = normName(name);
  if (!norm) return false;
  return isUnavailableHoldText(norm)
    || /^(לא נקי|לא זמין|חסום|סגור|תקלה|מגורי צוות|צוות|אחזקה|לניקוי|שיפוץ|שיפוצים|טיפול)/i.test(norm);
}

/** Stay includes this day. */
export function kinorotStayOnDay(row, today) {
  if (!row) return false;
  return isStayIncludingDay(row.check_in_date, row.check_out_date, today);
}

function stayBeforeChange(row) {
  const prev = {
    check_in_date: row?.check_in_date,
    check_out_date: row?.check_out_date
  };
  for (const item of row?.fields || []) {
    if (item?.field === 'check_in') prev.check_in_date = item.from;
    if (item?.field === 'check_out') prev.check_out_date = item.from;
  }
  return prev;
}

/** Popup rows: a booking or cancellation whose stay includes today, including a date move onto or off today, excluding staff holds. */
export function kinorotChangeOnDay(kind, row, today) {
  const day = ymd(today);
  if (!day || !row) return false;
  if (isStaffHoldName(row.guest_name)) return false;
  if (kinorotStayOnDay(row, day)) return true;
  if (kind !== 'updated') return false;
  return kinorotStayOnDay(stayBeforeChange(row), day);
}

export function sameDayKinorotChanges(changes, today = israelToday()) {
  const created = (changes?.created || []).filter((row) => kinorotChangeOnDay('created', row, today));
  const updated = (changes?.updated || []).filter((row) => kinorotChangeOnDay('updated', row, today));
  const removed = (changes?.removed || []).filter((row) => kinorotChangeOnDay('removed', row, today));
  return {
    created,
    updated,
    removed,
    total: created.length + updated.length + removed.length
  };
}

async function kinorotFetch(method, body) {
  const headers = { Accept: 'application/json' };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = {
    method,
    headers,
    signal: AbortSignal.timeout(20000)
  };
  if (method !== 'GET' && body && typeof body === 'object') {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch('/api/kinorot/sync', init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || 'KINOROT_SYNC_FAILED');
    err.status = response.status;
    throw err;
  }
  return data;
}

export function fetchKinorotSyncStatus() {
  return kinorotFetch('GET');
}

/** @param {{ mode?: 'duty'|'full', days?: number, backDays?: number, boardDays?: number }} [options] */
export function startKinorotSync(options = {}) {
  return kinorotFetch('POST', options);
}

const SEEN_CHANGE_KEY = 'hotelos-kinorot-seen-change';
const SEEN_ITEMS_KEY = 'hotelos-kinorot-seen-items';
const SEEN_ITEMS_LIMIT = 500;
let ackedKeysMemory = null;

export function kinorotChangeCount(changes) {
  if (!changes) return 0;
  return (changes.created?.length || 0)
    + (changes.updated?.length || 0)
    + (changes.removed?.length || 0);
}

export function kinorotChangeKey(kind, row) {
  const stay = [
    kind,
    row?.id || '',
    row?.unit_id || '',
    String(row?.check_in_date || '').slice(0, 10),
    String(row?.check_out_date || '').slice(0, 10),
    String(row?.guest_name || '').replace(/\s+/g, ' ').trim()
  ].join('|');
  if (kind !== 'updated') return stay;
  const fields = (row?.fields || [])
    .map((item) => `${item.field}:${item.from}->${item.to}`)
    .sort()
    .join(';');
  return `${stay}|${fields}`;
}

export function keysForKinorotChanges(changes) {
  const keys = [];
  for (const row of changes?.created || []) keys.push(kinorotChangeKey('created', row));
  for (const row of changes?.updated || []) keys.push(kinorotChangeKey('updated', row));
  for (const row of changes?.removed || []) keys.push(kinorotChangeKey('removed', row));
  return keys;
}

export function readSeenKinorotChange() {
  try {
    return localStorage.getItem(SEEN_CHANGE_KEY) || '';
  } catch {
    return '';
  }
}

export function readAckedKinorotChangeKeys() {
  if (Array.isArray(ackedKeysMemory)) return ackedKeysMemory;
  try {
    const raw = localStorage.getItem(SEEN_ITEMS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    ackedKeysMemory = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    ackedKeysMemory = [];
  }
  return ackedKeysMemory;
}

export function rememberKinorotChange(changeId) {
  try {
    if (changeId) localStorage.setItem(SEEN_CHANGE_KEY, changeId);
  } catch {
    /* ignore */
  }
}

export function rememberKinorotChanges(changes, changeId) {
  rememberKinorotChange(changeId);
  const incoming = keysForKinorotChanges(changes);
  if (!incoming.length) return;
  const next = [...new Set([...readAckedKinorotChangeKeys(), ...incoming])].slice(-SEEN_ITEMS_LIMIT);
  ackedKeysMemory = next;
  try {
    localStorage.setItem(SEEN_ITEMS_KEY, JSON.stringify(next));
  } catch {
    /* memory is enough for this session */
  }
}

export function resetAckedKinorotChanges() {
  ackedKeysMemory = [];
  try {
    localStorage.removeItem(SEEN_ITEMS_KEY);
    localStorage.removeItem(SEEN_CHANGE_KEY);
  } catch {
    /* ignore */
  }
}

export function unseenKinorotChanges(changes, ackedKeys = readAckedKinorotChangeKeys(), today = israelToday()) {
  const scoped = sameDayKinorotChanges(changes, today);
  const acked = new Set(ackedKeys || readAckedKinorotChangeKeys());
  const keep = (kind) => (row) => !acked.has(kinorotChangeKey(kind, row));
  const created = scoped.created.filter(keep('created'));
  const updated = scoped.updated.filter(keep('updated'));
  const removed = scoped.removed.filter(keep('removed'));
  return {
    created,
    updated,
    removed,
    total: created.length + updated.length + removed.length
  };
}

export function hasUnseenKinorotChanges(status, today = israelToday()) {
  if (!status?.changes) return false;
  return unseenKinorotChanges(status.changes, undefined, today).total > 0;
}

/** Exact Israel clock time for ops / duty banner, e.g. 15:28:06 */
export function formatKinorotSyncClock(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export function formatKinorotSyncStamp(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export function formatKinorotSyncLabel(status) {
  if (!status) return 'אין רישום סנכרון';
  if (status.running) {
    return status.mode === 'duty' ? 'מסנכרן יום (כינורות)…' : 'מסנכרן עכשיו…';
  }
  const stamp = status.lastOkAt || status.journalUpdatedAt;
  if (!stamp) return 'עדיין לא סונכרן';
  const label = formatKinorotSyncStamp(stamp);
  const modeTag = status.mode === 'duty' ? 'יום · ' : '';
  if (status.lastError) return `נכשל · ${modeTag}${label}`;
  if (status.lastOkAt) return `סונכרן ${modeTag}${label}`;
  return `עדכון ביומן ${label}`;
}
