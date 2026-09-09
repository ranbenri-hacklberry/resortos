import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bookingsPath = process.argv[2];
const hypPath = process.argv[3] || path.join(ROOT, 'public', 'hyp-payments.json');
const outDir = process.argv[4] || path.join(process.env.HOME, 'Downloads');

const SKIP_NAMES = /^(תפוס|ביטול|סגור|שיפוץ|מוצאש|יציאה)/;
const PLACEHOLDER = /תפוס|ביטול|סגור|שיפוץ|מוצאש|יציאה במוצש|תפוס זמני|תפוס שיפוץ|ביטוללל/;

function normName(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/["'׳.]/g, '')
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

function last4Of(value) {
  return String(value || '').replace(/\D/g, '').slice(-4);
}

function ils(agorotOrAmount, isAgorot = false) {
  if (isAgorot) return Math.round(Number(agorotOrAmount || 0)) / 100;
  return Number(agorotOrAmount || 0);
}

function residOf(booking) {
  const raw = String(booking.special_requests || '');
  const m = raw.match(/kinorot:([^|]+)/);
  if (m) return m[1];
  const id = String(booking.id || '');
  const parts = id.split('_');
  return parts.length >= 3 ? parts.slice(2).join('_') : parts.at(-1) || id;
}

function kinorotKind(booking) {
  const req = String(booking.special_requests || '');
  if (/\|pay:voucher/.test(req) || booking.payment_mode === 'VOUCHER') return 'VOUCHER';
  if (/\|pay:comp/.test(req) || booking.payment_mode === 'COMP') return 'COMP';
  if (booking.payment_mode === 'CASH') return 'CASH';
  if (booking.payment_mode === 'BANK_TRANSFER') return 'BANK';
  if (booking.payment_mode === 'CARD' || (booking.clearing_payments || []).some((p) => !p.source || p.source === 'KINOROT' || p.source === 'HYP')) {
    if ((booking.clearing_payments || []).some((p) => String(p.txn || '').includes('_card') || p.last4 || p.source === 'HYP')) return 'CARD';
  }
  return booking.payment_mode || '';
}

function cardNotes(booking) {
  return (booking.clearing_payments || []).filter((p) => {
    const txn = String(p.txn || '');
    const methodCard = txn.includes('_card') || Boolean(p.last4) || p.source === 'HYP';
    const cash = txn.includes('_cash') || booking.payment_mode === 'CASH';
    const bank = txn.includes('_bank') || booking.payment_mode === 'BANK_TRANSFER';
    return methodCard && !cash && !bank;
  });
}

function daysBetween(a, b) {
  if (!a || !b) return 99;
  return Math.abs((Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 86400000);
}

function scoreHyp(note, booking, hyp) {
  const noteLast4 = last4Of(note.last4);
  const hypLast4 = last4Of(hyp.last4);
  const amount = Number(note.amount || ils(note.amount_agorot, true));
  const hypAmt = Number(hyp.amount || 0);
  const amountOk = Math.abs(amount - hypAmt) < 0.51;
  if (!amountOk) return 0;
  let score = 10;
  if (noteLast4 && hypLast4 && noteLast4 === hypLast4) score += 20;
  else if (noteLast4 && hypLast4 && noteLast4 !== hypLast4) score -= 8;
  const nameScore = overlap(booking.guest_name, `${hyp.name || ''} ${hyp.desc || ''}`);
  score += nameScore * 3;
  const noteDate = String(note.date || '');
  const hypDate = String(hyp.date || '');
  if (noteDate && hypDate && noteDate === hypDate) score += 6;
  else if (noteDate && hypDate && daysBetween(noteDate, hypDate) <= 2) score += 3;
  const cin = booking.check_in_date;
  if (hypDate && cin && daysBetween(hypDate, cin) <= 3) score += 2;
  if (noteLast4 && hypLast4 && noteLast4 !== hypLast4) return 0;
  if (noteLast4 && hypLast4 && noteLast4 === hypLast4 && amountOk) return score;
  if (!noteLast4 && nameScore >= 2 && amountOk) return score;
  if (!noteLast4 && nameScore >= 1 && amountOk && noteDate && hypDate && daysBetween(noteDate, hypDate) <= 2) return score;
  return 0;
}

const bookings = JSON.parse(fs.readFileSync(bookingsPath, 'utf8'));
const hypPayload = JSON.parse(fs.readFileSync(hypPath, 'utf8'));
const hypRows = (hypPayload.rows || []).filter((row) => Number(row.amount) > 0);
const usedTxn = new Set();

function takeBest(note, booking) {
  let best = null;
  for (const hyp of hypRows) {
    if (usedTxn.has(hyp.txn)) continue;
    const score = scoreHyp(note, booking, hyp);
    if (score > 0 && (!best || score > best.score)) best = { hyp, score };
  }
  if (best) usedTxn.add(best.hyp.txn);
  return best;
}

const byResid = new Map();
for (const booking of bookings) {
  const resid = residOf(booking);
  if (!byResid.has(resid)) byResid.set(resid, []);
  byResid.get(resid).push(booking);
}

const reports = [];
const updates = [];

for (const [resid, group] of byResid) {
  const primary = [...group].sort((a, b) => (b.clearing_payments?.length || 0) - (a.clearing_payments?.length || 0))[0];
  const skip = PLACEHOLDER.test(primary.guest_name) || SKIP_NAMES.test(primary.guest_name);
  const kind = kinorotKind(primary);
  const notes = cardNotes(primary);

  if (skip) {
    for (const booking of group) {
      reports.push({
        id: booking.id,
        resid,
        guest: booking.guest_name,
        unit: booking.unit_id,
        cin: booking.check_in_date,
        kind: 'SKIP',
        kinorot: 'לא רלוונטי',
        hyp: '',
        ref: '',
        last4: '',
        amount: 0,
        status: 'דילוג'
      });
    }
    continue;
  }

  if (kind === 'VOUCHER' || kind === 'COMP' || kind === 'CASH' || kind === 'BANK') {
    for (const booking of group) {
      reports.push({
        id: booking.id,
        resid,
        guest: booking.guest_name,
        unit: booking.unit_id,
        cin: booking.check_in_date,
        kind,
        kinorot: kind === 'VOUCHER' ? 'שובר' : kind === 'COMP' ? 'ללא תשלום' : kind === 'CASH' ? 'מזומן' : 'העברה',
        hyp: 'לא נדרש',
        ref: '',
        last4: '',
        amount: (booking.clearing_payments || []).reduce((s, p) => s + Number(p.amount || ils(p.amount_agorot, true)), 0),
        status: 'אין Hyp'
      });
    }
    continue;
  }

  if (!notes.length) {
    for (const booking of group) {
      reports.push({
        id: booking.id,
        resid,
        guest: booking.guest_name,
        unit: booking.unit_id,
        cin: booking.check_in_date,
        kind: kind || 'NONE',
        kinorot: 'אין אשראי בכינורות',
        hyp: 'לא נבדק',
        ref: '',
        last4: '',
        amount: 0,
        status: 'אין הערת אשראי'
      });
    }
    continue;
  }

  const matched = [];
  const missing = [];
  for (const note of notes) {
    const hit = takeBest(note, primary);
    if (hit) {
      matched.push({
        note,
        hyp: hit.hyp,
        score: hit.score
      });
    } else {
      missing.push(note);
    }
  }

  const hypPayments = matched.map(({ note, hyp }) => ({
    source: 'HYP',
    accountKey: 'HYP_4502210929',
    accountLabel: 'Hyp מסוף 4502210929',
    collector: 'Hyp',
    amount: hyp.amount,
    amount_agorot: Math.round(Number(hyp.amount) * 100),
    date: hyp.date,
    last4: hyp.last4 || note.last4 || '',
    brand: hyp.brand || '',
    ref: hyp.ref || '',
    txn: hyp.txn || '',
    invoice: hyp.invoice || '',
    depositApproval: hyp.depositApproval || '',
    terminalId: hyp.terminalId || '4502210929',
    hypMatch: 'MATCHED'
  }));
  const missingPayments = missing.map((note) => ({
    source: 'KINOROT',
    accountKey: 'MAX',
    collector: 'כינורות',
    amount: note.amount,
    amount_agorot: note.amount_agorot || Math.round(Number(note.amount) * 100),
    date: note.date || '',
    last4: note.last4 || '',
    txn: note.txn,
    hypMatch: 'NOT_FOUND'
  }));
  const clearing = [...hypPayments, ...missingPayments];
  const paidAgorot = clearing.reduce((s, p) => s + Number(p.amount_agorot || 0), 0);
  const total = Number(primary.total_price_agorot || 0);
  const status = total > 0 && paidAgorot + 50 >= total
    ? 'PAID'
    : paidAgorot > 50 ? 'DEPOSIT_PAID' : 'UNPAID';

  for (const booking of group) {
    const req = String(booking.special_requests || '');
    const refs = matched.map((m) => m.hyp.ref).filter(Boolean);
    const missingMark = missing.length ? '|hyp:missing' : '';
    const hypTok = refs.length ? `|hyp:${refs.join(',')}` : missingMark;
    const nextReq = /\|hyp:/.test(req)
      ? req.replace(/\|hyp:[^|]*/g, hypTok)
      : `${req}${hypTok}`;
    updates.push({
      id: booking.id,
      payment_status: status,
      payment_mode: 'CARD',
      clearing_payments: clearing,
      special_requests: nextReq,
      deposit_agorot: paidAgorot || booking.deposit_agorot
    });
    for (const row of matched) {
      reports.push({
        id: booking.id,
        resid,
        guest: booking.guest_name,
        unit: booking.unit_id,
        cin: booking.check_in_date,
        kind: 'CARD',
        kinorot: `שולם אשראי ₪${row.note.amount} ••••${row.note.last4 || ''}`,
        hyp: `${row.hyp.name} ₪${row.hyp.amount} ${row.hyp.date}`,
        ref: row.hyp.ref || '',
        txn: row.hyp.txn || '',
        last4: row.hyp.last4 || row.note.last4 || '',
        amount: row.hyp.amount,
        status: 'נמצא'
      });
    }
    for (const note of missing) {
      reports.push({
        id: booking.id,
        resid,
        guest: booking.guest_name,
        unit: booking.unit_id,
        cin: booking.check_in_date,
        kind: 'CARD',
        kinorot: `שולם אשראי ₪${note.amount} ••••${note.last4 || ''}`,
        hyp: 'לא נמצא',
        ref: '',
        txn: '',
        last4: note.last4 || '',
        amount: note.amount,
        status: 'לא נמצא'
      });
    }
  }
}

fs.writeFileSync(path.join(outDir, 'kinorot-hyp-match.json'), JSON.stringify({ updates, reports }, null, 2));

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const headers = ['כניסה', 'אורח', 'יחידה', 'הזמנה', 'כינורות', 'Hyp', 'אסמכתא', 'עסקה', '4 ספרות', 'סכום', 'סטטוס'];
const csv = [
  headers.join(','),
  ...reports.map((r) => [
    r.cin, r.guest, r.unit, r.resid, r.kinorot, r.hyp, r.ref, r.txn || '', r.last4, r.amount, r.status
  ].map(csvEscape).join(','))
].join('\n');
fs.writeFileSync(path.join(outDir, 'kinorot-hyp-match.csv'), `\uFEFF${csv}\n`);

const found = reports.filter((r) => r.status === 'נמצא');
const notFound = reports.filter((r) => r.status === 'לא נמצא');
console.log(JSON.stringify({
  bookings: bookings.length,
  updates: updates.length,
  found: found.length,
  notFound: notFound.length,
  uniqueFoundRefs: [...new Set(found.map((r) => r.ref))].length,
  uniqueMissing: [...new Set(notFound.map((r) => `${r.resid}|${r.amount}|${r.last4}`))].length
}, null, 2));
