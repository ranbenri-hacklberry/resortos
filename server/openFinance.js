const AUTH_URL = 'https://api.open-finance.ai/oauth/token';
const API_BASE = 'https://api.open-finance.ai/v2';
const REFRESH_URL = 'https://api.open-finance.ai/chat/chat/connections/refresh';
const USER_AGENT = 'Mozilla/5.0 HotelOS-OpenFinance/1.0';

const tokenCache = new Map();

function credentials() {
  const clientId = String(process.env.OPEN_FINANCE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.OPEN_FINANCE_CLIENT_SECRET || '').trim();
  const userId = String(process.env.OPEN_FINANCE_USER_ID || '').trim();
  if (!clientId || !clientSecret || !userId) {
    const err = new Error('OPEN_FINANCE_NOT_CONFIGURED');
    err.status = 503;
    throw err;
  }
  return { clientId, clientSecret, userId };
}

function cacheKey(userId) {
  return String(userId || '').toLowerCase();
}

function expiresInMs(expiresIn) {
  const n = Number(expiresIn) || 86400;
  return n > 100000 ? n : n * 1000;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function requestToken() {
  const { clientId, clientSecret, userId } = credentials();
  const key = cacheKey(userId);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60 * 1000) {
    return cached.accessToken;
  }

  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    },
    body: JSON.stringify({ clientId, clientSecret, userId }),
    signal: AbortSignal.timeout(20000)
  });
  const data = await readJson(response);
  if (!response.ok || !data?.accessToken) {
    const err = new Error(data?.message || data?.error || 'OPEN_FINANCE_AUTH_FAILED');
    err.status = response.status || 502;
    err.body = data;
    throw err;
  }
  tokenCache.set(key, {
    accessToken: data.accessToken,
    expiresAt: Date.now() + expiresInMs(data.expiresIn)
  });
  return data.accessToken;
}

async function financyFetch(path, { method = 'GET', query, body, retry = true } = {}) {
  const token = await requestToken();
  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000)
  });
  const data = await readJson(response);
  if (response.status === 401 && retry) {
    tokenCache.delete(cacheKey(credentials().userId));
    return financyFetch(path, { method, query, body, retry: false });
  }
  if (!response.ok) {
    const err = new Error(data?.message || data?.error || 'OPEN_FINANCE_REQUEST_FAILED');
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function collectPages(path, query = {}, { maxPages = 8 } = {}) {
  const items = [];
  let nextPage = query.nextPage || '';
  let pages = 0;
  do {
    const data = await financyFetch(path, {
      query: { ...query, nextPage: nextPage || undefined, limit: query.limit || 50 }
    });
    items.push(...(data?.items || []));
    nextPage = data?.nextPage || '';
    pages += 1;
  } while (nextPage && pages < maxPages);
  return { items, nextPage: nextPage || null, count: items.length };
}

function amountOf(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value);
  if (typeof value === 'object') {
    if (value.amount != null) return Number(value.amount);
    if (value.balanceAmount) return amountOf(value.balanceAmount);
  }
  return null;
}

function pickDisplayBalance(account) {
  const balances = Array.isArray(account?.balances) ? account.balances : [];
  const type = account?.accountType;
  const prefer = type === 'CARD'
    ? ['interimBooked', 'closingBooked', 'interimAvailable']
    : type === 'LOAN'
      ? ['closingBooked', 'expected', 'interimBooked']
      : ['interimAvailable', 'closingBooked', 'expected', 'interimBooked'];
  for (const wanted of prefer) {
    const hit = balances.find((row) => (
      row?.balanceType === wanted
      && (type === 'CARD' || row?.creditLimitIncluded !== true)
      && amountOf(row) != null
    ));
    if (hit) {
      return {
        amount: amountOf(hit),
        currency: hit.balanceAmount?.currency || account.currency || 'ILS',
        balanceType: hit.balanceType,
        referenceDate: hit.referenceDate || null,
        creditLimitIncluded: Boolean(hit.creditLimitIncluded)
      };
    }
  }
  const first = balances.find((row) => amountOf(row) != null);
  if (!first) return null;
  return {
    amount: amountOf(first),
    currency: first.balanceAmount?.currency || account.currency || 'ILS',
    balanceType: first.balanceType || null,
    referenceDate: first.referenceDate || null,
    creditLimitIncluded: Boolean(first.creditLimitIncluded)
  };
}

