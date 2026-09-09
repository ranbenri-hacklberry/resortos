#!/usr/bin/env node
/**
 * Scrape Kinorot GO occupancy boards and upsert into Studio hotelos_bookings.
 * Intended to run on the Mac Studio via launchd / `npm run sync:kinorot`.
 */
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KINOROT_COMPLEXES, KINOROT_PLACE_TO_UNIT, TENANT_ID } from './kinorotPlaces.js';
import { parseResviewPayment } from '../functions/lib/kinorotZcredit.js';
import { moneyFromKinorotPayment } from '../src/lib/kinorotNotePayments.js';
import { appendStayHoursToken, notesFromResviewHtml, parseStayHoursFromNotes } from '../src/lib/kinorotStayHours.js';
import { writeKinorotSyncStatus } from './kinorotSyncControl.js';
import { summarizeKinorotDiff } from './kinorotSyncDiff.js';
import { notifySameDayKinorotBookings } from './kinorotSameDaySms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = 'https://app.kinorotgo.co.il';
const DAYS = Number(process.env.KINOROT_DAYS || 45);
const BACK_DAYS = Number(process.env.KINOROT_BACK_DAYS || 31);
const COOKIE_FILE = path.join(ROOT, 'server', 'kinorot.session');

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
  const headers = {
    'User-Agent': 'Mozilla/5.0 ResortOSKinorotSync',
    ...(options.headers || {})
  };
  const cookie = cookieHeader(jar);
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(url, {
    redirect: 'manual',
    ...options,
    headers
  });
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
  const text = await response.text();
  return { status: response.status, url: response.url, text };
}

function looksLoggedIn(html) {
  const text = String(html || '');
  if (/One moment, please|cf-browser-verification|Just a moment/i.test(text.slice(0, 4000))) return false;
  if (/name="pass"|הכניסו את פרטי ההתחברות/.test(text.slice(0, 8000))) return false;
  return /boardhp|התנתק|homepage\.php|clerk=/.test(text);
}

