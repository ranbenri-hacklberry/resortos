import { hasRecordedReceipt, isFullyPaid, kinorotSettlementKind } from './bookingPaid';
import { israelToday } from './cabinAccess';
import { mergeClearingPayments, normalizeClearingPayment } from './clearingPayments';
import { formatStayHourLabel, stayHoursFromBooking } from './kinorotStayHours';
import { db } from './resortos-db';
import { pushBookingToCloud } from './cloudDb';

export const PAYMENT_STATUSES = [
  { key: 'UNPAID', label: 'לא שולם' },
  { key: 'PAID', label: 'שולם' },
  { key: 'PARTIAL', label: 'שולם חלקית' }
];

export const PAYMENT_METHODS = [
  { key: 'CASH', label: 'מזומן', mode: 'CASH' },
  { key: 'CARD', label: 'אשראי', mode: 'CARD' },
  { key: 'CARD_CASH', label: 'אשראי + מזומן', mode: 'CARD_CASH' },
  { key: 'BANK', label: 'העברה', mode: 'BANK_TRANSFER' },
  { key: 'VOUCHER', label: 'שובר', mode: 'VOUCHER' },
  { key: 'OFFSET', label: 'קיזוז', mode: 'OFFSET' },
  { key: 'BOOKING', label: 'בוקינג', mode: 'BOOKING' },
  { key: 'AIRBNB', label: 'Airbnb', mode: 'AIRBNB' }
];

export function priorityStatusKey(booking) {
  if (!booking) return '';
  const status = String(booking.payment_status || '').toUpperCase();
  if (status === 'PAID') return 'PAID';
  if (status === 'PARTIAL' || status === 'DEPOSIT_PAID') return 'PARTIAL';
  return 'UNPAID';
}

function israelClock(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  return {
    hour: Number(parts.find((part) => part.type === 'hour')?.value),
    minute: Number(parts.find((part) => part.type === 'minute')?.value)
  };
}

function isAtCheckin(booking, now) {
  const ymd = String(booking?.check_in_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || israelToday(now) !== ymd) return false;
  const label = formatStayHourLabel(stayHoursFromBooking(booking).checkin) || '15:00';
  const match = label.match(/^(\d{2}):(\d{2})$/);
  const hour = match ? Number(match[1]) : 15;
  const minute = match ? Number(match[2]) : 0;
  const clock = israelClock(now);
  return clock.hour > hour || (clock.hour === hour && clock.minute >= minute);
}

function hasPaymentRecord(booking) {
  if (kinorotSettlementKind(booking)) return true;
  if (String(booking?.payment_mode || '').trim()) return true;
  if (hasRecordedReceipt(booking)) return true;
  const status = String(booking?.payment_status || '').toUpperCase();
  return Boolean(status && status !== 'UNPAID');
}

/** Shekel on the Priority board only during check-in, and only while payment is still open. */
export function priorityShekelMark(booking, now = new Date()) {
  if (!booking || !isAtCheckin(booking, now)) return '';
  if (isFullyPaid(booking) || kinorotSettlementKind(booking)) return '';
  const mode = String(booking.payment_mode || '').toUpperCase();
  if (mode === 'CASH') return 'blink';
  if (!hasPaymentRecord(booking)) return 'steady';
  return '';
}

export function priorityMethodLabel(methodKey) {
  return PAYMENT_METHODS.find((row) => row.key === methodKey)?.label || 'לא צוין';
}

function clearingKind(raw) {
  const row = normalizeClearingPayment(raw);
  const method = String(raw?.method || '').toLowerCase();
  const txn = String(row.txn || '');
  if (row.source === 'CASH' || row.accountKey === 'CASH' || method === 'cash' || /_cash$/.test(txn)) return 'cash';
  if (row.source === 'BANK' || row.accountKey === 'BANK' || method === 'bank' || /_bank$/.test(txn)) return 'bank';
  if (row.source === 'VOUCHER' || method === 'voucher') return 'voucher';
  if (row.source === 'OFFSET' || method === 'offset') return 'offset';
  if (row.source === 'BOOKING') return 'booking';
  if (row.source === 'AIRBNB') return 'airbnb';
  if (
    row.source === 'CARD'
    || row.source === 'HYP'
    || row.source === 'MAX'
    || row.accountKey === 'MAX'
    || method === 'card'
    || /_card$/.test(txn)
  ) return 'card';
  return '';
}

