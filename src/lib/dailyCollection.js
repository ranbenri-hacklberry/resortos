import { israelToday } from './cabinAccess';
import { unitAccessGroup } from './units';
import { isUnavailableHoldBooking, isUnavailableHoldCollectionRow } from './unavailableHold';

export const DAILY_COLLECTION_STORAGE_KEY = 'hotelos-daily-collection-v2';
export const DAILY_COLLECTION_SEED_URL = '/daily-collection.csv';

export const COLLECTION_STATUSES = {
  paid: 'שולם',
  unpaid: 'לא שולם',
  voucher_hold: 'קיזוז נופש ברמה',
  kinorot: 'קיזוז כינורות',
  unknown: ''
};

const PROPERTY_ALIASES = [
  ['בתי נורית', 'בתי נורית'],
  ['מול הנוף', 'מול הנוף'],
  ['נופים בלבן', 'נופים בלבן'],
  ['החצר המוסיקלית', 'החצר המוסיקלית'],
  ['חצר מוסיקלית', 'החצר המוסיקלית'],
  ['בקתות מאיה', 'בקתות מאיה'],
  ['כיפת השמיים', 'כיפת השמיים'],
  ['כיפת שמיים', 'כיפת השמיים'],
  ['בקתות טוסקנה', 'בקתות טוסקנה'],
  ['טוסקנה', 'בקתות טוסקנה'],
  ['סייסטה', 'סייסטה'],
  ['מיאליס ריזורט', 'מיאליס ריזורט'],
  ['מיאליס', 'מיאליס ריזורט'],
  ['קאסה נובה', 'קאסה נובה'],
  ['טאג מאהל', 'טאג מאהל'],
  ["טאג' מאהל", 'טאג מאהל'],
  ['צימר בגבעה', 'צימר בגבעה']
];

export const PROPERTY_ORDER = [
  'בתי נורית',
  'טאג מאהל',
  'מול הנוף',
  'נופים בלבן',
  'בקתות טוסקנה',
  'החצר המוסיקלית',
  'בקתות מאיה',
  'כיפת השמיים',
  'צימר בגבעה',
  'מיאליס ריזורט',
  'קאסה נובה',
  'סייסטה'
];

export function parseMoney(value) {
  const raw = String(value || '')
    .replace(/[₪\s,]/g, '')
    .replace(/\u00a0/g, '')
    .trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function formatIls(amount) {
  const n = Math.round(Number(amount) || 0);
  return `₪${n.toLocaleString('he-IL')}`;
}

function repairDateToken(value) {
  let text = String(value || '').replace(/\r/g, '').trim();
  if (!text) return '';
  text = text.replace(/^(\d{1,2})\/(\d{1,2})(\d{4})$/, '$1/$2/$3');
  return text;
}

export function parseCollectionDate(value) {
  const text = repairDateToken(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  let year = Number(match[3]);
  const month = Number(match[2]);
  const day = Number(match[1]);
  if (year < 100) year += 2000;
  if (year < 2024) year = 2026;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(check.getTime())) return null;
  return iso;
}

export function formatHeDate(iso) {
  if (!iso) return '';
  const [year, month, day] = String(iso).split('-');
  if (!day) return iso;
  return `${Number(day)}/${Number(month)}/${year}`;
}

export function normalizePropertyName(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const hit = PROPERTY_ALIASES.find(([alias]) => raw.includes(alias) || alias.includes(raw));
  return hit ? hit[1] : raw;
}

export function normalizeStatus(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'unknown';
  if (raw.includes('קיזוז כינורות')) return 'kinorot';
  if (raw.includes('קיזוז נופש')) return 'voucher_hold';
  if (raw === 'שולם' || raw.startsWith('שולם')) return 'paid';
  if (raw.includes('לא שולם')) return 'unpaid';
  return 'unknown';
}

export function statusLabel(status) {
  if (status === 'paid') return 'שולם';
  if (status === 'unpaid') return 'לא שולם';
  if (status === 'voucher_hold') return 'קיזוז נופש ברמה';
  if (status === 'kinorot') return 'קיזוז כינורות';
  return 'לא עודכן';
}

export function splitMethods(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function parseCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n+/g, '\n')
    .trim();
}

