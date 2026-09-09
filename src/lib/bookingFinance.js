import { bookingStayKey, linkCollectionToBookings, methodBucket, monthKey, parseMoney, propertyFromUnit } from './dailyCollection';
import { collectionCreditAmount } from './maxCollectionMatch';
import { addDaysIso, collectionTransferAmount } from './cashFlowForecast';
import { israelToday } from './cabinAccess';
import { HYP_TERMINALS, hypAccountOf, listClearingPayments, normalizeClearingPayment, paymentClearingLine } from './clearingPayments';
import { bankCashDeposits, bankCheckDeposits, bankClearingLine } from './bankCollectionMatch';
import { paymentFromHypRow, unassignedHypCharges } from './hypPayments';
import { isUnavailableHoldBooking, isUnavailableHoldCollectionRow } from './unavailableHold';

function moneyRound(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function rowStayFacts(row, booking) {
  const checkIn = booking?.check_in_date || row?.stayDate || '';
  const checkOut = booking?.check_out_date || '';
  let nights = 0;
  if (checkIn && checkOut) {
    const start = new Date(`${checkIn}T12:00:00`).getTime();
    const end = new Date(`${checkOut}T12:00:00`).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      nights = Math.max(0, Math.round((end - start) / 86400000));
    }
  }
  const guests = booking
    ? (Number(booking.adults_count) || 0)
      + (Number(booking.children_count) || 0)
      + (Number(booking.babies_count) || 0)
    : 0;
  return { checkIn, nights, guests };
}

export function cabinUnitLabel(booking, units) {
  if (!booking) return '';
  const unitById = units instanceof Map ? units : new Map((units || []).map((unit) => [unit.id, unit]));
  return unitById.get(booking.unit_id)?.name || '';
}

export function scaleBreakdown(breakdown, share, cabinIndex = 0) {
  const n = Math.max(1, Number(share) || 1);
  if (!breakdown || n === 1) return breakdown;
  const factor = 1 / n;
  const scaleMoves = (moves) => (moves || []).map((move) => ({
    ...move,
    id: `${move.id}#${cabinIndex}`,
    amount: moneyRound(move.amount * factor)
  }));
  return {
    due: moneyRound(breakdown.due * factor),
    paid: moneyRound(breakdown.paid * factor),
    credit: {
      amount: moneyRound(breakdown.credit?.amount * factor),
      movements: scaleMoves(breakdown.credit?.movements)
    },
    cash: {
      amount: moneyRound(breakdown.cash?.amount * factor),
      movements: scaleMoves(breakdown.cash?.movements)
    },
    transfer: {
      amount: moneyRound(breakdown.transfer?.amount * factor),
      movements: scaleMoves(breakdown.transfer?.movements)
    },
    check: {
      amount: moneyRound((breakdown.check?.amount || 0) * factor),
      movements: scaleMoves(breakdown.check?.movements)
    }
  };
}

export function collectionDisplayRows(filtered, linked, extras = {}) {
  const units = extras.units;
  const rowsForStay = new Map();
  for (const row of filtered || []) {
    const booking = linked?.byCollection?.[row.id];
    if (!booking) continue;
    const key = bookingStayKey(booking, units);
    rowsForStay.set(key, (rowsForStay.get(key) || 0) + 1);
  }
  const out = [];
  for (const row of filtered || []) {
    const booking = linked?.byCollection?.[row.id];
    const cabins = stayBookings(booking, extras.bookings, extras.units, extras)
      .slice()
      .sort((a, b) => String(a.unit_id || '').localeCompare(String(b.unit_id || '')));
    const stayKey = booking ? bookingStayKey(booking, units) : '';
    const expand = cabins.length > 1 && (rowsForStay.get(stayKey) || 0) === 1;
    const parts = expand ? cabins : [booking || null];
    parts.forEach((cabin, index) => {
      out.push({
        key: `${row.id}#${cabin?.id || index}`,
        row,
        booking: cabin,
        share: parts.length,
        cabinIndex: index
      });
    });
  }
  return out;
}

function bookingDueIls(booking) {
  const price = (Number(booking?.total_price_agorot) || 0) / 100;
  const deposit = (Number(booking?.deposit_agorot) || 0) / 100;
  const clearing = listClearingPayments(booking).reduce((sum, row) => (
    sum + (Number(row.amount_agorot) || 0) / 100
  ), 0);
  const usableDeposit = (deposit > price + 1 && clearing + 1 < deposit) ? 0 : deposit;
  return moneyRound(Math.max(price, usableDeposit, clearing));
}

function methodsFromBooking(booking) {
  const mode = String(booking?.payment_mode || '');
  const status = String(booking?.payment_status || '');
  if (mode === 'CASH' || mode === 'CASH_TRUST' || status === 'PENDING_CASH') return ['מזומן'];
  if (mode === 'BANK_TRANSFER' || status === 'PENDING_BANK') return ['העברה בנקאית'];
  if (mode === 'VOUCHER') return ['שובר'];
  if (mode === 'COMP') return ['ללא תשלום'];
  return ['אשראי'];
}

