/**
 * Cardcom Tap on Phone server flow for the ResortOS staff app.
 * ApiName / ApiPassword / TerminalNumber stay in Worker secrets.
 * PrepareDevice and ProcessSDKTransaction are the Cardcom API steps.
 * registerDevice and performTransaction stay on the phone.
 */

import { loadCalendarReplica } from './calendarReplica.js';
import { buildHypLowProfileBody } from './hypPay.js';
import {
  appendCardcomPayment,
  assertChargeAmount,
  asObject,
  bookingIdOk,
  chargeableAgorot,
  deviceUuidOk,
  idempotencyKeyOk,
  mockDealNumber,
  normalizePayments,
  paidAgorot,
  parseAmountIls,
  readSdkResponseCode,
  redact
} from './cardcomTapCore.js';

const PREPARE_URL = 'https://secure.cardcom.solutions/api/v11/TapTransactions/PrepareDevice';
const PROCESS_URL = 'https://secure.cardcom.solutions/api/v11/TapTransactions/ProcessSDKTransaction';
const TRANSACTIONS_URL = 'https://secure.cardcom.solutions/api/v11/TapTransactions/GetTransactions';
const DOCUMENT_URL = 'https://secure.cardcom.solutions/api/v11/Documents/CreateDocument';
const LOW_PROFILE_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create';
const LOW_PROFILE_RESULT_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult';
const MANUAL_URL = 'https://secure.cardcom.solutions/api/v11/Transactions/Transaction';
const MAX_DEVICES = 5;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization'
    }
  });
}

function fail(code, message, status = 400, extra = {}) {
  return json({ ok: false, code, message, ...extra }, status);
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || 'dashboard_secret')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function signDashboardToken(env, user, now = Date.now()) {
  const exp = now + 7 * 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    phone: user.phone || '',
    exp
  });
  const encoded = btoa(unescape(encodeURIComponent(payload)));
  const sig = await hmacHex(env.CHECKOUT_MAILBOX_SECRET || env.HOTELOS_DESK_PIN || 'dashboard_salt', encoded);
  return `${encoded}.${sig}`;
}

