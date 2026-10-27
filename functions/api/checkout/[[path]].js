import {
  applyHypPaid,
  hypAlreadyPaid,
  hypDepositPaid,
  quoteCheckin,
  quoteGuestCharge,
  startCardCheckin,
  chargeSavedCardCheckin,
  startGuestPayment,
  stayFullyPaid,
  withoutCardToken,
  hypClientPayment
} from '../../lib/checkinCharge.js';
import {
  findHypDealForCheckout,
  getHypLowProfileResult,
  inquireHypByOrder,
  hypBrowserReturnUrl,
  hypReceiptUrl,
  hypCheckoutTokenFromParams,
  hypDealToReturnParams,
  hypLowProfileIdFromParams,
  hypParentBreakoutResponse,
  HYP_RETURN_ORIGIN,
  isHypPaid,
  parseHypQuery,
  verifyHypReturn
} from '../../lib/hypPay.js';
import { persistReservationPaymentMethod, stripCardSecrets } from '../../lib/reservationPaymentMethods.js';
import {
  idPhotoKeyBytes,
  idPhotoKvKey,
  idPhotoTtlSeconds,
  openIdPhoto,
  sealIdPhoto,
  sniffIdPhoto,
  stripIdPhoto
} from '../../lib/idPhoto.js';
import { scanGuestId } from '../../lib/idScan.js';
import { allCabinsPaid, applyPaySplitView, resolveStayUnitId } from '../../lib/paySplit.js';
import { verifyStaffPin } from '../../lib/staffPin.js';
import { normalizeBalancePreference } from '../../lib/balancePref.js';
import { buildDemoCheckoutRow } from '../../lib/demoCheckout.js';
import { departuresAuthorized, parseDeparturesQuery, departureRow } from '../../lib/checkoutDepartures.js';
import { applyPaidArrivalCheckin, stayExpiresAt, stayLinkExpired } from '../../../src/lib/stayAccess.js';
import {
  CATALOG_LOCKBOX,
  CATALOG_WIFI,
  UNIT_WIFI,
  RAMOT_GATE_CODE,
  UNIT_PROPERTY
} from '../../lib/unitNames.js';
import { loadCalendarReplica } from '../../lib/calendarReplica.js';

const TOKEN_RE = /^tok_[A-Za-z0-9_-]+$/;
const BOOKING_PREFIX = 'booking:';