export function bookingForFinanceRow(row, linked, extras = {}) {
  const hit = linked?.byCollection?.[row?.id];
  if (hit) return hit;
  const date = String(row?.stayDate || '').slice(0, 10);
  const guest = String(row?.guestName || '').trim().toLowerCase();
  if (!date || guest.length < 2) return null;
  const tokens = guest.split(/\s+/).filter((part) => part.length >= 2);
  const matches = (extras.bookings || []).filter((booking) => {
    if (!booking || booking.deleted_at || booking.booking_status === 'CANCELED') return false;
    if (String(booking.check_in_date || '').slice(0, 10) !== date) return false;
    const name = String(booking.guest_name || '').trim().toLowerCase();
    if (name === guest) return true;
    return tokens.filter((part) => name.includes(part)).length >= Math.min(2, tokens.length);
  });
  if (!matches.length) return null;
  return [...matches].sort((a, b) => clearingProofCount(b) - clearingProofCount(a))[0];
}

function clearingProofCount(booking) {
  return (booking?.clearing_payments || []).filter((row) => {
    const ref = String(row?.ref || '').trim();
    return ref && !/^0+$/.test(ref);
  }).length;
}

export function mergeKinorotArrivals(collectionRows, bookings, units, { today = israelToday() } = {}) {
  const rows = (collectionRows || []).filter((row) => !isUnavailableHoldCollectionRow(row));
  const lastReport = rows.map((row) => row.stayDate).filter(Boolean).sort().at(-1) || '';
  const afterReport = lastReport ? addDaysIso(lastReport, 1) : '';
  const linked = linkCollectionToBookings(rows, bookings, units);
  const used = linked.usedBookingIds || new Set();
  const groups = new Map();
  for (const booking of bookings || []) {
    if (!booking || booking.deleted_at || booking.booking_status === 'CANCELED') continue;
    if (isUnavailableHoldBooking(booking)) continue;
    if (!booking.check_in_date || booking.check_in_date > today) continue;
    if (used.has(booking.id)) continue;
    if (afterReport && booking.check_in_date < afterReport) continue;
    const key = bookingStayKey(booking, units);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(booking);
  }
  const extra = [];
  for (const group of groups.values()) {
    const booking = [...group].sort((a, b) => String(a.unit_id || '').localeCompare(String(b.unit_id || '')))[0];
    extra.push({
      id: `arrival-${booking.id}`,
      stayDate: booking.check_in_date,
      property: propertyFromUnit(booking.unit_id),
      guestName: booking.guest_name || '',
      deposit: moneyRound((Number(booking.deposit_agorot) || 0) / 100),
      balance: 0,
      cash: 0,
      amount: moneyRound(group.reduce((sum, item) => sum + bookingDueIls(item), 0)),
      methods: methodsFromBooking(booking),
      voucher: 0,
      status: (booking.payment_status === 'PAID' || booking.payment_mode === 'VOUCHER' || booking.payment_mode === 'COMP') ? 'paid' : 'unpaid',
      notes: 'כניסה מהיומן · אחרי הדוח היומי',
      source: 'kinorot-arrival',
      sourceLine: 0
    });
  }
  return extra.length ? rows.concat(extra) : rows;
}

export function hasHypProof(booking) {
  return listClearingPayments(booking).some((row) => (
    (row.source === 'HYP' || row.accountKey === 'MAX_HYP' || row.terminalId)
    && String(row.ref || '').trim()
    && !/^0+$/.test(String(row.ref || '').trim())
  ));
}

export function paymentKind(row) {
  const buckets = methodBucket(row?.methods || []);
  if (buckets.credit) return 'credit';
  if (buckets.transfer) return 'transfer';
  if (buckets.cash) return 'cash';
  if (buckets.check) return 'check';
  if (buckets.voucher) return 'voucher';
  if (buckets.booking || buckets.airbnb) return 'ota';
  return 'unknown';
}

