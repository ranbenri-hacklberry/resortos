export const MAX_CREDITS_URL = '/max-credits.json';

export function monthKey(date) {
  return String(date || '').slice(0, 7);
}

export function monthLabel(key) {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return key || '';
  const [year, month] = key.split('-');
  return new Date(`${year}-${month}-01T12:00:00`).toLocaleDateString('he-IL', {
    month: 'long',
    year: 'numeric'
  });
}

export function formatIlsMoney(amount) {
  const n = Number(amount) || 0;
  return `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatHeDay(date) {
  if (!date) return '—';
  return new Date(`${date}T12:00:00`).toLocaleDateString('he-IL');
}

export function availableMonths(rows) {
  return [...new Set((rows || []).map((row) => monthKey(row.creditDate)).filter(Boolean))]
    .sort()
    .reverse();
}

export function filterMaxCredits(rows, { month = '', brand = '', query = '' } = {}) {
  const q = String(query || '').trim();
  return (rows || []).filter((row) => {
    if (month && monthKey(row.creditDate) !== month) return false;
    if (brand && row.brand !== brand) return false;
    if (q && !(
      String(row.cardLast4 || '').includes(q)
      || String(row.batchId || '').includes(q)
      || String(row.installment || '').includes(q)
    )) return false;
    return true;
  });
}

export function summarizeMaxCredits(rows) {
  return (rows || []).reduce((acc, row) => {
    acc.count += 1;
    acc.gross += Number(row.gross) || 0;
    acc.net += Number(row.net) || 0;
    acc.fee += Number(row.fee) || 0;
    return acc;
  }, { count: 0, gross: 0, net: 0, fee: 0 });
}

export async function loadMaxCredits() {
  const response = await fetch(MAX_CREDITS_URL, { cache: 'no-store' });
  if (!response.ok) {
    const err = new Error('MAX_CREDITS_MISSING');
    err.status = response.status;
    throw err;
  }
  return response.json();
}
