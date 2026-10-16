/**
 * ResortOS — Financial Command Center Core Engine
 * 
 * Multi-bank 120-day cash flow forecasting, credit facility utilization monitoring,
 * safety buffer risk tracking, external funding requirement calculation,
 * check duplicate detection, and manual scenario modeling.
 * 
 * STRICT RULES:
 * - Bank operations are strictly read-only.
 * - Never invent balances, account mappings, settlement amounts, or future bookings.
 * - Only existing bookings and unpaid receivables are counted.
 * - Absolute prevention of double counting between card transactions, debits, settlements, and bookings.
 */

export function israelToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

export const BANK_IDS = ['mizrahi', 'discount', 'beinleumi'];

export const BANK_CONFIG = {
  mizrahi: {
    id: 'mizrahi',
    name: 'מזרחי טפחות',
    bankNumber: '20',
    branch: '462',
    accountNumber: '601997',
    accountLabel: '462-601997 (מיאליס ריזורט בע״מ)',
    color: '#D97706', // Amber / Orange
    badgeBg: 'rgba(217, 119, 6, 0.15)',
    defaultFacility: 150000,
    defaultSafetyBuffer: 25000,
    linkedCards: ['2221', '2599', '4580'],
    cardLabels: 'אמקס 2221 · ויזה 2599 · ויזה 4580'
  },
  discount: {
    id: 'discount',
    name: 'בנק דיסקונט',
    bankNumber: '11',
    branch: '176',
    accountNumber: '253325996',
    accountLabel: '176-253325996 (מיאליס ריזורט בע״מ)',
    color: '#10B981', // Emerald Green
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    defaultFacility: 100000,
    defaultSafetyBuffer: 20000,
    linkedCards: ['3174'],
    cardLabels: 'דיינרס 3174'
  },
  beinleumi: {
    id: 'beinleumi',
    name: 'הבנק הבינלאומי (FIBI)',
    bankNumber: '31',
    branch: '092',
    accountNumber: '395140',
    accountLabel: '31-92-395140 (חח״ד עסקי)',
    color: '#3B82F6', // Blue
    badgeBg: 'rgba(59, 130, 246, 0.15)',
    defaultFacility: 100000,
    defaultSafetyBuffer: 30000,
    linkedCards: ['2592', '8094'],
    cardLabels: 'דיינרס 2592 · מקס 8094'
  }
};

export const SETTINGS_STORAGE_KEY = 'resortos_finance_command_settings_v1';
export const MANUAL_ENTRIES_STORAGE_KEY = 'resortos_finance_manual_entries_v1';

export function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Israeli Banking Holidays (Bank of Israel official schedule)
 * Format: YYYY-MM-DD
 */
export const ISRAELI_BANK_HOLIDAYS = new Set([
  // 2025
  '2025-04-13', '2025-04-19', '2025-04-30', '2025-05-01', '2025-06-02',
  '2025-09-23', '2025-09-24', '2025-10-02', '2025-10-07', '2025-10-14',
  // 2026
  '2026-03-03', '2026-04-02', '2026-04-08', '2026-04-21', '2026-04-22',
  '2026-05-22', '2026-09-12', '2026-09-13', '2026-09-21', '2026-09-26', '2026-10-03',
  // 2027
  '2027-03-23', '2027-04-22', '2027-04-28', '2027-05-11', '2027-05-12',
  '2027-06-11', '2027-10-02', '2027-10-03', '2027-10-11', '2027-10-16', '2027-10-23',
  // 2028
  '2028-03-12', '2028-04-11', '2028-04-17', '2028-05-02', '2028-05-31',
  '2028-09-21', '2028-09-22', '2028-09-30', '2028-10-05', '2028-10-12',
]);

/**
 * Returns true if the date is a valid banking business day in Israel (Sunday through Thursday, excluding holidays).
 * Friday (5) and Saturday (6) are weekends in Israel.
 */
