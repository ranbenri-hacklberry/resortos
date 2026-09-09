import fs from 'fs';
import { parseDailyCollectionCsv, methodBucket, monthKey } from '../src/lib/dailyCollection.js';
import { collectionCreditAmount } from '../src/lib/maxCollectionMatch.js';

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseHyp(path) {
  const lines = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    if (!row.terminal_id) {
      const tail = [...cols].reverse().find((c) => /^\d{8,}$/.test(c));
      if (tail) row.terminal_id = tail;
    }
    return row;
  });
}

function amt(row) {
  return Number(String(row['סכום'] || '').replace(/[^\d.-]/g, '')) || 0;
}

function isApproved(row) {
  return String(row['תשובת חברת אשראי'] || '').trim() === 'אושרה';
}

function cents(n) {
  return Math.round(Number(n || 0) * 100);
}

function dayDelta(a, b) {
  if (!a || !b) return 999;
  const left = new Date(`${a}T12:00:00`).getTime();
  const right = new Date(`${b}T12:00:00`).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return 999;
  return Math.round(Math.abs(left - right) / 86400000);
}

function normName(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokens(value) {
  return normName(value).split(' ').filter((t) => t.length >= 2);
}

function overlap(a, b) {
  const left = new Set(tokens(a));
  return tokens(b).filter((t) => left.has(t)).length;
}

const collection = parseDailyCollectionCsv(
  fs.readFileSync('/Users/user/Documents/Max/hotelos/public/daily-collection.csv', 'utf8'),
  'daily-collection.csv'
).rows;

const hyp = parseHyp('/Users/user/Downloads/hyp_august_2026_all.csv');
const approved = hyp.filter(isApproved).filter((r) => {
  const ref = String(r['מספר אישור'] || '').trim();
  return ref && !/^0+$/.test(ref);
});

const studioTxns = new Set(JSON.parse(fs.readFileSync('/tmp/studio-hyp-txns.json', 'utf8') || '[]'));
const month = process.argv[2] || '2026-08';

const paid = collection.filter((r) => r.status === 'paid' && (!month || monthKey(r.stayDate) === month));
const unpaid = collection.filter((r) => r.status === 'unpaid' && (!month || monthKey(r.stayDate) === month));
const allMonth = collection.filter((r) => !month || monthKey(r.stayDate) === month);

const buckets = {
  credit: 0,
  cash: 0,
  transfer: 0,
  ota: 0,
  empty: 0,
  mixed: 0,
  other: 0
};
for (const row of paid) {
  const b = methodBucket(row.methods || []);
  const n = (row.methods || []).length;
  if (b.credit && (b.cash || b.transfer || b.airbnb || b.booking)) buckets.mixed += 1;
  else if (b.credit) buckets.credit += 1;
  else if (b.cash && !b.credit) buckets.cash += 1;
  else if (b.transfer && !b.credit) buckets.transfer += 1;
  else if (b.airbnb || b.booking) buckets.ota += 1;
  else if (!n) buckets.empty += 1;
  else buckets.other += 1;
}

const creditPaid = paid.filter((row) => {
  const b = methodBucket(row.methods || []);
  return b.credit || collectionCreditAmount(row) > 0;
});
const paidMustHaveCard = paid.filter((row) => {
  const b = methodBucket(row.methods || []);
  if (b.cash && !b.credit && !b.transfer) return false;
  if (b.airbnb || b.booking) return false;
  if (b.transfer && !b.credit) return false;
  if (b.offset) return false;
  return true;
});

const unusedHyp = approved.filter((r) => !studioTxns.has(String(r['מספר עסקה'] || '').trim()));

function bestHyp(row, pool) {
  const credit = collectionCreditAmount(row) || Number(row.amount) || 0;
  const name = `${row.guestName || ''} ${row.notes || ''}`;
  let best = null;
  for (const tx of pool) {
    const hypName = `${tx['שם פרטי'] || ''} ${tx['שם משפחה'] || ''} ${tx['תיאור עסקה'] || ''}`;
    const delta = dayDelta(row.stayDate, tx['תאריך']);
    const amountHit = cents(amt(tx)) === cents(credit) || cents(amt(tx)) === cents(row.amount);
    const nameHit = overlap(name, hypName);
    if (delta > 10) continue;
    if (!amountHit && nameHit < 1) continue;
    let score = 0;
    if (amountHit) score += 6;
    if (Math.abs(cents(amt(tx)) - cents(credit)) <= 100 && credit) score += 3;
    score += Math.max(0, 4 - delta);
    score += nameHit * 2;
    if (!best || score > best.score) best = { tx, score, delta, amountHit, nameHit };
  }
  return best && best.score >= 6 ? best : null;
}

const used = new Set();
const creditHits = [];
const creditMiss = [];
for (const row of creditPaid) {
  const pool = approved.filter((tx) => !used.has(tx['מספר עסקה']));
  const hit = bestHyp(row, pool);
  if (hit) {
    used.add(hit.tx['מספר עסקה']);
    creditHits.push({ row, hit });
  } else creditMiss.push(row);
}

const mustHits = [];
const mustMiss = [];
const used2 = new Set();
for (const row of paidMustHaveCard) {
  const pool = approved.filter((tx) => !used2.has(tx['מספר עסקה']));
  const hit = bestHyp(row, pool);
  if (hit) {
    used2.add(hit.tx['מספר עסקה']);
    mustHits.push({ row, hit });
  } else mustMiss.push(row);
}

const hypInMonth = approved.filter((r) => String(r['תאריך'] || '').startsWith(month));
const hypSum = hypInMonth.reduce((s, r) => s + amt(r), 0);
const creditSum = creditPaid.reduce((s, r) => s + (collectionCreditAmount(r) || r.amount || 0), 0);
const paidSum = paid.reduce((s, r) => s + (Number(r.amount) || 0), 0);

const out = {
  month,
  collection: {
    rows: allMonth.length,
    paid: paid.length,
    unpaid: unpaid.length,
    paidSum,
    buckets,
    creditPaid: creditPaid.length,
    creditSum,
    paidMustHaveCard: paidMustHaveCard.length
  },
  hyp: {
    approved: approved.length,
    inMonth: hypInMonth.length,
    sum: hypSum,
    alreadyOnBookings: approved.filter((r) => studioTxns.has(String(r['מספר עסקה'] || '').trim())).length,
    notOnBookings: unusedHyp.length,
    notOnBookingsSum: unusedHyp.reduce((s, r) => s + amt(r), 0)
  },
  matchCredit: { hits: creditHits.length, miss: creditMiss.length },
  matchPaidNonCash: { hits: mustHits.length, miss: mustMiss.length },
  creditMiss: creditMiss.slice(0, 80).map((r) => ({
    date: r.stayDate,
    guest: r.guestName,
    property: r.property,
    amount: r.amount,
    credit: collectionCreditAmount(r),
    methods: r.methods,
    notes: r.notes
  })),
  mustMiss: mustMiss.slice(0, 80).map((r) => ({
    date: r.stayDate,
    guest: r.guestName,
    property: r.property,
    amount: r.amount,
    methods: r.methods,
    notes: r.notes
  })),
  unusedHyp: unusedHyp.map((r) => ({
    date: r['תאריך'],
    amount: amt(r),
    terminal: r.terminal_id,
    ref: r['מספר אישור'],
    txn: r['מספר עסקה'],
    name: `${r['שם פרטי'] || ''} ${r['שם משפחה'] || ''}`.trim(),
    desc: r['תיאור עסקה']
  }))
};

fs.writeFileSync('/tmp/daily-hyp-reconcile.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  month,
  collectionRows: allMonth.length,
  paid: paid.length,
  unpaid: unpaid.length,
  buckets,
  creditPaid: creditPaid.length,
  creditSum,
  paidMustHaveCard: paidMustHaveCard.length,
  hypApproved: approved.length,
  hypOnBookings: out.hyp.alreadyOnBookings,
  hypNotOnBookings: unusedHyp.length,
  creditHits: creditHits.length,
  creditMiss: creditMiss.length,
  mustHits: mustHits.length,
  mustMiss: mustMiss.length
}, null, 2));