export function collectionCheckAmount(row) {
  const text = `${(row?.methods || []).join(' ')} ${row?.notes || ''}`;
  if (!/צ['׳]?ק|שיק/.test(text)) return 0;
  const hit = text.match(/([\d,]{3,})\s*צ['׳]?ק/)
    || text.match(/צ['׳]?ק[^\d]{0,8}([\d,]{3,})(?!\.\d)/)
    || text.match(/([\d,]{3,})צ['׳]?ק/)
    || text.match(/([\d,]{3,})\s*שיק/)
    || text.match(/שיק[^\d]{0,8}([\d,]{3,})(?!\.\d)/);
  if (hit) return parseMoney(hit[1]);
  const buckets = methodBucket(row?.methods || []);
  if (buckets.check && !buckets.credit && !buckets.transfer && !buckets.cash && !buckets.booking) {
    return Number(row?.amount) || 0;
  }
  return 0;
}

export function collectionCashAmount(row) {
  const buckets = methodBucket(row?.methods || []);
  if (!buckets.cash) return 0;
  const cash = Number(row?.cash) || 0;
  if (cash > 0) return cash;
  if (buckets.credit || buckets.transfer || buckets.booking || buckets.airbnb || buckets.voucher) return 0;
  return Number(row?.amount) || 0;
}

export function rowHasPaymentMethod(row, method) {
  const buckets = methodBucket(row?.methods || []);
  if (method === 'credit') return Boolean(buckets.credit);
  if (method === 'transfer') return Boolean(buckets.transfer);
  if (method === 'cash') return Boolean(buckets.cash);
  if (method === 'check') return Boolean(buckets.check);
  return true;
}

export function methodAmountOf(row, method) {
  if (method === 'credit') return collectionCreditAmount(row);
  if (method === 'transfer') return collectionTransferAmount(row);
  if (method === 'cash') return collectionCashAmount(row);
  if (method === 'check') return collectionCheckAmount(row);
  return Number(row?.amount) || 0;
}

export function paidMethodTotal(rows, method) {
  return (rows || []).reduce((sum, row) => {
    if (row.status !== 'paid' && row.status !== 'kinorot') return sum;
    return sum + (methodAmountOf(row, method) || 0);
  }, 0);
}

function movementMethod(payment) {
  const key = `${payment.source || ''} ${payment.accountKey || ''}`;
  if (/CASH/i.test(key)) return 'cash';
  if (/BANK|BEINLEUMI/i.test(key)) return 'transfer';
  return 'credit';
}

function movementFromClearing(payment) {
  const row = normalizeClearingPayment(payment);
  return {
    id: row.txn || `${row.ref}|${row.amount_agorot}|${row.date}`,
    method: movementMethod(row),
    amount: (Number(row.amount_agorot) || 0) / 100,
    ref: row.ref || '',
    source: row.source || '',
    accountLabel: row.accountLabel || '',
    accountDetail: row.accountDetail || '',
    terminalId: row.terminalId || '',
    merchantId: row.merchantId || '',
    date: row.date || '',
    last4: row.last4 || '',
    brand: row.brand || ''
  };
}

function movementFromBank(tx) {
  if (!tx) return null;
  return {
    id: tx.id || `${tx.date}|${tx.amount}|${tx.reference}`,
    method: 'transfer',
    amount: Number(tx.amount) || 0,
    ref: String(tx.reference || '').trim(),
    accountLabel: tx.accountLabel || '',
    accountDetail: tx.description || '',
    terminalId: '',
    merchantId: '',
    date: tx.date || '',
    last4: '',
    brand: ''
  };
}

function sumMovements(movements) {
  return (movements || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

export function buildStayIndex(bookings, units) {
  const map = new Map();
  for (const item of bookings || []) {
    if (!item || item.deleted_at || item.booking_status === 'CANCELED') continue;
    const key = bookingStayKey(item, units);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function stayBookings(booking, bookings, units, extras = {}) {
  if (!booking) return [];
  const key = bookingStayKey(booking, units);
  if (extras.stayIndex) return extras.stayIndex.get(key) || [];
  return (bookings || []).filter((item) => (
    item && !item.deleted_at && item.booking_status !== 'CANCELED' && bookingStayKey(item, units) === key
  ));
}

function uniqueMovements(movements) {
  const seen = new Set();
  const out = [];
  for (const item of movements || []) {
    const key = item.id || `${item.ref}|${item.amount}|${item.date}|${item.terminalId || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function bookingTotalAmount(row, booking, extras = {}) {
  const siblings = stayBookings(booking, extras.bookings, extras.units, extras);
  const fromBookings = [booking, ...siblings].map((item) => Number(item?.total_price_agorot || 0) / 100);
  const fromStay = Math.max(0, ...fromBookings);
  return Math.max(Number(row?.amount) || 0, fromStay);
}

function isCollectedCredit(item) {
  if (item.method !== 'credit' || !(Number(item.amount) > 0)) return false;
  if (item.ref && !/^0+$/.test(item.ref)) return true;
  return item.source === 'KINOROT' || item.source === 'HYP' || Boolean(item.last4);
}

function realCreditMovements(booking, extras = {}) {
  const siblings = stayBookings(booking, extras.bookings, extras.units, extras);
  const group = siblings.length ? siblings : (booking ? [booking] : []);
  const stored = uniqueMovements(group.flatMap((item) => (
    (Array.isArray(item?.clearing_payments) ? item.clearing_payments : []).map(movementFromClearing)
  ))).filter(isCollectedCredit);
  if (stored.length) return stored;
  const hyp = booking?.stay?.hyp;
  if (!(hyp?.auth || hyp?.id || hyp?.paid)) return [];
  return listClearingPayments(booking)
    .map(movementFromClearing)
    .filter(isCollectedCredit);
}

function realTransferMovements(booking, bankHit, extras = {}) {
  const siblings = stayBookings(booking, extras.bookings, extras.units, extras);
  const group = siblings.length ? siblings : (booking ? [booking] : []);
  const stored = uniqueMovements(group.flatMap((item) => (
    (Array.isArray(item?.clearing_payments) ? item.clearing_payments : []).map(movementFromClearing)
  ))).filter((item) => item.method === 'transfer' && (item.ref || item.amount > 0));
  const bank = movementFromBank(bankHit?.tx);
  if (bank && !stored.some((item) => (
    (item.ref && bank.ref && item.ref === bank.ref)
    || (item.date === bank.date && Math.round(item.amount * 100) === Math.round(bank.amount * 100))
  ))) {
    stored.push(bank);
  }
  return stored.filter((item) => item.ref || item.amount > 0);
}

export function rowPaymentBreakdown(row, booking, bankHit, extras = {}) {
  const credit = realCreditMovements(booking, extras);
  const transfer = realTransferMovements(booking, bankHit, extras);
  const siblings = stayBookings(booking, extras.bookings, extras.units, extras);
  const group = siblings.length ? siblings : (booking ? [booking] : []);
  const cashMoves = uniqueMovements(group.flatMap((item) => (
    (Array.isArray(item?.clearing_payments) ? item.clearing_payments : []).map(movementFromClearing)
  ))).filter((item) => item.method === 'cash' && item.amount > 0);
  const cashAmount = sumMovements(cashMoves) || collectionCashAmount(row);
  const checkAmount = collectionCheckAmount(row);
  const due = bookingTotalAmount(row, booking, extras);
  const paid = sumMovements(credit) + sumMovements(transfer) + cashAmount + checkAmount;
  return {
    due,
    paid,
    credit: { amount: sumMovements(credit), movements: credit },
    cash: { amount: cashAmount, movements: cashMoves },
    transfer: { amount: sumMovements(transfer), movements: transfer },
    check: { amount: checkAmount, movements: [] }
  };
}

function leftoverOf(breakdown) {
  return Math.max(0, Math.round(((breakdown.due || 0) - (breakdown.paid || 0)) * 100) / 100);
}

function moneySum(rows, pick = (row) => row.amount) {
  return Math.round((rows || []).reduce((sum, row) => sum + (Number(pick(row)) || 0), 0) * 100) / 100;
}

function isLedgerRow(row) {
  if (row?.source === 'kinorot-arrival') return false;
  return row?.status === 'paid' || row?.status === 'kinorot';
}

export function buildCollectionLedger(rows, hypPayload, bankRows, { month = '', bankMatch = null } = {}) {
  const scoped = (rows || []).filter((row) => !month || monthKey(row.stayDate) === month);
  let paidCount = 0;
  let arrivalCount = 0;
  let creditReport = 0;
  let transferReport = 0;
  let cashReport = 0;
  let checkReport = 0;
  let ota = 0;
  let mixedUnsplit = 0;
  for (const row of scoped) {
    if (row.source === 'kinorot-arrival') arrivalCount += 1;
    if (!isLedgerRow(row)) continue;
    paidCount += 1;
    if (paymentKind(row) === 'ota') ota += Number(row.amount) || 0;
    const credit = creditDueForHypCross(row);
    creditReport += credit;
    const transfer = collectionTransferAmount(row);
    transferReport += transfer;
    cashReport += collectionCashAmount(row);
    checkReport += collectionCheckAmount(row);
    const buckets = methodBucket(row.methods || []);
    if (buckets.credit && (buckets.transfer || buckets.cash) && !credit && !transfer) {
      mixedUnsplit += Math.max(0, (Number(row.amount) || 0) - (Number(row.cash) || 0));
    }
  }
  const hypRows = (hypPayload?.rows || []).filter((row) => (
    !month || String(row.date || '').slice(0, 7) === month
  ));
  const matchedTransfers = (bankMatch?.matches || []).filter((item) => (
    !month || monthKey(item.collection?.stayDate || item.row?.stayDate) === month
  ));
  const cashRows = bankCashDeposits(bankRows, { month });
  const checkRows = bankCheckDeposits(bankRows, { month });
  const hypActual = moneySum(hypRows);
  const transferActual = moneySum(matchedTransfers, (item) => item.amount);
  const cashActual = moneySum(cashRows);
  const checkActual = moneySum(checkRows);
  const received = moneyRound(hypActual + transferActual + cashActual + checkActual);
  const reported = moneyRound(creditReport + transferReport + cashReport + checkReport);
  return {
    turnover: {
      reported,
      actual: received,
      count: paidCount,
      arrivals: arrivalCount,
      diff: moneyRound(reported - received)
    },
    paidCount,
    ota: Math.round(ota * 100) / 100,
    mixedUnsplit: Math.round(mixedUnsplit * 100) / 100,
    credit: {
      reported: Math.round(creditReport * 100) / 100,
      actual: hypActual,
      count: hypRows.filter((row) => Number(row.amount) > 0).length,
      diff: Math.round((creditReport - hypActual) * 100) / 100
    },
    transfer: {
      reported: Math.round(transferReport * 100) / 100,
      actual: transferActual,
      count: matchedTransfers.length,
      diff: Math.round((transferReport - transferActual) * 100) / 100
    },
    cash: {
      reported: Math.round(cashReport * 100) / 100,
      actual: cashActual,
      count: cashRows.length,
      diff: Math.round((cashReport - cashActual) * 100) / 100
    },
    check: {
      reported: Math.round(checkReport * 100) / 100,
      actual: checkActual,
      count: checkRows.length,
      diff: Math.round((checkReport - checkActual) * 100) / 100
    }
  };
}

function creditDueForHypCross(row) {
  const buckets = methodBucket(row?.methods || []);
  if (buckets.booking || buckets.airbnb) return 0;
  if (!buckets.credit) return 0;
  const fromNotes = collectionCreditAmount(row);
  if (buckets.transfer || buckets.cash || buckets.voucher) {
    const notes = String(row?.notes || '');
    if (!/[\d,]{2,}\s*אשראי|אשראי[^\d]{0,12}[\d,]{2,}/.test(notes)) return 0;
  }
  return fromNotes;
}

function stayCollectionKey(row) {
  const name = String(row?.guestName || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/["'׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${name}|${row?.stayDate || ''}|${row?.property || ''}`;
}

const SKIP_MISMATCH_NAME = /^(תפוס|ביטול|סגור|שיפוץ|מוצאש|יציאה)/;

function kinorotResid(booking) {
  const req = String(booking?.special_requests || '');
  const hit = req.match(/kinorot:([^|]+)/);
  if (hit) return `k:${hit[1]}`;
  const id = String(booking?.id || '');
  const parts = id.split('_');
  if (id.startsWith('kin_') && parts.length >= 3) return `k:${parts.slice(2).join('_')}`;
  return `id:${id}`;
}

function hypNameScore(row, booking) {
  const hypName = `${row?.name || ''} ${row?.desc || ''}`;
  const guest = String(booking?.guest_name || '');
  const guestParts = guest.toLowerCase().replace(/["'׳.]/g, ' ').split(/\s+/).filter((part) => part.length >= 2);
  const hyp = hypName.toLowerCase();
  return guestParts.filter((part) => hyp.includes(part)).length;
}

function attachLiveHyp(groups, hypPayload) {
  const used = new Set();
  for (const group of groups.values()) {
    for (const booking of group) {
      for (const payment of booking.clearing_payments || []) {
        const txn = String(payment.txn || '').trim();
        const ref = String(payment.ref || '').trim();
        if (txn) used.add(txn);
        if (ref) used.add(ref);
      }
    }
  }
  const extra = new Map();
  for (const row of hypPayload?.rows || []) {
    const txn = String(row.txn || '').trim();
    const ref = String(row.ref || '').trim();
    if ((txn && used.has(txn)) || (ref && used.has(ref))) continue;
    if (!(Number(row.amount) > 0)) continue;
    let best = null;
    for (const [key, group] of groups) {
      const booking = group[0];
      const names = hypNameScore(row, booking);
      const cin = String(booking.check_in_date || '');
      const day = String(row.date || '');
      const delta = (!day || !cin)
        ? 99
        : Math.abs((Date.parse(`${day}T12:00:00`) - Date.parse(`${cin}T12:00:00`)) / 86400000);
      const last4 = String(row.last4 || '').replace(/\D/g, '').slice(-4);
      const stayLast4 = group.flatMap((item) => (
        (item.clearing_payments || []).map((payment) => String(payment.last4 || '').replace(/\D/g, '').slice(-4))
      )).filter(Boolean);
      let score = names * 4;
      if (last4 && stayLast4.includes(last4)) score += 12;
      if (delta <= 1) score += 6;
      else if (delta <= 3) score += 4;
      else if (delta <= 8) score += 2;
      else score -= 6;
      if (score >= 8 && (!best || score > best.score)) best = { key, score };
    }
    if (!best) continue;
    used.add(txn);
    if (ref) used.add(ref);
    const list = extra.get(best.key) || [];
    list.push(movementFromClearing(paymentFromHypRow(row)));
    extra.set(best.key, list);
  }
  return extra;
}

export function financeStayRollup(bookings, units, { month = '', throughDate = '', hypPayload = null } = {}) {
  const groups = new Map();
  const futureGroups = new Map();
  for (const booking of activeBookings(bookings, month)) {
    if (isUnavailableHoldBooking(booking)) continue;
    if (SKIP_MISMATCH_NAME.test(String(booking.guest_name || '').trim())) continue;
    const key = kinorotResid(booking);
    const future = throughDate && String(booking.check_in_date || '') > throughDate;
    const bucket = future ? futureGroups : groups;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(booking);
  }
  const liveHyp = attachLiveHyp(groups, hypPayload);
  let booked = 0;
  let collected = 0;
  let credit = 0;
  let cash = 0;
  let transfer = 0;
  let open = 0;
  let openCount = 0;
  let stayCount = 0;
  for (const [key, group] of groups) {
    const modes = new Set(group.map((item) => item.payment_mode).filter(Boolean));
    if (modes.has('VOUCHER') || modes.has('COMP')) {
      stayCount += 1;
      continue;
    }
    const dues = group.map((item) => bookingDueIls(item));
    const samePrice = dues.length > 1 && dues.every((value) => Math.abs(value - dues[0]) < 0.51);
    const due = samePrice ? Math.max(0, ...dues) : moneyRound(dues.reduce((sum, value) => sum + value, 0));
    const moves = uniqueMovements([
      ...group.flatMap((item) => (
        (Array.isArray(item.clearing_payments) ? item.clearing_payments : []).map(movementFromClearing)
      )),
      ...(liveHyp.get(key) || [])
    ]);
    const creditMoves = moves.filter(isCollectedCredit);
    const cashMoves = moves.filter((item) => item.method === 'cash' && item.amount > 0);
    const transferMoves = moves.filter((item) => item.method === 'transfer' && item.amount > 0);
    const paid = moneyRound(sumMovements(creditMoves) + sumMovements(cashMoves) + sumMovements(transferMoves));
    stayCount += 1;
    booked += due;
    collected += paid;
    credit += sumMovements(creditMoves);
    cash += sumMovements(cashMoves);
    transfer += sumMovements(transferMoves);
    const leftover = leftoverOf({ due, paid });
    if (leftover > 1) {
      open += leftover;
      openCount += 1;
    }
  }
  let futureBooked = 0;
  let futureCount = 0;
  for (const group of futureGroups.values()) {
    const modes = new Set(group.map((item) => item.payment_mode).filter(Boolean));
    if (modes.has('VOUCHER') || modes.has('COMP')) continue;
    const dues = group.map((item) => bookingDueIls(item));
    const samePrice = dues.length > 1 && dues.every((value) => Math.abs(value - dues[0]) < 0.51);
    futureBooked += samePrice ? Math.max(0, ...dues) : dues.reduce((sum, value) => sum + value, 0);
    futureCount += 1;
  }
  return {
    stayCount,
    booked: moneyRound(booked),
    collected: moneyRound(collected),
    credit: moneyRound(credit),
    cash: moneyRound(cash),
    transfer: moneyRound(transfer),
    open: moneyRound(open),
    openCount,
    futureBooked: moneyRound(futureBooked),
    futureCount
  };
}

export function financeMismatchTotals(rows, bookings, units, bankMatch, hypPayload, { month = '', throughDate = '' } = {}) {
  const rollup = financeStayRollup(bookings, units, { month, throughDate, hypPayload });
  const hypRows = unassignedHypCharges(hypPayload, bookings, { month });
  const paymentAmount = hypRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return {
    booked: rollup.booked,
    collected: rollup.collected,
    credit: rollup.credit,
    cash: rollup.cash,
    transfer: rollup.transfer,
    bookingAmount: rollup.open,
    bookingCount: rollup.openCount,
    paymentAmount: moneyRound(paymentAmount),
    paymentCount: hypRows.length,
    stayCount: rollup.stayCount,
    futureBooked: rollup.futureBooked,
    futureCount: rollup.futureCount
  };
}

export function summarizeOpenVsUnassignedHyp(rows, bookings, units, bankMatch, hypPayload, { month = '' } = {}) {
  const linked = linkCollectionToBookings(rows, bookings, units);
  const extras = { bookings, units };
  const stays = new Map();
  for (const row of rows || []) {
    const kind = paymentKind(row);
    const booking = linked.byCollection?.[row.id];
    const bankHit = bankMatch?.byCollectionId?.[row.id];
    const breakdown = rowPaymentBreakdown(row, booking, bankHit, extras);
    const key = stayCollectionKey(row);
    const current = stays.get(key) || {
      row,
      kind,
      due: 0,
      paid: 0,
      creditDue: 0,
      creditPaid: 0
    };
    current.due = Math.max(current.due, breakdown.due || 0);
    current.paid = Math.max(current.paid, breakdown.paid || 0);
    current.creditDue = Math.max(current.creditDue, creditDueForHypCross(row));
    current.creditPaid = Math.max(current.creditPaid, breakdown.credit?.amount || 0);
    if (kind === 'ota') current.kind = 'ota';
    stays.set(key, current);
  }
  const openRows = [];
  for (const stay of stays.values()) {
    const leftover = stay.kind === 'ota'
      ? leftoverOf({ due: stay.due, paid: stay.paid })
      : Math.max(0, Math.round((stay.creditDue - stay.creditPaid) * 100) / 100);
    if (leftover <= 1) continue;
    openRows.push({ row: stay.row, leftover, kind: stay.kind });
  }
  const cardOpen = openRows.filter((item) => item.kind !== 'ota');
  const otaOpen = openRows.filter((item) => item.kind === 'ota');
  const hypRows = unassignedHypCharges(hypPayload, bookings, { month });
  const byTerminal = HYP_TERMINALS.map((terminalId) => {
    const rows = hypRows.filter((row) => String(row.terminalId || '') === terminalId);
    const amount = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    return {
      terminalId,
      label: hypAccountOf(terminalId).label,
      rows,
      count: rows.length,
      amount: Math.round(amount * 100) / 100
    };
  });
  const openAmount = cardOpen.reduce((sum, item) => sum + item.leftover, 0);
  const otaAmount = otaOpen.reduce((sum, item) => sum + item.leftover, 0);
  const hypAmount = byTerminal.reduce((sum, item) => sum + item.amount, 0);
  return {
    openRows: cardOpen,
    otaRows: otaOpen,
    hypRows,
    byTerminal,
    openAmount: Math.round(openAmount * 100) / 100,
    otaAmount: Math.round(otaAmount * 100) / 100,
    hypAmount: Math.round(hypAmount * 100) / 100,
    diff: Math.round((openAmount - hypAmount) * 100) / 100
  };
}

export function paymentKindLabel(kind) {
  if (kind === 'credit') return 'אשראי';
  if (kind === 'transfer') return 'העברה';
  if (kind === 'cash') return 'מזומן';
  if (kind === 'check') return 'צ׳ק';
  if (kind === 'voucher') return 'שובר';
  if (kind === 'ota') return 'OTA';
  return 'לא ידוע';
}

function isLiveBooking(booking) {
  return Boolean(booking) && !booking.deleted_at && booking.booking_status !== 'CANCELED';
}

function activeBookings(bookings, month) {
  return (bookings || []).filter((booking) => {
    if (!isLiveBooking(booking)) return false;
    if (month && monthKey(booking.check_in_date) !== month) return false;
    return true;
  });
}

function uniqueStays(bookings, units) {
  const seen = new Map();
  for (const booking of bookings || []) {
    const key = bookingStayKey(booking, units);
    if (seen.has(key)) {
      seen.get(key).unitIds.push(booking.unit_id);
      continue;
    }
    seen.set(key, {
      ...booking,
      stayKey: key,
      unitIds: [booking.unit_id],
      property: propertyFromUnit(booking.unit_id)
    });
  }
  return [...seen.values()];
}

export function buildBookingFinance(collectionRows, bookings, units, maxMatch, { month = '', bankMatch = null } = {}) {
  const rows = (collectionRows || []).filter((row) => !month || monthKey(row.stayDate) === month);
  const namedRows = rows.filter((row) => row.guestName);
  const monthBookings = activeBookings(bookings, month);
  const linked = linkCollectionToBookings(namedRows, bookings, units);
  const calendarByCollection = linked.byCollection;
  const usedBookingIds = linked.usedBookingIds;

  const lastCollectionDate = (collectionRows || [])
    .map((row) => row.stayDate)
    .filter(Boolean)
    .sort()
    .at(-1) || '';
  const firstBookingDate = monthBookings
    .map((booking) => booking.check_in_date)
    .filter(Boolean)
    .sort()[0] || '';

  const collectionWithoutCalendar = namedRows.filter((row) => !calendarByCollection[row.id]);
  const collectionBeforeCalendar = collectionWithoutCalendar.filter((row) => (
    firstBookingDate && row.stayDate && row.stayDate < firstBookingDate
  ));
  const collectionUnmatched = collectionWithoutCalendar.filter((row) => (
    !firstBookingDate || !row.stayDate || row.stayDate >= firstBookingDate
  ));

  const calendarWithoutCollection = uniqueStays(
    monthBookings.filter((booking) => !usedBookingIds.has(booking.id)),
    units
  );
  const calendarAfterReport = calendarWithoutCollection.filter((booking) => (
    lastCollectionDate && booking.check_in_date && booking.check_in_date > lastCollectionDate
  ));
  const calendarUnmatched = calendarWithoutCollection.filter((booking) => (
    !lastCollectionDate || !booking.check_in_date || booking.check_in_date <= lastCollectionDate
  ));

  const withCalendar = rows.filter((row) => calendarByCollection[row.id]);
  let maxMatched = 0;
  let creditUnmatched = 0;
  let transfers = 0;
  let cash = 0;
  let open = 0;

  const paymentRows = withCalendar.map((row) => {
    const kind = paymentKind(row);
    const booking = calendarByCollection[row.id];
    const maxHit = maxMatch?.byCollectionId?.[row.id];
    const bankHit = bankMatch?.byCollectionId?.[row.id];
    let payment = kind;
    if (kind === 'credit' && hasHypProof(booking)) payment = 'hyp';
    else if (kind === 'credit') payment = 'credit_unmatched';
    else if (kind === 'transfer' && bankHit) payment = 'bank';
    if (payment === 'hyp') maxMatched += 1;
    if (payment === 'credit_unmatched') creditUnmatched += 1;
    if (payment === 'transfer') transfers += 1;
    if (payment === 'cash') cash += 1;
    if (row.status === 'unpaid' || row.status === 'unknown' || row.status === 'voucher_hold') open += 1;
    return {
      row,
      booking,
      kind,
      payment,
      creditAmount: collectionCreditAmount(row),
      transferAmount: collectionTransferAmount(row),
      maxHit,
      bankHit
    };
  });

  return {
    month,
    collectionCount: rows.length,
    bookingCount: monthBookings.length,
    stayCount: uniqueStays(monthBookings, units).length,
    calendarMatched: withCalendar.length,
    firstBookingDate,
    lastCollectionDate,
    collectionWithoutCalendar: collectionUnmatched,
    collectionBeforeCalendar,
    calendarWithoutCollection: calendarUnmatched,
    calendarAfterReport,
    calendarByCollection,
    paymentRows,
    totals: {
      calendarMatched: withCalendar.length,
      collectionWithoutCalendar: collectionUnmatched.length,
      collectionBeforeCalendar: collectionBeforeCalendar.length,
      calendarWithoutCollection: calendarUnmatched.length,
      calendarAfterReport: calendarAfterReport.length,
      maxMatched,
      creditUnmatched,
      transfers,
      cash,
      open
    }
  };
}

export function paymentStatusLabel(payment) {
  if (payment === 'hyp' || payment === 'max') return 'יש אסמכתת Hyp';
  if (payment === 'credit_unmatched') return 'חסרה אסמכתת Hyp';
  if (payment === 'bank') return 'יש העברה בחשבון';
  if (payment === 'transfer') return 'העברה בדוח — בלי שורת בנק';
  if (payment === 'cash') return 'מזומן בדוח היומי';
  if (payment === 'voucher') return 'שובר בדוח היומי';
  if (payment === 'ota') return 'OTA בדוח היומי';
  return 'חסר פירוט תשלום בדוח';
}

export function paymentClearingLines(payment, maxHit, booking, bankHit) {
  const lines = listClearingPayments(booking).map((row) => paymentClearingLine(row));
  if (bankHit?.tx) {
    const bank = bankClearingLine(bankHit.tx);
    if (bank.line && !lines.some((row) => row.ref && row.ref === bank.ref)) lines.push(bank);
  }
  if (lines.length) return lines;
  if (payment === 'transfer') return [{ account: 'העברה בנקאית', ref: '', line: 'העברה בדוח היומי · אין שורה בחשבון' }];
  if (payment === 'cash') return [{ account: 'מזומן בשטח', ref: '', line: 'מזומן בשטח · אין אסמכתה' }];
  return [];
}

export function paymentClearingLabel(payment, maxHit, booking, bankHit) {
  return paymentClearingLines(payment, maxHit, booking, bankHit).map((row) => row.line).join(' · ');
}

export function journalStatusLabel(booking, row, { firstBookingDate } = {}) {
  if (booking) return 'יש יומן כינורות';
  if (paymentKind(row) === 'ota') return 'Booking — לא בכינורות';
  if (firstBookingDate && row?.stayDate && row.stayDate < firstBookingDate) {
    return 'לפני סנכרון כינורות';
  }
  return 'אין יומן כינורות';
}

export function paymentProofOf(row, maxHit, booking, bankHit) {
  const kind = paymentKind(row);
  if (kind === 'credit' && hasHypProof(booking)) return 'hyp';
  if (kind === 'credit') return 'credit_unmatched';
  if (kind === 'transfer' && bankHit) return 'bank';
  return kind;
}

export function paymentReceived(row, booking, bankHit) {
  if (row?.status === 'paid') return true;
  if (hasHypProof(booking)) return true;
  if (bankHit) return true;
  const kind = paymentKind(row);
  return kind === 'ota' || kind === 'cash' || kind === 'voucher';
}

export function moneyGaps(row, booking, maxHit, { bankHit } = {}) {
  const parts = [];
  const proof = paymentProofOf(row, maxHit, booking, bankHit);
  const kind = paymentKind(row);
  const received = hasHypProof(booking) || Boolean(bankHit);
  if (row?.status === 'unpaid' && !received) parts.push('לא שולם בדוח היומי');
  if (kind === 'credit' && proof === 'credit_unmatched') parts.push('חסרה אסמכתת Hyp');
  return parts;
}

export function registryNotes(row, booking, { firstBookingDate, bankHit } = {}) {
  const notes = [];
  if (paymentKind(row) === 'ota' && !booking) {
    notes.push('Booking — בלי יומן כינורות');
  } else if (!booking) {
    if (firstBookingDate && row?.stayDate && row.stayDate < firstBookingDate) {
      notes.push('רישום: לפני סנכרון כינורות');
    } else {
      notes.push('רישום: בלי יומן כינורות');
    }
  }
  if (row?.status === 'unpaid' && (hasHypProof(booking) || bankHit)) {
    notes.push('רישום: עדיין לא עודכן בדוח היומי');
  }
  return notes;
}

export function missingParts(row, booking, maxHit, coverage = {}) {
  return moneyGaps(row, booking, maxHit, coverage);
}

export function missingLabel(row, booking, maxHit, coverage = {}) {
  const money = moneyGaps(row, booking, maxHit, coverage);
  if (money.length) return money.join(' · ');
  if (paymentReceived(row, booking, coverage.bankHit)) return 'הכל הותאם';
  return registryNotes(row, booking, coverage).join(' · ') || 'הכל הותאם';
}