function rowKey(parts) {
  return parts.map((part) => String(part || '').trim().toLowerCase()).join('|');
}

export function parseDailyCollectionCsv(text, sourceName = '') {
  const table = parseCsv(text);
  const importedAt = new Date().toISOString();
  const seen = new Map();
  const rows = [];

  table.forEach((cols, index) => {
    if (index === 0) return;
    const dateRaw = cleanText(cols[0]);
    const propertyRaw = cleanText(cols[1]);
    const guestName = cleanText(cols[2]);
    const notes = cleanText(cols[10]);
    const stayDate = parseCollectionDate(dateRaw);
    if (!stayDate && !guestName && !propertyRaw) return;
    if (!stayDate && !guestName) return;

    const deposit = parseMoney(cols[3]);
    const balance = parseMoney(cols[4]);
    const cash = parseMoney(cols[5]);
    const amount = parseMoney(cols[6]);
    const methods = splitMethods(cols[7]);
    const voucher = parseMoney(cols[8]);
    const status = normalizeStatus(cols[9]);
    const property = normalizePropertyName(propertyRaw);
    const fingerprint = rowKey([stayDate, property, guestName, amount, cash, status, notes]);
    const dup = seen.get(fingerprint) || 0;
    seen.set(fingerprint, dup + 1);

    rows.push({
      id: `${stayDate || 'na'}-${index}-${dup}`,
      stayDate: stayDate || '',
      property,
      guestName,
      deposit,
      balance,
      cash,
      amount,
      methods,
      voucher,
      status,
      notes,
      sourceLine: index + 1
    });
  });

  return {
    importedAt,
    sourceName: sourceName || 'daily-collection.csv',
    rows
  };
}

