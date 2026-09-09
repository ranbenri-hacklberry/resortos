#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { parseResviewPayment } from '../functions/lib/kinorotZcredit.js';

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

async function request(url, jar, options = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0 ResortOSProbe', ...(options.headers || {}) };
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

function isLoginPage(html) {
  return /name="pass"|הכניסו את פרטי ההתחברות/.test(String(html || '').slice(0, 8000));
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

function moneyInputs(html) {
  const inputs = [];
  const re = /<input\b[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const tag = match[0];
    const id = (tag.match(/\bid="([^"]+)"/i) || [])[1] || '';
    const name = (tag.match(/\bname="([^"]+)"/i) || [])[1] || '';
    const value = (tag.match(/\bvalue="([^"]*)"/i) || [])[1] || '';
    const key = `${id} ${name}`.toLowerCase();
    if (!/pay|price|sum|total|deposit|paid|amount|יתר|מקד|סכום|מחיר/.test(key) && !/^\d/.test(value)) continue;
    if (!value && !/pay|price|deposit|amount/.test(key)) continue;
    inputs.push({ id, name, value: value.slice(0, 40) });
  }
  return inputs.slice(0, 30);
}

function snippets(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const found = [];
  for (const word of ['מקדמה', 'שולם', 'יתרה', 'סה"כ', "סה''כ", 'לתשלום', 'מחיר']) {
    const i = text.indexOf(word);
    if (i >= 0) found.push(text.slice(Math.max(0, i - 12), i + 48));
  }
  return found;
}

async function main() {
  const ran = sql(`
    SELECT id, guest_name, unit_id, check_in_date, total_price_agorot, deposit_agorot, payment_status, booking_status
    FROM public.hotelos_bookings
    WHERE deleted_at IS NULL
      AND (
        guest_name ILIKE '%בן ארי%'
        OR guest_phone LIKE '%548076123%'
        OR (unit_id IN ('hill-4','bageva-4') AND check_in_date = '2026-08-22')
      )
    ORDER BY updated_at DESC
    LIMIT 8;
  `);
  console.log('RAN_ROWS');
  console.log(ran || '(none)');

  const sample = sql(`
    SELECT id, guest_name, special_requests, total_price_agorot, deposit_agorot, payment_status
    FROM public.hotelos_bookings
    WHERE deleted_at IS NULL
      AND id LIKE 'kin_%'
      AND check_out_date >= CURRENT_DATE
    ORDER BY check_in_date
    LIMIT 5;
  `);
  console.log('SAMPLE_KIN');
  console.log(sample || '(none)');

  const jar = new Map();
  await login(jar);
  const resids = [...new Set([
    ...String(ran || '').split('\n').map((line) => (line.match(/kin_\d+_(\d+)/) || [])[1]),
    ...String(sample || '').split('\n').map((line) => (line.match(/kinorot:(\d+)/) || line.match(/kin_\d+_(\d+)/) || [])[1])
  ].filter(Boolean))].slice(0, 4);

  for (const resid of resids) {
    const page = await request(`${BASE}/resview.php?res=${encodeURIComponent(resid)}`, jar);
    if (isLoginPage(page.text)) {
      console.log(`RES ${resid} login-page`);
      continue;
    }
    const parsed = parseResviewPayment(page.text);
    console.log(`RES ${resid}`);
    console.log(JSON.stringify({ parsed, inputs: moneyInputs(page.text), snippets: snippets(page.text) }));
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
