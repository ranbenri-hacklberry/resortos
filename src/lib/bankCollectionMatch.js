import { collectionTransferAmount, providerLabel } from './cashFlowForecast';
import { BEINLEUMI_ACCOUNT } from './clearingPayments';

const LIVE_BANKS = new Set(['mizrahi', 'discount', 'beinleumi']);

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

function dayDelta(a, b) {
  if (!a || !b) return 999;
  const left = new Date(`${a}T12:00:00`).getTime();
  const right = new Date(`${b}T12:00:00`).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return 999;
  return Math.round(Math.abs(left - right) / 86400000);
}

function tokens(value) {
  return String(value || '')
    .replace(/ו\/או.*$/, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length >= 2);
}

function overlap(a, b) {
  const left = new Set(tokens(a));
  return tokens(b).filter((part) => left.has(part)).length;
}

export function payerFromBankDesc(description) {
  const text = String(description || '').trim();
  const named = text.match(/זיכוי\s+מ\S*\s+מ(.+)$/);
  if (named) return named[1].replace(/ו\/או.*$/, '').trim();
  const bit = text.match(/ביט[^\p{L}]*([\p{L}\s]+)/u);
  if (bit) return bit[1].trim();
  return '';
}

export function incomingBankRows(beinleumiPayload, liveTransactions = []) {
  const fromStatement = (beinleumiPayload?.rows || [])
    .filter((row) => Number(row.amount) > 0 && (row.category === 'credit' || /זיכוי|ביט/.test(row.description || '')))
    .map((row) => ({
      id: row.id,
      date: row.date,
      amount: Number(row.amount) || 0,
      description: row.description || '',
      reference: String(row.reference || '').trim(),
      providerId: 'beinleumi',
      accountLabel: `בינלאומי ${BEINLEUMI_ACCOUNT}`,
      payer: payerFromBankDesc(row.description)
    }));
  const fromLive = (liveTransactions || [])
    .filter((tx) => {
      if (Number(tx.amount) <= 0) return false;
      if (tx.type && /DEBIT|CHARGE|WITHDRAW/i.test(String(tx.type))) return false;
      const provider = String(tx.providerId || '');
      if (LIVE_BANKS.has(provider)) return true;
      return /זיכוי|העברה|ביט|הפקד|מזומן|שיק|צ['׳]?ק/.test(`${tx.description || ''} ${tx.merchantName || ''}`);
    })
    .map((tx) => {
      const description = [tx.merchantName, tx.description]
        .map((part) => String(part || '').trim())
        .filter((part, index, all) => part && all.indexOf(part) === index)
        .join(' ');
      return {
        id: tx.id || tx.SK,
        date: String(tx.transactionDate || tx.bookingDate || '').slice(0, 10),
        amount: Number(tx.amount) || 0,
        description,
        reference: String(tx.reference || tx.id || '').trim(),
        providerId: tx.providerId || '',
        accountLabel: tx.providerId === 'beinleumi'
          ? `בינלאומי ${BEINLEUMI_ACCOUNT}`
          : providerLabel(tx.providerId),
        category: tx.category || '',
        subcategory: tx.subcategory || '',
        payer: payerFromBankDesc(description)
      };
    });
  const seen = new Set();
  const merged = [];
  for (const row of [...fromStatement, ...fromLive]) {
    const key = `${row.date}|${cents(row.amount)}|${row.reference}|${row.description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

export function matchBankToCollection(collectionRows, bankRows, { maxDateDelta = 10 } = {}) {
  const candidates = (collectionRows || [])
    .map((row) => ({ row, amount: collectionTransferAmount(row), amountCents: cents(collectionTransferAmount(row)) }))
    .filter((item) => item.amountCents > 0);
  const unused = new Set((bankRows || []).map((tx) => tx.id));
  const byAmount = new Map();
  for (const tx of bankRows || []) {
    const key = cents(tx.amount);
    if (!byAmount.has(key)) byAmount.set(key, []);
    byAmount.get(key).push(tx);
  }

  const matches = [];
  const queue = candidates
    .map((item) => {
      const options = (byAmount.get(item.amountCents) || [])
        .map((tx) => {
          const delta = dayDelta(item.row.stayDate, tx.date);
          const nameHit = overlap(`${item.row.guestName} ${item.row.notes}`, `${tx.payer} ${tx.description}`);
          return { tx, delta, nameHit, score: (delta <= 1 ? 6 : delta <= 3 ? 4 : delta <= maxDateDelta ? 2 : 0) + nameHit * 3 };
        })
        .filter((opt) => opt.delta <= maxDateDelta)
        .sort((a, b) => b.score - a.score || a.delta - b.delta);
      return { ...item, options };
    })
    .filter((item) => item.options.length)
    .sort((a, b) => a.options.length - b.options.length || a.amountCents - b.amountCents);

  const usedCollection = new Set();
  for (const item of queue) {
    if (usedCollection.has(item.row.id)) continue;
    const hit = item.options.find((opt) => unused.has(opt.tx.id) && opt.score >= 2);
    if (!hit) continue;
    unused.delete(hit.tx.id);
    usedCollection.add(item.row.id);
    matches.push({
      collectionId: item.row.id,
      collection: item.row,
      amount: item.amount,
      tx: hit.tx,
      dateDelta: hit.delta,
      nameHit: hit.nameHit
    });
  }

  const byCollectionId = {};
  for (const match of matches) byCollectionId[match.collectionId] = match;
  return {
    matches,
    byCollectionId,
    totals: {
      collectionTransfers: candidates.length,
      matched: matches.length,
      unmatchedCollection: candidates.length - matches.length
    }
  };
}

function depositText(description, category = '') {
  return `${description || ''} ${category || ''}`;
}

export function isCheckDepositDesc(description, category = '') {
  const text = depositText(description, category);
  if (/CHQ_RETURN|החזר שיק/.test(text)) return false;
  if (/CHQ_INCOME|CHECK_DEPOSIT|CHEQUE_DEPOSIT|הפקדת\s*שיק|הפקדת\s*צ['׳]?ק/.test(text)) return true;
  return /שיק|שיקים|צ['׳]?ק|\bCHEQUE\b|\bCHQ\b/.test(text);
}

export function isCashDepositDesc(description, category = '') {
  const text = depositText(description, category);
  if (isCheckDepositDesc(text)) return false;
  if (/CASH_INCOME|CASH_DEPOSIT|CASH DEPOSIT/.test(text)) return true;
  return /מזומן|מזומנים|ה\.מזומן|קופה|הפקדת מזומן/.test(text);
}

export function isGuestTransferDesc(description) {
  const text = String(description || '');
  if (isCashDepositDesc(text) || isCheckDepositDesc(text)) return false;
  if (/LI PAYMENTS|VISA|הלוואה|משכורת|שכיר|פיוניר|עמלה|החזרי מס|מס הכנסה|MAX |מקס /.test(text)) return false;
  return /זיכוי|ביט|העברה|העב׳|BIT/i.test(text);
}

function inMonth(date, month) {
  return !month || String(date || '').slice(0, 7) === month;
}

function rowDepositBlob(row) {
  return `${row?.description || ''} ${row?.subcategory || ''}`;
}

export function bankCashDeposits(bankRows, { month = '' } = {}) {
  return (bankRows || []).filter((row) => (
    Number(row.amount) > 0
    && isCashDepositDesc(rowDepositBlob(row), row.category)
    && inMonth(row.date, month)
  ));
}

export function bankCheckDeposits(bankRows, { month = '' } = {}) {
  return (bankRows || []).filter((row) => (
    Number(row.amount) > 0
    && isCheckDepositDesc(rowDepositBlob(row), row.category)
    && inMonth(row.date, month)
  ));
}

export function bankGuestTransfers(bankRows, { month = '' } = {}) {
  return (bankRows || []).filter((row) => (
    Number(row.amount) > 0
    && isGuestTransferDesc(row.description)
    && inMonth(row.date, month)
  ));
}

export function bankClearingLine(tx) {
  if (!tx) return { account: '', ref: '', line: '' };
  const account = tx.accountLabel || `בינלאומי ${BEINLEUMI_ACCOUNT}`;
  const ref = tx.reference || '';
  return {
    account,
    ref,
    line: ref ? `${account} · אסמכתה ${ref}` : `${account} · אין אסמכתה`
  };
}