export function loadDailyCollection() {
  try {
    const raw = localStorage.getItem(DAILY_COLLECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDailyCollection(payload) {
  localStorage.setItem(DAILY_COLLECTION_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}

export async function seedDailyCollectionIfEmpty() {
  const existing = loadDailyCollection();
  if (existing?.sourceName && existing.sourceName !== 'daily-collection.csv') {
    return existing;
  }
  try {
    const response = await fetch(DAILY_COLLECTION_SEED_URL, { cache: 'no-store' });
    if (!response.ok) return existing;
    const text = await response.text();
    if (!text || !text.includes('שם הלקוח')) return existing;
    const fingerprint = `${text.length}:${text.split('\n').length}`;
    if (existing?.rows?.length && existing.seedFingerprint === fingerprint) return existing;
    const parsed = parseDailyCollectionCsv(text, 'daily-collection.csv');
    parsed.seedFingerprint = fingerprint;
    return saveDailyCollection(parsed);
  } catch {
    return existing;
  }
}

export function monthKey(iso) {
  return String(iso || '').slice(0, 7);
}

export function monthLabel(key) {
  if (!key) return 'כל התאריכים';
  const [year, month] = key.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}

export function defaultMonthKey() {
  return israelToday().slice(0, 7);
}

export function availableMonths(rows) {
  const keys = [...new Set((rows || []).map((row) => monthKey(row.stayDate)).filter(Boolean))];
  keys.sort((a, b) => b.localeCompare(a));
  return keys;
}

/** Open the current month only if it has rows; otherwise the latest month that does. */
export function resolveFinanceMonth(rows, { todayKey = defaultMonthKey() } = {}) {
  const keys = availableMonths(rows);
  const currentHasRows = (rows || []).some((row) => monthKey(row.stayDate) === todayKey);
  if (currentHasRows) return todayKey;
  if (keys[0]) return keys[0];
  return todayKey;
}

export function methodBucket(methods) {
  const joined = methods.join(' ');
  return {
    cash: joined.includes('מזומן'),
    credit: joined.includes('אשראי'),
    transfer: joined.includes('העברה') || joined.includes('ביט'),
    voucher: joined.includes('שובר'),
    booking: /booking/i.test(joined),
    airbnb: /airbnb/i.test(joined),
    offset: joined.includes('קיזוז'),
    check: /צ['׳]?ק|שיק/.test(joined)
  };
}

export function isOpenRow(row) {
  return row.status === 'unpaid' || row.status === 'voucher_hold' || row.status === 'unknown';
}

export function summarizeCollection(rows) {
  const summary = {
    count: rows.length,
    paidCount: 0,
    openCount: 0,
    collected: 0,
    cash: 0,
    credit: 0,
    transfer: 0,
    voucher: 0,
    ota: 0,
    openAmount: 0
  };

  for (const row of rows) {
    const buckets = methodBucket(row.methods || []);
    if (row.status === 'paid' || row.status === 'kinorot') {
      summary.paidCount += 1;
      summary.collected += row.amount || 0;
      summary.cash += row.cash || 0;
      summary.voucher += row.voucher || 0;
      if (buckets.credit) summary.credit += Math.max(0, (row.amount || 0) - (row.cash || 0) - (row.voucher || 0));
      if (buckets.transfer && !buckets.credit) summary.transfer += Math.max(0, (row.amount || 0) - (row.cash || 0));
      if (buckets.booking || buckets.airbnb) summary.ota += row.amount || 0;
    } else if (isOpenRow(row)) {
      summary.openCount += 1;
      summary.openAmount += row.amount || 0;
    }
  }

  return summary;
}

export function sortCollectionRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    if (a.stayDate !== b.stayDate) return String(b.stayDate || '').localeCompare(String(a.stayDate || ''));
    const ai = PROPERTY_ORDER.indexOf(a.property);
    const bi = PROPERTY_ORDER.indexOf(b.property);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

export function filterCollectionRows(rows, { month = '', property = '', status = '', query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return (rows || []).filter((row) => {
    if (isUnavailableHoldCollectionRow(row)) return false;
    if (month && monthKey(row.stayDate) !== month) return false;
    if (property && row.property !== property) return false;
    if (status === 'open' && !isOpenRow(row)) return false;
    if (status && status !== 'open' && row.status !== status) return false;
    if (!q) return true;
    const hay = `${row.guestName} ${row.property} ${row.notes} ${(row.methods || []).join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}

function stripGuestName(name) {
  return String(name || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/יציאה ב\s*\d+/g, ' ')
    .replace(/["'׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function guestTokens(name) {
  return stripGuestName(name)
    .split(' ')
    .map((part) => part.replace(/^ו/, ''))
    .filter((part) => part.length >= 2 && !['בן', 'בת', 'משפחת', 'משפחה'].includes(part));
}

function guestNameScore(collectionName, bookingName) {
  const a = stripGuestName(collectionName);
  const b = stripGuestName(bookingName);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 90;
  const ta = guestTokens(a);
  const tb = guestTokens(b);
  if (!ta.length || !tb.length) return 0;
  const shared = ta.filter((token) => tb.includes(token) && token.length >= 3);
  if (shared.length >= 2) return 80;
  const lastA = ta[ta.length - 1];
  const lastB = tb[tb.length - 1];
  if (ta.length >= 2 && tb.length >= 2 && lastA && lastA === lastB && lastA.length >= 4) return 70;
  return 0;
}

export function propertyFromUnit(unitId, unitName) {
  const id = String(unitId || '');
  if (id.startsWith('hill-')) return 'צימר בגבעה';
  if (id.startsWith('dome-')) return 'כיפת השמיים';
  if (id === 'mialis-villa' || id.startsWith('suite-')) return 'מיאליס ריזורט';
  const group = unitAccessGroup(unitId);
  return normalizePropertyName((group.split('·')[0] || unitName || '').trim());
}

function bookingOverlapsStay(booking, stayDate) {
  if (!stayDate || booking.deleted_at || booking.booking_status === 'CANCELED') return false;
  if (booking.check_in_date === stayDate) return true;
  return Boolean(
    booking.check_in_date
    && booking.check_out_date
    && booking.check_in_date <= stayDate
    && stayDate < booking.check_out_date
  );
}

function daysBetween(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(Date.parse(`${a}T00:00:00`) - Date.parse(`${b}T00:00:00`)) / 86400000;
}

function stayDateScore(stayDate, booking) {
  if (!stayDate || !booking?.check_in_date) return 0;
  if (booking.check_in_date === stayDate) return 40;
  if (bookingOverlapsStay(booking, stayDate)) return 30;
  if (daysBetween(stayDate, booking.check_in_date) <= 2) return 15;
  return 0;
}

function isLiveBooking(booking) {
  return Boolean(booking)
    && !booking.deleted_at
    && booking.booking_status !== 'CANCELED'
    && !isUnavailableHoldBooking(booking);
}

export function bookingStayKey(booking, units) {
  const unitById = units instanceof Map ? units : new Map((units || []).map((unit) => [unit.id, unit]));
  const unit = unitById.get(booking.unit_id);
  return [
    stripGuestName(booking.guest_name),
    booking.check_in_date || '',
    booking.check_out_date || '',
    propertyFromUnit(booking.unit_id, unit?.name)
  ].join('|');
}

export function linkCollectionToBookings(rows, bookings, units) {
  const unitById = new Map((units || []).map((unit) => [unit.id, unit]));
  const live = (bookings || []).filter(isLiveBooking);
  const groups = new Map();
  for (const booking of live) {
    const key = bookingStayKey(booking, unitById);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(booking);
  }

  const candidates = [];
  for (const row of rows || []) {
    if (!row?.stayDate || !row.guestName) continue;
    for (const [key, group] of groups) {
      const booking = group[0];
      const property = propertyFromUnit(booking.unit_id, unitById.get(booking.unit_id)?.name);
      if (row.property && property && property !== 'יחידות נוספות' && row.property !== property) continue;
      const nameScore = guestNameScore(row.guestName, booking.guest_name);
      const dateScore = stayDateScore(row.stayDate, booking);
      if (nameScore < 70 || dateScore < 15) continue;
      candidates.push({
        rowId: row.id,
        row,
        key,
        booking,
        score: nameScore + dateScore
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score || String(a.rowId).localeCompare(String(b.rowId)));

  const byCollection = {};
  const usedBookingIds = new Set();
  const usedGroups = new Set();
  const usedRows = new Set();
  for (const candidate of candidates) {
    if (usedRows.has(candidate.rowId)) continue;
    if (usedGroups.has(candidate.key)) {
      const taken = groups.get(candidate.key)?.[0];
      if (guestNameScore(candidate.row?.guestName, taken?.guest_name) < 70) continue;
    }
    usedRows.add(candidate.rowId);
    usedGroups.add(candidate.key);
    byCollection[candidate.rowId] = candidate.booking;
    for (const booking of groups.get(candidate.key) || []) usedBookingIds.add(booking.id);
  }

  for (const row of rows || []) {
    if (!row?.stayDate || byCollection[row.id]) continue;
    const night = live.filter((booking) => {
      if (usedBookingIds.has(booking.id)) return false;
      if (!bookingOverlapsStay(booking, row.stayDate)) return false;
      const property = propertyFromUnit(booking.unit_id, unitById.get(booking.unit_id)?.name);
      if (row.property && property && property !== 'יחידות נוספות' && row.property !== property) return false;
      return true;
    });
    if (night.length !== 1 || !row.property) continue;
    const booking = night[0];
    const key = bookingStayKey(booking, unitById);
    if (usedGroups.has(key)) continue;
    usedRows.add(row.id);
    usedGroups.add(key);
    byCollection[row.id] = booking;
    for (const sibling of groups.get(key) || [booking]) usedBookingIds.add(sibling.id);
  }

  return { byCollection, usedBookingIds, usedGroups };
}

export function matchCollectionToBooking(row, bookings, units) {
  if (!row) return null;
  return linkCollectionToBookings([row], bookings, units).byCollection[row.id] || null;
}

export function exportDailyCollectionCsv(rows) {
  const header = [
    'תאריך',
    'מתחם',
    'שם הלקוח',
    'מקדמה',
    'יתרה',
    'מזומן',
    'סכום תשלום',
    'אמצעי תשלום',
    'סכום שובר שנפדה',
    'שולם/לא שולם',
    'הערות'
  ];
  const lines = [header.join(',')];
  for (const row of rows || []) {
    const cells = [
      formatHeDate(row.stayDate),
      row.property,
      row.guestName,
      row.deposit,
      row.balance,
      row.cash,
      row.amount,
      (row.methods || []).join(', '),
      row.voucher,
      statusLabel(row.status),
      row.notes
    ].map((value) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    });
    lines.push(cells.join(','));
  }
  return `\uFEFF${lines.join('\n')}`;
}
