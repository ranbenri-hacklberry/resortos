export const MAX_MERCHANT_ID = '1086759';
export const HYP_TERMINAL_ID = '4502210929';
export const HYP_TERMINAL_A = '4502210929';
export const HYP_TERMINAL_B = '4502315932';
export const HYP_TERMINALS = [HYP_TERMINAL_A, HYP_TERMINAL_B];
export const BEINLEUMI_ACCOUNT = '31-92-395140';

export function hypAccountOf(terminalId) {
  const id = String(terminalId || '').trim();
  const known = HYP_TERMINALS.includes(id) ? id : '';
  return {
    key: known ? `HYP_${known}` : 'MAX_HYP',
    label: known ? `Hyp מסוף ${known}` : 'Hyp',
    detail: `מקס ${MAX_MERCHANT_ID}`,
    terminalId: known || id,
    merchantId: MAX_MERCHANT_ID,
    acquirer: 'MAX'
  };
}

export const CLEARING_ACCOUNTS = {
  MAX_HYP: {
    id: 'max-hyp-4502210929',
    label: `Hyp מסוף ${HYP_TERMINAL_A}`,
    detail: `מקס ${MAX_MERCHANT_ID}`,
    merchantId: MAX_MERCHANT_ID,
    terminalId: HYP_TERMINAL_A,
    acquirer: 'MAX'
  },
  HYP_4502210929: {
    id: 'hyp-4502210929',
    label: `Hyp מסוף ${HYP_TERMINAL_A}`,
    detail: `מקס ${MAX_MERCHANT_ID}`,
    merchantId: MAX_MERCHANT_ID,
    terminalId: HYP_TERMINAL_A,
    acquirer: 'MAX'
  },
  HYP_4502315932: {
    id: 'hyp-4502315932',
    label: `Hyp מסוף ${HYP_TERMINAL_B}`,
    detail: `מקס ${MAX_MERCHANT_ID}`,
    merchantId: MAX_MERCHANT_ID,
    terminalId: HYP_TERMINAL_B,
    acquirer: 'MAX'
  },
  MAX: {
    id: 'max-1086759',
    label: `מקס ${MAX_MERCHANT_ID}`,
    detail: 'מיאליס ריזורט בע״מ',
    merchantId: MAX_MERCHANT_ID
  },
  BEINLEUMI: {
    id: 'beinleumi-395140',
    label: `בינלאומי ${BEINLEUMI_ACCOUNT}`,
    detail: 'חח״ד עיסקי'
  },
  CASH: {
    id: 'cash',
    label: 'מזומן בשטח',
    detail: ''
  },
  BANK: {
    id: 'bank',
    label: 'העברה בנקאית',
    detail: ''
  }
};

export function formatIlsFromAgorot(agorot) {
  const n = Math.round(Number(agorot || 0)) / 100;
  return `₪${n.toLocaleString('he-IL')}`;
}

export function normalizeClearingPayment(raw = {}) {
  const terminalId = String(raw.terminalId || '').trim();
  const hyp = (raw.source === 'HYP' || terminalId || String(raw.accountKey || '').startsWith('HYP') || raw.accountKey === 'MAX_HYP')
    ? hypAccountOf(terminalId || (raw.accountKey === 'MAX_HYP' ? HYP_TERMINAL_A : ''))
    : null;
  const accountKey = hyp?.key
    || raw.accountKey
    || (raw.batchId || raw.merchantId === MAX_MERCHANT_ID ? 'MAX' : '')
    || (raw.source === 'CASH' || raw.accountKey === 'CASH' ? 'CASH' : '')
    || (raw.source === 'BANK' || raw.accountKey === 'BANK' ? 'BANK' : '')
    || (raw.source === 'BEINLEUMI' ? 'BEINLEUMI' : '');
  const account = CLEARING_ACCOUNTS[accountKey] || hyp || null;
  const ref = String(raw.ref || raw.auth || raw.batchId || raw.reference || '').trim();
  const amountAgorot = Number.isFinite(Number(raw.amount_agorot))
    ? Number(raw.amount_agorot)
    : Math.round(Number(raw.amount || 0) * 100);
  return {
    source: raw.source || (hyp ? 'HYP' : accountKey) || 'UNKNOWN',
    accountKey: accountKey || raw.accountKey || '',
    accountLabel: hyp?.label || raw.accountLabel || account?.label || 'חשבון סליקה',
    accountDetail: hyp?.detail || raw.accountDetail || account?.detail || '',
    merchantId: raw.merchantId || account?.merchantId || '',
    terminalId: terminalId || account?.terminalId || '',
    acquirer: raw.acquirer || account?.acquirer || '',
    ref,
    txn: String(raw.txn || raw.id || '').trim(),
    invoice: String(raw.invoice || raw.hesh || '').trim(),
    depositApproval: String(raw.depositApproval || '').trim(),
    amount_agorot: amountAgorot,
    date: raw.date || '',
    last4: raw.last4 || '',
    brand: raw.brand || '',
    collector: String(raw.collector || raw.collected_by || '').trim(),
    collected_at: raw.collected_at || raw.at || raw.date || ''
  };
}

