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
  if (/העבר/.test(text)) return 'bank';
  if (/ביט|bit|פייבוקס|paybox/i.test(text)) return 'app';
  if (/צ[׳']?ק|שיק/.test(text)) return 'check';
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
  return method === 'card' || method === 'bank' || method === 'cash' || method === 'app' || method === 'check';
}

export function receivedKinorotNotePayments(events) {
  return (events || []).filter((row) => isCollectedKinorotMethod(row.method));
}

const NOTE_DATE = '(?:(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?\\s*-?\\s*)?';
const NOTE_VERB = '(?:שולם|שולמה|שולמו|שילם|שילמה|שילמו|חויב|חוייב|חויבה|חוייבה|חיוב|גבה|נגבה|הועבר|הועברו)';
const NOTE_METH = "(אשראי|מזומן|העברה(?:\\s+בנקאית)?|העברות(?:\\s+בנקאיות)?|ביט|bit|פייבוקס|paybox|צ[׳']?ק|שיק)";
const NOTE_AMT = '(\\d{1,3}(?:[,.]\\d{3})+|\\d{2,6})\\s*(?:₪|ש"ח|שח|ש\'\'ח)?';
// A: [date] [בוצע] VERB [מקדמה] [ל<name>] [ב METH] AMOUNT [METH]
const NOTE_RE_A = new RegExp(NOTE_DATE + '(?:בוצע[הו]?\\s+)?' + NOTE_VERB + '(?:\\s+מקדמה)?(?:\\s+ל\\S+)?(?:\\s+ב?' + NOTE_METH + ')?[\\s-]+' + NOTE_AMT + '(?:\\s*ב?' + NOTE_METH + ')?', 'gi');
// B: [date] [בוצע/ה|נעשתה|התקבלה] העברה [בנקאית] [בוצעה|נוספת|התקבלה] [של] AMOUNT
const NOTE_RE_B = new RegExp(NOTE_DATE + '(?:(?:בוצע[הו]?|נעשתה|התקבלה)\\s+)?(?<!\\d{3,}\\s*)(העברה(?:\\s+בנקאית)?)(?:\\s+(?:בוצעה|נוספת|התקבלה))?(?:\\s+של)?[\\s-]+' + NOTE_AMT, 'gi');
// C (amount first): AMOUNT [₪] [תוספת] [מקדמה] [ב]METH, not followed by לברר/לבדוק
const NOTE_RE_C = new RegExp('(?<!\\d[,.]?)' + NOTE_AMT + '\\s*-?\\s*(?:תוספת\\s+)?(?:מקדמה\\s+)?(?:ש"ח\\s+)?ב?' + NOTE_METH + '(?!\\s*(?:לברר|לבדוק))', 'gi');
// D: [date] METH AMOUNT — informal notes without שולם, e.g. "8.11 מזומן 560 אדם"
const NOTE_RE_D = new RegExp(NOTE_DATE + 'ב?\s*' + NOTE_METH + '[\\s-]+' + NOTE_AMT, 'gi');
// Not-a-payment guard: text just before the match says it is missing/pending/claimed.
const NOTE_NOT_PAID = /(?:^|\s)(?:לא(?=\s)|טרם|חסר|להשלים|משלימה|יתרה של|נשאר|טוענת ש|אמור ל\S*|ממתין ל|מחכה ל|צריך ל\S*)\s*(?:\S+\s+){0,3}$/;

export function parseKinorotNotePayments(text, { todayIso } = {}) {
  const src = String(text || '').replace(/[\u200e\u200f\u00a0]/g, ' ').replace(/\s+/g, ' ');
  const hits = new Map();
  for (const [kind, re] of [['A', NOTE_RE_A], ['B', NOTE_RE_B], ['C', NOTE_RE_C], ['D', NOTE_RE_D]]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(src))) {
      let day, month, year, methodRaw, amountRaw;
      if (kind === 'A') [, day, month, year, methodRaw, amountRaw] = match, methodRaw = methodRaw || match[6];
      else if (kind === 'B') [, day, month, year, methodRaw, amountRaw] = match;
      else if (kind === 'D') [, day, month, year, methodRaw, amountRaw] = match;
      else [, amountRaw, methodRaw] = match;
      const amount = Number(String(amountRaw || '0').replace(/[,.]/g, ''));
      if (!Number.isFinite(amount) || amount < 50 || amount > 80000) continue;
      if (NOTE_NOT_PAID.test(src.slice(Math.max(0, match.index - 20), match.index))) continue;
      const pos = match.index + match[0].lastIndexOf(amountRaw);
      if (hits.has(pos)) continue;
      const method = normalizeKinorotPayMethod(methodRaw || 'אשראי');
      const date = day ? kinorotNotePaymentDate(Number(day), Number(month), year, todayIso) : '';
      hits.set(pos, { date, method, amount });
    }
  }
  const events = [];
  const seen = new Set();
  for (const [, ev] of [...hits.entries()].sort((x, y) => x[0] - y[0])) {
    const key = `${ev.date}|${ev.method}|${ev.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(ev);
  }
  return events;
}

export function paymentModeFromKinorotMethod(method) {
  if (method === 'card') return 'CARD';
  if (method === 'bank') return 'BANK_TRANSFER';
  if (method === 'cash') return 'CASH';
  // Bit/PayBox and checks land in the bank account; consumers only know CARD/BANK_TRANSFER/CASH.
  if (method === 'app' || method === 'check') return 'BANK_TRANSFER';
  return null;
}

export function moneyFromKinorotPayment(payment, resid, { existingPayments = [] } = {}) {
  const pay = payment && typeof payment === 'object' ? payment : {};
  const totalIls = Number(pay.total || 0);
  const notePayments = Array.isArray(pay.notePayments) ? pay.notePayments : [];
  const collected = receivedKinorotNotePayments(notePayments);
  const paidIls = collected.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const total_price_agorot = Math.round(totalIls * 100);
  const clearing = clearingPaymentsFromKinorotNotes(notePayments, {
    resid: resid || '',
    last4: pay.last4 || '',
    existingPayments
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

/** Keep a manually-corrected collector (e.g. ברק) when the same Kinorot txn is re-synced. */
export function preserveKinorotCollector(existingPayments, incoming) {
  const prev = (Array.isArray(existingPayments) ? existingPayments : [])
    .map((row) => ({
      txn: String(row?.txn || ''),
      collector: String(row?.collector || '').trim()
    }))
    .filter((row) => row.txn && row.collector && row.collector !== 'כינורות');
  const byTxn = new Map(prev.map((row) => [row.txn, row.collector]));
  return (Array.isArray(incoming) ? incoming : []).map((row) => {
    const kept = byTxn.get(String(row?.txn || ''));
    if (!kept) return row;
    return { ...row, collector: kept };
  });
}

export function clearingPaymentsFromKinorotNotes(events, { resid = '', last4 = '', existingPayments = [] } = {}) {
  const built = receivedKinorotNotePayments(events).map((event) => {
    const method = event.method || 'card';
    const accountKey = method === 'cash' ? 'CASH' : (method === 'bank' || method === 'app' || method === 'check') ? 'BANK' : 'MAX';
    return {
      source: 'KINOROT',
      accountKey,
      method,
      amount: event.amount,
      amount_agorot: Math.round(Number(event.amount || 0) * 100),
      date: event.date || '',
      last4: method === 'card' ? last4 : '',
      collector: 'כינורות',
      txn: `kinorot_note_${resid || 'res'}_${event.date || 'na'}_${Math.round(event.amount * 100)}_${method}`
    };
  });
  return preserveKinorotCollector(existingPayments, built);
}
