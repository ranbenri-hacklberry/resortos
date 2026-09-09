#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { parseResviewPayment } from '../functions/lib/kinorotZcredit.js';
import {
  clearingPaymentsFromKinorotNotes,
  moneyFromKinorotPayment
} from '../src/lib/kinorotNotePayments.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://app.kinorotgo.co.il';

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile();

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

function isLoginPage(html) {
  return /name="pass"|הכניסו את פרטי ההתחברות/.test(String(html || '').slice(0, 8000));
}

async function request(url, jar, options = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0 ResortOSPaySync', ...(options.headers || {}) };
  const cookie = cookieHeader(jar);
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(url, { redirect: 'manual', ...options, headers });
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  const single = response.headers.get('set-cookie');
  mergeCookies(jar, setCookies.length ? setCookies : (single ? [single] : []));
  const loc = response.headers.get('location');
  if (response.status >= 300 && response.status < 400 && loc) {
    const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
    return request(next, jar, { method: 'GET' });
  }
  return { status: response.status, text: await response.text() };
}

async function login(jar) {
  const user = process.env.KINOROT_USER || '';
  const pass = process.env.KINOROT_PASSWORD || '';
  if (!user || !pass) throw new Error('KINOROT_MISSING_CREDS');
  await request(`${BASE}/logcrm.php`, jar);
  const body = new URLSearchParams({ user, pass, v: 'yes' });
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
  const next = bounce
    ? (bounce[1].startsWith('http') ? bounce[1] : new URL(bounce[1], `${BASE}/`).href)
    : `${BASE}/homepage.php`;
  return request(next, jar);
}

function sql(q) {
  const env = { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'postgres' };
  const result = spawnSync(
    '/opt/homebrew/bin/psql',
    ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-F', '|', '-c', q],
    { env, encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'psql failed');
  return String(result.stdout || '').trim();
}

function moneyFromResview(payment) {
  const pay = payment && typeof payment === 'object' ? payment : {};
  const money = moneyFromKinorotPayment(pay);
  return {
    ...money,
    paidIls: Number(pay.paid || 0),
    totalIls: Number(pay.total || 0),
    depositField: Number(pay.deposit || 0),
    clearing_payments: Array.isArray(pay.notePayments) ? pay.notePayments : []
  };
}

function sqlString(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

async function main() {
  const rows = sql(`
    SELECT id, guest_name, special_requests, payment_status, total_price_agorot, deposit_agorot
    FROM public.hotelos_bookings
    WHERE deleted_at IS NULL
      AND id LIKE 'kin\\_%' ESCAPE '\\'
      AND check_out_date >= CURRENT_DATE
      AND COALESCE(payment_status, 'UNPAID') NOT IN ('PENDING_CASH', 'PENDING_BANK')
    ORDER BY check_in_date
  `).split('\n').filter(Boolean).map((line) => {
    const [id, guest, req, status, total, deposit] = line.split('|');
    const resid = (String(req || '').match(/kinorot:(\d+)/) || String(id || '').match(/kin_\d+_(\d+)/) || [])[1];
    return { id, guest, resid, status, total: Number(total || 0), deposit: Number(deposit || 0) };
  }).filter((row) => row.resid);

  console.log(`[kinorot-pay] upcoming ${rows.length}`);
  const jar = new Map();
  await login(jar);
  let updated = 0;
  let withMoney = 0;
  const samples = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    let page = await request(`${BASE}/resview.php?res=${encodeURIComponent(row.resid)}`, jar);
    if (isLoginPage(page.text)) {
      jar.clear();
      await login(jar);
      page = await request(`${BASE}/resview.php?res=${encodeURIComponent(row.resid)}`, jar);
    }
    if (isLoginPage(page.text)) {
      console.log(`[kinorot-pay] login fail ${row.resid}`);
      continue;
    }
    const parsed = parseResviewPayment(page.text);
    const money = moneyFromResview(parsed);
    if (money.total_price_agorot > 0 || money.deposit_agorot > 0 || money.payment_status !== 'UNPAID') withMoney += 1;
    if (samples.length < 8 || ['70541', '72394', '178291215559611', '178317280552829'].includes(row.resid)) {
      samples.push({
        guest: row.guest,
        resid: row.resid,
        total: money.totalIls,
        depositField: money.depositField,
        paid: money.paidIls,
        status: money.payment_status
      });
    }
    if (row.status === 'PAID' && money.payment_status !== 'PAID') {
      if (money.total_price_agorot > 0 && row.total <= 0) {
        sql(`UPDATE public.hotelos_bookings SET total_price_agorot = ${money.total_price_agorot}, updated_at = now() WHERE id = ${sqlString(row.id)} AND total_price_agorot = 0;`);
      }
      continue;
    }
    const notes = clearingPaymentsFromKinorotNotes(money.clearing_payments, {
      resid: row.resid,
      last4: parsed.last4 || ''
    });
    sql(`
      UPDATE public.hotelos_bookings SET
        total_price_agorot = CASE WHEN total_price_agorot > 0 THEN total_price_agorot ELSE ${money.total_price_agorot} END,
        deposit_agorot = CASE
          WHEN ${money.deposit_agorot} > deposit_agorot THEN ${money.deposit_agorot}
          WHEN payment_status IN ('PAID', 'PENDING_CASH', 'PENDING_BANK') THEN deposit_agorot
          ELSE ${money.deposit_agorot}
        END,
        payment_mode = COALESCE(${money.payment_mode ? sqlString(money.payment_mode) : 'NULL'}, payment_mode),
        clearing_payments = CASE
          WHEN ${sqlString(JSON.stringify(notes))}::jsonb = '[]'::jsonb THEN clearing_payments
          ELSE (
            SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
            FROM (
              SELECT e FROM jsonb_array_elements(COALESCE(clearing_payments, '[]'::jsonb)) e
              WHERE COALESCE(e->>'source', '') <> 'KINOROT'
              UNION ALL
              SELECT e FROM jsonb_array_elements(${sqlString(JSON.stringify(notes))}::jsonb) e
            ) x
          )
        END,
        payment_status = CASE
          WHEN payment_status IN ('PENDING_CASH', 'PENDING_BANK') THEN payment_status
          WHEN ${sqlString(JSON.stringify(notes))}::jsonb <> '[]'::jsonb
            AND ${sqlString(money.payment_status)} IN ('PAID', 'DEPOSIT_PAID', 'PARTIAL')
            THEN ${sqlString(money.payment_status)}
          WHEN COALESCE(clearing_payments, '[]'::jsonb) = '[]'::jsonb
            THEN ${sqlString(money.payment_status)}
          ELSE payment_status
        END,
        booking_status = CASE
          WHEN booking_status IN ('CANCELED', 'CHECKED_OUT') THEN booking_status
          ELSE booking_status
        END,
        updated_at = now()
      WHERE id = ${sqlString(row.id)};
    `);
    updated += 1;
    if ((i + 1) % 20 === 0 || i + 1 === rows.length) {
      console.log(`[kinorot-pay] ${i + 1}/${rows.length} money=${withMoney}`);
    }
  }
  console.log('[kinorot-pay] samples');
  console.log(JSON.stringify(samples, null, 2));
  console.log(`[kinorot-pay] updated ${updated} withMoney ${withMoney}/${rows.length}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