export function isBankingBusinessDay(isoDate) {
  if (!isoDate) return false;
  const d = new Date(`${isoDate}T12:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  if (day === 5 || day === 6) return false;
  if (ISRAELI_BANK_HOLIDAYS.has(isoDate)) return false;
  return true;
}

/**
 * Adjusts any transaction date that falls on a non-business day (Friday, Saturday, or holiday)
 * to the next banking business day in Israel (e.g. Friday/Saturday -> Sunday).
 */
export function adjustToNextBusinessDay(isoDate) {
  if (!isoDate) return isoDate;
  let cur = isoDate;
  let safety = 0;
  while (!isBankingBusinessDay(cur) && safety < 14) {
    cur = addDaysIso(cur, 1);
    safety += 1;
  }
  return cur;
}

export function formatMoney(amount, currency = 'ILS') {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const n = Number(amount);
  const formatted = n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'USD') return `$${formatted}`;
  if (currency === 'EUR') return `€${formatted}`;
  return `₪${formatted}`;
}

export function formatCompactMoney(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const n = Math.round(Number(amount));
  return `₪${n.toLocaleString('he-IL')}`;
}

export function getMonthKey(isoDate) {
  return String(isoDate || '').slice(0, 7);
}

export function loadFinanceSettings() {
  const defaults = {
    bookingPayoutDay: 3, // 3rd of each month
    initialCashDrawer: 0,
    banks: {
      mizrahi: { facility: BANK_CONFIG.mizrahi.defaultFacility, safetyBuffer: BANK_CONFIG.mizrahi.defaultSafetyBuffer },
      discount: { facility: BANK_CONFIG.discount.defaultFacility, safetyBuffer: BANK_CONFIG.discount.defaultSafetyBuffer },
      beinleumi: { facility: BANK_CONFIG.beinleumi.defaultFacility, safetyBuffer: BANK_CONFIG.beinleumi.defaultSafetyBuffer }
    }
  };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      bookingPayoutDay: Number(parsed.bookingPayoutDay) || defaults.bookingPayoutDay,
      initialCashDrawer: Number(parsed.initialCashDrawer) || defaults.initialCashDrawer,
      banks: {
        mizrahi: {
          facility: Number(parsed.banks?.mizrahi?.facility) || defaults.banks.mizrahi.facility,
          safetyBuffer: Number(parsed.banks?.mizrahi?.safetyBuffer) || defaults.banks.mizrahi.safetyBuffer
        },
        discount: {
          facility: Number(parsed.banks?.discount?.facility) || defaults.banks.discount.facility,
          safetyBuffer: Number(parsed.banks?.discount?.safetyBuffer) || defaults.banks.discount.safetyBuffer
        },
        beinleumi: {
          facility: Number(parsed.banks?.beinleumi?.facility) || defaults.banks.beinleumi.facility,
          safetyBuffer: Number(parsed.banks?.beinleumi?.safetyBuffer) || defaults.banks.beinleumi.safetyBuffer
        }
      }
    };
  } catch {
    return defaults;
  }
}

export function saveFinanceSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save finance settings:', err);
  }
}

export function loadManualEntries() {
  try {
    const raw = localStorage.getItem(MANUAL_ENTRIES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveManualEntries(entries) {
  try {
    localStorage.setItem(MANUAL_ENTRIES_STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.error('Failed to save manual entries:', err);
  }
}

function normalizeBankKey(name) {
  const s = String(name || '').toLowerCase();
  if (s.includes('mizrahi') || s.includes('מזרחי')) return 'mizrahi';
  if (s.includes('discount') || s.includes('דיסקונט')) return 'discount';
  if (s.includes('beinleumi') || s.includes('fibi') || s.includes('בינלאומי')) return 'beinleumi';
  return s;
}

/**
 * Checks for duplicate checks in existing checks or bank records.
 * Duplicate criteria: same check number, same bank, and same amount.
 */
export function findCheckDuplicates(candidate, existingChecks = []) {
  const checkNum = String(candidate?.check_number || candidate?.id || '').trim();
  const amount = Math.abs(Number(candidate?.amount) || 0);
  const bank = normalizeBankKey(candidate?.bank);

  if (!checkNum) return [];

  return existingChecks.filter((c) => {
    const cNum = String(c.check_number || c.id || '').trim();
    const cAmount = Math.abs(Number(c.amount) || 0);
    const cBank = normalizeBankKey(c.bank);
    return cNum === checkNum && Math.abs(cAmount - amount) < 0.01 && (!bank || !cBank || bank === cBank);
  });
}

/**
 * Calculate Booking.com monthly payout receivables from confirmed bookings.
 * Payout occurs on configured monthly day (default: 3rd).
 */
export function buildBookingComPayoutEvents({
  today = israelToday(),
  horizonEnd,
  bookings = [],
  payoutDay = 3,
  targetBank = 'beinleumi'
}) {
  const events = [];
  const monthlyAcc = new Map(); // monthKey -> sum amount

  for (const b of bookings) {
    // Only existing confirmed/checked-in/checked-out stays
    if (!b || b.booking_status === 'CANCELED') continue;
    const isBookingCom = String(b.channel || '').toLowerCase().includes('booking')
      || String(b.channel_source || '').toLowerCase().includes('booking')
      || String(b.guest_email || '').includes('@guest.booking.com');
    if (!isBookingCom) continue;

    const checkOut = b.check_out_date || b.check_in_date;
    if (!checkOut) continue;

    const stayMonth = getMonthKey(checkOut);
    const netPayout = (Number(b.total_price_agorot) || 0) / 100 * 0.85; // 15% OTA commission deduction
    if (netPayout > 0) {
      monthlyAcc.set(stayMonth, (monthlyAcc.get(stayMonth) || 0) + netPayout);
    }
  }

  // Generate payout event on the 3rd of each following month
  for (const [month, totalNet] of monthlyAcc.entries()) {
    const [y, m] = month.split('-').map(Number);
    const nextYear = m === 12 ? y + 1 : y;
    const nextMonth = m === 12 ? 1 : m + 1;
    const rawPayoutDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(payoutDay).padStart(2, '0')}`;
    const payoutDate = adjustToNextBusinessDay(rawPayoutDate);

    if (payoutDate >= today && payoutDate <= horizonEnd && totalNet > 0) {
      events.push({
        id: `booking-payout-${payoutDate}`,
        date: payoutDate,
        originalDate: rawPayoutDate,
        amount: Math.round(totalNet * 100) / 100,
        bank: targetBank,
        type: 'credit',
        category: 'booking_payout',
        label: `תקבול Booking.com חודשי (${month})`,
        isConfirmed: true,
        source: 'booking_com'
      });
    }
  }

  return events;
}

