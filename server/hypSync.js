import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listHypTransactions, mergeHypPaymentRows } from '../functions/lib/hypPay.js';
import { hasHypPortalCreds, hypMonthBounds, scrapeHypPortals } from './hypPortal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYMENTS_PATH = path.join(__dirname, '..', 'public', 'hyp-payments.json');

function loadPrevious() {
  try {
    return JSON.parse(fs.readFileSync(PAYMENTS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export async function syncHypPayments({ from, to, env = process.env } = {}) {
  const bounds = hypMonthBounds();
  const startIso = String(from || bounds.from).slice(0, 10);
  const endIso = String(to || bounds.to).slice(0, 10);
  const listed = ['A', 'B'].some((terminal) => hasHypPortalCreds(env, terminal))
    ? await scrapeHypPortals(env, { from: startIso, to: endIso })
    : await listHypTransactions(env, { from: startIso, to: endIso });
  const previous = loadPrevious();
  const kept = (previous?.rows || []).filter((row) => {
    const date = String(row.date || '').slice(0, 10);
    return date && (date < startIso || date > endIso);
  });
  const rows = mergeHypPaymentRows(kept, listed.rows);
  const sum = Math.round(rows.reduce((total, row) => total + (Number(row.amount) || 0), 0) * 100) / 100;
  const dates = rows.map((row) => row.date).filter(Boolean).sort();
  const payload = {
    source: listed.results?.[0]?.source || 'hyp-api',
    from: dates[0] || previous?.from || from || '',
    to: dates.at(-1) || previous?.to || to || '',
    importedAt: new Date().toISOString(),
    count: rows.length,
    sum,
    terminals: listed.results,
    rows
  };
  fs.mkdirSync(path.dirname(PAYMENTS_PATH), { recursive: true });
  fs.writeFileSync(PAYMENTS_PATH, JSON.stringify(payload));
  return {
    ok: true,
    count: payload.count,
    sum: payload.sum,
    from: payload.from,
    to: payload.to,
    terminals: listed.results,
    errors: listed.errors || [],
    importedAt: payload.importedAt
  };
}