async function login(jar) {
  const user = process.env.KINOROT_USER || '';
  const pass = process.env.KINOROT_PASSWORD || '';
  if (!user || !pass) {
    throw new Error('Missing KINOROT_USER / KINOROT_PASSWORD in .env');
  }
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
  const home = await request(next, jar);
  if (!looksLoggedIn(home.text) && !jar.has('PHPSESSID')) {
    throw new Error('Kinorot login failed');
  }
  return home;
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function extractTilePayloads(html) {
  const payloads = [];
  const needle = 'handleTileClick(event,';
  let from = 0;
  while (true) {
    const hit = html.indexOf(needle, from);
    if (hit < 0) break;
    const start = html.indexOf('{', hit);
    if (start < 0) break;
    let depth = 0;
    let end = -1;
    for (let i = start; i < html.length; i += 1) {
      const ch = html[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) break;
    try {
      payloads.push(JSON.parse(decodeEntities(html.slice(start, end + 1))));
    } catch {
      /* skip malformed tile payload */
    }
    from = end + 1;
  }
  return payloads;
}

function cleanGuestName(value) {
  const name = decodeEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return 'אורח';
  if (/[<>]|vertical-align|data-roomtype|cckin\.svg|cell-name|status-icon|border-bo/i.test(name)) {
    return 'אורח';
  }
  return name.slice(0, 120);
}

function isOccupancyStatus(status) {
  const st = String(status || '');
  return !/תחזוקה|מבוטלת|cancel|maintenance/i.test(st);
}

function stripToText(html) {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePaxFromText(text) {
  const src = String(text || '');
  const labeled = src.match(/אורחים:\s*(\d+)\s*מבוגרים(?:\s*\/\s*(\d+)\s*ילדים)?(?:\s*\/\s*(\d+)\s*תינוק)?/);
  if (labeled) {
    return {
      adults: Number(labeled[1]),
      children: Number(labeled[2] || 0),
      infants: Number(labeled[3] || 0)
    };
  }
  const alt = src.match(/מבוגרים\s+(\d+)(?:\s*\/\s*ילדים\s+(\d+))?(?:\s*\/\s*תינוק(?:ות)?\s+(\d+))?/);
  if (alt) {
    const infantsFromWord = Number((src.match(/(\d+)\s*תינוק/) || [])[1] || 0);
    return {
      adults: Number(alt[1]),
      children: Number(alt[2] || 0),
      infants: Number(alt[3] || infantsFromWord || 0)
    };
  }
  return null;
}

function collectPaxByKey(html) {
  const map = new Map();
  const re = /data-resid="(\d+)"/g;
  let match;
  while ((match = re.exec(html))) {
    const resid = match[1];
    const chunk = html.slice(match.index, Math.min(html.length, match.index + 5000));
    const place = (chunk.match(/data-roomtype="(\d+)"/) || [])[1] || '';
    if (!place) continue;
    const key = `${place}|${resid}`;
    if (map.has(key)) continue;
    const pax = parsePaxFromText(stripToText(chunk));
    if (pax && Number.isFinite(pax.adults)) map.set(key, pax);
  }
  return map;
}

export function parseBoardHtml(html) {
  const paxByKey = collectPaxByKey(html);
  const seen = new Map();
  for (const tile of extractTilePayloads(html)) {
    const resid = String(tile.resid || '').trim();
    const place = String(tile.roomtype || '').trim();
    const cin = String(tile.checkin || '').trim();
    const cout = String(tile.checkout || '').trim();
    const st = String(tile.status || '').trim();
    if (!resid || !place || !cin || !cout) continue;
    if (!isOccupancyStatus(st)) continue;
    const unitId = KINOROT_PLACE_TO_UNIT[place];
    if (!unitId) continue;
    const key = `${place}|${resid}`;
    if (seen.has(key)) continue;
    const pax = paxByKey.get(key);
    seen.set(key, {
      resid,
      place,
      unitId,
      cin,
      cout,
      st,
      guest: cleanGuestName(tile.realguestname || tile.name),
      phone: String(tile.phone || '').trim(),
      email: String(tile.email || '').trim(),
      adults: pax ? pax.adults : 2,
      children: pax ? pax.children : 0,
      infants: pax ? pax.infants : 0,
      paxFromBoard: Boolean(pax)
    });
  }
  return [...seen.values()];
}

function parseResviewGuest(html) {
  const block = String(html || '').match(/<div class="t">לקוח:<\/div>[\s\S]{0,1800}?<table/i);
  const src = block ? block[0] : '';
  const phones = [...src.matchAll(/href="tel:([^"]+)"/gi)]
    .map((match) => String(match[1]).replace(/[^\d+]/g, ''))
    .filter((phone) => phone && phone !== '0509506222');
  const email = (src.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/) || [])[1] || '';
  return {
    phone: phones[0] || '',
    email
  };
}

function isLoginPage(html) {
  return /name="pass"|הכניסו את פרטי ההתחברות/.test(String(html || '').slice(0, 8000));
}

async function enrichGuestContacts(rows, jar) {
  const unique = [...new Set(rows.map((row) => row.resid).filter(Boolean))];
  console.log(`[kinorot] fetching ${unique.length} reservation pages for phones`);
  const details = new Map();
  for (let i = 0; i < unique.length; i += 1) {
    const resid = unique[i];
    try {
      let page = await request(`${BASE}/resview.php?res=${encodeURIComponent(resid)}`, jar);
      if (isLoginPage(page.text)) {
        jar.clear();
        await login(jar);
        saveJar(jar);
        page = await request(`${BASE}/resview.php?res=${encodeURIComponent(resid)}`, jar);
      }
      details.set(resid, {
        ...parseResviewGuest(page.text),
        payment: parseResviewPayment(page.text),
        pax: parsePaxFromText(stripToText(page.text)),
        hours: parseStayHoursFromNotes(notesFromResviewHtml(page.text))
      });
    } catch (err) {
      console.log(`[kinorot] resview ${resid} failed: ${err.message || err}`);
    }
    if ((i + 1) % 20 === 0 || i + 1 === unique.length) {
      console.log(`[kinorot] phones ${i + 1}/${unique.length}`);
    }
  }
  let withPhone = 0;
  for (const row of rows) {
    const detail = details.get(row.resid);
    if (!detail) continue;
    if (detail.phone) {
      row.phone = detail.phone;
      withPhone += 1;
    }
    if (detail.email && !row.email) row.email = detail.email;
    if (!row.paxFromBoard && detail.pax && Number.isFinite(detail.pax.adults)) {
      row.adults = detail.pax.adults;
      row.children = detail.pax.children || 0;
      row.infants = detail.pax.infants || 0;
    }
    if (detail.payment) row.payment = detail.payment;
    if (detail.hours) row.hours = detail.hours;
  }
  console.log(`[kinorot] phones found ${withPhone}/${rows.length}`);
  return jar;
}

function bookingStatus(st, cin, cout, today, paymentStatus) {
  if (cout <= today) return 'CHECKED_OUT';
  return 'CONFIRMED';
}

function channelSource(resid) {
  return String(resid).length > 10 ? 'airbnb' : 'kinorot';
}

function sqlString(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function appendPayToken(req, money) {
  const cleaned = String(req || '').replace(/\|pay:(?:voucher|comp)\b/g, '');
  if (money?.payment_mode === 'VOUCHER') return `${cleaned}|pay:voucher`;
  if (money?.payment_mode === 'COMP') return `${cleaned}|pay:comp`;
  return cleaned;
}

function moneyFromResview(payment, resid) {
  return moneyFromKinorotPayment(payment, resid);
}

function bookingRow(row, today) {
  const id = `kin_${row.place}_${row.resid}`;
  const money = moneyFromResview(row.payment, row.resid);
  const status = bookingStatus(row.st, row.cin, row.cout, today, money.payment_status);
  return {
    id,
    unit_id: row.unitId,
    guest_name: row.guest,
    guest_phone: row.phone || '',
    guest_email: row.email || '',
    check_in_date: row.cin,
    check_out_date: row.cout,
    adults_count: row.adults,
    children_count: row.children,
    booking_status: status,
    channel_source: channelSource(row.resid),
    special_requests: appendPayToken(
      appendStayHoursToken(
        `kinorot:${row.resid}|pax:${Number(row.adults) || 0}+${Number(row.children) || 0}+${Number(row.infants) || 0}`,
        row.hours || {}
      ),
      money
    ),
    checkout_token: `tok_${id}`,
    ...money
  };
}

function staysOverlap(a, b) {
  return a.unit_id === b.unit_id
    && a.check_in_date < b.check_out_date
    && a.check_out_date > b.check_in_date;
}

function stayNights(row) {
  const start = new Date(`${row.check_in_date}T12:00:00`).getTime();
  const end = new Date(`${row.check_out_date}T12:00:00`).getTime();
  return Math.max(0, Math.round((end - start) / 86400000));
}

function residFromBookingId(id) {
  const match = String(id || '').match(/_(\d+)$/);
  return Number(match?.[1] || 0);
}

function dedupeIncomingOverlaps(rows) {
  const ranked = [...rows].sort((a, b) => {
    const nights = stayNights(b) - stayNights(a);
    if (nights) return nights;
    return residFromBookingId(b.id) - residFromBookingId(a.id);
  });
  const kept = [];
  for (const row of ranked) {
    if (kept.some((other) => staysOverlap(row, other))) continue;
    kept.push(row);
  }
  return kept;
}

function clearStaleKinOverlapsSql(rows) {
  if (!rows.length) return '';
  const values = rows.map((row) => (
    `(${sqlString(row.id)}, ${sqlString(row.unit_id)}, ${sqlString(row.check_in_date)}::date, ${sqlString(row.check_out_date)}::date)`
  )).join(',\n    ');
  return `
UPDATE public.hotelos_bookings o
SET
  booking_status = 'CANCELED',
  deleted_at = COALESCE(o.deleted_at, now()),
  cancellation_reason = CASE
    WHEN COALESCE(o.cancellation_reason, '') <> '' THEN o.cancellation_reason
    ELSE 'replaced_by_kinorot'
  END,
  updated_at = now()
WHERE o.deleted_at IS NULL
  AND o.booking_status IS DISTINCT FROM 'CANCELED'
  AND o.id LIKE 'kin\\_%' ESCAPE '\\'
  AND EXISTS (
    SELECT 1 FROM (VALUES
      ${values}
    ) AS n(id, unit_id, cin, cout)
    WHERE o.unit_id = n.unit_id
      AND o.id IS DISTINCT FROM n.id
      AND o.check_in_date < n.cout
      AND o.check_out_date > n.cin
  );
`;
}

function clearLocalOverlapsSql(rows) {
  if (!rows.length) return '';
  const clauses = rows.map((row) => `(
    o.unit_id = ${sqlString(row.unit_id)}
    AND o.check_in_date < ${sqlString(row.check_out_date)}
    AND o.check_out_date > ${sqlString(row.check_in_date)}
  )`).join('\n    OR ');
  return `
UPDATE public.hotelos_bookings o
SET
  booking_status = 'CANCELED',
  deleted_at = COALESCE(o.deleted_at, now()),
  cancellation_reason = CASE
    WHEN COALESCE(o.cancellation_reason, '') <> '' THEN o.cancellation_reason
    ELSE 'replaced_by_kinorot'
  END,
  updated_at = now()
WHERE o.deleted_at IS NULL
  AND o.booking_status IS DISTINCT FROM 'CANCELED'
  AND o.id NOT LIKE 'kin\\_%' ESCAPE '\\'
  AND (
    ${clauses}
  );
`;
}

function updateExistingDatesSql(rows) {
  if (!rows.length) return '';
  const values = rows.map((row) => (
    `(${sqlString(row.id)}, ${sqlString(row.check_in_date)}::date, ${sqlString(row.check_out_date)}::date)`
  )).join(',\n    ');
  return `
UPDATE public.hotelos_bookings b
SET
  check_in_date = n.cin,
  check_out_date = n.cout,
  updated_at = now()
FROM (VALUES
    ${values}
) AS n(id, cin, cout)
WHERE b.id = n.id
  AND b.deleted_at IS NULL
  AND (b.check_in_date IS DISTINCT FROM n.cin OR b.check_out_date IS DISTINCT FROM n.cout);
`;
}

function buildSql(rows, today, { allowVanish = false } = {}) {
  const ids = rows.map((row) => sqlString(row.id));
  const inserts = rows.map((row) => `
INSERT INTO public.hotelos_bookings (
  id, tenant_id, unit_id, guest_name, guest_phone, guest_email, check_in_date, check_out_date,
  adults_count, children_count, total_price_agorot, deposit_agorot, booking_status,
  payment_status, payment_mode, clearing_payments, channel_source, checkout_token, special_requests, created_at, updated_at, version
) VALUES (
  ${sqlString(row.id)}, '${TENANT_ID}', ${sqlString(row.unit_id)}, ${sqlString(row.guest_name)},
  ${sqlString(row.guest_phone)}, ${sqlString(row.guest_email)},
  ${sqlString(row.check_in_date)}, ${sqlString(row.check_out_date)},
  ${row.adults_count}, ${row.children_count}, ${Number(row.total_price_agorot) || 0}, ${Number(row.deposit_agorot) || 0}, ${sqlString(row.booking_status)},
  ${sqlString(row.payment_status || 'UNPAID')}, ${row.payment_mode ? sqlString(row.payment_mode) : 'NULL'},
  ${sqlString(JSON.stringify(row.clearing_payments || []))}::jsonb,
  ${sqlString(row.channel_source)}, ${sqlString(row.checkout_token)},
  ${sqlString(row.special_requests)}, now(), now(), 1
)
ON CONFLICT (id) DO UPDATE SET
  guest_name = CASE
    WHEN btrim(COALESCE(EXCLUDED.guest_name, '')) IN ('', 'תפוס', 'אורח')
      THEN public.hotelos_bookings.guest_name
    ELSE EXCLUDED.guest_name
  END,
  guest_phone = CASE
    WHEN EXCLUDED.guest_phone <> '' THEN EXCLUDED.guest_phone
    ELSE public.hotelos_bookings.guest_phone
  END,
  guest_email = CASE
    WHEN EXCLUDED.guest_email <> '' THEN EXCLUDED.guest_email
    ELSE public.hotelos_bookings.guest_email
  END,
  check_in_date = EXCLUDED.check_in_date,
  check_out_date = EXCLUDED.check_out_date,
  adults_count = EXCLUDED.adults_count,
  children_count = EXCLUDED.children_count,
  booking_status = CASE
    WHEN public.hotelos_bookings.booking_status = 'CHECKED_OUT' THEN public.hotelos_bookings.booking_status
    WHEN EXCLUDED.check_out_date <= ${sqlString(today)}::date THEN 'CHECKED_OUT'
    ELSE EXCLUDED.booking_status
  END,
  channel_source = EXCLUDED.channel_source,
  special_requests = EXCLUDED.special_requests,
  unit_id = EXCLUDED.unit_id,
  updated_at = now(),
  deleted_at = NULL,
  total_price_agorot = CASE
    WHEN public.hotelos_bookings.total_price_agorot > 0 THEN public.hotelos_bookings.total_price_agorot
    ELSE EXCLUDED.total_price_agorot
  END,
  deposit_agorot = CASE
    WHEN EXCLUDED.deposit_agorot > public.hotelos_bookings.deposit_agorot THEN EXCLUDED.deposit_agorot
    WHEN public.hotelos_bookings.payment_status IN ('PAID', 'DEPOSIT_PAID', 'PARTIAL', 'PENDING_CASH', 'PENDING_BANK')
      THEN public.hotelos_bookings.deposit_agorot
    WHEN EXCLUDED.deposit_agorot > 0 THEN EXCLUDED.deposit_agorot
    WHEN public.hotelos_bookings.total_price_agorot > 0
      THEN ROUND(public.hotelos_bookings.total_price_agorot * 0.20)
    ELSE public.hotelos_bookings.deposit_agorot
  END,
  payment_mode = COALESCE(EXCLUDED.payment_mode, public.hotelos_bookings.payment_mode),
  clearing_payments = CASE
    WHEN EXCLUDED.clearing_payments = '[]'::jsonb THEN public.hotelos_bookings.clearing_payments
    ELSE (
      SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
      FROM (
        SELECT e
        FROM jsonb_array_elements(COALESCE(public.hotelos_bookings.clearing_payments, '[]'::jsonb)) e
        WHERE COALESCE(e->>'source', '') <> 'KINOROT'
        UNION ALL
        SELECT e
        FROM jsonb_array_elements(EXCLUDED.clearing_payments) e
      ) x
    )
  END,
  payment_status = CASE
    WHEN public.hotelos_bookings.payment_status IN ('PENDING_CASH', 'PENDING_BANK')
      THEN public.hotelos_bookings.payment_status
    WHEN EXCLUDED.payment_mode IN ('VOUCHER', 'COMP') THEN 'PAID'
    WHEN EXCLUDED.clearing_payments <> '[]'::jsonb AND EXCLUDED.payment_status IN ('PAID', 'DEPOSIT_PAID', 'PARTIAL')
      THEN EXCLUDED.payment_status
    WHEN COALESCE(public.hotelos_bookings.clearing_payments, '[]'::jsonb) = '[]'::jsonb
      AND public.hotelos_bookings.payment_status IN ('PAID', 'DEPOSIT_PAID', 'PARTIAL')
      THEN COALESCE(NULLIF(EXCLUDED.payment_status, ''), 'UNPAID')
    ELSE public.hotelos_bookings.payment_status
  END;
`).join('\n');

  const vanish = (allowVanish && ids.length)
    ? `
UPDATE public.hotelos_bookings
SET deleted_at = now(), updated_at = now()
WHERE id LIKE 'kin\\_%' ESCAPE '\\'
  AND deleted_at IS NULL
  AND check_out_date >= ${sqlString(today)}
  AND id NOT IN (${ids.join(', ')});
`
    : '';

  const closePast = `
UPDATE public.hotelos_bookings
SET booking_status = 'CHECKED_OUT', updated_at = now()
WHERE id LIKE 'kin\\_%' ESCAPE '\\'
  AND deleted_at IS NULL
  AND check_out_date <= ${sqlString(today)}
  AND booking_status IN ('CHECKED_IN', 'CONFIRMED', 'PENDING');
`;

  return `BEGIN;\n${clearLocalOverlapsSql(rows)}\n${clearStaleKinOverlapsSql(rows)}\n${updateExistingDatesSql(rows)}\n${inserts}\n${vanish}\n${closePast}\nCOMMIT;\n`;
}

function resolvePsql() {
  const envPath = process.env.PSQL_BIN;
  const candidates = [
    envPath,
    '/opt/homebrew/bin/psql',
    '/usr/local/bin/psql',
    'psql'
  ].filter(Boolean);
  for (const bin of candidates) {
    const probe = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return bin;
  }
  return 'psql';
}

function runSql(sql) {
  const tmp = path.join('/tmp', `kinorot_sync_${Date.now()}.sql`);
  fs.writeFileSync(tmp, sql);
  const env = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin'}`,
    PGPASSWORD: process.env.PGPASSWORD || 'postgres'
  };
  const host = process.env.PGHOST || '127.0.0.1';
  const port = process.env.PGPORT || '54322';
  const psql = resolvePsql();
  const direct = spawnSync(psql, ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', tmp], {
    env,
    encoding: 'utf8'
  });
  if (direct.status === 0) return direct.stdout;
  let names = '';
  try {
    names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
  } catch {
    names = '';
  }
  const container = names.split('\n').find((n) => /supabase_db/.test(n));
  if (!container) {
    throw new Error(`psql failed: ${direct.stderr || direct.stdout || 'no supabase db container'}`);
  }
  const piped = spawnSync('docker', ['exec', '-i', '-u', 'postgres', container, 'psql', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    encoding: 'utf8'
  });
  if (piped.status !== 0) {
    throw new Error(piped.stderr || piped.stdout || 'docker psql failed');
  }
  return piped.stdout;
}

function saveJar(jar) {
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(Object.fromEntries(jar)));
}