function sanitizeConnection(connection) {
  return {
    id: connection.id,
    providerId: connection.providerId,
    status: connection.status,
    accounts: connection.accounts || 0,
    cards: connection.cards || 0,
    loans: connection.loans || 0,
    savings: connection.savings || 0,
    transactions: connection.transactions || 0,
    lastFetchedAt: connection.lastFetchedAt || null,
    lastFetchedDataDate: connection.lastFetchedDataDate || null,
    expiryDate: connection.expiryDate || null,
    customerId: connection.customerId || null,
    psuId: connection.psuId || null,
    allowBusiness: Boolean(connection.allowBusiness)
  };
}

function sanitizeAccount(account) {
  const parsed = account.parsedAccount || null;
  return {
    id: account.id,
    connectionId: account.connectionId,
    providerId: account.providerId,
    accountType: account.accountType,
    accountName: account.accountName || account.product || '',
    product: account.product || '',
    currency: account.currency || 'ILS',
    accountNumber: account.accountNumber || '',
    parsedAccount: parsed,
    ownerName: account.ownerInfo?.fullName || '',
    creditLimit: amountOf(account.creditLimit),
    transactions: account.transactions || 0,
    displayBalance: pickDisplayBalance(account),
    balances: (account.balances || []).map((row) => ({
      balanceType: row.balanceType,
      amount: amountOf(row),
      currency: row.balanceAmount?.currency || account.currency || 'ILS',
      creditLimitIncluded: Boolean(row.creditLimitIncluded),
      referenceDate: row.referenceDate || null
    }))
  };
}

function sanitizeTransaction(tx) {
  const charged = tx.amount?.chargedAmount || {};
  return {
    id: tx.id,
    SK: tx.SK,
    accountId: tx.accountId,
    connectionId: tx.connectionId,
    providerId: tx.providerId,
    type: tx.type,
    merchantName: tx.merchantName || '',
    description: tx.description?.description || tx.description || '',
    amount: amountOf(charged),
    currency: charged.currency || 'ILS',
    category: tx.changedCategory?.main || tx.category?.main || '',
    subcategory: tx.changedCategory?.sub || tx.category?.sub || '',
    transactionDate: tx.date?.transactionDate || tx.date?.bookingDate || '',
    bookingDate: tx.date?.bookingDate || '',
    reference: tx.reference || tx.providerReference || tx.identifier || tx.transactionId || '',
    balancePerEndDay: tx.balancePerEndDay ?? null
  };
}

function isAccountLimitError(err) {
  return err?.body?.type === 'ACCOUNT_LIMIT_REACHED' || err?.status === 403;
}

function preferLiveConnections(list) {
  const rank = (status) => {
    if (status === 'ACTIVE' || status === 'CONNECTED') return 3;
    if (status === 'FETCHING') return 2;
    if (status === 'EXPIRED') return 0;
    return 1;
  };
  const byProvider = new Map();
  for (const row of list) {
    const prev = byProvider.get(row.providerId);
    if (!prev
      || rank(row.status) > rank(prev.status)
      || (rank(row.status) === rank(prev.status) && String(row.lastFetchedAt || '') > String(prev.lastFetchedAt || ''))) {
      byProvider.set(row.providerId, row);
    }
  }
  return [...byProvider.values()];
}

export async function getFinanceOverview() {
  credentials();
  const connections = await collectPages('/connections', { limit: 50 });
  let accountItems = [];
  let accountsError = null;
  try {
    const accounts = await collectPages('/data/accounts', { limit: 50 });
    accountItems = accounts.items;
  } catch (err) {
    if (!isAccountLimitError(err)) throw err;
    accountsError = err.message;
  }
  return {
    userId: process.env.OPEN_FINANCE_USER_ID,
    connections: preferLiveConnections(connections.items.map(sanitizeConnection)),
    accounts: accountItems.map(sanitizeAccount),
    accountsError
  };
}

export async function getFinanceTransactions({
  dateFrom,
  dateTo,
  accountId,
  connectionId,
  providerId,
  nextPage,
  limit = 40
} = {}) {
  credentials();
  try {
    const data = await financyFetch('/data/transactions', {
      query: {
        dateFrom,
        dateTo,
        accountId,
        connectionId,
        providerId,
        nextPage,
        limit,
        sort: -1
      }
    });
    return {
      items: (data?.items || []).map(sanitizeTransaction),
      nextPage: data?.nextPage || null,
      count: data?.count ?? (data?.items || []).length
    };
  } catch (err) {
    if (!isAccountLimitError(err)) throw err;
    return { items: [], nextPage: null, count: 0, accountsError: err.message };
  }
}

export async function refreshFinanceConnections() {
  credentials();
  return financyFetch(REFRESH_URL, { method: 'POST' });
}

export function isOpenFinanceConfigured() {
  try {
    credentials();
    return true;
  } catch {
    return false;
  }
}