/**
 * Core Financial Command Center 120-Day Cash Flow Simulation Engine
 */
export function computeFinancialCommandCenter({
  today = israelToday(),
  horizonDays = 120,
  settings = loadFinanceSettings(),
  accounts = [],
  transactions = [],
  checks = [],
  maxCredits = [],
  hypPayments = [],
  collectionRows = [],
  bookings = [],
  beinleumiStatement = null,
  manualEntries = [],
  cashDeposits = [],
  initialCashDrawer = null
}) {
  const horizonEnd = addDaysIso(today, horizonDays);

  // 1. Resolve Initial Balances per bank
  const bankBalances = {
    mizrahi: 0,
    discount: 0,
    beinleumi: 0
  };

  // Populate from accounts overview
  for (const acc of accounts) {
    if (acc.accountType !== 'CHECKING') continue;
    const prov = acc.providerId;
    const bal = Number(acc.displayBalance?.amount || 0);
    if (prov === 'mizrahi') bankBalances.mizrahi = bal;
    else if (prov === 'discount') bankBalances.discount = bal;
    else if (prov === 'beinleumi') bankBalances.beinleumi = bal;
  }

  // Fallback to Beinleumi statement if open-finance checking is empty or absent
  if (bankBalances.beinleumi === 0 && beinleumiStatement?.closingBalance != null) {
    bankBalances.beinleumi = Number(beinleumiStatement.closingBalance);
  }

  // 2. Build Event Stream (strictly preventing double counting)
  const baselineEvents = [];
  const manualEvents = [];

  // A. Future Checks (drawn on their respective bank, adjusted to next business day)
  for (const c of checks) {
    const rawDue = c.due_date;
    if (!rawDue) continue;
    const due = adjustToNextBusinessDay(rawDue);
    if (due < today || due > horizonEnd) continue;
    const amount = Number(c.amount) || 0;
    if (amount <= 0) continue;

    const bKey = normalizeBankKey(c.bank);
    const bank = BANK_IDS.includes(bKey) ? bKey : 'mizrahi';
    const payee = c.payee || c.description || 'ספק';
    const checkNum = c.check_number || c.id || '';

    baselineEvents.push({
      id: `check-${c.id || checkNum}-${due}`,
      date: due,
      originalDate: rawDue,
      amount: -amount,
      bank,
      type: 'debit',
      category: 'check',
      label: `שיק מס׳ ${checkNum} · ${payee}${rawDue !== due ? ` (נדחה מ-${rawDue})` : ''}`,
      checkNumber: checkNum,
      payee,
      isConfirmed: true,
      source: 'check_register'
    });
  }

  // B. Credit Card Statement Debits
  // 1. FIBI Cards: from statement cardsSummary (Max 8094 & Diners 2592 debited on the 15th)
  if (beinleumiStatement?.cardsSummary) {
    const rawNextDebit = beinleumiStatement.cardsSummary.nextDebitDate || addDaysIso(today, 10);
    const nextDebit = adjustToNextBusinessDay(rawNextDebit);
    const amount = Number(beinleumiStatement.cardsSummary.upcomingCharges) || 0;
    if (nextDebit >= today && nextDebit <= horizonEnd && amount > 0) {
      baselineEvents.push({
        id: `fibi-cards-debit-${nextDebit}`,
        date: nextDebit,
        originalDate: rawNextDebit,
        amount: -amount,
        bank: 'beinleumi',
        type: 'debit',
        category: 'card_debit',
        label: 'חיוב כרטיסי אשראי (דיינרס 2592 + מקס 8094)',
        isConfirmed: true,
        source: 'cards_summary'
      });
    }
  }

  // 2. Open Finance Card Accounts
  const cardAccounts = accounts.filter((a) => a.accountType === 'CARD');
  for (const card of cardAccounts) {
    const prov = card.providerId || 'mizrahi';
    const targetBank = prov === 'discount' ? 'discount' : prov === 'beinleumi' ? 'beinleumi' : 'mizrahi';
    const billAmount = Math.abs(Number(card.displayBalance?.amount || 0));
    const rawDueDate = card.displayBalance?.referenceDate;
    const dueDate = rawDueDate ? adjustToNextBusinessDay(rawDueDate) : null;

    // Avoid duplicating FIBI if already covered by cardsSummary
    if (targetBank === 'beinleumi' && beinleumiStatement?.cardsSummary?.upcomingCharges) continue;

    if (dueDate && dueDate >= today && dueDate <= horizonEnd && billAmount > 0) {
      baselineEvents.push({
        id: `card-debit-${card.id}-${dueDate}`,
        date: dueDate,
        originalDate: rawDueDate,
        amount: -billAmount,
        bank: targetBank,
        type: 'debit',
        category: 'card_debit',
        label: `חיוב כרטיס ${card.accountName || card.product || ''} (סיומת ${String(card.accountNumber || '').slice(-4)})`,
        isConfirmed: true,
        source: 'card_statement'
      });
    }
  }

  // C. Credit Card Settlements (Max acquirer receipts)
  // Max settles into Beinleumi 395140 or Mizrahi
  for (const tx of maxCredits) {
    const rawCreditDate = tx.creditDate;
    if (!rawCreditDate) continue;
    const creditDate = adjustToNextBusinessDay(rawCreditDate);
    if (creditDate < today || creditDate > horizonEnd) continue;
    const net = Number(tx.net) || 0;
    if (net <= 0) continue;

    baselineEvents.push({
      id: `max-credit-${tx.batchId}-${tx.cardLast4}-${creditDate}-${tx.installment || 1}`,
      date: creditDate,
      originalDate: rawCreditDate,
      amount: net,
      bank: 'beinleumi', // Configured settlement bank for Max merchant
      type: 'credit',
      category: 'settlement',
      label: `זיכוי מקס עסקים (סיומת ${tx.cardLast4 || ''} · מנה ${tx.batchId || ''})`,
      isConfirmed: true,
      source: 'max_clearing'
    });
  }

  // D. Booking.com Monthly Payouts
  const bookingEvents = buildBookingComPayoutEvents({
    today,
    horizonEnd,
    bookings,
    payoutDay: settings.bookingPayoutDay || 3,
    targetBank: 'beinleumi'
  });
  baselineEvents.push(...bookingEvents);

  // E. Direct Collection & Receivables (Unpaid bookings)
  // Only count receivables that are NOT already captured in Max credits or Hyp settlements
  for (const row of collectionRows) {
    const rawStayDate = row.stayDate;
    if (!rawStayDate) continue;
    const stayDate = adjustToNextBusinessDay(rawStayDate);
    if (stayDate < today || stayDate > horizonEnd) continue;
    if (row.status === 'paid' || row.status === 'kinorot') continue;

    // Calculate unpaid transfer/bank amount
    const methods = Array.isArray(row.methods) ? row.methods.join(' ') : String(row.methods || '');
    const isCredit = methods.includes('אשראי');
    if (isCredit) continue; // Already settled through credit card stream

    const unpaidAmount = Math.max(0, (Number(row.amount) || 0) - (Number(row.cash) || 0) - (Number(row.voucher) || 0));
    if (unpaidAmount > 0) {
      baselineEvents.push({
        id: `receivable-${row.id}-${stayDate}`,
        date: stayDate,
        originalDate: rawStayDate,
        amount: unpaidAmount,
        bank: 'mizrahi', // Primary receiving bank for direct guest wire transfers
        type: 'credit',
        category: 'receivable',
        label: `תקבול צפוי מהזמנה · ${row.guestName || row.property || ''}`,
        isConfirmed: true,
        source: 'unpaid_booking'
      });
    }
  }

  // F. Cash Drawer Tracking (Guest Cash Collections from collectionRows)
  let initialCashFromPastRows = 0;
  for (const row of collectionRows) {
    const cashAmount = Math.abs(Number(row.cash) || 0);
    if (cashAmount <= 0) continue;
    const rawDate = row.stayDate;
    if (!rawDate) continue;

    if (rawDate < today) {
      initialCashFromPastRows += cashAmount;
    } else if (rawDate <= horizonEnd) {
      // Future cash collection into CASH_DRAWER (available on property)
      baselineEvents.push({
        id: `cash-collection-${row.id || rawDate}`,
        date: rawDate,
        amount: cashAmount,
        bank: null, // Sits in CASH_DRAWER only! Never credited to bank account until deposited.
        type: 'cash_collection',
        category: 'cash_drawer',
        label: `גביית מזומן (קופת מתחם) · ${row.guestName || row.property || ''}`,
        isConfirmed: true,
        source: 'cash_collection'
      });
    }
  }

  const resolvedInitialCashDrawer = initialCashDrawer != null
    ? Number(initialCashDrawer)
    : (Number(settings.initialCashDrawer) || 0) + initialCashFromPastRows;

  // G. Cash Deposits to Bank (CASH_DEPOSIT_TO_BANK)
  for (const dep of cashDeposits) {
    const rawDate = dep.date;
    if (!rawDate) continue;
    const depositDate = adjustToNextBusinessDay(rawDate);
    if (depositDate < today || depositDate > horizonEnd) continue;
    const amount = Math.abs(Number(dep.amount) || 0);
    if (amount <= 0) continue;
    const bank = BANK_IDS.includes(dep.bank) ? dep.bank : 'mizrahi';

    baselineEvents.push({
      id: `cash-deposit-${dep.id || Math.random()}`,
      date: depositDate,
      originalDate: rawDate,
      amount,
      bank,
      type: 'cash_deposit',
      category: 'cash_deposit',
      label: `הפקדת מזומן לחשבון ${BANK_CONFIG[bank]?.name || bank}`,
      isConfirmed: true,
      source: 'cash_deposit'
    });
  }

  // H. Manual Forecast Assumptions
  for (const m of manualEntries) {
    const rawDate = m.date;
    if (!rawDate) continue;
    const amount = Number(m.amount) || 0;
    if (amount === 0) continue;
    const bank = BANK_IDS.includes(m.bank) ? m.bank : 'mizrahi';

    if (m.type === 'cash_deposit' || m.type === 'CASH_DEPOSIT_TO_BANK') {
      const date = adjustToNextBusinessDay(rawDate);
      if (date < today || date > horizonEnd) continue;
      manualEvents.push({
        id: `manual-deposit-${m.id || Math.random()}`,
        date,
        originalDate: rawDate,
        amount: Math.abs(amount),
        bank,
        type: 'cash_deposit',
        category: 'cash_deposit',
        label: `[הפקדה ידנית] הפקדת מזומן לקופת ${BANK_CONFIG[bank]?.name || bank}`,
        isConfirmed: false,
        source: 'manual_deposit',
        notes: m.notes || ''
      });
    } else if (m.type === 'cash_collection') {
      if (rawDate < today || rawDate > horizonEnd) continue;
      manualEvents.push({
        id: `manual-cash-${m.id || Math.random()}`,
        date: rawDate,
        amount: Math.abs(amount),
        bank: null,
        type: 'cash_collection',
        category: 'cash_drawer',
        label: `[קופה ידנית] ${m.label || 'גביית מזומן בקופה'}`,
        isConfirmed: false,
        source: 'manual_cash',
        notes: m.notes || ''
      });
    } else {
      const date = adjustToNextBusinessDay(rawDate);
      if (date < today || date > horizonEnd) continue;
      manualEvents.push({
        id: `manual-${m.id || Math.random()}`,
        date,
        originalDate: rawDate,
        amount: m.type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
        bank,
        type: m.type === 'expense' ? 'debit' : 'credit',
        category: 'manual_assumption',
        label: `[הנחה ידנית] ${m.label || m.notes || (m.type === 'expense' ? 'הוצאה חזויה' : 'הכנסה חזויה')}`,
        isConfirmed: false,
        source: 'manual_entry',
        notes: m.notes || ''
      });
    }
  }

  // Sort events chronologically
  baselineEvents.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  const allEventsCombined = [...baselineEvents, ...manualEvents].sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);

  // 3. Build Daily Simulation Timeline
  function simulate(eventsList) {
    const days = [];
    const running = {
      mizrahi: bankBalances.mizrahi,
      discount: bankBalances.discount,
      beinleumi: bankBalances.beinleumi
    };
    let runningCashDrawer = resolvedInitialCashDrawer;

    let cursor = today;
    while (cursor <= horizonEnd) {
      const dayEvents = eventsList.filter((e) => e.date === cursor);

      for (const ev of dayEvents) {
        if (ev.type === 'cash_collection') {
          // Cash in drawer only! Never touches bank balances until deposited.
          runningCashDrawer = Math.round((runningCashDrawer + ev.amount) * 100) / 100;
        } else if (ev.type === 'cash_deposit') {
          // Reduces cash drawer and credits target bank account on deposit date.
          runningCashDrawer = Math.round((runningCashDrawer - ev.amount) * 100) / 100;
          if (ev.bank && running[ev.bank] !== undefined) {
            running[ev.bank] = Math.round((running[ev.bank] + ev.amount) * 100) / 100;
          }
        } else if (ev.bank && running[ev.bank] !== undefined) {
          running[ev.bank] = Math.round((running[ev.bank] + ev.amount) * 100) / 100;
        }
      }

      running.mizrahi = Math.round(running.mizrahi * 100) / 100;
      running.discount = Math.round(running.discount * 100) / 100;
      running.beinleumi = Math.round(running.beinleumi * 100) / 100;
      runningCashDrawer = Math.round(runningCashDrawer * 100) / 100;

      const totalBalance = Math.round((running.mizrahi + running.discount + running.beinleumi) * 100) / 100;
      const totalLiquidFunds = Math.round((totalBalance + runningCashDrawer) * 100) / 100;
      const totalFacility = settings.banks.mizrahi.facility + settings.banks.discount.facility + settings.banks.beinleumi.facility;
      const totalBuffer = settings.banks.mizrahi.safetyBuffer + settings.banks.discount.safetyBuffer + settings.banks.beinleumi.safetyBuffer;

      // Calculate utilization per bank - STRICTLY against running[bank]!
      // Cash in drawer DOES NOT reduce facility utilization until deposited!
      const utilMizrahi = running.mizrahi < 0 ? Math.min(100, Math.round((Math.abs(running.mizrahi) / settings.banks.mizrahi.facility) * 100)) : 0;
      const utilDiscount = running.discount < 0 ? Math.min(100, Math.round((Math.abs(running.discount) / settings.banks.discount.facility) * 100)) : 0;
      const utilBeinleumi = running.beinleumi < 0 ? Math.min(100, Math.round((Math.abs(running.beinleumi) / settings.banks.beinleumi.facility) * 100)) : 0;

      // Buffer breaches - strictly against bank balance
      const bufferBreachMizrahi = running.mizrahi < settings.banks.mizrahi.safetyBuffer;
      const bufferBreachDiscount = running.discount < settings.banks.discount.safetyBuffer;
      const bufferBreachBeinleumi = running.beinleumi < settings.banks.beinleumi.safetyBuffer;

      days.push({
        date: cursor,
        events: dayEvents,
        balances: { ...running },
        cashDrawer: runningCashDrawer,
        totalBalance, // Bank checking total
        totalLiquidFunds, // Bank checking + Cash drawer
        totalLiquidity: Math.round((totalLiquidFunds + totalFacility) * 100) / 100,
        utilizations: {
          mizrahi: utilMizrahi,
          discount: utilDiscount,
          beinleumi: utilBeinleumi
        },
        bufferBreaches: {
          mizrahi: bufferBreachMizrahi,
          discount: bufferBreachDiscount,
          beinleumi: bufferBreachBeinleumi
        },
        availableHeadroom: {
          mizrahi: Math.round((running.mizrahi + settings.banks.mizrahi.facility) * 100) / 100,
          discount: Math.round((running.discount + settings.banks.discount.facility) * 100) / 100,
          beinleumi: Math.round((running.beinleumi + settings.banks.beinleumi.facility) * 100) / 100,
          total: Math.round((totalBalance + totalFacility) * 100) / 100
        }
      });

      cursor = addDaysIso(cursor, 1);
    }
    return days;
  }

  const baselineDays = simulate(baselineEvents);
  const scenarioDays = simulate(allEventsCombined);

  // 4. Calculate Risk Alerts & Utilization Triggers (50%, 60%, buffer breach)
  const alerts = [];
  const processedAlertKeys = new Set();

  function evaluateAlerts(daysList, scenarioName) {
    for (const d of daysList) {
      for (const bank of BANK_IDS) {
        const util = d.utilizations[bank];
        const bal = d.balances[bank];
        const buffer = settings.banks[bank].safetyBuffer;
        const fac = settings.banks[bank].facility;
        const bankName = BANK_CONFIG[bank].name;

        // 60% Critical Utilization Alert
        if (util >= 60) {
          const key = `${bank}-util60-${d.date}`;
          if (!processedAlertKeys.has(key)) {
            processedAlertKeys.add(key);
            alerts.push({
              id: key,
              severity: 'critical',
              bank,
              bankName,
              date: d.date,
              type: 'facility_utilization_60',
              title: `ניצול מסגרת קריטי: ${util}% ב${bankName}`,
              description: `ב־${d.date} היתרה החזויה היא ${formatMoney(bal)} מתוך מסגרת של ${formatCompactMoney(fac)}. נדרשת תשומת לב מיידית.`,
              balance: bal,
              utilization: util,
              shortfall: Math.max(0, -bal),
              causingEvents: d.events.filter((e) => e.bank === bank)
            });
          }
        }
        // 50% Proactive Warning Alert
        else if (util >= 50) {
          const key = `${bank}-util50-${d.date}`;
          if (!processedAlertKeys.has(key)) {
            processedAlertKeys.add(key);
            alerts.push({
              id: key,
              severity: 'warning',
              bank,
              bankName,
              date: d.date,
              type: 'facility_utilization_50',
              title: `אזהרה מוקדמת: ניצול מסגרת ${util}% ב${bankName}`,
              description: `ב־${d.date} שיעור הניצול חוצה את רף ה־50% (${formatMoney(bal)} מתוך ${formatCompactMoney(fac)}).`,
              balance: bal,
              utilization: util,
              shortfall: Math.max(0, -bal),
              causingEvents: d.events.filter((e) => e.bank === bank)
            });
          }
        }

        // Safety Buffer Breach
        if (bal < buffer) {
          const key = `${bank}-buffer-${d.date}`;
          if (!processedAlertKeys.has(key)) {
            processedAlertKeys.add(key);
            alerts.push({
              id: key,
              severity: bal < 0 ? 'critical' : 'warning',
              bank,
              bankName,
              date: d.date,
              type: 'safety_buffer_breach',
              title: `ירידה מתחת לכרית הביטחון ב${bankName}`,
              description: `יתרה חזויה של ${formatMoney(bal)} נמוכה מכרית הביטחון המוגדרת (${formatCompactMoney(buffer)}).`,
              balance: bal,
              utilization: util,
              shortfall: Math.round((buffer - bal) * 100) / 100,
              causingEvents: d.events.filter((e) => e.bank === bank)
            });
          }
        }
      }
    }
  }

  evaluateAlerts(baselineDays, 'baseline');

  // Sort alerts: critical first, then chronological
  alerts.sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1;
    if (b.severity === 'critical' && a.severity !== 'critical') return 1;
    return a.date.localeCompare(b.date);
  });

  // 5. External Funding Requirement Calculation
  // Calculate earliest shortage, max cumulative gap, and required financing amount
  let earliestShortageDate = null;
  let maxCumulativeGap = 0;
  let gapDayInfo = null;

  for (const d of baselineDays) {
    const totalBuffer = settings.banks.mizrahi.safetyBuffer + settings.banks.discount.safetyBuffer + settings.banks.beinleumi.safetyBuffer;
    const totalFacility = settings.banks.mizrahi.facility + settings.banks.discount.facility + settings.banks.beinleumi.facility;
    
    // Gap relative to remaining liquid cash + safety buffers
    const combinedBufferDeficit = Math.max(0, totalBuffer - d.totalBalance);
    const facilityDeficit = Math.max(0, -(d.totalBalance + totalFacility));

    if (d.totalBalance < totalBuffer && !earliestShortageDate) {
      earliestShortageDate = d.date;
    }

    if (combinedBufferDeficit > maxCumulativeGap) {
      maxCumulativeGap = combinedBufferDeficit;
      gapDayInfo = d;
    }
  }

  // Determine if it's a temporary timing gap or sustained shortage
  let gapType = 'none';
  if (maxCumulativeGap > 0) {
    // Check if balance recovers above safety buffer within 10 days of peak gap
    const peakIndex = baselineDays.findIndex((d) => d.date === gapDayInfo?.date);
    const subsequentDays = baselineDays.slice(peakIndex + 1, peakIndex + 11);
    const recovers = subsequentDays.some((d) => {
      const buf = settings.banks.mizrahi.safetyBuffer + settings.banks.discount.safetyBuffer + settings.banks.beinleumi.safetyBuffer;
      return d.totalBalance >= buf;
    });
    gapType = recovers ? 'timing_gap' : 'sustained_shortage';
  }

  // Seasonality explanation without inventing or dismissing risks
  const currentMonthNum = Number(today.slice(5, 7));
  let seasonalityNote = '';
  if (currentMonthNum >= 10 && currentMonthNum <= 12) {
    seasonalityNote = 'חודשי הסתיו והחורף (אוקטובר-דצמבר) מתאפיינים בעונתיות מתונה יותר בצפון לעומת שיא הקיץ. תזמון פירעון שיקים של ספקים ושכירות מהווה את עיקר הלחץ התזרימי בתקופה זו.';
  } else if (currentMonthNum >= 1 && currentMonthNum <= 3) {
    seasonalityNote = 'רבעון ראשון (ינואר-מרץ) מתאפיין בפעילות חורף וסופי שבוע, לקראת עלייה בתפוסה ובהכנסות בחג הפסח ובאביב.';
  } else {
    seasonalityNote = 'עונת האביב והקיץ מלווה בהיקפי סליקה גבוהים וזיכויים רציפים מחופשות ואירוח.';
  }

  const fundingRequirement = {
    hasRequirement: maxCumulativeGap > 0,
    earliestShortageDate,
    maxCumulativeGap: Math.round(maxCumulativeGap),
    financingAmountNeeded: Math.round(maxCumulativeGap),
    gapType, // 'timing_gap' | 'sustained_shortage' | 'none'
    peakDate: gapDayInfo?.date || null,
    seasonalityExplanation: seasonalityNote
  };

  // 6. Summary KPIs
  const currentTotalCash = Math.round((bankBalances.mizrahi + bankBalances.discount + bankBalances.beinleumi) * 100) / 100;
  const currentCashDrawer = Math.round(resolvedInitialCashDrawer * 100) / 100;
  const currentTotalLiquidFunds = Math.round((currentTotalCash + currentCashDrawer) * 100) / 100;
  const currentTotalFacility = settings.banks.mizrahi.facility + settings.banks.discount.facility + settings.banks.beinleumi.facility;
  const currentTotalLiquidity = Math.round((currentTotalLiquidFunds + currentTotalFacility) * 100) / 100;
  const currentTotalBuffer = settings.banks.mizrahi.safetyBuffer + settings.banks.discount.safetyBuffer + settings.banks.beinleumi.safetyBuffer;
  const currentAvailableHeadroom = Math.round((currentTotalCash + currentTotalFacility) * 100) / 100;

  return {
    today,
    horizonDays,
    horizonEnd,
    settings,
    balances: bankBalances,
    cashDrawer: currentCashDrawer,
    kpis: {
      currentTotalCash,
      currentCashDrawer,
      currentTotalLiquidFunds,
      currentTotalFacility,
      currentTotalLiquidity,
      currentTotalBuffer,
      currentAvailableHeadroom,
      baselineEndingCash: baselineDays[baselineDays.length - 1]?.totalBalance || 0,
      scenarioEndingCash: scenarioDays[scenarioDays.length - 1]?.totalBalance || 0,
      activeAlertsCount: alerts.length,
      criticalAlertsCount: alerts.filter((a) => a.severity === 'critical').length
    },
    fundingRequirement,
    alerts,
    baseline: {
      events: baselineEvents,
      days: baselineDays
    },
    scenario: {
      events: allEventsCombined,
      days: scenarioDays
    },
    manualEntries
  };
}

/**
 * Format a concise WhatsApp alert message for Chloe to dispatch to the owner
 */
export function formatChloeWhatsAppAlert(alert) {
  const icon = alert.severity === 'critical' ? '🚨' : '⚠️';
  const causingList = (alert.causingEvents || [])
    .slice(0, 3)
    .map((e) => `  • ${e.label}: ${formatMoney(e.amount)}`)
    .join('\n');

  return `${icon} *התראת תזרים מחמ״ל ResortOS*
בנק: *${alert.bankName}*
תאריך צפוי: *${alert.date}*
יתרה חזויה: *${formatMoney(alert.balance)}*
ניצול מסגרת: *${alert.utilization}%*
פער/גירעון: *${formatMoney(alert.shortfall)}*

${alert.title}
${alert.description}

${causingList ? `תנועות עיקריות ביום זה:\n${causingList}\n` : ''}
לצפייה בלוח התזרים המלא:
https://resortos.app/financials`;
}