function guestStayRedirect(request, token, extra = {}) {
  const url = new URL(`/stay/${encodeURIComponent(token)}`, HYP_RETURN_ORIGIN);
  for (const [key, value] of Object.entries(extra)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  return hypParentBreakoutResponse(url.toString());
}

function afterPayRedirect(request, token, row, extra = {}) {
  if (row?.stay?.hyp_intent?.stage === 'desk') {
    const url = new URL('/desk', HYP_RETURN_ORIGIN);
    for (const [key, value] of Object.entries(extra)) {
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
    return hypParentBreakoutResponse(url.toString());
  }
  return guestStayRedirect(request, token, extra);
}

function hypSuccessUrl() {
  return hypBrowserReturnUrl();
}

function hypChargeReturn(body) {
  const embed = Boolean(body?.embed_receipt);
  const url = embed ? hypReceiptUrl() : hypSuccessUrl();
  return { successUrl: url, failUrl: url, stayInFrame: embed };
}

async function hypSearchFromRequest(request) {
  const url = new URL(request.url);
  if (url.search && url.search.length > 1) return url.search.slice(1);
  if (request.method === 'POST') {
    const ct = String(request.headers.get('content-type') || '');
    if (ct.includes('application/x-www-form-urlencoded')) return (await request.text()).trim();
    if (ct.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      if (typeof body.query === 'string') return String(body.query).replace(/^\?/, '');
      return new URLSearchParams(body).toString();
    }
  }
  return '';
}

async function persistStay(env, token, row, stay, payment) {
  const stored = {
    ...row,
    stay,
    payment: payment || row.payment || null,
    updated_at: new Date().toISOString()
  };
  const saved = await persistGuestRow(env, token, stored);
  if (!saved) {
    const err = new Error('MAILBOX_WRITE_FAILED');
    err.status = 503;
    throw err;
  }
  await addInboxToken(env, token, stored);
  return stored;
}

async function recoverHypPaymentIfNeeded(env, token, row) {
  if (!row || hypAlreadyPaid(row)) return row;
  if (row.booking_status === 'CANCELED') return row;
  const intent = row.stay?.hyp_intent;
  const balanceDue = Boolean(intent?.lowProfileId)
    && !stayFullyPaid(row)
    && (intent.purpose === 'balance' || intent.purpose === 'extra' || intent.stage === 'checkin');
  if (hypDepositPaid(row) && !balanceDue) return row;
  const waiting = balanceDue
    || row.payment_status === 'UNPAID'
    || row.booking_status === 'PENDING'
    || intent?.status === 'redirected'
    || (intent?.status === 'paid' && balanceDue);
  if (!waiting) return row;
  try {
    if (intent?.lowProfileId) {
      const lp = await getHypLowProfileResult(env, intent.lowProfileId, {
        terminal: intent.terminal,
        order: token
      });
      if (lp.paid) {
        const marked = await markHypPaid(env, token, row, lp.params, {
          terminal: lp.terminal || intent.terminal || 'B',
          purpose: intent.purpose || 'deposit'
        });
        return marked?.stored || row;
      }
    }
    const inquireTerminals = intent?.terminal === 'A' ? ['A', 'B'] : ['B', 'A'];
    for (const terminal of inquireTerminals) {
      try {
        const inquired = await inquireHypByOrder(env, token, terminal);
        const id = String(inquired.params?.Id || inquired.params?.TransId || '').trim();
        const code = Number(inquired.params?.CCode);
        const failed = Number.isFinite(code) && code !== 0;
        if (id && !failed) {
          const marked = await markHypPaid(env, token, row, {
            CCode: '0',
            ...inquired.params,
            Id: id,
            Order: token
          }, {
            terminal: inquired.terminal || terminal,
            purpose: intent?.purpose || 'deposit'
          });
          return marked?.stored || row;
        }
      } catch (_) {}
    }
    const deal = await findHypDealForCheckout(env, token, row);
    if (!deal) return row;
    const marked = await markHypPaid(env, token, row, hypDealToReturnParams(deal, token), {
      terminal: intent?.terminal || 'B',
      purpose: intent?.purpose || 'deposit'
    });
    return marked?.stored || row;
  } catch (err) {
    console.warn('[hyp recover]', String(err?.message || err));
    return row;
  }
}

async function markHypPaid(env, token, row, params, extra = {}) {
  const stay = { ...(row.stay || {}), folio: Array.isArray(row.stay?.folio) ? [...row.stay.folio] : [] };
  const result = applyHypPaid(row, stay, params, {
    purpose: extra.purpose || stay.hyp_intent?.purpose,
    stage: extra.stage || stay.hyp_intent?.stage,
    terminal: extra.terminal || stay.hyp_intent?.terminal,
    cabinId: extra.cabinId || stay.hyp_intent?.cabin_id
  });
  const stored = await persistStay(env, token, row, stay, {
    quote: stay.checkin_quote || stay.hyp_intent || {},
    hyp: withoutCardToken(result) || result,
    purpose: stay.hyp_intent?.purpose || extra.purpose || 'balance'
  });
  await persistHypPayment(env, token, stored, result);
  if (stay.hyp_card?.token) {
    await persistReservationPaymentMethod(env, stored, stay.hyp_card);
  }
  return { stored, result };
}

const HYP_PAYMENTS_TABLE = `CREATE TABLE IF NOT EXISTS hyp_payments (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  purpose TEXT NOT NULL,
  terminal TEXT NOT NULL,
  amount_agorot INTEGER NOT NULL,
  status TEXT NOT NULL,
  hyp_trans_id TEXT,
  hyp_auth TEXT,
  hyp_order TEXT,
  hesh TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

async function persistHypPayment(env, token, row, result) {
  if (!env.STAY_DB || !token) return;
  try {
    await env.STAY_DB.prepare(HYP_PAYMENTS_TABLE).run();
    const intent = row.stay?.hyp_intent || {};
    const id = String(result?.id || `hyp_${token}_${intent.purpose || 'pay'}`);
    const now = new Date().toISOString();
    await env.STAY_DB.prepare(
      `INSERT INTO hyp_payments (id, token, purpose, terminal, amount_agorot, status, hyp_trans_id, hyp_auth, hyp_order, hesh, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         hyp_trans_id = excluded.hyp_trans_id,
         hyp_auth = excluded.hyp_auth,
         hesh = excluded.hesh,
         updated_at = excluded.updated_at`
    )
      .bind(
        id,
        token,
        String(intent.purpose || 'balance'),
        String(intent.terminal || 'A'),
        Math.round(Number(result?.amount || intent.amount || 0) * 100),
        'paid',
        String(result?.id || ''),
        String(result?.auth || ''),
        String(result?.order || token),
        String(result?.hesh || ''),
        now,
        now
      )
      .run();
  } catch (err) {
    console.warn('[STAY_DB hyp_payments]', String(err?.message || err));
  }
}

async function completeHypReturn(env, request, token, row, search) {
  const returned = parseHypQuery(search);
  const terminal = row.stay?.hyp_intent?.terminal;
  const purpose = row.stay?.hyp_intent?.purpose || 'balance';
  const cabinId = row.stay?.hyp_intent?.cabin_id;
  const cabinPaid = row.stay?.pay_split === 'per_cabin' && cabinId && row.stay?.cabin_paid?.[cabinId]?.paid;
  const already = purpose === 'deposit' ? hypDepositPaid(row) : (cabinPaid || hypAlreadyPaid(row));
  const lpId = hypLowProfileIdFromParams(returned) || row.stay?.hyp_intent?.lowProfileId;
  if (lpId) {
    const lp = await getHypLowProfileResult(env, lpId, { terminal, order: token });
    if (lp.paid || (already && isHypPaid(lp.params))) {
      if (!already) await markHypPaid(env, token, row, lp.params, { terminal: lp.terminal || terminal });
      return afterPayRedirect(request, token, row, { hyp: 'ok' });
    }
  }
  const verified = await verifyHypReturn(env, search, { terminal });
  if (verified.paid || (already && isHypPaid(verified.params))) {
    if (!already) await markHypPaid(env, token, row, verified.params, { terminal: verified.terminal || terminal });
    return afterPayRedirect(request, token, row, { hyp: 'ok' });
  }
  return afterPayRedirect(request, token, row, {
    hyp: 'fail',
    ccode: String(verified.params.CCode || verified.verify.CCode || returned.ResponseCode || '')
  });
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      ...extra
    }
  });
}

function isAdmin(request, env) {
  const secret = env.CHECKOUT_MAILBOX_SECRET;
  if (!secret) return false;
  const provided = request.headers.get('x-hotelos-mailbox') || '';
  return provided === secret;
}

function viewedBooking(row, unitId) {
  return applyPaySplitView(row, unitId);
}

function publicView(row, unitId) {
  if (!unitId) return publicBooking(row);
  return publicBooking(viewedBooking(row, unitId));
}

function requestUnitId(row, body, request) {
  const fromBody = body?.unit_id || body?.cabin_id;
  let fromUrl = '';
  try {
    fromUrl = request ? new URL(request.url).searchParams.get('unit') : '';
  } catch (_) {}
  return resolveStayUnitId(row, fromBody || fromUrl);
}

function publicBooking(row) {
  if (!row) return null;
  const inStay = row.booking_status === 'CHECKED_IN' || row.booking_status === 'CHECKED_OUT';
  const firstName = String(row.guest_name || '').trim().split(/\s+/)[0] || '';
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    unit_id: row.unit_id,
    is_cabin_portal: Boolean(row.is_cabin_portal),
    guest_name: inStay ? firstName : row.guest_name,
    guest_email: inStay ? null : row.guest_email,
    guest_phone: inStay ? null : row.guest_phone,
    check_in_date: row.check_in_date,
    check_out_date: row.check_out_date,
    adults_count: row.adults_count,
    children_count: row.children_count,
    baby_cot_required: Boolean(row.baby_cot_required || row.stay?.baby_cot_required),
    link_sent_at: row.link_sent_at || row.stay?.link_sent_at || row.created_at || null,
    total_price_agorot: inStay ? null : row.total_price_agorot,
    deposit_agorot: inStay ? null : row.deposit_agorot,
    booking_status: row.booking_status,
    payment_status: row.payment_status,
    payment_mode: row.payment_mode,
    clearing_payments: inStay ? [] : (Array.isArray(row.clearing_payments) ? row.clearing_payments : []),
    balance_payment_preference: row.balance_payment_preference || row.stay?.balance_payment_preference || 'CREDIT_CARD',
    balance_paid: Boolean(row.balance_paid || row.stay?.balance_paid),
    balance_payment_method: row.balance_payment_method || row.stay?.balance_payment_method || null,
    hyp_terminal: row.hyp_terminal || row.stay?.hyp_terminal || row.stay?.hyp_intent?.terminal || null,
    channel_source: row.channel_source,
    checkout_token: row.checkout_token,
    special_requests: inStay ? null : row.special_requests,
    payment: inStay ? null : publicPayment(row),
    expires_at: row.expires_at,
    checked_out_at: row.checked_out_at || row.stay?.self_checked_out_at || null,
    checkout_status: row.checkout_status || row.stay?.checkout_status || 'staying',
    created_at: row.created_at,
    updated_at: row.updated_at,
    stay: publicStay(row.stay, row)
  };
}

function publicPayment(row) {
  const payment = row?.payment;
  if (!payment || typeof payment !== 'object') return payment || null;
  const purpose = payment.purpose || row.stay?.hyp_intent?.purpose || '';
  const balanceSettled = hypAlreadyPaid(row) || Boolean(row.balance_paid || row.stay?.balance_paid);
  const thisChargePaid = purpose === 'deposit'
    ? hypDepositPaid(row)
    : purpose === 'balance' || purpose === 'extra'
      ? balanceSettled
      : balanceSettled || row.stay?.hyp_intent?.status === 'paid';
  if (!thisChargePaid) return payment;
  const next = { ...payment };
  delete next.pay_url;
  delete next.iframe_url;
  return next;
}

function publicStay(stay, row) {
  const isReady = stay && (Boolean(stay.cabin_ready) || String(stay.operational_status || '').toUpperCase() === 'READY');
  const inStay = Boolean(row) && (row.booking_status === 'CHECKED_IN' || row.booking_status === 'CHECKED_OUT' || Boolean(stay?.guest_checked_in_at));
  const allowPin = Boolean(row) && (inStay || (isReady && stayFullyPaid(row)));

  const unitId = row?.unit_id || stay?.unit_id || '';
  const propId = UNIT_PROPERTY[unitId] || '';
  const defaultWifi = (UNIT_WIFI[unitId] && UNIT_WIFI[unitId].length)
    ? UNIT_WIFI[unitId]
    : (CATALOG_WIFI[propId] || []);
  const wifiList = (Array.isArray(stay?.wifi_networks) && stay.wifi_networks.length)
    ? stay.wifi_networks
    : (stay?.wifi_ssid ? [{ ssid: stay.wifi_ssid, password: stay.wifi_password || '' }] : defaultWifi);
  const gateCode = stay?.gate_code || (unitId.startsWith('k') ? RAMOT_GATE_CODE : null);

  const baseStay = stripIdPhoto((stay && typeof stay === 'object') ? stay : { folio: [], checkout_time: '11:00' });

  return stripCardSecrets({
    ...baseStay,
    cabin_ready: isReady,
    // Keep room_open so paid guests can check in when the unit is READY + vacant.
    room_open: Boolean(baseStay.room_open) || isReady,
    operational_status: isReady ? 'READY' : (baseStay.operational_status || 'DIRTY'),
    door_pin: allowPin ? (baseStay.door_pin || CATALOG_LOCKBOX[unitId] || null) : null,
    gate_code: gateCode,
    gate_mode: baseStay.gate_mode || (gateCode ? 'code' : null),
    wifi_ssid: wifiList[0]?.ssid || null,
    wifi_password: wifiList[0]?.password || null,
    wifi_networks: wifiList
  });
}


function kvTtlSeconds(booking) {
  const until = new Date(stayExpiresAt(booking)).getTime();
  const seconds = Math.ceil((until - Date.now()) / 1000);
  return Math.max(90 * 24 * 3600, Math.max(60, seconds));
}

function hasStayDb(env) {
  return Boolean(env?.STAY_DB);
}

async function kvPut(env, key, value, options) {
  if (!env?.CHECKOUT_KV) return false;
  try {
    await env.CHECKOUT_KV.put(key, value, options);
    return true;
  } catch (err) {
    console.warn('[CHECKOUT_KV PUT]', String(err?.message || err));
    return false;
  }
}

async function kvGet(env, key) {
  if (!env?.CHECKOUT_KV || !key) return null;
  try {
    const raw = await env.CHECKOUT_KV.get(key);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    console.warn('[CHECKOUT_KV GET]', String(err?.message || err));
    return null;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(false), ms))
  ]);
}

const INBOX_TABLE = `CREATE TABLE IF NOT EXISTS checkout_inbox (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
)`;

const CALLS_TABLE = `CREATE TABLE IF NOT EXISTS guest_calls (
  token TEXT PRIMARY KEY,
  booking_id TEXT,
  unit_id TEXT,
  guest_name TEXT,
  guest_phone TEXT,
  cabin TEXT,
  requested_at TEXT,
  acked_at TEXT
)`;

function callToken() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function callAckPage({ title, body, token, done }) {
  const form = done ? '' : `<form method="POST" action="/api/checkout/call-ack"><input type="hidden" name="t" value="${escapeHtml(token)}"><button type="submit" style="margin-top:24px;font-size:22px;padding:16px 28px;border:0;border-radius:14px;background:#1c1917;color:#fff;font-weight:800">דיברתי עם האורח</button></form>`;
  return new Response(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:sans-serif;background:#fff7ed"><div><h1 style="font-size:32px;margin:0 0 8px">${escapeHtml(title)}</h1><p style="font-size:18px;line-height:1.5">${escapeHtml(body)}</p>${form}</div></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}

async function ensureCallsTable(env) {
  if (!hasStayDb(env)) return false;
  await env.STAY_DB.prepare(CALLS_TABLE).run();
  return true;
}

async function openCallForBooking(env, bookingId) {
  if (!bookingId || !await ensureCallsTable(env)) return null;
  return env.STAY_DB.prepare(
    `SELECT token, requested_at, acked_at FROM guest_calls
     WHERE booking_id = ?1 AND (acked_at IS NULL OR acked_at = '')
     ORDER BY requested_at DESC LIMIT 1`
  ).bind(bookingId).first();
}

async function insertCall(env, row) {
  if (!await ensureCallsTable(env)) return false;
  await env.STAY_DB.prepare(
    `INSERT INTO guest_calls (token, booking_id, unit_id, guest_name, guest_phone, cabin, requested_at, acked_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '')`
  ).bind(
    row.token,
    row.booking_id,
    row.unit_id,
    row.guest_name,
    row.guest_phone,
    row.cabin,
    row.requested_at
  ).run();
  return true;
}

async function listRecentCalls(env) {
  if (!await ensureCallsTable(env)) return [];
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const result = await env.STAY_DB.prepare(
    `SELECT token, booking_id, unit_id, guest_name, guest_phone, cabin, requested_at, acked_at
     FROM guest_calls WHERE requested_at >= ?1 ORDER BY requested_at DESC LIMIT 40`
  ).bind(since).all();
  return result?.results || [];
}

async function findCall(env, token) {
  if (!await ensureCallsTable(env)) return null;
  return env.STAY_DB.prepare(
    'SELECT token, booking_id, unit_id, guest_name, guest_phone, cabin, requested_at, acked_at FROM guest_calls WHERE token = ?1'
  ).bind(token).first();
}

async function ackCallRow(env, token) {
  const existing = await findCall(env, token);
  if (!existing || existing.acked_at) return existing;
  const at = new Date().toISOString();
  await env.STAY_DB.prepare('UPDATE guest_calls SET acked_at = ?1 WHERE token = ?2').bind(at, token).run();
  existing.acked_at = at;
  return existing;
}

async function ensureInboxTable(env) {
  if (!hasStayDb(env)) return false;
  await env.STAY_DB.prepare(INBOX_TABLE).run();
  return true;
}

async function readInboxTokens(env) {
  if (!hasStayDb(env)) return [];
  try {
    await ensureInboxTable(env);
    const result = await env.STAY_DB.prepare(
      'SELECT token FROM checkout_inbox ORDER BY created_at DESC LIMIT 100'
    ).all();
    return (result?.results || []).map((row) => row.token).filter((token) => TOKEN_RE.test(token));
  } catch (err) {
    console.warn('[STAY_DB inbox]', String(err?.message || err));
    return [];
  }
}

async function addInboxToken(env, token) {
  if (!TOKEN_RE.test(token) || !hasStayDb(env)) return;
  try {
    await ensureInboxTable(env);
    await env.STAY_DB.prepare(
      'INSERT OR IGNORE INTO checkout_inbox (token, created_at) VALUES (?1, ?2)'
    ).bind(token, new Date().toISOString()).run();
  } catch (err) {
    console.warn('[STAY_DB inbox add]', String(err?.message || err));
  }
}

async function removeInboxToken(env, token) {
  if (!TOKEN_RE.test(token) || !hasStayDb(env)) return;
  try {
    await ensureInboxTable(env);
    await env.STAY_DB.prepare('DELETE FROM checkout_inbox WHERE token = ?1').bind(token).run();
  } catch (_) {}
}

async function readStayOverlay(env, token) {
  if (!env.STAY_DB) return null;
  try {
    const row = await env.STAY_DB.prepare('SELECT stay_json FROM stay_overlay WHERE token = ?1').bind(token).first();
    if (!row?.stay_json) return null;
    return JSON.parse(row.stay_json);
  } catch (_) {
    return null;
  }
}

async function writeStayOverlay(env, token, stay) {
  if (!env.STAY_DB || !token || !stay) return;
  try {
    await env.STAY_DB.prepare(
      'INSERT INTO stay_overlay (token, stay_json, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(token) DO UPDATE SET stay_json = excluded.stay_json, updated_at = excluded.updated_at'
    )
      .bind(token, JSON.stringify(stay), new Date().toISOString())
      .run();
  } catch (err) {
    console.warn('[STAY_DB overlay]', String(err?.message || err));
  }
}

function mergeStay(base, overlay) {
  if (!overlay || typeof overlay !== 'object') return base;
  return {
    ...(base && typeof base === 'object' ? base : {}),
    ...overlay,
    folio: Array.isArray(overlay.folio)
      ? overlay.folio
      : (Array.isArray(base?.folio) ? base.folio : [])
  };
}

const GUEST_BOOKING_TABLE = `CREATE TABLE IF NOT EXISTS guest_bookings (
  token TEXT PRIMARY KEY,
  booking_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

async function ensureGuestBookingTable(env) {
  if (!env.STAY_DB) return false;
  await env.STAY_DB.prepare(GUEST_BOOKING_TABLE).run();
  return true;
}

async function readGuestBooking(env, token) {
  if (!token) return null;
  if (env.STAY_DB) {
    try {
      await ensureGuestBookingTable(env);
      const row = await env.STAY_DB.prepare(
        'SELECT booking_json FROM guest_bookings WHERE token = ?1'
      ).bind(token).first();
      if (row?.booking_json) return JSON.parse(row.booking_json);
    } catch (err) {
      console.warn('[STAY_DB read]', String(err?.message || err));
    }
  }
  return kvGet(env, BOOKING_PREFIX + token);
}

async function writeGuestBooking(env, token, booking) {
  if (!env.STAY_DB || !token || !booking) return false;
  try {
    await ensureGuestBookingTable(env);
    await env.STAY_DB.prepare(
      'INSERT INTO guest_bookings (token, booking_json, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(token) DO UPDATE SET booking_json = excluded.booking_json, updated_at = excluded.updated_at'
    )
      .bind(token, JSON.stringify(booking), new Date().toISOString())
      .run();
    return true;
  } catch (err) {
    console.warn('[STAY_DB write]', String(err?.message || err));
    return false;
  }
}

export async function persistGuestRow(env, token, stored) {
  await writeStayOverlay(env, token, stored.stay);
  const payload = JSON.stringify(stored);
  const kvWrite = kvPut(env, BOOKING_PREFIX + token, payload, {
    expirationTtl: kvTtlSeconds(stored)
  });
  const dbWrite = writeGuestBooking(env, token, stored);
  const [dbOk, kvOk] = await Promise.all([
    withTimeout(dbWrite, 4000),
    kvWrite
  ]);
  return Boolean(dbOk || kvOk);
}

function idPhotoHeaders(mime) {
  return {
    'content-type': mime,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-disposition': 'inline; filename="id-photo"',
    'referrer-policy': 'no-referrer'
  };
}

async function readIdPhotoUpload(request) {
  const type = String(request.headers.get('content-type') || '');
  if (!type.includes('multipart/form-data')) return null;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return null;
  return new Uint8Array(await file.arrayBuffer());
}

export async function saveGuestIdPhoto(env, token, row, bytes, waitUntil) {
  const mime = sniffIdPhoto(bytes);
  if (!mime) return { error: 'BAD_IMAGE', status: 400 };
  const key = idPhotoKeyBytes(env?.ID_PHOTO_KEY);
  if (!key || !env?.CHECKOUT_KV) return { error: 'ID_PHOTO_UNAVAILABLE', status: 503 };
  if (row?.booking_status === 'CHECKED_OUT' || row?.booking_status === 'CANCELED') {
    return { error: 'CLOSED', status: 409 };
  }
  const sealed = await sealIdPhoto(bytes, key);
  const packed = JSON.stringify({ v: 1, ...sealed });
  const savedPhoto = await kvPut(env, idPhotoKvKey(token), packed, {
    expirationTtl: idPhotoTtlSeconds(row?.check_out_date)
  });
  if (!savedPhoto) return { error: 'ID_PHOTO_UNAVAILABLE', status: 503 };
  const receivedAt = new Date().toISOString();
  const stored = {
    ...row,
    stay: stripIdPhoto({ ...(row.stay || {}), id_photo_received_at: receivedAt }),
    updated_at: receivedAt
  };
  await persistGuestRow(env, token, stored);
  // Ran 2026-10-24: scan with Grok in the background; store only decision + name + reasons on the stay.
  const scanJob = runGuestIdScan(env, token, bytes, mime, row?.guest_name, receivedAt);
  if (typeof waitUntil === 'function') waitUntil(scanJob); else await scanJob;
  return { ok: true, received_at: receivedAt };
}

export async function runGuestIdScan(env, token, bytes, mime, guestName, receivedAt, scan = scanGuestId) {
  try {
    const summary = await scan(env, bytes, mime, guestName);
    const fresh = (await readBooking(env, token)) || null;
    if (!fresh || fresh.stay?.id_photo_received_at !== receivedAt) return summary; // newer upload wins
    await persistGuestRow(env, token, { ...fresh, stay: stripIdPhoto({ ...(fresh.stay || {}), id_scan: summary }), updated_at: new Date().toISOString() });
    return summary;
  } catch {
    return null;
  }
}

export async function loadGuestIdPhoto(env, token) {
  const key = idPhotoKeyBytes(env?.ID_PHOTO_KEY);
  if (!key) return null;
  const packed = await kvGet(env, idPhotoKvKey(token));
  if (!packed || packed.v !== 1 || !packed.iv || !packed.ct) return null;
  try {
    return await openIdPhoto(packed, key);
  } catch {
    return null;
  }
}

function israelTodayIso() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

function buildCabinPortalBooking(unitId, today = israelTodayIso()) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const prop = UNIT_PROPERTY[unitId] || '';
  const wifiList = (UNIT_WIFI[unitId] && UNIT_WIFI[unitId].length)
    ? UNIT_WIFI[unitId]
    : (CATALOG_WIFI[prop] || []);
  const wifi = wifiList[0] || null;
  const lockbox = CATALOG_LOCKBOX[unitId] || '';
  return {
    id: `cabin_${unitId}`,
    unit_id: unitId,
    guest_name: 'אורחי הסוויטה',
    guest_phone: '',
    check_in_date: today,
    check_out_date: tomorrow,
    booking_status: 'CHECKED_IN',
    payment_status: 'PAID',
    payment_mode: 'CASH_TRUST',
    is_cabin_portal: true,
    total_price_agorot: 0,
    deposit_agorot: 0,
    checkout_token: `tok_unit_${unitId}`,
    stay: {
      cabin_ready: true,
      guest_checked_in_at: new Date().toISOString(),
      wifi_ssid: wifi?.ssid || null,
      wifi_password: wifi?.password || null,
      wifi_networks: wifiList,
      lockbox_code: lockbox,
      door_pin: lockbox,
      gate_code: RAMOT_GATE_CODE,
      checkout_time: '11:00',
      folio: []
    }
  };
}

function isHoldBlock(name, notes) {
  const text = `${name || ''} ${notes || ''}`;
  return /סגור|תפוס|שיפוצ|חסום|לא למכיר|לא להשכר|לא זמין|לא פנוי|לא נקי|מקולקל|תחזוק|מגורי צוות/i.test(text);
}

async function findActiveBookingForUnit(env, unitId) {
  if (!unitId) return null;
  const today = israelTodayIso();
  if (env.STAY_DB) {
    try {
      await ensureGuestBookingTable(env);
      const rows = await env.STAY_DB.prepare(
        `SELECT booking_json FROM guest_bookings 
         WHERE json_extract(booking_json, '$.unit_id') = ?1 
           AND json_extract(booking_json, '$.check_in_date') <= ?2 
           AND json_extract(booking_json, '$.check_out_date') >= ?2 
           AND json_extract(booking_json, '$.booking_status') != 'CANCELED' 
         ORDER BY 
           (json_extract(booking_json, '$.booking_status') = 'CHECKED_IN') DESC,
           (json_extract(booking_json, '$.check_in_date') = ?2) DESC,
           json_extract(booking_json, '$.check_in_date') DESC
         LIMIT 5`
      ).bind(unitId, today).all();
      for (const row of (rows?.results || [])) {
        if (!row?.booking_json) continue;
        const parsed = JSON.parse(row.booking_json);
        if (isHoldBlock(parsed.guest_name, parsed.special_requests)) continue;
        const overlay = await readStayOverlay(env, parsed.checkout_token);
        if (overlay) parsed.stay = mergeStay(parsed.stay, overlay);
        return parsed;
      }
    } catch (err) {
      console.warn('[findActiveBookingForUnit DB error]', err);
    }
  }

  try {
    const replica = await loadCalendarReplica(env);
    const stays = Array.isArray(replica?.stays) ? replica.stays : [];
    const active = stays.find((s) => (
      s.unit_id === unitId &&
      s.check_in_date <= today &&
      s.check_out_date >= today &&
      s.booking_status !== 'CANCELED' &&
      !isHoldBlock(s.guest_name, s.special_requests)
    ));
    if (active?.checkout_token) {
      const full = await readBooking(env, active.checkout_token);
      if (full && !isHoldBlock(full.guest_name, full.special_requests)) return full;
      if (!isHoldBlock(active.guest_name, active.special_requests)) return active;
    }
  } catch (err) {
    console.warn('[findActiveBookingForUnit replica error]', err);
  }

  return null;
}

export async function readBooking(env, token) {
  if (token && token.startsWith('tok_unit_')) {
    const unitId = token.replace('tok_unit_', '');
    return buildCabinPortalBooking(unitId);
  }
  const raw = await readGuestBooking(env, token);
  if (!raw) return null;
  const overlay = await readStayOverlay(env, token);
  if (overlay) raw.stay = mergeStay(raw.stay, overlay);
  return raw;
}

function publishFingerprint(row) {
  if (!row) return '';
  return JSON.stringify({
    id: row.id,
    status: row.booking_status,
    name: row.guest_name,
    email: row.guest_email,
    phone: row.guest_phone,
    unit: row.unit_id,
    in: row.check_in_date,
    out: row.check_out_date,
    requests: row.special_requests || '',
    ready: row.stay?.cabin_ready || false,
    ops: row.stay?.operational_status || '',
    late: row.stay?.late_until || null,
    outAt: row.stay?.self_checked_out_at || null,
    folio: Array.isArray(row.stay?.folio) ? row.stay.folio.length : 0,
    pay: row.payment_status || '',
    mode: row.payment_mode || '',
    proof: Boolean(row.stay?.payment_proof)
  });
}

function isRealBooking(booking) {
  return Boolean(
    booking &&
    booking.id &&
    booking.unit_id &&
    booking.check_in_date &&
    booking.check_out_date &&
    booking.checkout_token
  );
}

export async function onRequest(context) {
  try {
    return await handleCheckout(context);
  } catch (err) {
    return json({ error: 'CHECKOUT_CRASH', message: String(err?.message || err) }, 500);
  }
}

async function handleCheckout(context) {
  const { request, env, params } = context;
  const rawPath = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  const segments = rawPath.split('/').filter(Boolean);
  const method = request.method.toUpperCase();
  const head = segments[0] || '';
  const urlObj = new URL(request.url);
  const queryUnit = urlObj.searchParams.get('unit') || '';

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
        'access-control-allow-headers': 'content-type, x-hotelos-mailbox'
      }
    });
  }

  if (!hasStayDb(env) && !env.CHECKOUT_KV) {
    return json({ error: 'MAILBOX_UNAVAILABLE' }, 503);
  }

  // Read-only departures overlay for Studio's checkout-reminder job (no side effects, never sends).
  if (head === 'departures' && method === 'GET') {
    if (!departuresAuthorized(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
    const q = parseDeparturesQuery(request.url, TOKEN_RE);
    if (q.error) return json({ error: q.error }, 400);
    const tokens = q.tokens.length ? q.tokens : await readInboxTokens(env);
    const rows = [];
    for (const token of tokens) {
      const row = departureRow(await readBooking(env, token), q.date);
      if (row) rows.push(row);
    }
    return json({ date: q.date, rows });
  }

  if (head === 'demo' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const row = buildDemoCheckoutRow(body.stage === 'stay' ? 'stay' : 'form');
    const saved = await persistGuestRow(env, row.checkout_token, row);
    if (!saved) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
    return json(publicBooking(row));
  }

  if (((head === 'unit' && segments[1]) || (!head && queryUnit)) && method === 'GET') {
    const unitId = segments[1] || queryUnit;
    let row = await findActiveBookingForUnit(env, unitId);
    if (!row) {
      row = buildCabinPortalBooking(unitId, israelTodayIso());
    } else {
      const autoIn = applyPaidArrivalCheckin(row);
      if (autoIn) {
        await persistGuestRow(env, row.checkout_token, autoIn);
        row = autoIn;
      }
    }
    return json(publicView(row, unitId));
  }

  if (head === 'hyp' && (method === 'GET' || method === 'POST')) {
    const search = await hypSearchFromRequest(request);
    const returned = parseHypQuery(search);
    const orderToken = hypCheckoutTokenFromParams(returned);
    if (!TOKEN_RE.test(orderToken)) {
      return Response.redirect(`${HYP_RETURN_ORIGIN}/?hyp=missing`, 302);
    }
    const row = await readBooking(env, orderToken);
    if (!row || row.booking_status === 'CANCELED') return guestStayRedirect(request, orderToken, { hyp: 'missing' });
    try {
      return await completeHypReturn(env, request, orderToken, row, search);
    } catch (err) {
      return guestStayRedirect(request, orderToken, { hyp: 'error' });
    }
  }

  if (TOKEN_RE.test(head) && segments[1] === 'hyp' && (method === 'GET' || method === 'POST')) {
    const row = await readBooking(env, head);
    if (!row || row.booking_status === 'CANCELED') return guestStayRedirect(request, head, { hyp: 'missing' });
    if (stayLinkExpired(row)) return guestStayRedirect(request, head, { hyp: 'expired' });
    const search = await hypSearchFromRequest(request);
    try {
      return await completeHypReturn(env, request, head, row, search);
    } catch (err) {
      return guestStayRedirect(request, head, { hyp: 'error' });
    }
  }

  if (head === 'publish' && (method === 'PUT' || method === 'POST')) {
    if (!isAdmin(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
    const booking = await request.json().catch(() => null);
    if (!isRealBooking(booking) || !TOKEN_RE.test(booking.checkout_token)) {
      return json({ error: 'INVALID_BOOKING' }, 400);
    }
    const existing = await readBooking(env, booking.checkout_token);
    const mailboxPaid = Boolean(
      existing
      && (
        existing.booking_status === 'CONFIRMED'
        || existing.booking_status === 'CHECKED_IN'
        || existing.booking_status === 'CHECKED_OUT'
        || existing.payment_status === 'DEPOSIT_PAID'
        || existing.payment_status === 'PAID'
        || existing.stay?.hyp_deposit?.paid
        || existing.stay?.hyp?.paid
      )
    );
    if (mailboxPaid) {
      const kept = {
        ...existing,
        guest_name: booking.guest_name || existing.guest_name,
        guest_phone: booking.guest_phone || existing.guest_phone,
        guest_email: booking.guest_email || existing.guest_email,
        payment_status: booking.payment_status || existing.payment_status,
        payment_mode: booking.payment_mode || existing.payment_mode,
        balance_paid: Boolean(booking.balance_paid || existing.balance_paid),
        clearing_payments: Array.isArray(booking.clearing_payments) && booking.clearing_payments.length ? booking.clearing_payments : (existing.clearing_payments || []),
        stay: {
          ...(existing.stay || {}),
          ...(booking.stay || {}),
          folio: Array.isArray(existing.stay?.folio) ? existing.stay.folio : (booking.stay?.folio || []),
          late_until: existing.stay?.late_until || booking.stay?.late_until || null,
          self_checked_out_at: existing.stay?.self_checked_out_at || null,
          checkout_time: existing.stay?.checkout_time || booking.stay?.checkout_time || '11:00'
        },
        expires_at: stayExpiresAt(existing)
      };
      if (booking.booking_status === 'CHECKED_IN' || booking.booking_status === 'CHECKED_OUT') {
        kept.booking_status = booking.booking_status;
      }
      if (publishFingerprint(existing) === publishFingerprint(kept)) {
        return json(publicBooking(existing));
      }
      const savedKept = await persistGuestRow(env, booking.checkout_token, kept);
      if (!savedKept) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
      return json(publicBooking(kept));
    }
    const stored = {
      ...existing,
      ...booking,
      booking_status: booking.booking_status || 'PENDING',
      payment_status: booking.payment_status || 'UNPAID',
      expires_at: stayExpiresAt({ ...existing, ...booking }),
      updated_at: new Date().toISOString()
    };
    if (publishFingerprint(existing) === publishFingerprint(stored)) {
      return json(publicBooking(existing));
    }
    const savedStored = await persistGuestRow(env, booking.checkout_token, stored);
    if (!savedStored) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
    return json(publicBooking(stored));
  }

  if (head === 'calls' && method === 'GET') {
    if (!isAdmin(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
    return json({ calls: await listRecentCalls(env) });
  }

  if (head === 'call-ack' && (method === 'GET' || method === 'POST')) {
    let ackToken = '';
    if (method === 'GET') {
      ackToken = new URL(request.url).searchParams.get('t') || '';
    } else {
      const ct = String(request.headers.get('content-type') || '');
      if (ct.includes('application/json')) {
        const body = await request.json().catch(() => ({}));
        ackToken = String(body.t || '');
      } else {
        ackToken = new URLSearchParams(await request.text()).get('t') || '';
      }
    }
    if (!/^[a-f0-9]{18}$/.test(ackToken)) {
      return callAckPage({ title: 'הקישור לא תקין', body: '', token: '', done: true });
    }
    const found = method === 'POST' ? await ackCallRow(env, ackToken) : await findCall(env, ackToken);
    if (!found) return callAckPage({ title: 'הבקשה לא נמצאה', body: '', token: '', done: true });
    const who = [found.guest_name, found.cabin].filter(Boolean).join(' · ');
    if (found.acked_at) {
      return callAckPage({ title: 'נרשם', body: who ? `דיברת עם ${who}` : 'דיברת עם האורח', token: '', done: true });
    }
    return callAckPage({ title: 'אישור שיחה', body: who, token: ackToken, done: false });
  }

  if (head === 'inbox' && method === 'GET') {
    if (!isAdmin(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
    try {
      const tokens = await readInboxTokens(env);
      const bookings = [];
      for (const token of tokens) {
        const row = await readBooking(env, token);
        if (row && !row.mailbox_acked) bookings.push(publicBooking(row));
      }
      return json({ bookings });
    } catch (err) {
      return json({ error: 'INBOX_FAILED', message: String(err?.message || err) }, 500);
    }
  }

  if (head === 'ack' && method === 'POST') {
    if (!isAdmin(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || '');
    if (!TOKEN_RE.test(token)) return json({ error: 'INVALID_TOKEN' }, 400);
    const row = await readBooking(env, token);
    if (row) {
      row.mailbox_acked = true;
      await persistGuestRow(env, token, row);
    }
    await removeInboxToken(env, token);
    return json({ ok: true });
  }

  const token = head;
  if (TOKEN_RE.test(token) && segments[1] === 'id-photo' && segments.length === 2) {
    const row = await readBooking(env, token);
    if (!row || row.booking_status === 'CANCELED') return json({ error: 'NOT_FOUND' }, 404);
    if (stayLinkExpired(row)) return json({ error: 'EXPIRED' }, 410);
    if (method === 'GET') {
      if (!isAdmin(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
      const photo = await loadGuestIdPhoto(env, token);
      if (!photo) return json({ error: 'NOT_FOUND' }, 404);
      return new Response(photo.bytes, { status: 200, headers: idPhotoHeaders(photo.mime) });
    }
    if (method !== 'POST') return json({ error: 'METHOD' }, 405);
    const bytes = await readIdPhotoUpload(request);
    const saved = await saveGuestIdPhoto(env, token, row, bytes || new Uint8Array(), context.waitUntil?.bind(context));
    if (saved.error) return json({ error: saved.error }, saved.status);
    return json({ ok: true, received_at: saved.received_at });
  }

  if (TOKEN_RE.test(token) && segments[1] === 'stay' && method === 'POST') {
    const row = await readBooking(env, token);
    if (!row || row.booking_status === 'CANCELED') return json({ error: 'NOT_FOUND' }, 404);
    if (stayLinkExpired(row)) return json({ error: 'EXPIRED' }, 410);
    const body = await request.json().catch(() => ({}));
    const stay = { ...(row.stay || {}), folio: Array.isArray(row.stay?.folio) ? [...row.stay.folio] : [] };
    const unitId = requestUnitId({ ...row, stay }, body, request);
    const chargeView = () => viewedBooking({ ...row, stay }, unitId);
    const action = String(body.action || '');
    const checkinAction = action === 'checkin_quote'
      || action === 'guest_checkin'
      || action === 'guest_checkin_complete'
      || action === 'guest_auto_checkin'
      || action === 'guest_checkin_cash'
      || action === 'guest_checkin_cash_pin'
      || action === 'guest_checkin_bank'
      || action === 'hyp_verify'
      || action === 'guest_deposit';
    if (
      action !== 'call_me' &&
      !checkinAction &&
      row.booking_status !== 'CONFIRMED' &&
      row.booking_status !== 'CHECKED_IN' &&
      row.booking_status !== 'CHECKED_OUT'
    ) {
      return json({ error: 'NOT_CONFIRMED' }, 409);
    }
    if (action === 'call_me') {
      const now = new Date().toISOString();
      const existing = await openCallForBooking(env, row.id);
      const recent = existing && Date.now() - Date.parse(existing.requested_at) < 10 * 60 * 1000;
      if (!recent) {
        const savedCall = await insertCall(env, {
          token: callToken(),
          booking_id: String(row.id || ''),
          unit_id: String(row.unit_id || unitId || ''),
          guest_name: String(row.guest_name || ''),
          guest_phone: String(row.guest_phone || ''),
          cabin: String(body.cabin || '').slice(0, 80),
          requested_at: now
        });
        if (!savedCall) return json({ error: 'CALL_STORE_FAILED' }, 503);
        stay.call_requested_at = now;
      }
    } else if (action === 'folio_add' && body.item?.title) {
      stay.folio.unshift({
        id: String(body.item.id || ('folio_' + Date.now())),
        title: String(body.item.title),
        qty: Math.max(1, Number(body.item.qty) || 1),
        total: Math.max(0, Number(body.item.total) || 0),
        at: new Date().toISOString()
      });
    } else if (action === 'late_checkout' && body.until) {
      stay.late_until = String(body.until);
      stay.checkout_time = String(body.until).replace('+1', '');
      stay.folio.unshift({
        id: 'late_' + Date.now(),
        title: String(body.title || 'Late checkout'),
        qty: 1,
        total: Math.max(0, Number(body.price) || 0),
        at: new Date().toISOString()
      });
    } else if (action === 'self_checkout') {
      const outAt = new Date().toISOString();
      stay.self_checked_out_at = outAt;
      stay.checkout_status = 'self_departed';
      stay.pending_farewell_sms = true;
      stay.pending_router_webhook = true;
      if (body.stars != null && body.stars !== '') {
        stay.feedback_stars = Math.min(5, Math.max(1, Number(body.stars)));
      }
      row.booking_status = 'CHECKED_OUT';
      row.checked_out_at = outAt;
      row.checkout_status = 'self_departed';
      // Notify Studio (Micropay farewell SMS + optional router webhook) when configured.
      const studioFx = String(env.RESORTOS_STUDIO_EFFECTS_URL || env.CHECKOUT_SIDE_EFFECTS_URL || '').trim();
      const mailboxSecret = env.CHECKOUT_MAILBOX_SECRET;
      if (studioFx && mailboxSecret) {
        try {
          await fetch(studioFx, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-hotelos-mailbox': mailboxSecret
            },
            body: JSON.stringify({
              event: 'self_checkout',
              booking_id: row.id,
              unit_id: row.unit_id,
              guest_phone: row.guest_phone,
              tenant_id: row.tenant_id,
              checkout_token: token,
              checked_out_at: outAt
            }),
            signal: AbortSignal.timeout(8000)
          });
          stay.pending_farewell_sms = false;
        } catch (err) {
          console.warn('[self_checkout effects]', String(err?.message || err));
        }
      }
    } else if (action === 'guest_feedback') {
      if (body.stars != null && body.stars !== '') {
        stay.feedback_stars = Math.min(5, Math.max(1, Number(body.stars)));
      }
      if (body.text != null) stay.feedback_text = String(body.text).slice(0, 2000);
      if (body.google === true || body.google === false) stay.feedback_google = body.google;
      if (body.done) stay.feedback_done = true;
    } else if (action === 'checkin_quote') {
      try {
        const quote = await quoteCheckin(chargeView(), env);
        stay.checkin_quote = quote;
        const storedQuote = { ...row, stay, payment: { quote }, updated_at: new Date().toISOString() };
        const savedQuote = await persistGuestRow(env, token, storedQuote);
        if (!savedQuote) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
        return json(publicView(storedQuote, unitId));
      } catch (err) {
        return json({ error: err.code || 'CHECKIN_QUOTE_FAILED', message: String(err.message || err) }, 422);
      }
    } else if (action === 'guest_checkin_cash_pin') {
      const staff = await verifyStaffPin(env, body.pin);
      if (!staff) {
        return json({ error: 'INVALID_PIN', message: 'קוד נציג שגוי' }, 401);
      }
      stay.payment_choice = 'CASH';
      stay.field_rep_phone = String(body.field_rep_phone || stay.field_rep_phone || '');
      stay.cash_collected_by_name = staff.display_name || staff.username || '';
      stay.balance_payment_preference = 'CASH';
      row.payment_mode = 'CASH';
      if (stay.pay_split === 'per_cabin') {
        stay.cabin_paid = {
          ...(stay.cabin_paid || {}),
          [unitId]: { paid: true, at: new Date().toISOString(), method: 'CASH' }
        };
        if (allCabinsPaid(stay)) {
          stay.balance_paid = true;
          row.payment_status = 'PAID';
          row.balance_paid = true;
        } else {
          stay.balance_paid = false;
          row.balance_paid = false;
        }
      } else {
        stay.balance_paid = true;
        row.payment_status = 'PAID';
        row.balance_paid = true;
      }
      row.balance_paid_at = new Date().toISOString();
      row.balance_payment_method = 'CASH';
      row.balance_payment_preference = 'CASH';
      if (staff.id) row.cash_collected_by = staff.id;
      stay.guest_checked_in_at = stay.guest_checked_in_at || new Date().toISOString();
      row.booking_status = 'CHECKED_IN';
    } else if (action === 'guest_checkin_cash') {
      stay.payment_choice = 'CASH';
      stay.field_rep_phone = String(body.field_rep_phone || '');
      row.payment_mode = 'CASH';
      if (row.payment_status !== 'PAID') row.payment_status = 'PENDING_CASH';
      if (stayFullyPaid(chargeView())) {
        stay.guest_checked_in_at = stay.guest_checked_in_at || new Date().toISOString();
        row.booking_status = 'CHECKED_IN';
      } else if (row.booking_status !== 'CHECKED_IN' && row.booking_status !== 'CHECKED_OUT') {
        row.booking_status = 'CONFIRMED';
      }
    } else if (action === 'guest_checkin_bank') {
      const proof = String(body.payment_proof || '');
      if (!proof.startsWith('data:image/') || proof.length < 32 || proof.length > 900_000) {
        return json({ error: 'INVALID_PROOF' }, 400);
      }
      stay.payment_choice = 'BANK_TRANSFER';
      stay.payment_proof = proof;
      stay.payment_proof_at = new Date().toISOString();
      stay.field_rep_phone = String(body.field_rep_phone || '');
      stay.balance_payment_preference = 'BANK_TRANSFER';
      row.payment_mode = 'BANK_TRANSFER';
      row.bank_transfer_receipt_url = 'uploaded';
      row.balance_payment_preference = 'BANK_TRANSFER';
      if (row.payment_status !== 'PAID') row.payment_status = 'PENDING_BANK';
      if (stayFullyPaid(chargeView())) {
        stay.guest_checked_in_at = stay.guest_checked_in_at || new Date().toISOString();
        row.booking_status = 'CHECKED_IN';
        row.balance_paid = true;
        row.balance_paid_at = new Date().toISOString();
        row.balance_payment_method = 'BANK_TRANSFER';
        stay.balance_paid = true;
      } else if (row.booking_status !== 'CHECKED_IN' && row.booking_status !== 'CHECKED_OUT') {
        row.booking_status = 'CONFIRMED';
      }
    } else if (action === 'guest_deposit') {
      try {
        if (hypDepositPaid(row) || hypAlreadyPaid(row)) {
          if (row.booking_status !== 'CHECKED_IN' && row.booking_status !== 'CHECKED_OUT') {
            row.booking_status = 'CONFIRMED';
          }
        } else {
          const quote = quoteGuestCharge(row);
          stay.hyp_intent = {
            purpose: quote.purpose,
            terminal: quote.terminal,
            stage: 'confirm',
            amount: quote.amount,
            status: 'redirected',
            at: new Date().toISOString()
          };
          const started = await startGuestPayment(row, env, hypChargeReturn(body));
          if (started.lowProfileId) stay.hyp_intent.lowProfileId = started.lowProfileId;
          const storedDeposit = {
            ...row,
            stay,
            payment: hypClientPayment(started),
            updated_at: new Date().toISOString()
          };
          const savedDeposit = await persistGuestRow(env, token, storedDeposit);
          if (!savedDeposit) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
          return json(publicView(storedDeposit, unitId));
        }
      } catch (err) {
        return json({ error: err.code || 'DEPOSIT_CHARGE_FAILED', message: String(err.message || err) }, 422);
      }
    } else if (action === 'guest_checkin') {
      try {
        const view = chargeView();
        if (stayFullyPaid(view) || hypAlreadyPaid(view)) {
          if (!hypAlreadyPaid(view) && stayFullyPaid(view)) {
            stay.guest_checked_in_at = stay.guest_checked_in_at || new Date().toISOString();
            row.booking_status = 'CHECKED_IN';
            if (stay.pay_split !== 'per_cabin' || allCabinsPaid(stay)) row.payment_status = 'PAID';
          } else {
            applyHypPaid(row, stay, stay.hyp || {}, { purpose: 'balance', stage: 'checkin', terminal: 'A', cabinId: unitId });
          }
        } else if (body.use_saved_card) {
          if (body.guest_approved !== true) {
            return json({ error: 'GUEST_APPROVAL_REQUIRED', message: 'החיוב של הכרטיס השמור מחכה לאישור האורח.' }, 409);
          }
          stay.hyp_intent = {
            purpose: 'balance',
            terminal: row.stay?.hyp_card?.terminal || 'A',
            stage: 'checkin',
            status: 'token_charge',
            cabin_id: unitId,
            at: new Date().toISOString()
          };
          const charged = await chargeSavedCardCheckin(view, env);
          stay.checkin_quote = charged.quote;
          stay.payment_choice = 'SAVED_CARD';
          stay.field_rep_phone = String(body.field_rep_phone || stay.field_rep_phone || '');
          if (charged.skipped) {
            const zeroDue = !charged.quote.needsCharge && Number(view.total_price_agorot) > 0;
            if (zeroDue && (stay.pay_split !== 'per_cabin' || allCabinsPaid(stay))) row.payment_status = 'PAID';
            if (!stayFullyPaid(viewedBooking({ ...row, stay }, unitId)) && !stayFullyPaid(view)) {
              return json({ error: 'PAYMENT_REQUIRED', message: 'יש להשלים את התשלום של הבקתה לפני כניסה לחדר.' }, 409);
            }
            stay.guest_checked_in_at = stay.guest_checked_in_at || new Date().toISOString();
            row.booking_status = 'CHECKED_IN';
            row.payment_mode = 'CARD';
          } else {
            applyHypPaid(row, stay, charged.params, {
              purpose: 'balance',
              stage: 'checkin',
              terminal: charged.terminal,
              cabinId: unitId
            });
          }
          const storedTokenPay = {
            ...row,
            stay,
            payment: { quote: charged.quote, saved_card: true, paid: true },
            updated_at: new Date().toISOString()
          };
          const savedTokenPay = await persistGuestRow(env, token, storedTokenPay);
          if (!savedTokenPay) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
          await addInboxToken(env, token, storedTokenPay);
          return json(publicView(storedTokenPay, unitId));
        } else {
          stay.hyp_intent = {
            purpose: 'balance',
            terminal: 'A',
            stage: 'checkin',
            status: 'redirected',
            cabin_id: unitId,
            at: new Date().toISOString()
          };
          const started = await startCardCheckin(view, env, hypChargeReturn(body));
          if (started.terminal) stay.hyp_intent.terminal = started.terminal;
          if (started.lowProfileId) stay.hyp_intent.lowProfileId = started.lowProfileId;
          stay.checkin_quote = started.quote;
          stay.payment_choice = 'CARD';
          stay.field_rep_phone = String(body.field_rep_phone || stay.field_rep_phone || '');
          if (started.skipped) {
            const zeroDue = !started.quote.needsCharge && Number(view.total_price_agorot) > 0;
            if (zeroDue && (stay.pay_split !== 'per_cabin' || allCabinsPaid(stay))) row.payment_status = 'PAID';
            if (!stayFullyPaid(view)) {
              return json({ error: 'PAYMENT_REQUIRED', message: 'יש להשלים את התשלום של הבקתה לפני כניסה לחדר.' }, 409);
            }
            stay.guest_checked_in_at = stay.guest_checked_in_at || new Date().toISOString();
            row.booking_status = 'CHECKED_IN';
            row.payment_mode = 'CARD';
          } else {
            row.payment_mode = 'CARD';
          }
          const storedStart = {
            ...row,
            stay,
            payment: hypClientPayment(started),
            updated_at: new Date().toISOString()
          };
          const savedStart = await persistGuestRow(env, token, storedStart);
          if (!savedStart) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
          await addInboxToken(env, token, storedStart);
          return json(publicView(storedStart, unitId));
        }
      } catch (err) {
        return json({ error: err.code || 'CHECKIN_CHARGE_FAILED', message: String(err.message || err) }, 422);
      }
    } else if (action === 'hyp_verify') {
      try {
        const search = String(body.query || body.search || '').replace(/^\?/, '');
        const verified = await verifyHypReturn(env, search, { terminal: stay.hyp_intent?.terminal });
        if (!verified.paid) {
          return json({ error: 'PAYMENT_PENDING', payment: { pending: true, hyp: verified.params } }, 409);
        }
        const purpose = stay.hyp_intent?.purpose || 'balance';
        const cabinPaid = stay.pay_split === 'per_cabin' && stay.cabin_paid?.[unitId]?.paid;
        const already = purpose === 'deposit' ? hypDepositPaid(row) : (cabinPaid || hypAlreadyPaid(row));
        if (!already) {
          applyHypPaid(row, stay, verified.params, { terminal: verified.terminal, cabinId: unitId });
        }
      } catch (err) {
        return json({ error: err.code || 'HYP_VERIFY_FAILED', message: String(err.message || err) }, 422);
      }
    } else if (action === 'guest_auto_checkin') {
      const next = applyPaidArrivalCheckin({ ...row, stay });
      if (next) {
        stay.guest_checked_in_at = next.stay.guest_checked_in_at;
        row.booking_status = 'CHECKED_IN';
        row.stay = stay;
      }
    } else if (action === 'guest_checkin_complete') {
      try {
        const view = chargeView();
        if (stayFullyPaid(view) || hypAlreadyPaid(view) || view.payment_status === 'PAID') {
          stay.guest_checked_in_at = stay.guest_checked_in_at || new Date().toISOString();
          row.booking_status = 'CHECKED_IN';
          if (stay.pay_split !== 'per_cabin' || allCabinsPaid(stay)) row.payment_status = 'PAID';
          row.payment_mode = row.payment_mode || 'CARD';
        } else if (stay.pay_split !== 'per_cabin' && hypDepositPaid(row)) {
          if (row.booking_status !== 'CHECKED_IN' && row.booking_status !== 'CHECKED_OUT') {
            row.booking_status = 'CONFIRMED';
          }
        } else {
          const storedWait = {
            ...row,
            stay,
            payment: { quote: stay.checkin_quote || {}, pending: true },
            updated_at: new Date().toISOString()
          };
          const savedWait = await persistGuestRow(env, token, storedWait);
          if (!savedWait) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
          return json({ ...publicView(storedWait, unitId), error: 'PAYMENT_PENDING' }, 409);
        }
      } catch (err) {
        return json({ error: err.code || 'CHECKIN_COMPLETE_FAILED', message: String(err.message || err) }, 422);
      }
    } else {
      return json({ error: 'INVALID_ACTION' }, 400);
    }
    const stored = { ...row, stay, updated_at: new Date().toISOString() };
    const savedStay = await persistGuestRow(env, token, stored);
    if (!savedStay) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
    await addInboxToken(env, token, stored);
    return json(publicView(stored, unitId));
  }

  if (!TOKEN_RE.test(token) || segments.length !== 1) {
    return json({ error: 'INVALID_TOKEN' }, 400);
  }

  if (method === 'GET') {
    let row = await readBooking(env, token);
    if (!row || row.booking_status === 'CANCELED') return json({ error: 'NOT_FOUND' }, 404);
    if (stayLinkExpired(row)) return json({ error: 'EXPIRED' }, 410);
    row = await recoverHypPaymentIfNeeded(env, token, row);
    const autoIn = applyPaidArrivalCheckin(row);
    if (autoIn) {
      const savedAuto = await persistGuestRow(env, token, autoIn);
      if (savedAuto) row = autoIn;
    }
    const unitId = new URL(request.url).searchParams.get('unit');
    return json(publicView(row, unitId));
  }

  if (method === 'POST') {
    const row = await readBooking(env, token);
    if (!row || row.booking_status === 'CANCELED') return json({ error: 'NOT_FOUND' }, 404);
    if (stayLinkExpired(row)) return json({ error: 'EXPIRED' }, 410);
    const body = await request.json().catch(() => ({}));
    const guestName = String(body.guest_name || '').trim();
    const guestEmail = String(body.guest_email || '').trim();
    const specialRequests = String(body.special_requests || '').trim();
    if (!guestName) return json({ error: 'MISSING_GUEST_FIELDS' }, 400);
    const paymentMode = String(row.payment_mode || 'CREDIT_DEPOSIT');
    const wantPay = body.pay !== false && paymentMode !== 'CASH_TRUST';
    const pref = normalizeBalancePreference(
      body.balance_payment_preference,
      row.balance_payment_preference || row.stay?.balance_payment_preference || 'CREDIT_CARD'
    );
    const paymentChoice = body.payment_choice || body.balance_payment_preference || pref;
    const payMode = paymentChoice === 'CASH'
      ? 'CASH_TRUST'
      : (body.payment_mode || (paymentChoice === 'VOUCHER' ? 'VOUCHER' : paymentChoice === 'ALREADY_PAID' ? 'ALREADY_PAID' : 'CREDIT_DEPOSIT'));
    const voucherCode = String(body.voucher_code || '').trim();
    const keepStatus = row.booking_status === 'CHECKED_IN' || row.booking_status === 'CHECKED_OUT'
      ? row.booking_status
      : (hypAlreadyPaid(row) || hypDepositPaid(row) ? 'CONFIRMED' : row.booking_status);
    const stored = {
      ...row,
      guest_name: guestName,
      guest_email: guestEmail,
      special_requests: specialRequests,
      booking_status: keepStatus,
      payment_status: row.payment_status || 'UNPAID',
      balance_payment_preference: pref,
      payment_mode: payMode,
      expires_at: stayExpiresAt({ ...row, booking_status: keepStatus === 'PENDING' ? 'CONFIRMED' : keepStatus }),
      stay: {
        ...(row.stay || { cabin_ready: false, folio: [], checkout_time: '11:00' }),
        balance_payment_preference: pref,
        payment_choice: paymentChoice,
        checkout_completed_at: new Date().toISOString(),
        ...(voucherCode ? { voucher_code: voucherCode } : {})
      },
      updated_at: new Date().toISOString()
    };

    if (!wantPay || hypAlreadyPaid(stored) || hypDepositPaid(stored)) {
      if (stored.booking_status !== 'CHECKED_IN' && stored.booking_status !== 'CHECKED_OUT') {
        stored.booking_status = 'CONFIRMED';
      }
      if (!stored.payment_status || stored.payment_status === 'UNPAID') stored.payment_status = 'UNPAID';
      const savedConfirm = await persistGuestRow(env, token, stored);
      if (!savedConfirm) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
      await addInboxToken(env, token, stored);
      return json(publicBooking(stored));
    }

    const quote = quoteGuestCharge(stored);
    if (!quote.needsCharge) {
      stored.booking_status = stored.booking_status === 'CHECKED_IN' || stored.booking_status === 'CHECKED_OUT'
        ? stored.booking_status
        : 'CONFIRMED';
      const savedFree = await persistGuestRow(env, token, stored);
      if (!savedFree) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
      await addInboxToken(env, token, stored);
      return json(publicBooking(stored));
    }

    stored.hyp_terminal = quote.terminal;
    stored.stay = {
      ...(stored.stay || {}),
      hyp_terminal: quote.terminal,
      hyp_intent: {
        purpose: quote.purpose,
        terminal: quote.terminal,
        stage: 'confirm',
        amount: quote.amount,
        status: 'redirected',
        at: new Date().toISOString()
      }
    };
    const savedIntent = await persistGuestRow(env, token, stored);
    if (!savedIntent) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
    try {
      const started = await startGuestPayment(stored, env, hypChargeReturn(body));
      if (started.lowProfileId) {
        stored.stay.hyp_intent = {
          ...(stored.stay.hyp_intent || {}),
          lowProfileId: started.lowProfileId
        };
      }
      stored.payment = hypClientPayment(started);
      stored.updated_at = new Date().toISOString();
      const savedPay = await persistGuestRow(env, token, stored);
      if (!savedPay) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
      await addInboxToken(env, token, stored);
      return json(publicBooking(stored));
    } catch (err) {
      if (err.code === 'HYP_MISSING_CREDS') {
        stored.booking_status = stored.booking_status === 'CHECKED_IN' || stored.booking_status === 'CHECKED_OUT'
          ? stored.booking_status
          : 'CONFIRMED';
        stored.payment = { unavailable: true, error: 'HYP_MISSING_CREDS' };
        stored.updated_at = new Date().toISOString();
        const savedFallback = await persistGuestRow(env, token, stored);
        if (!savedFallback) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
        await addInboxToken(env, token, stored);
        return json(publicBooking(stored));
      }
      return json({ error: err.code || 'DEPOSIT_CHARGE_FAILED', message: String(err.message || err) }, 422);
    }
  }

  return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
}