export async function verifyDashboardToken(env, token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = String(token).split('.');
  const expected = await hmacHex(env.CHECKOUT_MAILBOX_SECRET || env.HOTELOS_DESK_PIN || 'dashboard_salt', encoded);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    if (Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cardcomCreds(env) {
  const apiName = String(env?.CARDCOM_API_NAME || '').trim();
  const apiPassword = String(env?.CARDCOM_API_PASSWORD || '').trim();
  const terminal = String(env?.CARDCOM_TERMINAL || '').replace(/\D/g, '');
  if (!apiName || !apiPassword || !terminal) {
    const err = new Error('CARDCOM_MISSING_CREDS');
    err.code = 'CARDCOM_MISSING_CREDS';
    throw err;
  }
  return { apiName, apiPassword, terminal: Number(terminal) };
}

export function tapMock(env) {
  const flag = String(env?.CARDCOM_TAP_MOCK || '').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'no') return false;
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  try {
    cardcomCreds(env);
    return false;
  } catch {
    return true;
  }
}

function secretText(env, value) {
  const text = String(value || '');
  const password = String(env?.CARDCOM_API_PASSWORD || '');
  if (password && text.includes(password)) return 'שגיאה מקרדקום';
  return text.slice(0, 300);
}

async function kvGet(kv, key) {
  if (!kv || !key) return null;
  const raw = await kv.get(key);
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function kvPut(kv, key, value) {
  if (!kv) return false;
  await kv.put(key, JSON.stringify(value));
  return true;
}

function idemKey(key) {
  return `cardcom-tap:idem:${key}`;
}

function deviceKey(uuid) {
  return `cardcom-tap:device:${uuid}`;
}

function dealKey(dealNumber) {
  return `cardcom-tap:deal:${dealNumber}`;
}

const DEVICE_LIST_KEY = 'cardcom-tap:devices';

function publicLedger(ledger) {
  return {
    ok: ledger.status === 'done' || ledger.status === 'reserved',
    status: ledger.status,
    alreadyDone: ledger.status === 'done',
    doNotChargeAgain: ledger.status === 'submitted' || ledger.status === 'unknown' || ledger.status === 'done',
    mock: Boolean(ledger.mock),
    dealNumber: ledger.dealNumber || '',
    documentNumber: ledger.documentNumber || '',
    documentUrl: ledger.documentUrl || '',
    bookingId: ledger.bookingId || '',
    guest_name: ledger.guest_name || '',
    amount: ledger.amount,
    payments: ledger.payments,
    bookingRecorded: Boolean(ledger.bookingRecorded),
    unlinked: Boolean(ledger.unlinked),
    payUrl: ledger.payUrl || '',
    lowProfileId: ledger.lowProfileId || ''
  };
}

function findStay(replica, id) {
  const wanted = String(id || '');
  if (!wanted) return null;
  const stays = [];
  if (Array.isArray(replica?.stays)) stays.push(...replica.stays);
  const byTail = replica?.byTail && typeof replica.byTail === 'object' ? replica.byTail : {};
  for (const list of Object.values(byTail)) {
    if (Array.isArray(list)) stays.push(...list);
  }
  return stays.find((row) => row && (row.id === wanted || row.checkout_token === wanted)) || null;
}

function mergeBooking(found, live) {
  if (!found) return live || null;
  if (!live) return found;
  const a = Array.isArray(found.clearing_payments) ? found.clearing_payments : [];
  const b = Array.isArray(live.clearing_payments) ? live.clearing_payments : [];
  return {
    ...found,
    ...live,
    id: found.id || live.id,
    guest_name: found.guest_name || live.guest_name,
    unit_id: found.unit_id || live.unit_id,
    checkout_token: live.checkout_token || found.checkout_token,
    total_price_agorot: Math.max(Number(found.total_price_agorot) || 0, Number(live.total_price_agorot) || 0),
    deposit_agorot: Math.max(Number(found.deposit_agorot) || 0, Number(live.deposit_agorot) || 0),
    clearing_payments: b.length >= a.length ? b : a
  };
}

function checkoutTokenFor(booking) {
  const existing = String(booking?.checkout_token || '');
  if (/^tok_[A-Za-z0-9_-]+$/.test(existing)) return existing;
  const safe = String(booking?.id || 'walk').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  return `tok_cc_${safe || 'walk'}`;
}

export async function defaultLoadBooking(env, id) {
  const replica = await loadCalendarReplica(env);
  const found = findStay(replica, id);
  let live = null;
  const token = found && /^tok_[A-Za-z0-9_-]+$/.test(String(found.checkout_token || ''))
    ? found.checkout_token
    : (/^tok_[A-Za-z0-9_-]+$/.test(String(id || '')) ? String(id) : '');
  if (token) {
    try {
      const checkout = await import('../api/checkout/[[path]].js');
      live = await checkout.readBooking(env, token);
    } catch (err) {
      console.warn('[cardcom readBooking]', err?.message || err);
    }
  }
  const booking = mergeBooking(found, live);
  if (!booking && token && live) return { booking: live, token };
  if (!booking) return null;
  return { booking, token: checkoutTokenFor(booking) };
}

async function patchReplica(env, booking) {
  if (!env?.STAY_DB || !booking) return;
  try {
    const replica = await loadCalendarReplica(env);
    if (!replica || !Array.isArray(replica.stays)) return;
    const stays = replica.stays.map((row) => {
      const match = row?.id === booking.id || (booking.checkout_token && row?.checkout_token === booking.checkout_token);
      if (!match) return row;
      return {
        ...row,
        ...booking,
        clearing_payments: booking.clearing_payments,
        payment_status: booking.payment_status,
        payment_mode: booking.payment_mode,
        checkout_token: booking.checkout_token
      };
    });
    const now = new Date().toISOString();
    await env.STAY_DB.prepare(
      'INSERT OR REPLACE INTO guest_context (id, payload, synced_at) VALUES (?1, ?2, ?3)'
    ).bind('all', JSON.stringify({ ...replica, stays, syncedAt: now }), now).run();
  } catch (err) {
    console.warn('[cardcom replica]', err?.message || err);
  }
}

export async function defaultSaveBooking(env, booking) {
  const token = checkoutTokenFor(booking);
  const stored = { ...booking, checkout_token: token, updated_at: new Date().toISOString() };
  try {
    const checkout = await import('../api/checkout/[[path]].js');
    const saved = await checkout.persistGuestRow(env, token, stored);
    if (!saved) return { ok: false, booking: stored };
  } catch (err) {
    console.warn('[cardcom saveBooking]', err?.message || err);
    return { ok: false, booking: stored };
  }
  await patchReplica(env, stored);
  return { ok: true, booking: stored };
}

async function cardcomPost(env, url, body, fetchImpl) {
  const creds = cardcomCreds(env);
  const payload = {
    ...body,
    ApiName: creds.apiName,
    ApiPassword: creds.apiPassword,
    TerminalNumber: body.TerminalNumber || creds.terminal
  };
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { Description: text.slice(0, 180) };
  }
  return { http: res.status, data };
}

function responseCodeOk(data) {
  const code = Number(data?.ResponseCode);
  return data && (data.ResponseCode === 0 || data.ResponseCode === '0' || code === 0);
}

async function rememberDevice(env, uuid) {
  const list = (await kvGet(env.CHECKOUT_KV, DEVICE_LIST_KEY)) || [];
  const devices = Array.isArray(list) ? list.map(String) : [];
  if (devices.includes(uuid)) return { ok: true, devices };
  if (devices.length >= MAX_DEVICES) {
    return { ok: false, code: 'DEVICE_LIMIT', message: 'למסוף הזה כבר רשומים 5 מכשירים' };
  }
  devices.push(uuid);
  await kvPut(env.CHECKOUT_KV, DEVICE_LIST_KEY, devices);
  return { ok: true, devices };
}

function mockPrepare(uuid) {
  return {
    ResponseCode: 0,
    Description: 'mock',
    TPN: `MOCKTPN-${uuid.slice(0, 8)}`,
    MerchantCode: 'MOCKMERCHANT',
    SapakMutavNumber: 'MOCKMUTAV',
    RavMutavTerminalNumber: 999001
  };
}

async function prepareDevice(env, body, deps) {
  const uuid = String(body.deviceUuid || '').trim();
  const manufacturer = String(body.manufacturer || '').trim().slice(0, 80);
  const model = String(body.model || '').trim().slice(0, 80);
  if (!deviceUuidOk(uuid) || !manufacturer || !model) {
    return fail('DEVICE', 'חסר מזהה מכשיר, יצרן או דגם');
  }
  const slot = await rememberDevice(env, uuid);
  if (!slot.ok) return fail(slot.code, slot.message, 409);
  let data;
  const mock = tapMock(env);
  try {
    if (mock) data = mockPrepare(uuid);
    else {
      const posted = await cardcomPost(env, PREPARE_URL, {
        DeviceUUID: uuid,
        DeviceManufacturer: manufacturer,
        DeviceModel: model
      }, deps.fetchImpl);
      data = posted.data || {};
      if (!responseCodeOk(data) || !data.TPN || !data.MerchantCode) {
        return fail('PREPARE_FAILED', secretText(env, data.Description) || 'הכנת המכשיר נכשלה', 502);
      }
    }
  } catch (err) {
    return fail('PREPARE_FAILED', 'הכנת המכשיר נכשלה', 502);
  }
  const stored = {
    deviceUuid: uuid,
    manufacturer,
    model,
    TPN: data.TPN,
    MerchantCode: data.MerchantCode,
    SapakMutavNumber: data.SapakMutavNumber,
    RavMutavTerminalNumber: data.RavMutavTerminalNumber,
    mock,
    at: new Date().toISOString()
  };
  await kvPut(env.CHECKOUT_KV, deviceKey(uuid), stored);
  return json({
    ok: true,
    mock,
    TPN: stored.TPN,
    MerchantCode: stored.MerchantCode,
    SapakMutavNumber: stored.SapakMutavNumber,
    RavMutavTerminalNumber: stored.RavMutavTerminalNumber
  });
}

async function loadBookingForCharge(env, deps, bookingId) {
  if (!bookingId) return { booking: null };
  const loaded = await (deps.loadBooking || defaultLoadBooking)(env, bookingId);
  if (!loaded?.booking) return { error: fail('NOT_FOUND', 'ההזמנה לא נמצאה', 404) };
  return { booking: loaded.booking, token: loaded.token || '' };
}

async function reserve(env, body, deps) {
  const key = String(body.idempotencyKey || '').trim();
  if (!idempotencyKeyOk(key)) return fail('IDEMPOTENCY', 'מזהה החיוב לא תקין');
  const bookingId = String(body.bookingId || '').trim();
  if (!bookingIdOk(bookingId)) return fail('BOOKING', 'מזהה ההזמנה לא תקין');
  const payments = normalizePayments(body.payments || 1);
  if (!payments) return fail('PAYMENTS', 'מספר התשלומים צריך להיות בין 1 ל-12');
  const channel = ['tap', 'link', 'manual'].includes(body.channel) ? body.channel : 'tap';
  const deviceUuid = String(body.deviceUuid || '').trim();
  if (channel === 'tap' && !deviceUuidOk(deviceUuid)) return fail('DEVICE', 'חסר מזהה מכשיר');

  const existing = await kvGet(env.CHECKOUT_KV, idemKey(key));
  if (existing) return json(publicLedger(existing));

  const loaded = await loadBookingForCharge(env, deps, bookingId);
  if (loaded.error) return loaded.error;
  const check = assertChargeAmount(loaded.booking, body.amount, channel);
  if (!check.ok) return fail(check.code, check.message, 400, { due_ils: check.due_ils });

  const ledger = {
    status: 'reserved',
    idempotencyKey: key,
    bookingId,
    guest_name: loaded.booking?.guest_name || '',
    amount: check.amount,
    agorot: check.agorot,
    payments,
    channel,
    deviceUuid,
    unlinked: !bookingId,
    bookingRecorded: !bookingId,
    createdAt: new Date().toISOString()
  };
  await kvPut(env.CHECKOUT_KV, idemKey(key), ledger);
  return json({ ...publicLedger(ledger), due_ils: check.due_ils, guest_name: ledger.guest_name });
}

async function recordBooking(env, deps, ledger) {
  if (!ledger.bookingId) {
    ledger.unlinked = true;
    ledger.bookingRecorded = true;
    return ledger;
  }
  const loaded = await loadBookingForCharge(env, deps, ledger.bookingId);
  if (loaded.error || !loaded.booking) {
    ledger.bookingRecorded = false;
    ledger.bookingError = 'NOT_FOUND';
    return ledger;
  }
  const appended = appendCardcomPayment(loaded.booking, {
    dealNumber: ledger.dealNumber,
    amountIls: ledger.amount,
    payments: ledger.payments,
    channel: ledger.channel,
    at: ledger.finishedAt || new Date().toISOString()
  });
  const saved = await (deps.saveBooking || defaultSaveBooking)(env, appended.booking);
  ledger.bookingRecorded = Boolean(saved?.ok !== false);
  ledger.guest_name = ledger.guest_name || appended.booking.guest_name || '';
  return ledger;
}

async function finishDeal(env, deps, ledger, dealNumber, mock) {
  const deal = String(dealNumber || '');
  if (!deal) return fail('NO_DEAL', 'קרדקום לא החזיר מספר עסקה', 502, { doNotChargeAgain: true });
  const priorKey = await kvGet(env.CHECKOUT_KV, dealKey(deal));
  if (priorKey && priorKey !== ledger.idempotencyKey) {
    const prior = await kvGet(env.CHECKOUT_KV, idemKey(priorKey));
    if (prior?.status === 'done') return json({ ...publicLedger(prior), replay: true });
  }
  ledger.status = 'done';
  ledger.dealNumber = deal;
  ledger.mock = Boolean(mock || ledger.mock);
  ledger.finishedAt = ledger.finishedAt || new Date().toISOString();
  await recordBooking(env, deps, ledger);
  await kvPut(env.CHECKOUT_KV, idemKey(ledger.idempotencyKey), ledger);
  await kvPut(env.CHECKOUT_KV, dealKey(deal), ledger.idempotencyKey);
  return json(publicLedger(ledger));
}

async function lookupDeal(env, ledger, deps) {
  if (tapMock(env)) {
    return { dealNumber: await mockDealNumber(ledger.idempotencyKey), mock: true };
  }
  const from = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const to = new Date(Date.now() + 60 * 60 * 1000);
  const stamp = (date) => date.toISOString().slice(0, 19);
  const posted = await cardcomPost(env, TRANSACTIONS_URL, {
    FromDate: stamp(from),
    ToDate: stamp(to)
  }, deps.fetchImpl);
  const rows = Array.isArray(posted.data?.Transactions) ? posted.data.Transactions : [];
  const wanted = Math.round(Number(ledger.amount) * 100);
  const hit = rows.find((row) => {
    const amount = Math.round(Number(String(row?.Amount ?? '').replace(/,/g, '')) * 100);
    return Number.isFinite(amount) && Math.abs(amount - wanted) <= 1 && row?.DealNumber;
  });
  return hit ? { dealNumber: String(hit.DealNumber), mock: false } : null;
}

async function recover(env, deps, ledger) {
  try {
    const found = await lookupDeal(env, ledger, deps);
    if (found?.dealNumber) return finishDeal(env, deps, ledger, found.dealNumber, found.mock);
  } catch (err) {
    console.warn('[cardcom recover]', err?.message || err);
  }
  ledger.status = 'unknown';
  await kvPut(env.CHECKOUT_KV, idemKey(ledger.idempotencyKey), ledger);
  return fail('PROCESS_UNKNOWN', 'לא ברור אם החיוב נקלט. אל תחייבו שוב. בדקו בקרדקום.', 504, { doNotChargeAgain: true });
}

async function submitSdk(env, ledger, body, deps) {
  const prep = await kvGet(env.CHECKOUT_KV, deviceKey(ledger.deviceUuid));
  if (!prep) return { error: fail('DEVICE_NOT_PREPARED', 'המכשיר עוד לא הוכן', 409, { doNotChargeAgain: true }) };
  if (String(body.ravMutavTerminalNumber || '') !== String(prep.RavMutavTerminalNumber || '')) {
    return { error: fail('TERMINAL_MISMATCH', 'מסוף הסליקה לא תואם את המכשיר', 409, { doNotChargeAgain: true }) };
  }
  const sdkRequest = body.sdkRequest;
  const sdkResponse = body.sdkResponse;
  if (tapMock(env)) {
    return {
      data: { ResponseCode: 0, Description: 'mock', DealNumber: await mockDealNumber(ledger.idempotencyKey) },
      mock: true,
      sdkRequest,
      sdkResponse
    };
  }
  const posted = await cardcomPost(env, PROCESS_URL, {
    RavMutavTerminalNumber: prep.RavMutavTerminalNumber,
    DeviceUUID: ledger.deviceUuid,
    SdkRequest: typeof sdkRequest === 'string' ? sdkRequest : JSON.stringify(sdkRequest ?? {}),
    SdkResponse: typeof sdkResponse === 'string' ? sdkResponse : JSON.stringify(sdkResponse ?? {})
  }, deps.fetchImpl);
  return { data: posted.data, mock: false, sdkRequest, sdkResponse };
}

async function processTap(env, body, deps) {
  const key = String(body.idempotencyKey || '').trim();
  if (!idempotencyKeyOk(key)) return fail('IDEMPOTENCY', 'מזהה החיוב לא תקין');
  const ledger = await kvGet(env.CHECKOUT_KV, idemKey(key));
  if (!ledger) return fail('NO_RESERVE', 'החיוב לא נשמר לפני הנגיעה', 409);
  if (ledger.status === 'done') {
    if (ledger.bookingId && !ledger.bookingRecorded) await recordBooking(env, deps, ledger);
    await kvPut(env.CHECKOUT_KV, idemKey(key), ledger);
    return json({ ...publicLedger(ledger), replay: true });
  }
  if (ledger.status === 'submitted' || ledger.status === 'unknown') return recover(env, deps, ledger);
  if (ledger.status === 'declined') {
    return fail('SDK_DECLINED', 'הנגיעה לא אושרה', 402, { doNotChargeAgain: false });
  }
  if (ledger.status !== 'reserved') return fail('BAD_STATE', 'אי אפשר להמשיך את החיוב', 409);

  const amount = parseAmountIls(body.amount);
  if (amount == null || amount !== ledger.amount) {
    return fail('AMOUNT_MISMATCH', 'הסכום לא תואם את מה שאושר', 409, { doNotChargeAgain: true });
  }
  const code = readSdkResponseCode(body.sdkResponse);
  const prep = await kvGet(env.CHECKOUT_KV, deviceKey(ledger.deviceUuid));
  if (!prep) return fail('DEVICE_NOT_PREPARED', 'המכשיר עוד לא הוכן', 409);
  if (body.ravMutavTerminalNumber != null && String(body.ravMutavTerminalNumber) !== String(prep.RavMutavTerminalNumber || '')) {
    return fail('TERMINAL_MISMATCH', 'מסוף הסליקה לא תואם את המכשיר', 409);
  }
  ledger.sdkRequest = redact(asObject(body.sdkRequest));
  ledger.sdkResponse = redact(asObject(body.sdkResponse));
  if (code !== '00') {
    ledger.status = 'declined';
    ledger.responseCode = code;
    await kvPut(env.CHECKOUT_KV, idemKey(key), ledger);
    return fail('SDK_DECLINED', 'הנגיעה לא אושרה', 402, { response_code: code });
  }

  ledger.status = 'submitted';
  ledger.submittedAt = new Date().toISOString();
  await kvPut(env.CHECKOUT_KV, idemKey(key), ledger);

  let submitted;
  try {
    submitted = await submitSdk(env, ledger, body, deps);
  } catch (err) {
    console.warn('[cardcom process]', err?.message || err);
    ledger.status = 'unknown';
    await kvPut(env.CHECKOUT_KV, idemKey(key), ledger);
    return fail('PROCESS_UNKNOWN', 'לא ברור אם החיוב נקלט. אל תחייבו שוב.', 504, { doNotChargeAgain: true });
  }
  if (submitted.error) return submitted.error;
  if (!responseCodeOk(submitted.data) || !submitted.data?.DealNumber) {
    ledger.status = 'unknown';
    ledger.cardcom = redact(submitted.data || {});
    await kvPut(env.CHECKOUT_KV, idemKey(key), ledger);
    return fail(
      'PROCESS_REJECTED',
      secretText(env, submitted.data?.Description) || 'קרדקום לא אישר את קליטת העסקה. אל תחייבו שוב.',
      502,
      { doNotChargeAgain: true }
    );
  }
  ledger.mock = submitted.mock;
  return finishDeal(env, deps, ledger, submitted.data.DealNumber, submitted.mock);
}

async function createInvoice(env, body, deps) {
  const key = String(body.idempotencyKey || '').trim();
  if (!idempotencyKeyOk(key)) return fail('IDEMPOTENCY', 'מזהה החיוב לא תקין');
  const ledger = await kvGet(env.CHECKOUT_KV, idemKey(key));
  if (!ledger || ledger.status !== 'done' || !ledger.dealNumber) {
    return fail('NO_DEAL', 'אפשר להפיק מסמך רק אחרי עסקה שנקלטה', 409);
  }
  if (body.dealNumber && String(body.dealNumber) !== String(ledger.dealNumber)) {
    return fail('DEAL_MISMATCH', 'מספר העסקה לא תואם', 409);
  }
  if (ledger.documentNumber) return json({ ...publicLedger(ledger), replay: true });

  const name = String(body.name || ledger.guest_name || 'אורח').slice(0, 80);
  const email = String(body.email || '').trim();
  let data;
  const mock = tapMock(env);
  try {
    if (mock) {
      data = {
        ResponseCode: 0,
        DocumentNumber: `9${ledger.dealNumber}`,
        DocumentUrl: `https://secure.cardcom.solutions/mock/doc/${ledger.dealNumber}`
      };
    } else {
      const posted = await cardcomPost(env, DOCUMENT_URL, {
        DealNumbers: [{ DealNumber: String(ledger.dealNumber) }],
        IsSendSMS: false,
        Document: {
          DocumentTypeToCreate: 'TaxInvoiceAndReceipt',
          Name: name,
          Email: email || undefined,
          IsSendByEmail: Boolean(email),
          Products: [{
            Description: 'אירוח מיאליס',
            UnitCost: ledger.amount,
            Quantity: 1,
            IsVatFree: false
          }],
          ISOCoinID: '1',
          Comments: ledger.bookingId ? `הזמנה ${ledger.bookingId}` : undefined
        }
      }, deps.fetchImpl);
      data = posted.data || {};
      if (!responseCodeOk(data) || !data.DocumentNumber) {
        return fail('INVOICE_FAILED', secretText(env, data.Description) || 'הפקת המסמך נכשלה', 502);
      }
    }
  } catch (err) {
    return fail('INVOICE_FAILED', 'הפקת המסמך נכשלה', 502);
  }
  ledger.documentNumber = String(data.DocumentNumber);
  ledger.documentUrl = String(data.DocumentUrl || data.DocumentLink || '');
  ledger.guest_name = name;
  await kvPut(env.CHECKOUT_KV, idemKey(key), ledger);
  return json(publicLedger(ledger));
}

async function createLink(env, body, deps) {
  const reserved = await reserve(env, { ...body, channel: 'link', deviceUuid: body.deviceUuid || 'link-device' }, deps);
  const data = await reserved.json();
  if (data.status === 'done' || data.payUrl) return json(data, reserved.ok ? 200 : reserved.status);
  if (!data.ok || data.status !== 'reserved') return json(data, reserved.status);
  const key = String(body.idempotencyKey || '').trim();
  const ledger = await kvGet(env.CHECKOUT_KV, idemKey(key));
  if (ledger.payUrl) return json(publicLedger(ledger));
  let url = '';
  let lowProfileId = '';
  if (tapMock(env)) {
    url = `https://secure.cardcom.solutions/mock/lp/${key}`;
    lowProfileId = `mock-${key.slice(0, 12)}`;
  } else {
    try {
      const creds = cardcomCreds(env);
      const payload = buildHypLowProfileBody({
        masof: String(creds.terminal),
        apiName: creds.apiName,
        apiPassword: creds.apiPassword
      }, {
        amount: ledger.amount,
        order: ledger.bookingId || key,
        clientName: ledger.guest_name || body.name || 'אורח',
        email: body.email || '',
        cell: body.phone || '',
        info: 'ResortOS',
        tokenize: false,
        invoice: false,
        sendHesh: false,
        tash: ledger.payments
      });
      const posted = await cardcomPost(env, LOW_PROFILE_URL, payload, deps.fetchImpl);
      const code = Number(posted.data?.ResponseCode);
      url = posted.data?.Url || posted.data?.url || '';
      lowProfileId = String(posted.data?.LowProfileId || posted.data?.LowProfileCode || '');
      if (!url || (Number.isFinite(code) && code !== 0)) {
        return fail('LINK_FAILED', secretText(env, posted.data?.Description) || 'יצירת קישור התשלום נכשלה', 502);
      }
    } catch (err) {
      return fail('LINK_FAILED', 'יצירת קישור התשלום נכשלה', 502);
    }
  }
  ledger.payUrl = url;
  ledger.lowProfileId = lowProfileId;
  await kvPut(env.CHECKOUT_KV, idemKey(key), ledger);
  return json(publicLedger(ledger));
}

async function linkStatus(env, body, deps) {
  const key = String(body.idempotencyKey || '').trim();
  const ledger = await kvGet(env.CHECKOUT_KV, idemKey(key));
  if (!ledger) return fail('NO_RESERVE', 'הקישור לא נמצא', 404);
  if (ledger.status === 'done') return json({ ...publicLedger(ledger), replay: true });
  if (tapMock(env)) {
    return finishDeal(env, deps, ledger, await mockDealNumber(key), true);
  }
  if (!ledger.lowProfileId) return fail('NO_LINK', 'עוד אין דף תשלום', 409);
  try {
    const creds = cardcomCreds(env);
    const posted = await cardcomPost(env, LOW_PROFILE_RESULT_URL, {
      LowProfileId: ledger.lowProfileId,
      TerminalNumber: creds.terminal
    }, deps.fetchImpl);
    const tx = posted.data?.TransactionInfo || posted.data?.TranzactionInfo || {};
    const deal = tx.DealNumber || tx.TranzactionId || posted.data?.DealNumber || '';
    const code = Number(tx.ResponseCode ?? posted.data?.ResponseCode);
    if (!deal || (Number.isFinite(code) && code !== 0)) {
      return json({ ok: false, code: 'UNPAID', message: 'האורח עוד לא שילם', status: ledger.status });
    }
    return finishDeal(env, deps, ledger, deal, false);
  } catch (err) {
    return fail('LINK_STATUS_FAILED', 'לא הצלחנו לבדוק את הקישור', 502);
  }
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

async function manualCharge(env, body, deps) {
  const reserved = await reserve(env, { ...body, channel: 'manual', deviceUuid: body.deviceUuid || 'manual-entry' }, deps);
  const opened = await reserved.json();
  if (!reserved.ok && opened.status !== 'reserved') return json(opened, reserved.status);
  const key = String(body.idempotencyKey || '').trim();
  const ledger = await kvGet(env.CHECKOUT_KV, idemKey(key));
  if (!ledger) return fail('NO_RESERVE', 'החיוב לא נשמר', 409);
  if (ledger.status === 'done') return json({ ...publicLedger(ledger), replay: true });
  if (ledger.status === 'submitted' || ledger.status === 'unknown') return recover(env, deps, ledger);

  const pan = digits(body.cardNumber);
  const month = digits(body.expMonth).padStart(2, '0').slice(-2);
  const year = digits(body.expYear).slice(-2);
  const cvv = digits(body.cvv);
  if (pan.length < 8 || pan.length > 19 || Number(month) < 1 || Number(month) > 12 || year.length !== 2 || cvv.length < 3) {
    return fail('CARD', 'פרטי הכרטיס לא מלאים');
  }
  const last4 = pan.slice(-4);
  ledger.status = 'submitted';
  ledger.last4 = last4;
  ledger.submittedAt = new Date().toISOString();
  await kvPut(env.CHECKOUT_KV, idemKey(key), ledger);

  let deal = '';
  let mock = tapMock(env);
  try {
    if (mock) {
      deal = await mockDealNumber(key);
    } else {
      const creds = cardcomCreds(env);
      const posted = await cardcomPost(env, MANUAL_URL, {
        Amount: ledger.amount,
        CardNumber: pan,
        CardExpirationMMYY: `${month}${year}`,
        CVV2: cvv,
        NumOfPayments: ledger.payments,
        CreditType: ledger.payments > 1 ? 8 : 1,
        ExternalUniqTranId: key,
        ExternalUniqTranIdResponse: true,
        ISOCoinId: 1,
        CardOwnerInformation: {
          FullName: String(body.holderName || ledger.guest_name || '').slice(0, 80) || undefined,
          IdentityNumber: digits(body.holderId) || undefined
        },
        TerminalNumber: creds.terminal
      }, deps.fetchImpl);
      if (!responseCodeOk(posted.data)) {
        ledger.status = 'unknown';
        await kvPut(env.CHECKOUT_KV, idemKey(key), ledger);
        return fail('PROCESS_REJECTED', secretText(env, posted.data?.Description) || 'הכרטיס לא חויב. אל תנסו שוב לפני בדיקה.', 502, {
          doNotChargeAgain: true,
          last4
        });
      }
      deal = String(posted.data?.DealNumber || posted.data?.TranzactionId || posted.data?.TransactionId || '');
    }
  } catch (err) {
    ledger.status = 'unknown';
    await kvPut(env.CHECKOUT_KV, idemKey(key), ledger);
    return fail('PROCESS_UNKNOWN', 'לא ברור אם החיוב נקלט. אל תחייבו שוב.', 504, { doNotChargeAgain: true, last4 });
  }
  const done = await finishDeal(env, deps, ledger, deal, mock);
  const payload = await done.json();
  return json({ ...payload, last4 }, done.status);
}

async function bookingView(env, deps, id) {
  if (!bookingIdOk(id) || !id) return fail('BOOKING', 'מזהה ההזמנה לא תקין');
  const loaded = await loadBookingForCharge(env, deps, id);
  if (loaded.error) return loaded.error;
  const booking = loaded.booking;
  const due = chargeableAgorot(booking) / 100;
  return json({
    ok: true,
    id: booking.id || id,
    guest_name: booking.guest_name || '',
    unit_id: booking.unit_id || '',
    total_ils: (Number(booking.total_price_agorot) || 0) / 100,
    paid_ils: paidAgorot(booking) / 100,
    due_ils: due,
    payment_status: booking.payment_status || 'UNPAID'
  });
}

function routeName(request, deps) {
  if (deps.path) return String(deps.path).split('/').filter(Boolean).pop();
  const url = new URL(request.url);
  return url.pathname.split('/').filter(Boolean).pop() || '';
}

export async function handleCardcomRequest(request, env, deps = {}) {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return json({ ok: true }, 204);
  if (!env?.CHECKOUT_KV) return fail('KV_REQUIRED', 'אחסון התשלומים לא מוגדר', 503);

  const header = request.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  const session = await verifyDashboardToken(env, token);
  if (!session) return fail('UNAUTHORIZED', 'צריך להתחבר מחדש', 401);

  const name = routeName(request, deps);
  const fetchImpl = deps.fetchImpl || fetch;
  const tools = { ...deps, fetchImpl };
  try {
    if (name === 'booking' && method === 'GET') {
      const id = new URL(request.url).searchParams.get('id') || '';
      return bookingView(env, tools, id);
    }
    if (method !== 'POST') return fail('METHOD', 'הפעולה לא נתמכת', 405);
    const body = await request.json().catch(() => ({}));
    delete body.ApiPassword;
    delete body.apiPassword;
    delete body.CARDCOM_API_PASSWORD;
    if (name === 'reserve') return reserve(env, body, tools);
    if (name === 'prepare') return prepareDevice(env, body, tools);
    if (name === 'process') return processTap(env, body, tools);
    if (name === 'invoice') return createInvoice(env, body, tools);
    if (name === 'link') return createLink(env, body, tools);
    if (name === 'link-status') return linkStatus(env, body, tools);
    if (name === 'manual') return manualCharge(env, body, tools);
    return fail('NOT_FOUND', 'הפעולה לא נמצאה', 404);
  } catch (err) {
    console.error('[cardcom]', err?.message || err);
    return fail('INTERNAL', 'שגיאה בשרת התשלומים', 500);
  }
}
