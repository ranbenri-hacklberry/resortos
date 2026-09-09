import { israelToday } from './cabinAccess';
import { parseMoney } from './dailyCollection';

export const PROVIDER_LABELS = {
  mizrahi: 'מזרחי טפחות',
  discount: 'דיסקונט',
  beinleumi: 'הבינלאומי',
  max: 'מקס',
  hapoalim: 'הפועלים',
  leumi: 'לאומי',
  cal: 'כאל'
};

export function providerLabel(id) {
  return PROVIDER_LABELS[id] || id || 'בנק';
}

export function addDaysIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMoney(amount, currency = 'ILS') {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const n = Number(amount);
  const formatted = n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'USD') return `$${formatted}`;
  if (currency === 'EUR') return `€${formatted}`;
  return `₪${formatted}`;
}

export function accountNumberLabel(account) {
  const parsed = account?.parsedAccount;
  if (parsed?.bank && parsed?.branch && parsed?.number) {
    return `${parsed.bank}-${parsed.branch}-${parsed.number}`;
  }
  return account?.accountNumber || '';
}

export function checkingBalance(account) {
  return Number(account?.displayBalance?.amount || 0);
}

function cardBill(account) {
  const balances = account?.balances || [];
  const booked = balances.find((row) => row.balanceType === 'interimBooked')
    || balances.find((row) => row.balanceType === 'closingBooked' && !row.creditLimitIncluded)
    || account?.displayBalance;
  return {
    amount: Math.abs(Number(booked?.amount || 0)),
    dueDate: booked?.referenceDate || null,
    name: account?.accountName || account?.product || 'כרטיס',
    providerId: account?.providerId,
    last4: String(account?.accountNumber || '').slice(-4)
  };
}

export function collectionTransferAmount(row) {
  const methods = (row?.methods || []).join(' ');
  const notes = String(row?.notes || '');
  if (!methods.includes('העברה') && !notes.includes('העברה') && !methods.includes('ביט')) return 0;
  const before = notes.match(/([\d,]{2,})\s*העברה/);
  const after = notes.match(/העברה[^\d]{0,16}([\d,]{2,})/);
  if (before) return parseMoney(before[1]);
  if (after) return parseMoney(after[1]);
  if (methods.includes('אשראי')) return 0;
  return Math.max(0, (Number(row.amount) || 0) - (Number(row.cash) || 0) - (Number(row.voucher) || 0));
}

export function buildCashFlowForecast({
  today = israelToday(),
  targetDate,
  accounts = [],
  maxCredits = [],
  collectionRows = []
} = {}) {
  const target = targetDate && targetDate > today ? targetDate : addDaysIso(today, 14);
  const checking = (accounts || []).filter((account) => account.accountType === 'CHECKING');
  const cards = (accounts || []).filter((account) => account.accountType === 'CARD');
  const opening = checking.reduce((sum, account) => sum + checkingBalance(account), 0);

  const events = [];

  for (const tx of maxCredits || []) {
    if (!tx.creditDate || tx.creditDate <= today || tx.creditDate > target) continue;
    events.push({
      id: `max-${tx.batchId}-${tx.cardLast4}-${tx.creditDate}-${tx.installment || 'x'}`,
      date: tx.creditDate,
      amount: Number(tx.net) || 0,
      type: 'credit',
      label: `זיכוי מקס ${tx.brand || ''} ${tx.cardLast4 || ''}`.trim()
    });
  }

  for (const account of cards) {
    const bill = cardBill(account);
    if (!bill.dueDate || bill.dueDate <= today || bill.dueDate > target || !bill.amount) continue;
    events.push({
      id: `card-${account.id}-${bill.dueDate}`,
      date: bill.dueDate,
      amount: -bill.amount,
      type: 'charge',
      label: `חיוב ${bill.name}${bill.last4 ? ` · ${bill.last4}` : ''}`
    });
  }

  for (const row of collectionRows || []) {
    if (!row.stayDate || row.stayDate <= today || row.stayDate > target) continue;
    if (row.status === 'paid' || row.status === 'kinorot') continue;
    const amount = collectionTransferAmount(row);
    if (amount <= 0) continue;
    events.push({
      id: `tr-${row.id}`,
      date: row.stayDate,
      amount,
      type: 'transfer',
      label: `העברה צפויה · ${row.guestName || row.property || ''}`.trim()
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

  const days = [];
  let running = opening;
  let cursor = addDaysIso(today, 1);
  while (cursor <= target) {
    const dayEvents = events.filter((event) => event.date === cursor);
    const credits = dayEvents.filter((event) => event.type === 'credit').reduce((sum, event) => sum + event.amount, 0);
    const charges = dayEvents.filter((event) => event.type === 'charge').reduce((sum, event) => sum + event.amount, 0);
    const transfers = dayEvents.filter((event) => event.type === 'transfer').reduce((sum, event) => sum + event.amount, 0);
    running += credits + charges + transfers;
    days.push({
      date: cursor,
      events: dayEvents,
      credits,
      charges,
      transfers,
      delta: credits + charges + transfers,
      balance: running
    });
    cursor = addDaysIso(cursor, 1);
  }

  const selected = days[days.length - 1] || {
    date: target,
    events: [],
    credits: 0,
    charges: 0,
    transfers: 0,
    delta: 0,
    balance: opening
  };

  const totals = events.reduce((acc, event) => {
    if (event.type === 'credit') acc.credits += event.amount;
    if (event.type === 'charge') acc.charges += event.amount;
    if (event.type === 'transfer') acc.transfers += event.amount;
    return acc;
  }, { credits: 0, charges: 0, transfers: 0 });

  return {
    today,
    target,
    opening,
    projected: selected.balance,
    totals,
    checking,
    events,
    days,
    selected
  };
}
