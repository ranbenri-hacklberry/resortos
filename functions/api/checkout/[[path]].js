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
import { allCabinsPaid, applyPaySplitView, resolveStayUnitId } from '../../lib/paySplit.js';
import { verifyStaffPin } from '../../lib/staffPin.js';
import { normalizeBalancePreference } from '../../lib/balancePref.js';
import { buildDemoCheckoutRow } from '../../lib/demoCheckout.js';
import { applyPaidArrivalCheckin, stayExpiresAt, stayLinkExpired } from '../../../src/lib/stayAccess.js';

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
  if (!row || hypDepositPaid(row) || hypAlreadyPaid(row)) return row;
  if (row.booking_status === 'CANCELED') return row;
  const intent = row.stay?.hyp_intent;
  const waiting = row.payment_status === 'UNPAID'
    || row.booking_status === 'PENDING'
    || intent?.status === 'redirected';
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
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    unit_id: row.unit_id,
    guest_name: row.guest_name,
    guest_email: row.guest_email,
    guest_phone: row.guest_phone,
    check_in_date: row.check_in_date,
    check_out_date: row.check_out_date,
    adults_count: row.adults_count,
    children_count: row.children_count,
    baby_cot_required: Boolean(row.baby_cot_required || row.stay?.baby_cot_required),
    link_sent_at: row.link_sent_at || row.stay?.link_sent_at || row.created_at || null,
    total_price_agorot: row.total_price_agorot,
    deposit_agorot: row.deposit_agorot,
    booking_status: row.booking_status,
    payment_status: row.payment_status,
    payment_mode: row.payment_mode,
    clearing_payments: Array.isArray(row.clearing_payments) ? row.clearing_payments : [],
    balance_payment_preference: row.balance_payment_preference || row.stay?.balance_payment_preference || 'CREDIT_CARD',
    balance_paid: Boolean(row.balance_paid || row.stay?.balance_paid),
    balance_payment_method: row.balance_payment_method || row.stay?.balance_payment_method || null,
    hyp_terminal: row.hyp_terminal || row.stay?.hyp_terminal || row.stay?.hyp_intent?.terminal || null,
    channel_source: row.channel_source,
    checkout_token: row.checkout_token,
    special_requests: row.special_requests,
    payment: publicPayment(row),
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    stay: publicStay(row.stay, row)
  };
}

function publicPayment(row) {
  const payment = row?.payment;
  if (!payment || typeof payment !== 'object') return payment || null;
  const paid = hypDepositPaid(row) || hypAlreadyPaid(row) || row.stay?.hyp_intent?.status === 'paid';
  if (!paid) return payment;
  const next = { ...payment };
  delete next.pay_url;
  delete next.iframe_url;
  return next;
}

function publicStay(stay, row) {
  const allowed = Boolean(row) && stayFullyPaid(row) && row.booking_status === 'CHECKED_IN';
  if (!stay || typeof stay !== 'object') {
    return { cabin_ready: false, operational_status: 'DIRTY', folio: [], checkout_time: '11:00' };
  }
  if (allowed && stay.cabin_ready) return stripCardSecrets({ ...stay, cabin_ready: true });
  return stripCardSecrets({
    ...stay,
    cabin_ready: false,
    door_pin: null,
    gate_code: null,
    wifi_ssid: null,
    wifi_password: null,
    wifi_networks: []
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

export async function readBooking(env, token) {
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
  const segments = [].concat(params.path || []).filter(Boolean);
  const method = request.method.toUpperCase();
  const head = segments[0] || '';

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

  if (head === 'demo' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const row = buildDemoCheckoutRow(body.stage === 'stay' ? 'stay' : 'form');
    const saved = await persistGuestRow(env, row.checkout_token, row);
    if (!saved) return json({ error: 'MAILBOX_WRITE_FAILED' }, 503);
    return json(publicBooking(row));
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
      !checkinAction &&
      row.booking_status !== 'CONFIRMED' &&
      row.booking_status !== 'CHECKED_IN' &&
      row.booking_status !== 'CHECKED_OUT'
    ) {
      return json({ error: 'NOT_CONFIRMED' }, 409);
    }
    if (action === 'folio_add' && body.item?.title) {
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
      stay.self_checked_out_at = new Date().toISOString();
      if (body.stars != null && body.stars !== '') {
        stay.feedback_stars = Math.min(5, Math.max(1, Number(body.stars)));
      }
      row.booking_status = 'CHECKED_OUT';
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
          const started = await startGuestPayment(row, env, {
            successUrl: hypSuccessUrl(),
            failUrl: hypSuccessUrl()
          });
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
          const started = await startCardCheckin(view, env, {
            successUrl: hypSuccessUrl(),
            failUrl: hypSuccessUrl()
          });
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
      expires_at: stayExpiresAt({ ...row, booking_status: keepStatus === 'PENDING' ? 'CONFIRMED' : keepStatus }),
      stay: {
        ...(row.stay || { cabin_ready: false, folio: [], checkout_time: '11:00' }),
        balance_payment_preference: pref
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
      const started = await startGuestPayment(stored, env, {
        successUrl: hypSuccessUrl(),
        failUrl: hypSuccessUrl()
      });
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
