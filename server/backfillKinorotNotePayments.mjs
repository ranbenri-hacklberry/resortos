#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { parseResviewPayment } from '../functions/lib/kinorotZcredit.js';
import { moneyFromKinorotPayment } from '../src/lib/kinorotNotePayments.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq < 1) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (process.env[key] === undefined) process.env[key] = val;
}

function sql(q) {
  const result = spawnSync('/opt/homebrew/bin/psql', [
    '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-F', '|', '-c', q
  ], { env: { ...process.env, PGPASSWORD: 'postgres' }, encoding: 'utf8', cwd: ROOT });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'psql failed');
  return String(result.stdout || '').trim();
}

function sqlString(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

const BASE = 'https://app.kinorotgo.co.il';
function parseCookie(setCookie) {
  const jar = new Map();
  for (const raw of setCookie || []) {
    const part = String(raw).split(';')[0];
    const i = part.indexOf('=');
    if (i < 1) continue;
    jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return jar;
}
function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
function mergeCookies(jar, setCookie) {
  for (const [k, v] of parseCookie(setCookie)) jar.set(k, v);
}
async function request(url, jar, options = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0 ResortOSBackfill', ...(options.headers || {}) };
  const cookie = cookieHeader(jar);
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(url, { redirect: 'manual', ...options, headers });
  const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  const single = response.headers.get('set-cookie');
  mergeCookies(jar, setCookies.length ? setCookies : (single ? [single] : []));
  const loc = response.headers.get('location');
  if (response.status >= 300 && response.status < 400 && loc) {
    return request(loc.startsWith('http') ? loc : new URL(loc, url).href, jar, { method: 'GET' });
  }
  return { status: response.status, text: await response.text() };
}
function isLoginPage(html) {
  return /name="pass"|הכניסו את פרטי ההתחברות/.test(String(html || '').slice(0, 8000));
}
async function login(jar) {
  await request(`${BASE}/logcrm.php`, jar);
  const body = new URLSearchParams({ user: process.env.KINOROT_USER, pass: process.env.KINOROT_PASSWORD, v: 'yes' });
  const result = await request(`${BASE}/crm_login.php`, jar, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${BASE}/logcrm.php`,
      Origin: BASE
    },
    body
  });
  const bounce = result.text.match(/window\.location\s*=\s*['"]([^'"]+)['"]/);
  const next = bounce ? (bounce[1].startsWith('http') ? bounce[1] : new URL(bounce[1], `${BASE}/`).href) : `${BASE}/homepage.php`;
  return request(next, jar);
}

const from = process.env.BACKFILL_FROM || '2026-09-01';
const to = process.env.BACKFILL_TO || '2026-09-07';

const lines = sql(`
  SELECT id, guest_name, special_requests, payment_status
  FROM hotelos_bookings
  WHERE deleted_at IS NULL
    AND booking_status <> 'CANCELED'
    AND check_in_date >= '${from}'
    AND check_in_date <= '${to}'
    AND guest_name NOT IN ('סגור', 'תפוס שיפוץ', 'מוצאש', 'שיפוץ')
    AND guest_name NOT ILIKE 'תפוס%'
    AND guest_name NOT ILIKE 'בריכה%'
    AND guest_name NOT ILIKE 'ביטול%'
    AND payment_status NOT IN ('PENDING_CASH', 'PENDING_BANK')
  ORDER BY check_in_date, id
`).split('\n').filter(Boolean);

const byResid = new Map();
for (const line of lines) {
  const [id, guest, req, status] = line.split('|');
  const resid = (String(req || '').match(/kinorot:(\d+)/) || String(id || '').match(/kin_\d+_(\d+)/) || [])[1];
  if (!resid) continue;
  if (!byResid.has(resid)) byResid.set(resid, { resid, guest, req, ids: [], status });
  byResid.get(resid).ids.push(id);
}

const jar = new Map();
await login(jar);
const out = [];
let i = 0;
for (const row of byResid.values()) {
  i += 1;
  let page = await request(`${BASE}/resview.php?res=${encodeURIComponent(row.resid)}`, jar);
  if (isLoginPage(page.text)) {
    jar.clear();
    await login(jar);
    page = await request(`${BASE}/resview.php?res=${encodeURIComponent(row.resid)}`, jar);
  }
  if (isLoginPage(page.text)) {
    out.push({ resid: row.resid, guest: row.guest, error: 'login' });
    continue;
  }
  const parsed = parseResviewPayment(page.text);
  const money = moneyFromKinorotPayment(parsed, row.resid);
  let req = String(row.req || '').replace(/\|pay:(?:voucher|comp)\b/g, '');
  if (money.payment_mode === 'VOUCHER') req += '|pay:voucher';
  if (money.payment_mode === 'COMP') req += '|pay:comp';
  const notes = JSON.stringify(money.clearing_payments || []);
  const ids = row.ids.map((id) => sqlString(id)).join(', ');
  sql(`
    UPDATE hotelos_bookings SET
      total_price_agorot = CASE WHEN total_price_agorot > 0 THEN total_price_agorot ELSE ${money.total_price_agorot} END,
      deposit_agorot = CASE WHEN ${money.deposit_agorot} > deposit_agorot THEN ${money.deposit_agorot} ELSE deposit_agorot END,
      payment_mode = COALESCE(${money.payment_mode ? sqlString(money.payment_mode) : 'NULL'}, payment_mode),
      payment_status = CASE
        WHEN payment_status IN ('PENDING_CASH', 'PENDING_BANK') THEN payment_status
        ELSE ${sqlString(money.payment_status)}
      END,
      clearing_payments = CASE
        WHEN ${sqlString(notes)}::jsonb = '[]'::jsonb THEN clearing_payments
        ELSE (
          SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
          FROM (
            SELECT e FROM jsonb_array_elements(COALESCE(clearing_payments, '[]'::jsonb)) e
            WHERE COALESCE(e->>'source', '') <> 'KINOROT'
            UNION ALL
            SELECT e FROM jsonb_array_elements(${sqlString(notes)}::jsonb) e
          ) x
        )
      END,
      special_requests = ${sqlString(req)},
      updated_at = now()
    WHERE id IN (${ids});
  `);
  out.push({
    resid: row.resid,
    guest: row.guest,
    cabins: row.ids.length,
    status: money.payment_status,
    mode: money.payment_mode,
    paid: parsed.paid,
    voucher: parsed.voucherRedeemed,
    notes: parsed.notePayments
  });
  if (i % 15 === 0) console.error(`[backfill] ${i}/${byResid.size}`);
}

const marked = out.filter((row) => row.status === 'PAID' || row.status === 'DEPOSIT_PAID' || row.voucher);
const still = out.filter((row) => row.status === 'UNPAID' && !row.voucher && !row.error);
console.log(JSON.stringify({
  scanned: out.length,
  markedCount: marked.length,
  stillOpen: still.length,
  still,
  updated: marked.map((row) => ({
    guest: row.guest,
    status: row.status,
    mode: row.mode,
    paid: row.paid,
    notes: row.notes
  }))
}, null, 2));
