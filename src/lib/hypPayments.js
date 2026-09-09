import { hypPaymentFromRow } from './clearingPayments';
import { isUnavailableHoldBooking } from './unavailableHold';

export const HYP_PAYMENTS_URL = '/hyp-payments.json';

export function formatHypRefreshedAt(payload) {
  const raw = String(payload?.importedAt || '').trim();
  if (!raw) {
    const header = payload?.lastModified || payload?.fileUpdatedAt;
    if (header) return formatHypRefreshedAt({ importedAt: header });
    if (payload?.source === 'hyp-august-2026-csv') return 'ייבוא CSV · לא רוענן חי';
    if (payload?.to) return `עד ${payload.to}`;
    return 'עדיין לא רוענן';
  }
  const isoDay = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00+03:00` : raw;
  const date = new Date(isoDay);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export async function loadHypPayments() {
  const response = await fetch(HYP_PAYMENTS_URL, { cache: 'no-store' });
  if (!response.ok) {
    const err = new Error('HYP_PAYMENTS_MISSING');
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  if (!data.importedAt) {
    const lastModified = response.headers.get('last-modified');
    if (lastModified) data.lastModified = new Date(lastModified).toISOString();
  }
  return data;
}

export function hypTxnSet(bookings) {
  const seen = new Set();
  for (const booking of bookings || []) {
    for (const payment of booking.clearing_payments || []) {
      const txn = String(payment.txn || '').trim();
      if (txn) seen.add(txn);
    }
  }
  return seen;
}

export function hypAssignedKeys(bookings) {
  const txn = hypTxnSet(bookings);
  const ref = new Set();
  const terminalTxn = new Set();
  const terminalRef = new Set();
  for (const booking of bookings || []) {
    for (const payment of booking.clearing_payments || []) {
      const value = String(payment.ref || '').trim();
      const terminal = String(payment.terminalId || '').trim();
      const id = String(payment.txn || '').trim();
      if (value && !/^0+$/.test(value)) {
        ref.add(value);
        if (terminal) terminalRef.add(`${terminal}|${value}`);
      }
      if (id && terminal) terminalTxn.add(`${terminal}|${id}`);
    }
  }
  return { txn, ref, terminalTxn, terminalRef };
}

export function unmatchedHypRows(payload, bookings) {
  const used = hypAssignedKeys(bookings);
  return (payload?.rows || []).filter((row) => {
    const terminal = String(row.terminalId || '').trim();
    const txn = String(row.txn || '').trim();
    const ref = String(row.ref || '').trim();
    if (txn && (used.terminalTxn.has(`${terminal}|${txn}`) || used.txn.has(txn))) return false;
    if (terminal && ref && used.terminalRef.has(`${terminal}|${ref}`)) return false;
    return Boolean(txn || ref);
  });
}

export function unassignedHypCharges(payload, bookings, { month = '' } = {}) {
  return unmatchedHypRows(payload, bookings).filter((row) => {
    if (Number(row.amount) <= 0) return false;
    if (month && String(row.date || '').slice(0, 7) !== month) return false;
    return true;
  });
}

function tokens(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length >= 2);
}

function overlap(a, b) {
  const left = new Set(tokens(a));
  return tokens(b).filter((part) => left.has(part)).length;
}

function dayDelta(a, b) {
  if (!a || !b) return 99;
  const left = new Date(`${a}T12:00:00`).getTime();
  const right = new Date(`${b}T12:00:00`).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return 99;
  return Math.round(Math.abs(left - right) / 86400000);
}

export function suggestBookingsForHyp(row, bookings, units, { limit = 8, query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const hypName = `${row.name || ''} ${row.desc || ''}`;
  const live = (bookings || []).filter((booking) => (
    !booking.deleted_at && booking.booking_status !== 'CANCELED' && !isUnavailableHoldBooking(booking)
  ));
  const unitName = (id) => units?.find((unit) => unit.id === id)?.name || id || '';

  const ranked = live.map((booking) => {
    const guest = booking.guest_name || '';
    const unit = unitName(booking.unit_id);
    const hay = `${guest} ${unit} ${booking.unit_id}`.toLowerCase();
    if (q && !hay.includes(q)) return null;
    const deltaIn = dayDelta(row.date, booking.check_in_date);
    const inStay = row.date && booking.check_in_date && booking.check_out_date
      && row.date >= booking.check_in_date
      && row.date <= booking.check_out_date;
    let score = overlap(guest, hypName) * 3;
    score += overlap(unit, row.desc) * 2;
    if (inStay) score += 4;
    else if (deltaIn <= 3) score += 3;
    else if (deltaIn <= 8) score += 1;
    if (q && hay.includes(q)) score += 5;
    return { booking, unit, score, deltaIn };
  }).filter(Boolean);

  ranked.sort((a, b) => b.score - a.score || a.deltaIn - b.deltaIn);
  const suggested = ranked.filter((row) => row.score >= 3).slice(0, limit);
  const searched = q ? ranked.slice(0, limit) : [];
  return (searched.length ? searched : suggested);
}

export function paymentFromHypRow(row) {
  return hypPaymentFromRow(row);
}
