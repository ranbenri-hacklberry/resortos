import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hypMasofForTerminal, resolveHypTerminal } from '../functions/lib/hypPay.js';
import { parseHypPortalCsv } from '../functions/lib/hypPortalCsv.js';

const LOGIN_URL = 'https://pay.hyp.co.il/cgi-bin/yaadpay/yaadpay3ds.pl';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function envTrim(env, key) {
  return String(env?.[key] || '').trim();
}

export function hypPortalLogin(env, terminal = 'A') {
  const t = resolveHypTerminal(terminal);
  const masof = String(
    (t === 'B' ? envTrim(env, 'HYP_B_MASOF') : envTrim(env, 'HYP_A_MASOF'))
    || hypMasofForTerminal(t)
  ).replace(/\D/g, '');
  const user = envTrim(env, `HYP_${t}_PORTAL_USER`);
  const pass = envTrim(env, `HYP_${t}_PORTAL_PASS`);
  if (!masof || masof.length < 8 || !user || !pass) {
    const err = new Error('HYP_PORTAL_MISSING_CREDS');
    err.code = 'HYP_PORTAL_MISSING_CREDS';
    err.terminal = t;
    throw err;
  }
  return { masof, user, pass, terminal: t };
}

export function hasHypPortalCreds(env, terminal = 'A') {
  try {
    hypPortalLogin(env, terminal);
    return true;
  } catch {
    return false;
  }
}

function ymd(value) {
  const raw = String(value || '').slice(0, 10).replace(/-/g, '');
  return /^\d{8}$/.test(raw) ? raw : '';
}

export function hypMonthBounds(isoDay = '') {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(isoDay)
    ? isoDay
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const [year, month] = day.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(last).padStart(2, '0')}`
  };
}

function curl(jar, args, { input } = {}) {
  const result = spawnSync('curl', [
    '-sS',
    '-c', jar,
    '-b', jar,
    '-A', UA,
    '--max-time', '90',
    ...args
  ], {
    input,
    maxBuffer: 40 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString('utf8') || 'HYP_PORTAL_CURL_FAILED');
  }
  return result.stdout;
}

function extractCsrf(html) {
  const text = Buffer.isBuffer(html) ? html.toString('latin1') : String(html);
  const match = text.match(/name="CSRF"\s+value="([a-f0-9]+)"/i)
    || text.match(/CSRF=([a-f0-9]{16,})/i);
  return match?.[1] || '';
}

export function scrapeHypPortalTerminal(env, terminal, { from, to } = {}) {
  const login = hypPortalLogin(env, terminal);
  const bounds = hypMonthBounds();
  const start = ymd(from) || ymd(bounds.from);
  const end = ymd(to) || ymd(bounds.to);
  const jar = path.join(os.tmpdir(), `hyp-portal-${login.terminal}-${process.pid}.jar`);
  try {
    const body = new URLSearchParams({
      action: 'login',
      Masof: login.masof,
      User: login.user,
      Pass: login.pass
    }).toString();
    const home = curl(jar, [
      '-X', 'POST', LOGIN_URL,
      '-H', 'Content-Type: application/x-www-form-urlencoded',
      '--data-binary', '@-'
    ], { input: body });
    if (home.toString('latin1').includes('loginForm_1') && home.length < 20000) {
      const err = new Error('HYP_PORTAL_LOGIN_FAILED');
      err.code = 'HYP_PORTAL_LOGIN_FAILED';
      err.terminal = login.terminal;
      throw err;
    }
    const csrf = extractCsrf(home);
    if (!csrf) {
      const err = new Error('HYP_PORTAL_CSRF');
      err.code = 'HYP_PORTAL_CSRF';
      throw err;
    }
    const exportUrl = `${LOGIN_URL}?d=s&CSRF=${csrf}&action=exportXLS&from=UserPage&dateF=${start}&dateT=${end}`;
    const csv = curl(jar, [exportUrl]);
    const text = csv.toString('utf8');
    if (text.includes('loginForm_1') || !text.includes('מספר עסקה')) {
      const err = new Error('HYP_PORTAL_EXPORT_FAILED');
      err.code = 'HYP_PORTAL_EXPORT_FAILED';
      throw err;
    }
    const rows = parseHypPortalCsv(text, login.masof);
    return {
      terminal: login.terminal,
      masof: login.masof,
      source: 'hyp-portal',
      count: rows.length,
      rows,
      rawCsv: text
    };
  } finally {
    try { fs.unlinkSync(jar); } catch { /* ignore */ }
  }
}

export async function scrapeHypPortals(env = process.env, options = {}) {
  const terminals = ['A', 'B'].filter((terminal) => hasHypPortalCreds(env, terminal));
  if (!terminals.length) {
    const err = new Error('HYP_PORTAL_MISSING_CREDS');
    err.code = 'HYP_PORTAL_MISSING_CREDS';
    err.status = 503;
    throw err;
  }
  const results = [];
  const rows = [];
  const errors = [];
  for (const terminal of terminals) {
    try {
      const listed = scrapeHypPortalTerminal(env, terminal, options);
      results.push({
        terminal: listed.terminal,
        masof: listed.masof,
        source: listed.source,
        count: listed.count
      });
      rows.push(...listed.rows);
    } catch (err) {
      errors.push({ terminal, error: err.message || String(err) });
      results.push({ terminal, error: err.message || String(err), count: 0 });
    }
  }
  if (!rows.length) {
    const err = new Error(errors.map((item) => `${item.terminal}: ${item.error}`).join(' · ') || 'HYP_PORTAL_EMPTY');
    err.code = 'HYP_PORTAL_FAILED';
    err.results = results;
    throw err;
  }
  return { rows, results, errors };
}
