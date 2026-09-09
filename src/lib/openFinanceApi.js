import { getStoredToken } from './staffAuth';

const CACHE_MS = 90_000;
const cache = {
  overview: null,
  overviewAt: 0,
  overviewInflight: null,
  tx: new Map()
};

function txCacheKey(params) {
  return JSON.stringify({
    dateFrom: params.dateFrom || '',
    dateTo: params.dateTo || '',
    accountId: params.accountId || '',
    connectionId: params.connectionId || '',
    providerId: params.providerId || '',
    nextPage: params.nextPage || '',
    limit: params.limit || ''
  });
}

function clearFinanceCache() {
  cache.overview = null;
  cache.overviewAt = 0;
  cache.overviewInflight = null;
  cache.tx.clear();
}

async function financeFetch(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {})
  };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api/finance${path}`, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(25000)
  });
  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!response.ok) {
    const err = new Error(data?.error || 'OPEN_FINANCE_FAILED');
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

export function fetchFinanceOverview() {
  if (cache.overview && Date.now() - cache.overviewAt < CACHE_MS) {
    return Promise.resolve(cache.overview);
  }
  if (cache.overviewInflight) return cache.overviewInflight;
  cache.overviewInflight = financeFetch('/overview').then((data) => {
    cache.overview = data;
    cache.overviewAt = Date.now();
    cache.overviewInflight = null;
    return data;
  }, (err) => {
    cache.overviewInflight = null;
    throw err;
  });
  return cache.overviewInflight;
}

export async function fetchAllFinanceTransactions(params = {}, { maxPages = 12 } = {}) {
  const items = [];
  let nextPage = '';
  let pages = 0;
  do {
    const data = await fetchFinanceTransactions({
      ...params,
      nextPage: nextPage || undefined,
      limit: params.limit || 100
    });
    items.push(...(data.items || []));
    nextPage = data.nextPage || '';
    pages += 1;
  } while (nextPage && pages < maxPages);
  return { items, count: items.length, nextPage: nextPage || null };
}

export function fetchFinanceTransactions(params = {}) {
  const key = txCacheKey(params);
  const hit = cache.tx.get(key);
  if (hit?.data && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.data);
  if (hit?.inflight) return hit.inflight;
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    query.set(name, String(value));
  }
  const suffix = query.toString() ? `?${query}` : '';
  const inflight = financeFetch(`/transactions${suffix}`).then((data) => {
    cache.tx.set(key, { at: Date.now(), data });
    return data;
  }, (err) => {
    cache.tx.delete(key);
    throw err;
  });
  cache.tx.set(key, { at: 0, inflight });
  return inflight;
}

export function refreshFinanceConnections() {
  clearFinanceCache();
  return financeFetch('/refresh', { method: 'POST' });
}

export function scrapeLiveBanks(body = {}) {
  clearFinanceCache();
  return financeFetch('/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240000)
  });
}

export function fetchBankScrapeStatus() {
  return financeFetch('/scrape/status');
}

export function submitBankScrapeOtp(code) {
  return financeFetch('/scrape/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
}

export function syncHypPayments(body = {}) {
  return financeFetch('/hyp/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });
}
