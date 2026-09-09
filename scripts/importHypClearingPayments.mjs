import fs from 'fs';

const HYP_CSV = process.argv[2] || '/Users/user/Downloads/hyp_august_2026_all.csv';
const BOOKINGS_JSON = process.argv[3];
const UNITS_JSON = process.argv[4];
const APPLY = process.argv.includes('--apply');

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
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

function normName(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/["']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function nameTokens(value) {
  return normName(value).split(' ').filter((t) => t.length >= 2);
}

function overlap(a, b) {
  const left = new Set(nameTokens(a));
  const right = nameTokens(b);
  return right.filter((t) => left.has(t)).length;
}

function parseAmount(raw) {
  const n = Number(String(raw || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function isApproved(row) {
  const status = String(row['תשובת חברת אשראי'] || '').trim();
  return status === 'אושרה' || /^אושרה\b/.test(status);
}

function lastNameOf(value) {
  const tokens = nameTokens(value);
  return tokens[tokens.length - 1] || '';
}

function paymentFromHyp(row) {
  const amount = parseAmount(row['סכום']);
  return {
    source: 'HYP',
    accountKey: 'MAX_HYP',
    accountLabel: 'מקס 1086759',
    accountDetail: `Hyp מסוף ${row.terminal_id || '4502210929'}`,
    merchantId: '1086759',
    terminalId: row.terminal_id || row._terminal || '4502210929',
    acquirer: row['סולק'] || 'MAX',
    ref: String(row['מספר אישור'] || '').trim(),
    txn: String(row['מספר עסקה'] || '').trim(),
    invoice: String(row["מס' חשבונית"] || '').trim(),
    depositApproval: String(row['אישור הפקדה'] || '').trim(),
    amount_agorot: Math.round(amount * 100),
    date: String(row['תאריך'] || '').slice(0, 10),
    last4: String(row['4 ספרות אחרונות'] || '').trim(),
    brand: String(row['מותג'] || '').trim()
  };
}

function scoreMatch(tx, booking, unitName) {
  const hypName = `${tx['שם פרטי'] || ''} ${tx['שם משפחה'] || ''}`;
  const desc = tx['תיאור עסקה'] || '';
  const guest = booking.guest_name || '';
  const lastHyp = lastNameOf(hypName);
  const lastGuest = lastNameOf(guest);
  const firstHyp = nameTokens(hypName)[0] || '';
  const firstGuest = nameTokens(guest)[0] || '';
  const tokenHit = overlap(guest, hypName);
  let score = tokenHit * 2 + overlap(guest, desc);
  if (firstHyp && firstHyp === firstGuest) score += 4;
  if (lastHyp && lastHyp.length >= 3 && lastHyp === lastGuest) {
    score += firstHyp && firstHyp !== firstGuest ? 1 : 3;
  }
  const unitHit = unitMatches(desc, unitName);
  if (unitHit) score += 3;
  const cin = booking.check_in_date || '';
  const cout = booking.check_out_date || '';
  const day = tx['תאריך'] || '';
  const inStay = Boolean(day && cin && cout && day >= addDays(cin, -3) && day <= addDays(cout, 1));
  if (inStay) score += 2;
  else if (day && cin && Math.abs(Date.parse(`${day}T12:00:00`) - Date.parse(`${cin}T12:00:00`)) <= 8 * 86400000) score += 1;
  const lastOk = lastHyp && lastHyp.length >= 3 && lastHyp === lastGuest;
  const firstOk = Boolean(firstHyp && firstHyp === firstGuest);
  if (firstHyp && firstGuest && firstHyp !== firstGuest && !unitHit) return 0;
  if (!lastOk && !firstOk && !(unitHit && tokenHit && inStay) && tokenHit < 2) return 0;
  return score;
}

function unitMatches(desc, unitName) {
  if (!desc || !unitName) return false;
  const d = String(desc).replace(/['׳"]/g, '');
  const n = String(unitName).replace(/['׳"]/g, '');
  if (d.includes(n) || n.includes(d.trim())) return true;
  const skip = new Set(['בקתה', 'צימר', 'סוויטה']);
  const words = n.split(/[\s·]+/).filter((w) => w.length >= 2 && !skip.has(w));
  const hits = words.filter((w) => d.includes(w));
  const num = n.match(/\d+/)?.[0];
  return hits.length >= 2 || (hits.length >= 1 && num && d.includes(num));
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function sqlLiteral(value) {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

const hypRows = parseCsv(fs.readFileSync(HYP_CSV, 'utf8')).filter(isApproved);
const bookings = BOOKINGS_JSON ? JSON.parse(fs.readFileSync(BOOKINGS_JSON, 'utf8')) : [];
const units = UNITS_JSON ? JSON.parse(fs.readFileSync(UNITS_JSON, 'utf8')) : [];
const unitNameById = Object.fromEntries(units.map((u) => [u.id, u.name || u.unit_code || '']));

const live = bookings.filter((b) => !b.deleted_at && b.booking_status !== 'CANCELED');
const usedTxn = new Set();
const byBooking = new Map();

for (const tx of hypRows) {
  let best = null;
  for (const booking of live) {
    const score = scoreMatch(tx, booking, unitNameById[booking.unit_id] || '');
    if (score < 5) continue;
    if (!best || score > best.score) best = { booking, score };
  }
  if (!best) continue;
  const payment = paymentFromHyp(tx);
  if (!payment.txn || usedTxn.has(payment.txn)) continue;
  if (!payment.ref || /^0+$/.test(payment.ref)) continue;
  usedTxn.add(payment.txn);
  if (!byBooking.has(best.booking.id)) {
    byBooking.set(best.booking.id, { booking: best.booking, payments: [], score: best.score });
  }
  byBooking.get(best.booking.id).payments.push(payment);
}

const updates = [...byBooking.values()];
console.error(JSON.stringify({
  hypApproved: hypRows.length,
  bookings: live.length,
  matchedBookings: updates.length,
  matchedTxns: usedTxn.size
}, null, 2));

if (!APPLY) {
  for (const row of updates.slice(0, 8)) {
    console.error(`${row.booking.guest_name} ${row.booking.id} ← ${row.payments.length} תשלומים`, row.payments.map((p) => `${p.ref}/${p.amount_agorot / 100}`).join(', '));
  }
  process.exit(0);
}

for (const row of updates) {
  const existing = Array.isArray(row.booking.clearing_payments) ? row.booking.clearing_payments : [];
  const seen = new Set(existing.map((p) => p.txn || p.ref));
  const merged = existing.concat(row.payments.filter((p) => !seen.has(p.txn || p.ref)));
  console.log(`UPDATE public.hotelos_bookings SET clearing_payments = ${sqlLiteral(merged)}::jsonb, updated_at = now() WHERE id = '${row.booking.id.replace(/'/g, "''")}';`);
}