function loadJar() {
  const jar = new Map();
  if (!fs.existsSync(COOKIE_FILE)) return jar;
  try {
    const raw = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    for (const [k, v] of Object.entries(raw || {})) jar.set(k, v);
  } catch {
    /* ignore stale cookie file */
  }
  return jar;
}

function todayIso() {
  const now = new Date();
  const israel = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const y = israel.getFullYear();
  const m = String(israel.getMonth() + 1).padStart(2, '0');
  const d = String(israel.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function headerTdate(html) {
  return (String(html || '').match(/id="headerTdate"\s+value="([^"]+)"/) || [])[1] || '';
}

function boardWindows(today) {
  const windows = [];
  const latest = addDaysIso(today, Math.max(0, DAYS));
  let cursor = today;
  while (cursor <= latest) {
    windows.push({ tdate: cursor, days: 14 });
    cursor = addDaysIso(cursor, 14);
  }
  const earliest = addDaysIso(today, -Math.max(0, BACK_DAYS));
  cursor = earliest;
  while (cursor < today) {
    windows.push({ tdate: cursor, days: 14 });
    cursor = addDaysIso(cursor, 14);
  }
  return windows;
}

export async function scrapeKinorotBoards() {
  let jar = loadJar();
  let probe = await request(`${BASE}/boardhp.php?days=1`, jar);
  if (!looksLoggedIn(probe.text)) {
    jar = new Map();
    await login(jar);
    saveJar(jar);
  }
  const all = new Map();
  const unmapped = new Map();
  const today = todayIso();
  const windows = boardWindows(today);
  console.log(`[kinorot] windows ${windows.map((win) => `${win.tdate}/${win.days}d`).join(' · ')}`);
  for (const complex of KINOROT_COMPLEXES) {
    for (const win of windows) {
      const url = `${BASE}/boardhp.php?complex=${complex}&days=${win.days}&tdate=${win.tdate}`;
      let page = await request(url, jar);
      if (!looksLoggedIn(page.text)) {
        jar = new Map();
        await login(jar);
        saveJar(jar);
        page = await request(url, jar);
      }
      const shown = headerTdate(page.text);
      if (win.tdate !== today && shown && shown !== win.tdate) {
        console.log(`[kinorot] skip clamped complex=${complex} asked=${win.tdate} got=${shown}`);
        continue;
      }
      for (const tile of extractTilePayloads(page.text)) {
        const resid = String(tile.resid || '').trim();
        const place = String(tile.roomtype || '').trim();
        const cin = String(tile.checkin || '').trim();
        const cout = String(tile.checkout || '').trim();
        const st = String(tile.status || '').trim();
        if (!resid || !place || !cin || !cout || !isOccupancyStatus(st)) continue;
        const key = `${place}|${resid}`;
        if (!KINOROT_PLACE_TO_UNIT[place] && !unmapped.has(key)) {
          unmapped.set(key, {
            resid,
            place,
            cin,
            cout,
            st,
            guest: cleanGuestName(tile.realguestname || tile.name)
          });
        }
      }
      for (const row of parseBoardHtml(page.text)) all.set(`${row.place}|${row.resid}`, row);
    }
  }
  saveJar(jar);
  return { rows: [...all.values()], unmapped: [...unmapped.values()], jar, today };
}

export async function scrapeKinorot() {
  const { rows, jar } = await scrapeKinorotBoards();
  if (process.env.KINOROT_SKIP_ENRICH === '1') return rows;
  const nextJar = await enrichGuestContacts(rows, jar);
  saveJar(nextJar);
  return rows;
}

export { bookingRow, dedupeIncomingOverlaps, todayIso, addDaysIso };

function fetchJsonSql(sql) {
  const env = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin'}`,
    PGPASSWORD: process.env.PGPASSWORD || 'postgres'
  };
  const result = spawnSync(
    resolvePsql(),
    ['-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '54322',
      '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { env, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'psql json failed');
  }
  const raw = String(result.stdout || '').trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function loadExistingKinRows(incoming, today) {
  const from = addDaysIso(today, -BACK_DAYS);
  const to = addDaysIso(today, DAYS);
  const ids = incoming.map((row) => sqlString(row.id));
  const idFilter = ids.length ? `id IN (${ids.join(',')}) OR` : '';
  return fetchJsonSql(`
SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
FROM (
  SELECT id, unit_id, guest_name, check_in_date::text, check_out_date::text,
         booking_status, deleted_at
  FROM public.hotelos_bookings
  WHERE id LIKE 'kin\\_%' ESCAPE '\\'
    AND (
      ${idFilter}
      (
        deleted_at IS NULL
        AND booking_status IS DISTINCT FROM 'CANCELED'
        AND check_out_date >= ${sqlString(from)}::date
        AND check_in_date <= ${sqlString(to)}::date
      )
    )
) t;
`);
}

function countLiveKinFuture(today) {
  const env = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin'}`,
    PGPASSWORD: process.env.PGPASSWORD || 'postgres'
  };
  const host = process.env.PGHOST || '127.0.0.1';
  const port = process.env.PGPORT || '54322';
  const result = spawnSync(
    resolvePsql(),
    ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c',
      `SELECT count(*) FROM public.hotelos_bookings WHERE id LIKE 'kin_%' AND deleted_at IS NULL AND check_out_date >= '${today.replace(/'/g, "''")}';`],
    { env, encoding: 'utf8' }
  );
  if (result.status !== 0) return 0;
  return Number(String(result.stdout || '').trim()) || 0;
}

export async function main() {
  const today = todayIso();
  writeKinorotSyncStatus({ running: true, lastAttemptAt: new Date().toISOString(), lastError: null });
  console.log(`[kinorot] scrape days=${DAYS} back=${BACK_DAYS} today=${today}`);
  const scraped = await scrapeKinorot();
  const rows = dedupeIncomingOverlaps(scraped.map((row) => bookingRow(row, today)));
  const cins = rows.map((row) => row.check_in_date).filter(Boolean).sort();
  console.log(`[kinorot] parsed ${rows.length} stays range ${cins[0] || '—'} → ${cins.at(-1) || '—'}`);
  if (!rows.length) throw new Error('No Kinorot stays parsed');
  const liveFuture = countLiveKinFuture(today);
  const allowVanish = process.env.KINOROT_ALLOW_VANISH === '1'
    && rows.length >= 200
    && liveFuture > 0
    && rows.length >= liveFuture * 0.98;
  if (!allowVanish) {
    console.warn(`[kinorot] skip vanish scraped=${rows.length} liveFuture=${liveFuture}`);
  }
  const existing = loadExistingKinRows(rows, today);
  const changes = summarizeKinorotDiff({ incoming: rows, existing, today });
  console.log(`[kinorot] diff new=${changes.created.length} updated=${changes.updated.length} removed=${changes.removed.length}`);
  const sql = buildSql(rows, today, { allowVanish });
  const out = runSql(sql);
  console.log(out.trim().split('\n').slice(-8).join('\n'));
  console.log(`[kinorot] upserted ${rows.length} rows`);
  try {
    const sms = await notifySameDayKinorotBookings(changes.created, today);
    if (sms.rows) {
      console.log(`[kinorot] same-day sms rows=${sms.rows} sent=${sms.sent} errors=${sms.errors?.length || 0}`);
      if (sms.errors?.length) console.warn('[kinorot] same-day sms', sms.errors.map((item) => item.error).join(' · '));
    }
  } catch (err) {
    console.warn(`[kinorot] same-day sms failed: ${err.message || err}`);
  }
  fetch(process.env.HOTELOS_BRIDGE_URL ? `${String(process.env.HOTELOS_BRIDGE_URL).replace(/\/$/, '')}/api/guest-context-push` : 'http://127.0.0.1:4038/api/guest-context-push', {
    method: 'POST'
  }).catch(() => {});
  writeKinorotSyncStatus({
    running: false,
    lastOkAt: new Date().toISOString(),
    lastError: null,
    rows: rows.length,
    ...(changes.total ? {
      changeId: new Date().toISOString(),
      changes: {
        created: changes.created,
        updated: changes.updated,
        removed: changes.removed,
        total: changes.total
      }
    } : {})
  });
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((err) => {
    console.error(`[kinorot] ${err.message || err}`);
    writeKinorotSyncStatus({
      running: false,
      lastAttemptAt: new Date().toISOString(),
      lastError: String(err.message || err)
    });
    process.exit(1);
  });
}
