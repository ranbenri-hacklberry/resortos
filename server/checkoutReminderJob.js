/**
 * Permanent checkout-reminder job (Ran approved 2026-10-21).
 *   plan   07:30  departures + skips → Ran (Chloe WhatsApp, if managerWhatsApp.enabled)
 *   send   08:30  SMS to departing guests (MicroPay) — DRY RUN unless explicitly enabled
 *   report 11:30  who checked out / who hasn't → Ran
 * Real guest SMS requires BOTH config.dryRun=false AND env CHECKOUT_REMINDER_DRY_RUN=0.
 * Data: Studio hotelos_bookings (read-only) + optional cloud overlay GET /api/checkout/departures.
 * Writes: only guest_communications rows for real sends (never in dry run).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { studioRest, sendAndLogGuestSms } from './guestComms.js';
import { unitFullName, CANONICAL_MANAGED_SPACES } from '../src/lib/units.js';
import {
  smsUnitName, addDaysIso, classifyForDate, dedupeKey, formatPlan, formatReport, messageFor
} from '../src/lib/checkoutReminder.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(ROOT, 'logs');

export function loadConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'checkoutReminder.json'), 'utf8')); }
  catch { return { dryRun: true, checkoutTime: '11:00', managerWhatsApp: { enabled: false } }; }
}

export function isDryRun(cfg, env = process.env) {
  // Default ON. Real sending only when config says false AND env explicitly '0'.
  return !(cfg.dryRun === false && String(env.CHECKOUT_REMINDER_DRY_RUN ?? '1') === '0');
}

export function israelDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

function log(line) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString();
  fs.appendFileSync(path.join(LOG_DIR, `checkout-reminder-${israelDate()}.log`), `${ts} ${line}\n`);
  console.log(`${ts} ${line}`);
}

const unitOf = (id) => CANONICAL_MANAGED_SPACES.find((u) => u.id === id) || null;
const unitNameOf = (id) => smsUnitName(unitFullName(id, id));

const COLS = 'id,tenant_id,unit_id,guest_name,guest_phone,check_in_date,check_out_date,booking_status,channel_source,special_requests,checkout_token,checkout_status,checked_out_at,wifi_presence_status,stay';

async function studioDepartures(date) {
  const prev = addDaysIso(date, -1);
  const rows = await studioRest(
    `hotelos_bookings?deleted_at=is.null&check_out_date=in.(${prev},${date})&select=${COLS}&limit=200`
  );
  return Array.isArray(rows) ? rows : [];
}

/** Optional cloud overlay (late checkout / self checkout live in the cloud stay). */
async function cloudOverlay(rows, date, env) {
  const url = String(env.CHECKOUT_DEPARTURES_URL || '').trim();
  const key = String(env.CHECKOUT_DEPARTURES_KEY || '').trim();
  if (!url || !key) return { used: false, reason: 'no CHECKOUT_DEPARTURES_URL/KEY' };
  const tokens = rows.map((r) => r.checkout_token).filter(Boolean);
  try {
    const res = await fetch(`${url}?date=${date}&tokens=${encodeURIComponent(tokens.join(','))}`, {
      headers: { 'x-resortos-departures-key': key }, signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return { used: false, reason: `cloud ${res.status}` };
    const body = await res.json();
    const byToken = new Map((body.rows || []).map((r) => [r.checkout_token, r]));
    for (const r of rows) {
      const c = byToken.get(r.checkout_token);
      if (!c) continue;
      r.stay = { ...(r.stay || {}), ...(c.stay || {}) };
      for (const k of ['booking_status', 'checked_out_at', 'checkout_status', 'guest_phone']) if (c[k]) r[k] = c[k];
    }
    return { used: true, matched: byToken.size };
  } catch (err) {
    return { used: false, reason: String(err.message || err) };
  }
}

async function alreadySent(bookingId, date) {
  const rows = await studioRest(
    `guest_communications?booking_id=eq.${encodeURIComponent(bookingId)}`
    + `&metadata->>dedupe_key=eq.${encodeURIComponent(dedupeKey(bookingId, date))}&status=eq.sent&select=id&limit=1`
  );
  return Array.isArray(rows) && rows.length > 0;
}

function acquireLock(date, staleMin = 15) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const file = path.join(LOG_DIR, `checkout-reminder-${date}.lock`);
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < staleMin * 60000) return null;
    fs.unlinkSync(file);
  } catch {}
  try { fs.writeFileSync(file, String(process.pid), { flag: 'wx' }); return () => fs.rmSync(file, { force: true }); }
  catch { return null; }
}

