import { depositAgorotFromTotal } from './deposit.js';

function ilsFromRaw(raw) {
  const cleaned = String(raw || '').replace(/,/g, '');
  const amount = Number(cleaned.replace(/[^\d.]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function addDaysIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeKinorotPayMethod(raw) {
  const text = String(raw || '');
  if (/מזומן/.test(text)) return 'cash';
  if (/העברה/.test(text)) return 'bank';
  if (/אשראי/.test(text)) return 'card';
  return 'card';
}

export function kinorotNotePaymentDate(day, month, yearHint, todayIso) {
  const today = String(todayIso || new Date().toISOString()).slice(0, 10);
  const thisYear = Number(today.slice(0, 4));
  let year = Number(yearHint);
  if (!Number.isFinite(year) || year <= 0) year = thisYear;
  else if (year < 100) year += 2000;
  const iso = `${year}-${pad2(month)}-${pad2(day)}`;
  if (!yearHint && iso > addDaysIso(today, 14)) {
    return `${year - 1}-${pad2(month)}-${pad2(day)}`;
  }
  return iso;
}

export function isCollectedKinorotMethod(method) {
  return method === 'card' || method === 'bank' || method === 'cash';
}

export function receivedKinorotNotePayments(events) {
  return (events || []).filter((row) => isCollectedKinorotMethod(row.method));
}

export function parseKinorotNotePayments(text, { todayIso } = {}) {
  const src = String(text || '').replace(/\s+/g, ' ');
  const events = [];
  const seen = new Set();
  const re = /(?:(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s+)?(?:שולם|שולמה|שילמה|שילם|חויב|חויבה|גבה|נגבה)(?:\s+מקדמה)?(?:\s+ב?(אשראי|מזומן|העברה(?:\s+בנקאית)?))?\s+([\d,]{2,6})/g;
  let match;
  while ((match = re.exec(src))) {
    const amount = ilsFromRaw(match[5]);
    if (amount < 50 || amount > 80000) continue;
    const method = normalizeKinorotPayMethod(match[4] || 'אשראי');
    const date = match[1]
      ? kinorotNotePaymentDate(Number(match[1]), Number(match[2]), match[3], todayIso)
      : '';
    const key = `${date}|${method}|${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ date, method, amount });
  }
  return events;
}

export function paymentModeFromKinorotMethod(method) {
  if (method === 'card') return 'CARD';
  if (method === 'bank') return 'BANK_TRANSFER';
  if (method === 'cash') return 'CASH';
  return null;
}

export function moneyFromKinorotPayment(payment, resid) {
  const pay = payment && typeof payment === 'object' ? payment : {};
  const totalIls = Number(pay.total || 0);
  const notePayments = Array.isArray(pay.notePayments) ? pay.notePayments : [];
  const collected = receivedKinorotNotePayments(notePayments);
  const paidIls = collected.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const total_price_agorot = Math.round(totalIls * 100);
  const clearing = clearingPaymentsFromKinorotNotes(notePayments, {
    resid: resid || '',
    last4: pay.last4 || ''
  });
  if (pay.voucherRedeemed) {
    return {
      total_price_agorot,
      deposit_agorot: 0,
      payment_status: 'PAID',
      payment_mode: 'VOUCHER',
      clearing_payments: []
    };
  }
  if (pay.complimentary) {
    return {
      total_price_agorot,
      deposit_agorot: 0,
      payment_status: 'PAID',
      payment_mode: 'COMP',
      clearing_payments: []
    };
  }
  let payment_status = 'UNPAID';
  if (totalIls > 0 && paidIls + 0.5 >= totalIls) payment_status = 'PAID';
  else if (paidIls > 0.5) payment_status = 'DEPOSIT_PAID';
  const lastMethod = collected.at(-1)?.method;
  return {
    total_price_agorot,
    deposit_agorot: payment_status === 'UNPAID'
      ? depositAgorotFromTotal(total_price_agorot)
      : Math.round(paidIls * 100),
    payment_status,
    payment_mode: lastMethod ? paymentModeFromKinorotMethod(lastMethod) : null,
    clearing_payments: clearing
  };
}

export function clearingPaymentsFromKinorotNotes(events, { resid = '', last4 = '' } = {}) {
  return receivedKinorotNotePayments(events).map((event) => {
    const method = event.method || 'card';
    const accountKey = 'MAX';
    return {
      source: 'KINOROT',
      accountKey,
      amount: event.amount,
      amount_agorot: Math.round(Number(event.amount || 0) * 100),
      date: event.date || '',
      last4: method === 'card' ? last4 : '',
      collector: 'כינורות',
      txn: `kinorot_note_${resid || 'res'}_${event.date || 'na'}_${Math.round(event.amount * 100)}_${method}`
    };
  });
}