export function hypPaymentFromRow(row = {}) {
  const hyp = hypAccountOf(row.terminalId);
  return normalizeClearingPayment({
    source: 'HYP',
    accountKey: hyp.key,
    accountLabel: hyp.label,
    accountDetail: hyp.detail,
    merchantId: MAX_MERCHANT_ID,
    terminalId: hyp.terminalId || row.terminalId,
    acquirer: row.acquirer || 'MAX',
    ref: row.ref || '',
    txn: row.txn || '',
    invoice: row.invoice || '',
    depositApproval: row.depositApproval || '',
    amount: row.amount || 0,
    date: row.date || '',
    last4: row.last4 || '',
    brand: row.brand || ''
  });
}

export function hypPaymentFromResult(result = {}, extras = {}) {
  return normalizeClearingPayment({
    source: 'HYP',
    accountKey: 'MAX_HYP',
    ref: result.auth || extras.ref || '',
    txn: result.id || extras.txn || '',
    invoice: result.hesh || extras.invoice || '',
    amount: result.amount || extras.amount || 0,
    last4: result.last4 || extras.last4 || '',
    brand: result.brand || extras.brand || '',
    date: extras.date || new Date().toISOString().slice(0, 10),
    terminalId: extras.terminalId || HYP_TERMINAL_ID,
    merchantId: MAX_MERCHANT_ID,
    acquirer: 'MAX'
  });
}

export function maxPaymentFromTx(tx = {}) {
  return normalizeClearingPayment({
    source: 'MAX',
    accountKey: 'MAX',
    ref: tx.batchId || '',
    batchId: tx.batchId || '',
    amount: tx.gross || 0,
    date: tx.depositDate || tx.creditDate || '',
    last4: tx.cardLast4 || '',
    brand: tx.brand || '',
    merchantId: MAX_MERCHANT_ID
  });
}

export function mergeClearingPayments(existing, incoming) {
  const list = (Array.isArray(existing) ? existing : []).map(normalizeClearingPayment);
  for (const raw of (Array.isArray(incoming) ? incoming : [incoming]).filter(Boolean)) {
    const next = normalizeClearingPayment(raw);
    const key = next.txn || `${next.ref}|${next.amount_agorot}|${next.date}`;
    const idx = list.findIndex((row) => {
      const rowKey = row.txn || `${row.ref}|${row.amount_agorot}|${row.date}`;
      return key && rowKey === key;
    });
    if (idx >= 0) list[idx] = { ...list[idx], ...next };
    else list.push(next);
  }
  return list;
}

export function listClearingPayments(booking) {
  const stored = Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [];
  if (stored.length) return stored.map(normalizeClearingPayment);
  const hyp = booking?.stay?.hyp;
  if (hyp?.paid || hyp?.auth || hyp?.id) {
    return [hypPaymentFromResult(hyp, { amount: hyp.amount, date: String(hyp.at || '').slice(0, 10) })];
  }
  if (booking?.payment_mode === 'CASH' || booking?.payment_status === 'PENDING_CASH') {
    return [normalizeClearingPayment({
      source: 'CASH',
      accountKey: 'CASH',
      amount_agorot: Number(booking.deposit_agorot || booking.total_price_agorot || 0)
    })];
  }
  if (booking?.payment_mode === 'BANK_TRANSFER' || booking?.payment_status === 'PENDING_BANK') {
    return [normalizeClearingPayment({
      source: 'BANK',
      accountKey: 'BANK',
      amount_agorot: Number(booking.deposit_agorot || booking.total_price_agorot || 0)
    })];
  }
  return [];
}

export function paymentClearingLine(payment) {
  const row = normalizeClearingPayment(payment);
  const account = [row.accountLabel, row.accountDetail].filter(Boolean).join(' · ');
  return {
    account: account || row.accountLabel || '—',
    ref: row.ref || '',
    line: row.ref
      ? `${account || row.accountLabel} · אסמכתה ${row.ref}`
      : `${account || row.accountLabel} · אין אסמכתה`
  };
}

export function maxClearingLine(tx) {
  return paymentClearingLine(maxPaymentFromTx(tx));
}
