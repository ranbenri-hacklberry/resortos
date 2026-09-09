import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

if (!process.env.CI) process.env.CI = '1';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATEMENT_PATH = path.join(__dirname, '..', 'public', 'beinleumi-statement.json');
const OTP_FILE = '/tmp/hotelos-bank-otp';
const OTP_NEEDED_FILE = '/tmp/hotelos-bank-otp-needed.json';

let otpResolvers = [];
let pendingOtpInfo = null;
let currentJobLabel = '';

export function submitBankScraperOtp(code) {
  const value = String(code || '').trim();
  if (!value) return false;
  const waiters = otpResolvers.splice(0);
  for (const resolve of waiters) resolve(value);
  pendingOtpInfo = null;
  try {
    fs.unlinkSync(OTP_NEEDED_FILE);
  } catch (_) {}
  return waiters.length > 0;
}

function waitForOtp(phoneHint, timeoutMs = 300000) {
  const hint = String(phoneHint || '').trim();
  pendingOtpInfo = {
    company: currentJobLabel || 'max',
    phoneHint: hint,
    at: new Date().toISOString()
  };
  console.error(`[bank-scraper] צריך קוד SMS מ${pendingOtpInfo.company}${hint ? ` (${hint})` : ''}. תבקשו מהבעלים ותדביקו כאן או ב־/tmp/hotelos-bank-otp`);
  try {
    fs.writeFileSync(OTP_NEEDED_FILE, JSON.stringify(pendingOtpInfo));
  } catch (_) {}
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      otpResolvers = otpResolvers.filter((fn) => fn !== onCode);
      pendingOtpInfo = null;
      reject(Object.assign(new Error('OTP_TIMEOUT'), { status: 408, phoneHint: hint }));
    }, timeoutMs);
    function onCode(code) {
      clearTimeout(timer);
      pendingOtpInfo = null;
      try { fs.unlinkSync(OTP_NEEDED_FILE); } catch (_) {}
      resolve(code);
    }
    otpResolvers.push(onCode);
    try {
      if (fs.existsSync(OTP_FILE)) {
        const fromFile = String(fs.readFileSync(OTP_FILE, 'utf8') || '').trim();
        if (fromFile) {
          fs.unlinkSync(OTP_FILE);
          onCode(fromFile);
        }
      }
    } catch (_) {}
  });
}

function envCreds(prefix) {
  const username = String(process.env[`${prefix}_USERNAME`] || process.env[`${prefix}_USER`] || '').trim();
  const password = String(process.env[`${prefix}_PASSWORD`] || '').trim();
  if (!username || !password) return null;
  return { username, password };
}