export function paymentParts(booking) {
  const parts = { card: 0, cash: 0, bank: 0, voucher: 0, offset: 0, booking: 0, airbnb: 0 };
  for (const raw of Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : []) {
    const kind = clearingKind(raw);
    if (!kind) continue;
    parts[kind] += Number(normalizeClearingPayment(raw).amount_agorot) || 0;
  }
  return parts;
}

export function paymentBreakdown(booking, cashAgorot = null) {
  const parts = paymentParts(booking);
  const cash = Number.isFinite(cashAgorot) ? cashAgorot : parts.cash;
  const lines = [];
  if (parts.card > 0) lines.push(`אשראי ${formatPriorityShekels(parts.card)}`);
  if (cash > 0) lines.push(`מזומן ${formatPriorityShekels(cash)}`);
  if (parts.bank > 0) lines.push(`העברה ${formatPriorityShekels(parts.bank)}`);
  return lines.length > 1 ? lines.join(' · ') : '';
}

export function priorityMethodKey(booking) {
  if (!booking) return '';
  if (kinorotSettlementKind(booking) === 'voucher') return 'VOUCHER';
  const mode = String(booking.payment_mode || '').toUpperCase();
  if (mode === 'AIRBNB') return 'AIRBNB';
  if (mode === 'BOOKING' || kinorotSettlementKind(booking) === 'booking') return 'BOOKING';
  if (mode === 'VOUCHER') return 'VOUCHER';
  if (mode === 'OFFSET') return 'OFFSET';
  const parts = paymentParts(booking);
  if (parts.card > 0 && parts.cash > 0) return 'CARD_CASH';
  if (mode === 'CARD_CASH') return 'CARD_CASH';
  if (parts.cash > 0 && parts.card === 0 && parts.bank === 0) return 'CASH';
  if (parts.card > 0) return 'CARD';
  if (parts.bank > 0) return 'BANK';
  if (mode === 'CASH' || mode === 'CASH_TRUST') return 'CASH';
  if (mode === 'BANK_TRANSFER') return 'BANK';
  if (mode === 'CARD' || mode === 'CREDIT_FULL' || mode === 'CREDIT_DEPOSIT') return 'CARD';
  return '';
}

