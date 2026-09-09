import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeHypPortalTerminal } from '../server/hypPortal.js';
import { mergeHypPaymentRows } from '../functions/lib/hypPay.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const from = process.argv[2] || '2026-08-01';
const to = process.argv[3] || '2026-09-07';
const outDir = process.argv[4] || path.join(root, 'public');

const terminals = [];
const approved = [];
const errors = [];

for (const terminal of ['A', 'B']) {
  try {
    const listed = scrapeHypPortalTerminal(process.env, terminal, { from, to });
    terminals.push({ terminal: listed.terminal, masof: listed.masof, count: listed.count });
    approved.push(...listed.rows);
    const rawPath = path.join(outDir, `hyp-portal-raw-${listed.terminal}-${from}_to_${to}.csv`);
    fs.writeFileSync(rawPath, listed.rawCsv || '');
    console.log(JSON.stringify({ terminal: listed.terminal, count: listed.count, raw: rawPath }));
  } catch (err) {
    errors.push({ terminal, error: err.message || String(err) });
    console.error(JSON.stringify({ terminal, error: err.message || String(err) }));
  }
}

const previous = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(outDir, 'hyp-payments.json'), 'utf8'));
  } catch {
    return { rows: [] };
  }
})();

const kept = (previous.rows || []).filter((row) => {
  const date = String(row.date || '').slice(0, 10);
  return date && (date < from || date > to);
});
const rows = mergeHypPaymentRows(kept, approved);
const sum = Math.round(rows.reduce((total, row) => total + (Number(row.amount) || 0), 0) * 100) / 100;
const dates = rows.map((row) => row.date).filter(Boolean).sort();
const payload = {
  source: 'hyp-portal',
  from: dates[0] || from,
  to: dates.at(-1) || to,
  importedAt: new Date().toISOString(),
  count: rows.length,
  sum,
  terminals,
  errors,
  rows
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'hyp-payments.json'), JSON.stringify(payload));

const csvPath = path.join(outDir, `hyp-transactions-${from}_to_${to}.csv`);
const headers = [
  'date', 'time', 'name', 'desc', 'amount', 'last4', 'brand', 'txn', 'ref',
  'invoice', 'depositApproval', 'terminalId', 'acquirer'
];
const csvEscape = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = [
  headers.join(','),
  ...rows.map((row) => headers.map((key) => csvEscape(row[key] ?? '')).join(','))
].join('\n');
fs.writeFileSync(csvPath, `\uFEFF${csv}\n`);

const tidyPath = path.join(outDir, `hyp-transactions-${from}_to_${to}-he.csv`);
const heHeaders = ['תאריך', 'שם', 'תיאור', 'סכום', '4 ספרות', 'מותג', 'מספר עסקה', 'אישור', 'חשבונית', 'אישור הפקדה', 'מסוף'];
const heCsv = [
  heHeaders.join(','),
  ...rows.map((row) => [
    row.date || '',
    row.name || '',
    row.desc || '',
    row.amount ?? '',
    row.last4 || '',
    row.brand || '',
    row.txn || '',
    row.ref || '',
    row.invoice || '',
    row.depositApproval || '',
    row.terminalId || ''
  ].map(csvEscape).join(','))
].join('\n');
fs.writeFileSync(tidyPath, `\uFEFF${heCsv}\n`);

console.log(JSON.stringify({
  ok: true,
  from: payload.from,
  to: payload.to,
  count: payload.count,
  sum: payload.sum,
  terminals,
  errors,
  json: path.join(outDir, 'hyp-payments.json'),
  csv: csvPath,
  heCsv: tidyPath
}, null, 2));