// Manager reports go to Ran ONLY (Ran 2026-10-21: never Adam / anyone else).
export const RAN_PHONE = '972548317887';
async function notifyRan(text, cfg, env, { notify }) {
  const wa = cfg.managerWhatsApp || {};
  if (!notify || !wa.enabled) return { sent: false, reason: notify ? 'managerWhatsApp disabled' : '--no-notify' };
  if (String(wa.phone || RAN_PHONE).replace(/\D/g, '') !== RAN_PHONE) return { sent: false, reason: 'managerWhatsApp.phone is not Ran – refused' };
  const res = await fetch(wa.agentUrl || 'http://127.0.0.1:8787/api/messages/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: RAN_PHONE, text }), signal: AbortSignal.timeout(15000)
  });
  return { sent: res.ok, status: res.status };
}

export async function buildItems(date, { now = new Date(), env = process.env, cfg = loadConfig(), checkDedupe = true } = {}) {
  const rows = await studioDepartures(date);
  const cloud = await cloudOverlay(rows, date, env);
  const items = [];
  for (const b of rows) {
    let item = classifyForDate(b, date, { now, unit: unitOf(b.unit_id), checkoutTime: cfg.checkoutTime });
    if (!item) continue;
    if (item.send && checkDedupe && await alreadySent(b.id, date)) {
      item = classifyForDate(b, date, { now, unit: unitOf(b.unit_id), checkoutTime: cfg.checkoutTime, alreadySent: true });
    }
    items.push(item);
  }
  return { items, cloud, sourceRows: rows.length };
}

export async function runCheckoutReminderJob({ mode = 'plan', date, now = new Date(), env = process.env, notify = true } = {}) {
  const cfg = loadConfig();
  const dryRun = isDryRun(cfg, env);
  const day = date || israelDate(now);
  log(`[${mode}] start date=${day} dryRun=${dryRun}`);
  const { items, cloud, sourceRows } = await buildItems(day, { now, env, cfg });
  log(`[${mode}] rows=${sourceRows} departing=${items.length} cloud=${JSON.stringify(cloud)}`);

  if (mode === 'plan') {
    const text = formatPlan(day, items, unitNameOf, { dryRun });
    log(`[plan]\n${text}`);
    const n = await notifyRan(text, cfg, env, { notify }).catch((e) => ({ sent: false, error: e.message }));
    log(`[plan] notify=${JSON.stringify(n)}`);
    return { mode, date: day, dryRun, text, notify: n };
  }
  if (mode === 'report') {
    const text = formatReport(day, items, unitNameOf);
    log(`[report]\n${text}`);
    const n = await notifyRan(text, cfg, env, { notify }).catch((e) => ({ sent: false, error: e.message }));
    log(`[report] notify=${JSON.stringify(n)}`);
    return { mode, date: day, dryRun, text, notify: n };
  }
  // send
  const release = acquireLock(day, cfg.lockStaleMinutes);
  if (!release) { log('[send] locked, another run in progress'); return { mode, locked: true }; }
  const results = [];
  try {
    for (const item of items) {
      const unitName = unitNameOf(item.booking.unit_id);
      if (!item.send) { results.push({ id: item.booking.id, skipped: item.reason }); continue; }
      const message = messageFor(item, unitName);
      if (dryRun) {
        log(`[send][DRY] ${item.booking.id} → ${item.phone.slice(0, 5)}… | ${message}`);
        results.push({ id: item.booking.id, dry: true, message });
        continue;
      }
      try {
        await sendAndLogGuestSms({
          booking: item.booking, phone: item.phone, message, skipBcc: true,
          metadata: { kind: 'checkout_reminder', template: 'checkout_reminder_v2', dedupe_key: dedupeKey(item.booking.id, day) }
        });
        log(`[send] SENT ${item.booking.id}`);
        results.push({ id: item.booking.id, sent: true });
      } catch (err) {
        log(`[send] FAIL ${item.booking.id} ${err.message}`);
        results.push({ id: item.booking.id, error: err.message });
      }
    }
  } finally { release(); }
  return { mode, date: day, dryRun, results, errors: results.filter((r) => r.error) };
}