export function formatPriorityShekels(agorot) {
  const shekels = Math.round(Number(agorot || 0)) / 100;
  const text = Number.isInteger(shekels)
    ? shekels.toLocaleString('he-IL')
    : shekels.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text} ₪`;
}

export function parsePriorityShekels(raw) {
  const text = String(raw ?? '').replace(/₪/g, '').replace(/\s/g, '').trim();
  if (!text) return null;
  const grouped = text.match(/^(\d{1,3}(?:,\d{3})+)(\.\d+)?$/);
  const plain = text.match(/^(\d+)(\.\d+)?$/);
  const match = grouped || plain;
  if (!match) return null;
  const shekels = Number(`${match[1].replace(/,/g, '')}${match[2] || ''}`);
  if (!Number.isFinite(shekels) || shekels < 0) return null;
  return Math.round(shekels * 100);
}

function clearingIsCash(raw) {
  const row = normalizeClearingPayment(raw);
  const method = String(raw?.method || '').toLowerCase();
  const txn = String(row.txn || '');
  return row.source === 'CASH' || row.accountKey === 'CASH' || method === 'cash' || /_cash$/.test(txn);
}

export function cashCollectedAgorot(booking) {
  return (Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [])
    .filter(clearingIsCash)
    .reduce((sum, raw) => sum + (Number(normalizeClearingPayment(raw).amount_agorot) || 0), 0);
}

export function priorityPayLabel({ status, method, amountAgorot, collectedAgorot = 0 }) {
  if (!status) return '';
  const collected = method === 'CASH' && Number(collectedAgorot) > 0
    ? ` · נגבה ${formatPriorityShekels(collectedAgorot)}`
    : '';
  if (status === 'PAID') {
    const methodLabel = PAYMENT_METHODS.find((row) => row.key === method)?.label || '';
    return `${methodLabel ? `שולם (${methodLabel})` : 'שולם'}${collected}`;
  }
  const money = Number(amountAgorot) > 0 ? ` (${formatPriorityShekels(amountAgorot)})` : '';
  if (status === 'PARTIAL') return `שולם חלקית${money}${collected}`;
  return `לא שולם${money}${collected}`;
}

export function priorityPayTone(status) {
  if (status === 'PAID') return 'pay-ok';
  if (status === 'PARTIAL') return 'pay-wait';
  if (status === 'UNPAID') return 'pay-bad';
  return '';
}

function clearingSum(booking) {
  return (Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [])
    .reduce((sum, row) => sum + (Number(normalizeClearingPayment(row).amount_agorot) || 0), 0);
}

function methodMode(methodKey) {
  return PAYMENT_METHODS.find((row) => row.key === methodKey)?.mode || '';
}

function withoutDeskSettlement(booking) {
  const list = (Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [])
    .filter((row) => !String(row?.txn || '').startsWith('priority_settle_'));
  return { ...booking, clearing_payments: list };
}

function settlePaidBalance(booking, today, collector, methodKey) {
  const stripped = withoutDeskSettlement(booking);
  if (stripped.payment_status !== 'PAID') return { booking: stripped, collectedAgorot: 0 };
  if (stripped.payment_mode === 'CASH' || stripped.payment_mode === 'CASH_TRUST') {
    const cashDue = Math.max(0, (Number(stripped.total_price_agorot) || 0) - clearingSum(stripped));
    if (!(cashDue > 0)) return { booking: stripped, collectedAgorot: 0 };
    return withCashReceipt(stripped, today, collector, cashDue);
  }
  const total = Number(stripped.total_price_agorot) || 0;
  const due = Math.max(0, total - clearingSum(stripped));
  if (!(due > 0)) return { booking: stripped, collectedAgorot: 0 };
  if (stripped.payment_mode === 'CARD_CASH' || methodKey === 'CARD_CASH') {
    if (!(due > 0)) return { booking: { ...stripped, payment_mode: 'CARD_CASH' }, collectedAgorot: 0 };
    const cash = withCashReceipt({ ...stripped, payment_mode: 'CARD_CASH' }, today, collector, due);
    return {
      booking: { ...cash.booking, payment_mode: 'CARD_CASH' },
      collectedAgorot: cash.collectedAgorot
    };
  }
  const source = ['CARD', 'BANK', 'VOUCHER', 'BOOKING', 'AIRBNB'].includes(methodKey) ? methodKey : 'DESK';
  const payment = {
    source,
    accountKey: source,
    amount_agorot: due,
    date: today,
    collector: collector || 'משרד',
    payer_name: stripped.guest_name || '',
    collected_at: `${today}T12:00:00`,
    txn: `priority_settle_${source.toLowerCase()}_${stripped.id}`
  };
  return {
    booking: {
      ...stripped,
      clearing_payments: mergeClearingPayments(stripped.clearing_payments, payment)
    },
    collectedAgorot: due
  };
}

function withCashReceipt(booking, today, collector, amountAgorot) {
  const total = Number(booking.total_price_agorot) || 0;
  const amount = Number.isFinite(amountAgorot) ? amountAgorot : Math.max(0, total - clearingSum(booking));
  if (!(amount > 0)) return { booking, collectedAgorot: 0 };
  const payment = {
    source: 'CASH',
    accountKey: 'CASH',
    amount_agorot: amount,
    date: today,
    collector: collector || 'משרד',
    payer_name: booking.guest_name || '',
    collected_at: `${today}T12:00:00`,
    txn: `priority_cash_${booking.id}_${today}`
  };
  return {
    booking: {
      ...booking,
      clearing_payments: mergeClearingPayments(booking.clearing_payments, payment),
      cash_collected_by: payment.collector,
      cash_receipt_at: booking.cash_receipt_at || new Date().toISOString()
    },
    collectedAgorot: amount
  };
}

export function applyPriorityPayment(booking, { totalAgorot, statusKey, methodKey, today, collector, collectedAgorot } = {}) {
  if (!booking) return { booking: null, collectedAgorot: 0 };
  let next = {
    ...booking,
    updated_at: new Date().toISOString()
  };
  if (Number.isFinite(totalAgorot)) next.total_price_agorot = totalAgorot;
  if (statusKey) next.payment_status = statusKey;
  if (methodKey && methodMode(methodKey)) next.payment_mode = methodMode(methodKey);
  if (Number.isFinite(collectedAgorot)) {
    const written = collectedAgorot > 0 ? withCashReceipt(next, today, collector, collectedAgorot) : { booking: next, collectedAgorot: 0 };
    next = written.booking;
    const covered = clearingSum(next);
    const total = Number(next.total_price_agorot) || 0;
    if (!statusKey) {
      next.payment_status = covered <= 0 ? 'UNPAID' : (total > 0 && covered + 50 >= total ? 'PAID' : 'PARTIAL');
    }
    const inferred = priorityMethodKey({ ...next, payment_mode: methodKey === 'BOOKING' || methodKey === 'AIRBNB' || methodKey === 'VOUCHER' ? next.payment_mode : '' });
    if (inferred && (!methodKey || methodKey === 'CASH' || methodKey === 'CARD' || methodKey === 'CARD_CASH')) {
      next.payment_mode = methodMode(inferred) || next.payment_mode;
    }
    if (next.payment_status === 'PAID') {
      const settled = settlePaidBalance(next, today, collector, priorityMethodKey(next));
      return { booking: settled.booking, collectedAgorot: written.collectedAgorot || settled.collectedAgorot };
    }
    return { booking: next, collectedAgorot: written.collectedAgorot };
  }
  if (next.payment_status === 'PAID') {
    return settlePaidBalance(next, today, collector, methodKey);
  }
  if (statusKey && statusKey !== 'PAID') {
    return { booking: withoutDeskSettlement(next), collectedAgorot: 0 };
  }
  return { booking: next, collectedAgorot: 0 };
}

export function collectPriorityCash(booking, { today, collector, totalAgorot, collectedAgorot } = {}) {
  const total = Number.isFinite(totalAgorot) ? totalAgorot : Number(booking?.total_price_agorot) || 0;
  const specified = Number.isFinite(collectedAgorot) ? collectedAgorot : null;
  const already = paymentParts(booking);
  const other = already.card + already.bank + already.voucher + already.booking + already.airbnb;
  const remainder = Math.max(0, total - other - already.cash);
  const projectedCash = specified == null ? remainder : specified;
  const covered = other + (specified == null ? already.cash + remainder : Math.max(0, specified));
  const statusKey = covered <= 0
    ? 'UNPAID'
    : (total > 0 && covered + 50 >= total ? 'PAID' : 'PARTIAL');
  const hasCard = already.card > 0 && (projectedCash > 0 || already.cash > 0);
  return applyPriorityPayment(booking, {
    totalAgorot: total,
    statusKey,
    methodKey: hasCard ? 'CARD_CASH' : 'CASH',
    today,
    collector,
    collectedAgorot: specified == null ? undefined : specified
  });
}

/** Keep a typed amount on the open guest card. A draft for another booking stays off this card. */
export function applyPaymentDraft(card, draft) {
  if (!card) return card;
  const pay = draft && (!draft.paymentBookingId || draft.paymentBookingId === card.bookingId) ? draft : null;
  if (!pay || (pay.amountText == null && pay.collectedText == null && !pay.payStatus && !pay.payMethod)) return card;
  const amount = pay.amountText != null ? parsePriorityShekels(pay.amountText) : null;
  const collected = pay.collectedText != null ? parsePriorityShekels(pay.collectedText) : null;
  const cardPart = Math.max(0, (Number(card.paidAgorot) || 0) - (Number(card.cashCollectedAgorot) || 0));
  const totalAgorot = amount == null ? Number(card.amountAgorot) || 0 : amount;
  const cashAgorot = collected == null ? Number(card.cashCollectedAgorot) || 0 : collected;
  let payStatus = pay.payStatus || card.payStatus;
  let payMethod = pay.payMethod || card.payMethod;
  if (collected != null && !pay.payStatus) {
    const covered = cardPart + cashAgorot;
    payStatus = covered <= 0 ? 'UNPAID' : (totalAgorot > 0 && covered + 50 >= totalAgorot ? 'PAID' : 'PARTIAL');
  }
  if (collected != null && !pay.payMethod && cardPart > 0 && cashAgorot > 0) payMethod = 'CARD_CASH';
  const paidAgorot = payStatus === 'PAID'
    ? totalAgorot
    : collected == null
      ? card.paidAgorot
      : Math.max(0, cardPart + cashAgorot);
  return {
    ...card,
    amountText: pay.amountText != null ? pay.amountText : card.amountText,
    collectedText: pay.collectedText != null ? pay.collectedText : card.collectedText,
    payStatus,
    payMethod,
    amountAgorot: totalAgorot,
    cashCollectedAgorot: cashAgorot,
    paidAgorot,
    payBreakdown: cardPart > 0 && cashAgorot > 0
      ? `אשראי ${formatPriorityShekels(cardPart)} · מזומן ${formatPriorityShekels(cashAgorot)}`
      : (card.payBreakdown || '')
  };
}

export function paymentDraftDirty(row, draft) {
  if (!row?.bookingId || !draft) return false;
  if (draft.payStatus && draft.payStatus !== row.payStatus) return true;
  if (draft.payMethod && draft.payMethod !== row.payMethod) return true;
  if (draft.amountText != null) {
    const parsed = String(draft.amountText).trim() === '' ? 0 : parsePriorityShekels(draft.amountText);
    if (parsed != null && parsed !== Number(row.amountAgorot || 0)) return true;
  }
  if (draft.collectedText != null) {
    const parsed = String(draft.collectedText).trim() === '' ? 0 : parsePriorityShekels(draft.collectedText);
    if (parsed != null && parsed !== Number(row.cashCollectedAgorot || 0)) return true;
  }
  return false;
}

async function persistPriorityBooking(booking) {
  await db.bookings.put(booking);
  await pushBookingToCloud(booking, { allowOverlap: true });
}

export async function savePriorityPaymentDrafts({
  rows,
  bookings,
  drafts,
  today,
  collector,
  persistBooking = persistPriorityBooking
}) {
  const saved = [];
  const failed = [];
  for (const [unitId, draft] of Object.entries(drafts || {})) {
    const row = (rows || []).find((item) => item.id === unitId);
    const bookingId = draft.paymentBookingId || row?.bookingId;
    const booking = (bookings || []).find((item) => item.id === bookingId);
    if (!booking) {
      if (!paymentDraftDirty(row, draft)) continue;
      failed.push({ unitId, name: row?.name || unitId, error: 'אין הזמנה פעילה' });
      continue;
    }
    const payRow = bookingId === row?.bookingId
      ? row
      : {
        ...row,
        bookingId,
        amountAgorot: Number(booking.total_price_agorot) || 0,
        cashCollectedAgorot: cashCollectedAgorot(booking),
        payStatus: priorityStatusKey(booking),
        payMethod: priorityMethodKey(booking)
      };
    if (!paymentDraftDirty(payRow, draft)) continue;
    const parsed = draft.amountText == null
      ? null
      : (String(draft.amountText).trim() === '' ? 0 : parsePriorityShekels(draft.amountText));
    const collected = draft.collectedText == null
      ? null
      : (String(draft.collectedText).trim() === '' ? 0 : parsePriorityShekels(draft.collectedText));
    if ((draft.amountText != null && parsed == null) || (draft.collectedText != null && collected == null)) {
      failed.push({ unitId, name: row.name || unitId, error: 'הסכום לא תקין' });
      continue;
    }
    try {
      const { booking: next } = applyPriorityPayment(booking, {
        totalAgorot: parsed == null ? undefined : parsed,
        statusKey: draft.payStatus || undefined,
        methodKey: draft.payMethod || undefined,
        collectedAgorot: collected == null ? undefined : collected,
        today,
        collector
      });
      await persistBooking(next);
      saved.push(unitId);
    } catch (err) {
      failed.push({ unitId, name: row.name || unitId, error: err?.message || 'השמירה נכשלה' });
    }
  }
  return { saved, failed };
}
