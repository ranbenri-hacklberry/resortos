export const BEINLEUMI_STATEMENT_URL = '/beinleumi-statement.json';
export const MANUAL_BEINLEUMI_ACCOUNT_ID = 'manual-beinleumi-395140';

export const BEINLEUMI_CATEGORY_LABELS = {
  credit: 'זיכוי',
  debit: 'חיוב',
  fee: 'עמלה',
  loan: 'הלוואה',
  card: 'כרטיס',
  payroll: 'משכורת',
  rent: 'שכירות',
  transfer: 'העברה',
  masav: 'מס״ב'
};

export function beinleumiCategoryLabel(category) {
  return BEINLEUMI_CATEGORY_LABELS[category] || category || 'תנועה';
}

export async function loadBeinleumiStatement() {
  const response = await fetch(BEINLEUMI_STATEMENT_URL, { cache: 'no-store' });
  if (!response.ok) {
    const err = new Error('BEINLEUMI_STATEMENT_MISSING');
    err.status = response.status;
    throw err;
  }
  return response.json();
}

export function statementAccount(payload) {
  if (!payload) return null;
  return {
    id: MANUAL_BEINLEUMI_ACCOUNT_ID,
    providerId: 'beinleumi',
    accountType: 'CHECKING',
    accountName: payload.accountType || 'חח"ד עיסקי',
    product: payload.accountType,
    accountNumber: payload.accountNumber,
    ownerName: '',
    source: 'manual-pdf',
    parsedAccount: payload.parsedAccount || {
      bank: '31',
      branch: payload.branch,
      number: payload.accountNumber
    },
    displayBalance: {
      amount: Number(payload.closingBalance) || 0,
      currency: 'ILS',
      referenceDate: payload.closingDate || payload.to
    }
  };
}

export function statementTransactions(payload) {
  return (payload?.rows || []).map((row) => ({
    id: row.id,
    SK: row.id,
    providerId: 'beinleumi',
    transactionDate: row.date,
    valueDate: row.valueDate,
    description: row.description,
    merchantName: row.description,
    amount: Number(row.amount) || 0,
    balance: Number(row.balance) || 0,
    currency: 'ILS',
    category: row.category,
    sof: row.sof,
    reference: row.reference,
    source: 'manual-pdf'
  }));
}

function hasLiveBeinleumiChecking(accounts) {
  return (accounts || []).some((account) => (
    account?.providerId === 'beinleumi'
    && account.accountType === 'CHECKING'
    && account.id !== MANUAL_BEINLEUMI_ACCOUNT_ID
    && Number(account?.displayBalance?.amount) !== 0
  ));
}

export function statementCardAccounts(payload) {
  const summary = payload?.cardsSummary;
  if (!summary?.upcomingCharges) return [];
  return [{
    id: 'manual-beinleumi-cards',
    providerId: 'beinleumi',
    accountType: 'CARD',
    accountName: 'כרטיסי בינלאומי',
    product: (summary.cards || []).map((card) => `${card.label} ${card.last4}`).join(' · '),
    accountNumber: (summary.cards || []).map((card) => card.last4).join('/'),
    ownerName: summary.ownerName || '',
    source: 'manual-pdf',
    displayBalance: {
      amount: Number(summary.upcomingCharges) || 0,
      currency: 'ILS',
      referenceDate: summary.nextDebitDate
    },
    balances: [
      {
        balanceType: 'interimBooked',
        amount: Number(summary.upcomingCharges) || 0,
        currency: 'ILS',
        referenceDate: summary.nextDebitDate
      }
    ],
    cardsSummary: summary
  }];
}

export function mergeFinanceOverview(overview, payload) {
  const account = statementAccount(payload);
  if (!account && !payload?.cardsSummary) return overview;
  const base = overview || { accounts: [], connections: [] };
  const accounts = [...(base.accounts || [])];
  if (account && !hasLiveBeinleumiChecking(accounts) && !accounts.some((row) => row.id === account.id)) {
    accounts.unshift(account);
  }
  for (const card of statementCardAccounts(payload)) {
    if (!accounts.some((row) => row.id === card.id || (
      row.accountType === 'CARD' && String(row.accountNumber || '').includes(String(card.accountNumber || '').split('/')[0])
    ))) {
      accounts.push(card);
    }
  }
  const cardCount = accounts.filter((row) => row.accountType === 'CARD').length;
  const connections = (base.connections || []).map((row) => ({ ...row }));
  const existing = connections.find((row) => row.providerId === 'beinleumi');
  if (existing && (existing.status === 'FETCHING' || existing.status === 'INACTIVE' || payload?.cardsSummary)) {
    existing.status = existing.status === 'FETCHING' || existing.status === 'INACTIVE' ? 'ACTIVE' : existing.status;
    existing.accounts = Math.max(Number(existing.accounts) || 0, account ? 1 : 0);
    existing.cards = Math.max(Number(existing.cards) || 0, payload?.cardsSummary?.cards?.length || cardCount);
    existing.source = existing.source || 'manual-pdf';
  } else if (!existing) {
    connections.unshift({
      id: 'manual-beinleumi',
      providerId: 'beinleumi',
      status: 'ACTIVE',
      accounts: account ? 1 : 0,
      cards: payload?.cardsSummary?.cards?.length || 0,
      source: 'manual-pdf'
    });
  }
  return { ...base, accounts, connections };
}

export function mergeFinanceTransactions(items, payload, { dateFrom, dateTo, limit = 40 } = {}) {
  const manual = statementTransactions(payload).filter((tx) => {
    if (dateFrom && tx.transactionDate < dateFrom) return false;
    if (dateTo && tx.transactionDate > dateTo) return false;
    return true;
  });
  const seen = new Set();
  const merged = [];
  for (const tx of [...manual, ...(items || [])]) {
    const key = [
      tx.providerId || '',
      tx.transactionDate || '',
      Number(tx.amount).toFixed(2),
      String(tx.description || tx.merchantName || '').slice(0, 24)
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(tx);
  }
  merged.sort((a, b) => String(b.transactionDate || '').localeCompare(String(a.transactionDate || '')));
  return merged.slice(0, limit);
}

export function filterBeinleumiRows(rows, { month = '', category = '', query = '' } = {}) {
  const q = String(query || '').trim();
  return (rows || []).filter((row) => {
    if (month && String(row.date || '').slice(0, 7) !== month) return false;
    if (category && row.category !== category) return false;
    if (q && !`${row.description || ''} ${row.reference || ''} ${row.amount || ''}`.includes(q)) return false;
    return true;
  });
}

export function beinleumiMonths(rows) {
  return [...new Set((rows || []).map((row) => String(row.date || '').slice(0, 7)).filter(Boolean))]
    .sort()
    .reverse();
}

export function summarizeBeinleumi(rows) {
  return (rows || []).reduce((acc, row) => {
    const amount = Number(row.amount) || 0;
    acc.count += 1;
    if (amount >= 0) acc.in += amount;
    else acc.out += amount;
    acc.net += amount;
    return acc;
  }, { count: 0, in: 0, out: 0, net: 0 });
}