function isoDay(value) {
  const raw = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function categorize(description, amount) {
  const text = String(description || '');
  if (/משכורת/.test(text)) return 'payroll';
  if (/הלווא|הלואה|ריבית/.test(text)) return 'loan';
  if (/עמלה|השלמה למינימום/.test(text)) return 'fee';
  if (/מס.?ב|זה.?ב/.test(text)) return 'masav';
  if (/שכר דירה|שכירות/.test(text)) return 'rent';
  if (/העבר/.test(text)) return 'transfer';
  if (/מקס|כאל|דיינרס|ויזה/.test(text)) return 'card';
  return Number(amount) >= 0 ? 'credit' : 'debit';
}

function rowFromTxn(txn, index) {
  const date = isoDay(txn.date || txn.processedDate);
  const amount = Number(txn.chargedAmount ?? txn.originalAmount) || 0;
  const description = String(txn.description || txn.memo || 'תנועה');
  const reference = String(txn.identifier || txn.ref || '');
  return {
    id: `live-${date}-${reference || index}-${Math.round(Math.abs(amount) * 100)}`,
    date,
    valueDate: isoDay(txn.processedDate || txn.date) || date,
    sof: '',
    reference,
    description,
    category: categorize(description, amount),
    amount,
    balance: txn.balance == null ? undefined : Number(txn.balance)
  };
}

function mergeStatement(previous, scrape, companyId) {
  const accounts = scrape?.accounts || [];
  const preferred = accounts.find((account) => String(account.accountNumber || '').includes('395140')) || accounts[0];
  const txns = preferred?.txns || [];
  const liveRows = txns.map(rowFromTxn).filter((row) => row.date);
  const prevRows = Array.isArray(previous?.rows) ? previous.rows : [];
  const seen = new Set(liveRows.map((row) => `${row.date}|${row.amount}|${row.description}`));
  const kept = prevRows.filter((row) => !seen.has(`${row.date}|${row.amount}|${row.description}`));
  const rows = [...kept, ...liveRows].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  const credits = rows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
  const debits = rows.filter((row) => row.amount < 0).reduce((sum, row) => sum + row.amount, 0);
  const last = rows.at(-1);
  return {
    ...(previous || {}),
    source: 'israeli-bank-scrapers',
    bank: 'beinleumi',
    bankName: previous?.bankName || 'הבנק הבינלאומי',
    branch: previous?.branch || '92',
    accountNumber: previous?.accountNumber || String(preferred?.accountNumber || '395140').replace(/\D/g, '').slice(-6),
    accountType: previous?.accountType || 'חח"ד עיסקי',
    parsedAccount: previous?.parsedAccount || { bank: '31', branch: '92', number: '395140' },
    from: rows[0]?.date || previous?.from,
    to: last?.date || previous?.to,
    importedAt: new Date().toISOString().slice(0, 10),
    fileName: `${companyId}-live`,
    count: rows.length,
    credits: Math.round(credits * 100) / 100,
    debits: Math.round(debits * 100) / 100,
    openingBalance: previous?.openingBalance || 0,
    closingBalance: preferred?.balance != null ? Number(preferred.balance) : (last?.balance ?? previous?.closingBalance),
    closingDate: last?.date || previous?.closingDate,
    rows,
    cardsSummary: previous?.cardsSummary || null
  };
}

async function loadPrevious() {
  try {
    return JSON.parse(fs.readFileSync(STATEMENT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function configuredJobs() {
  const only = String(process.env.BANK_SCRAPER_ONLY || '').toLowerCase();
  const beinleumi = envCreds('BANK_SCRAPER_BEINLEUMI') || envCreds('FIBI') || envCreds('BEINLEUMI');
  const maxAdvances = envCreds('BANK_SCRAPER_MAX_ADVANCES') || envCreds('BANK_SCRAPER_MAX');
  const maxClearing = envCreds('BANK_SCRAPER_MAX_CLEARING');
  const maxCard = envCreds('BANK_SCRAPER_MAX_CARD');
  const jobs = [];
  if (beinleumi && (!only || only === 'beinleumi')) {
    jobs.push({
      companyId: 'beinleumi',
      label: 'beinleumi',
      credentials: beinleumi,
      skipOtp: process.env.BANK_SCRAPER_BEINLEUMI_OTP !== '1'
    });
  }
  if (maxAdvances && (!only || only === 'max' || only === 'max-advances')) {
    jobs.push({ companyId: 'max', label: 'max-advances', credentials: maxAdvances, skipOtp: false });
  }
  if (maxClearing && (!only || only === 'max' || only === 'max-clearing')) {
    jobs.push({ companyId: 'max', label: 'max-clearing', credentials: maxClearing, skipOtp: false });
  }
  if (maxCard && (!only || only === 'max-card')) {
    jobs.push({ companyId: 'max', label: 'max-card', credentials: maxCard, skipOtp: false });
  }
  return jobs;
}

export function bankScraperConfigured() {
  return configuredJobs().length > 0;
}

let scrapeLock = null;

export function bankScraperStatus() {
  return {
    configured: bankScraperConfigured(),
    pendingOtp: otpResolvers.length > 0,
    otp: pendingOtpInfo,
    running: Boolean(scrapeLock)
  };
}

function resolveCompanyType(CompanyTypes, id) {
  if (CompanyTypes?.[id]) return CompanyTypes[id];
  const pascal = id.charAt(0).toUpperCase() + id.slice(1);
  if (CompanyTypes?.[pascal]) return CompanyTypes[pascal];
  const hit = Object.keys(CompanyTypes || {}).find((key) => key.toLowerCase() === String(id).toLowerCase());
  return hit ? CompanyTypes[hit] : id;
}

async function scrapeOne(createScraper, CompanyTypes, job, startDate) {
  const scraper = createScraper({
    companyId: resolveCompanyType(CompanyTypes, job.companyId),
    startDate,
    defaultTimeout: 120000,
    headless: process.env.BANK_SCRAPER_SHOW_BROWSER !== '1',
    ...(job.skipOtp ? {} : { otpCodeRetriever: async (phoneHint) => waitForOtp(phoneHint) })
  });
  return scraper.scrape(job.credentials);
}

function writeStatement(statement) {
  if (!statement) return;
  fs.mkdirSync(path.dirname(STATEMENT_PATH), { recursive: true });
  fs.writeFileSync(STATEMENT_PATH, JSON.stringify(statement));
}

async function scrapeConfiguredBanksInner({ startDate } = {}) {
  const jobs = configuredJobs();
  if (!jobs.length) {
    const err = new Error('BANK_SCRAPER_NOT_CONFIGURED');
    err.status = 503;
    throw err;
  }
  const mod = await import('@sergienko4/israeli-bank-scrapers');
  const createScraper = mod.createScraper;
  const CompanyTypes = mod.CompanyTypes || {};
  const from = startDate || new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const results = [];
  let statement = await loadPrevious();
  for (const job of jobs) {
    currentJobLabel = job.label || job.companyId;
    console.error(`[bank-scraper] starting ${currentJobLabel}`);
    const scraped = await scrapeOne(createScraper, CompanyTypes, job, from);
    console.error('[bank-scraper] finished', currentJobLabel, scraped?.success, scraped?.errorType || 'ok', (scraped?.accounts || []).length);
    results.push({
      companyId: job.companyId,
      label: currentJobLabel,
      success: Boolean(scraped?.success),
      errorType: scraped?.errorType || null,
      errorMessage: scraped?.errorMessage || null,
      accounts: (scraped?.accounts || []).length,
      txns: (scraped?.accounts || []).reduce((sum, account) => sum + (account.txns || []).length, 0)
    });
    if (!scraped?.success) {
      console.error('[bank-scraper-fail]', JSON.stringify({
        label: currentJobLabel,
        errorType: scraped?.errorType,
        errorMessage: scraped?.errorMessage,
        errorDetails: scraped?.errorDetails
      }));
      const err = new Error(scraped?.errorType || scraped?.errorMessage || 'SCRAPE_FAILED');
      err.status = scraped?.errorType === 'INVALID_PASSWORD' ? 401 : 502;
      err.body = { results, errorDetails: scraped?.errorDetails || null };
      throw err;
    }
    if (String(job.companyId).toLowerCase() === 'beinleumi') {
      statement = mergeStatement(statement, scraped, job.companyId);
      writeStatement(statement);
    }
  }
  return { ok: true, results, importedAt: statement?.importedAt, count: statement?.count, closingBalance: statement?.closingBalance };
}

export async function scrapeConfiguredBanks(options) {
  if (scrapeLock) return scrapeLock;
  scrapeLock = scrapeConfiguredBanksInner(options).finally(() => {
    scrapeLock = null;
  });
  return scrapeLock;
}
