import { getStoredToken } from './staffAuth';

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

export function unseenKinorotChanges(changes, ackedKeys = readAckedKinorotChangeKeys()) {
  const acked = new Set(ackedKeys);
  const keep = (kind) => (row) => !acked.has(kinorotChangeKey(kind, row));
  const created = (changes?.created || []).filter(keep('created'));
  const updated = (changes?.updated || []).filter(keep('updated'));
  const removed = (changes?.removed || []).filter(keep('removed'));
  return {
    created,
    updated,
    removed,
    total: created.length + updated.length + removed.length
  };
}

export function hasUnseenKinorotChanges(status) {
  if (!status?.changes) return false;
  return unseenKinorotChanges(status.changes).total > 0;
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
