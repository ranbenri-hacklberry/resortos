/**
 * Coffee-cart payments. The phone calls these routes. The ESP never does.
 * Cardcom ApiName / ApiPassword stay in cardcomCreds() and are not returned.
 *
 * Tap capture and the tax invoice go through the same helpers as the desk
 * (prepareDevice, processTap, createInvoice). The hosted-page fallback builds
 * the Low Profile body with the existing helper, then points the webhook here.
 */

import { buildHypLowProfileBody, isHypLowProfilePaid, lpResultToHypParams } from './hypPay.js';
import {
  LOW_PROFILE_CREATE_URL,
  LOW_PROFILE_RESULT_URL,
  TAP_PHYSICAL_LIMIT_ILS,
  WALK_IN_MAX_ILS,
  approvalFromSdk,
  buildSdkSaleInput,
  cardcomCreds,
  formatAmount,
  isCardcomMock,
  last4FromSdk,
  mockDealNumber,
  roundMoney,
  sdkSucceeded
} from './cardcomTapCore.js';
import {
  createCardcomStore,
  createInvoice,
  memoryStore,
  prepareDevice,
  processTap,
  quoteCharge
} from './cardcomTap.js';

export const KIOSK_ATTEMPT_TTL_MS = 3 * 60 * 1000;
export const KIOSK_TOKEN_MIN = 16;

const ORDER_PREFIX = 'kiosk:order:';
const LP_PREFIX = 'kiosk:lp:';

export function kioskOrderKey(orderId) {
  return `${ORDER_PREFIX}${orderId}`;
}

function lpKey(lowProfileId) {
  return `${LP_PREFIX}${lowProfileId}`;
}

function fail(code, message, extra = {}) {
  const err = new Error(message || code);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

export function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const left = enc.encode(String(a));
  const right = enc.encode(String(b));
  const len = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < len; i += 1) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}

export function kioskAuthState(env, authorizationHeader) {
  const expected = String(env?.CARDCOM_KIOSK_TOKEN || '').trim();
  if (expected.length < KIOSK_TOKEN_MIN) return 'unconfigured';
  const header = String(authorizationHeader || '').trim();
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  const provided = match ? match[1] : '';
  if (!provided || !timingSafeEqual(provided, expected)) return 'denied';
  return 'ok';
}

export function assertKioskOrderId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw fail('BAD_ORDER', 'מזהה הזמנה חסר או לא תקין');
  }
  return id;
}

export function kioskLinkMaxIls(env) {
  const raw = String(env?.KIOSK_LINK_MAX_ILS || '').trim();
  if (!raw) return TAP_PHYSICAL_LIMIT_ILS;
  const n = roundMoney(raw);
  if (!(n >= 1) || n > WALK_IN_MAX_ILS) return TAP_PHYSICAL_LIMIT_ILS;
  return n;
}

export function kioskPublicOrigin(env) {
  const raw = String(env?.KIOSK_PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
  if (/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(raw)) return raw;
  return 'https://resortos.app';
}

function descriptionOf(body) {
  const text = String(body?.description || 'עגלת קפה').replace(/[\r\n\t]/g, ' ').trim();
  return (text || 'עגלת קפה').slice(0, 80);
}

function singlePayment(body) {
  if (body?.payments == null || body.payments === '') return 1;
  const count = Number(body.payments);
  if (count !== 1) throw fail('KIOSK_SINGLE_PAYMENT', 'עגלת הקפה סולקת בתשלום אחד');
  return 1;
}

function idempotencyKey(orderId, attempt) {
  return `kiosk-tap-${orderId}-a${attempt}`;
}

function linkIdempotencyKey(orderId) {
  return `kiosk-link-${orderId}`;
}

function nowMs(deps) {
  return typeof deps.now === 'function' ? deps.now() : Date.now();
}

function storeOf(env, deps) {
  return deps.store || createCardcomStore(env);
}

async function readOrder(store, orderId) {
  return store.get(kioskOrderKey(orderId));
}

async function writeOrder(store, order) {
  await store.put(kioskOrderKey(order.orderId), order);
  return order;
}

export function publicKioskOrder(order, extra = {}) {
  if (!order) return null;
  const status = order.status === 'awaiting_tap' ? 'pending' : (order.status || 'pending');
  const approved = status === 'approved';
  return {
    ok: approved,
    status,
    settled: status === 'approved' || status === 'declined' || status === 'review',
    channel: order.channel || '',
    orderId: order.orderId,
    amount: roundMoney(order.amount),
    dealNumber: String(order.dealNumber || ''),
    approval: String(order.approval || ''),
    last4: String(order.last4 || ''),
    documentNumber: String(order.documentNumber || ''),
    documentUrl: String(order.documentUrl || ''),
    invoiceOk: Boolean(order.documentNumber || order.documentUrl),
    lowProfileId: String(order.lowProfileId || ''),
    url: String(order.url || ''),
    mock: Boolean(order.mock),
    message: order.message || messageFor(status),
    ...extra
  };
}

function messageFor(status) {
  if (status === 'approved') return 'החיוב נקלט';
  if (status === 'declined') return 'הכרטיס לא אושר';
  if (status === 'review') return 'החיוב סומן לבדיקה. אל תנפקו את ההזמנה';
  if (status === 'pending') return 'ממתין לתשלום';
  return 'החיוב לא הושלם';
}

function cachedRegistration(body) {
  if (body?.forceRegister === true) return null;
  const sapak = String(body?.sapakMutavNumber || '').trim();
  const rav = body?.ravMutavTerminalNumber;
  if (!sapak || sapak.length > 40 || !/^[A-Za-z0-9_-]+$/.test(sapak)) return null;
  if (rav == null || rav === '' || !Number.isFinite(Number(rav))) return null;
  return { sapakMutavNumber: sapak, ravMutavTerminalNumber: rav };
}

function assertDeviceUuid(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 80) throw fail('BAD_DEVICE', 'חסרים פרטי המכשיר');
  return id;
}

export async function prepareKioskTap(env, body, deps = {}) {
  const store = storeOf(env, deps);
  const orderId = assertKioskOrderId(body?.orderId);
  const payments = singlePayment(body);
  const amount = roundMoney(body?.amount);
  const existing = await readOrder(store, orderId);
  const now = nowMs(deps);

  if (existing?.status === 'approved' || existing?.status === 'review') {
    return { ...publicKioskOrder(existing), idempotent: true, alreadyPaid: existing.status === 'approved' };
  }
  if (existing?.channel === 'link' && existing.status === 'pending' && existing.url) {
    throw fail('IN_PROGRESS', 'להזמנה כבר יש דף תשלום. אל תצמידו כרטיס.');
  }
  const sameAmount = existing ? Math.abs(roundMoney(existing.amount) - amount) <= 0.009 : false;
  const fresh = existing ? now - Number(existing.at || 0) < KIOSK_ATTEMPT_TTL_MS : false;
  if (existing?.status === 'awaiting_tap' && body?.forceRegister !== true) {
    if (fresh && sameAmount) return resumePayload(existing, true);
    if (fresh && !sameAmount) throw fail('IN_PROGRESS', 'הזמנה זו כבר ממתינה להצמדה');
  }
  const reregister = existing?.status === 'awaiting_tap' && body?.forceRegister === true && fresh && sameAmount;

  const attempt = reregister ? Number(existing.attempt) : Number(existing?.attempt || 0) + 1;
  if (attempt > 20) throw fail('TOO_MANY_ATTEMPTS', 'יותר מדי ניסיונות לאותה הזמנה');
  const key = reregister ? existing.idempotencyKey : idempotencyKey(orderId, attempt);
  let saleAmount = reregister ? existing.amount : amount;
  let salePayments = reregister ? (existing.payments || 1) : payments;
  if (!reregister) {
    const quoted = await quoteCharge(env, {
      amount,
      payments,
      bookingId: '',
      channel: 'tap',
      idempotencyKey: key
    }, deps);
    if (!quoted?.ok) throw fail(quoted?.code || 'BAD_AMOUNT', quoted?.message || 'הסכום לא אושר');
    saleAmount = quoted.amount;
    salePayments = quoted.payments;
  }

  const deviceUuid = assertDeviceUuid(body?.deviceUuid);
  const cached = reregister ? null : cachedRegistration(body);
  let registration = null;
  if (!cached) {
    registration = await prepareDevice(env, {
      deviceUuid,
      manufacturer: body?.manufacturer,
      model: body?.model
    }, deps);
  }
  const sapakMutavNumber = cached?.sapakMutavNumber || registration.sapakMutavNumber;
  const ravMutavTerminalNumber = cached?.ravMutavTerminalNumber || registration.ravMutavTerminalNumber;
  const sdkRequest = buildSdkSaleInput({
    amount: saleAmount,
    payments: salePayments,
    sapakMutavNumber,
    customer: { name: 'לקוח' }
  });
  const order = {
    orderId,
    channel: 'tap',
    status: 'awaiting_tap',
    amount: saleAmount,
    payments: 1,
    attempt,
    idempotencyKey: key,
    sdkRequest,
    deviceUuid,
    sapakMutavNumber,
    ravMutavTerminalNumber,
    tpn: registration?.tpn || '',
    merchantCode: registration?.merchantCode || '',
    at: now,
    mock: isCardcomMock(env),
    message: 'ממתין להצמדת כרטיס',
    ...(existing?.basaltTopup ? { basaltTopup: existing.basaltTopup } : {})
  };
  await writeOrder(store, order);
  return resumePayload(order, false);
}

async function creditBasaltTopupIfTagged(env, order, deps) {
  if (!order?.basaltTopup || order.status !== 'approved') return;
  const { creditApprovedTopup } = await import('./basalt.js');
  await creditApprovedTopup(env, order, deps);
}

function resumePayload(order, resume) {
  return {
    ok: true,
    status: 'awaiting_tap',
    orderId: order.orderId,
    amount: roundMoney(order.amount),
    payments: 1,
    attempt: order.attempt,
    idempotencyKey: order.idempotencyKey,
    sdkRequest: order.sdkRequest,
    sapakMutavNumber: order.sapakMutavNumber,
    ravMutavTerminalNumber: order.ravMutavTerminalNumber,
    tpn: order.tpn || '',
    merchantCode: order.merchantCode || '',
    resume: Boolean(resume),
    mock: Boolean(order.mock)
  };
}

export async function completeKioskTap(env, body, deps = {}) {
  const store = storeOf(env, deps);
  const orderId = assertKioskOrderId(body?.orderId);
  const order = await readOrder(store, orderId);
  if (!order || order.channel !== 'tap') throw fail('NOT_FOUND', 'אין חיוב פתוח להזמנה');
  if (order.status === 'approved' || order.status === 'review' || order.status === 'declined') {
    if (order.status === 'approved') await creditBasaltTopupIfTagged(env, order, deps);
    return { ...publicKioskOrder(order), idempotent: true };
  }
  const key = String(body?.idempotencyKey || '').trim();
  if (!key || key !== order.idempotencyKey) throw fail('ATTEMPT_MISMATCH', 'ניסיון החיוב לא תואם');
  if (String(body?.ravMutavTerminalNumber ?? '') !== String(order.ravMutavTerminalNumber ?? '')) {
    throw fail('DEVICE_MISMATCH', 'מסוף המכשיר לא תואם');
  }

  const sdkResponse = body?.sdkResponse;
  if (!sdkSucceeded(sdkResponse)) {
    const declined = {
      ...order,
      status: 'declined',
      mock: isCardcomMock(env),
      message: 'הכרטיס לא אושר',
      at: nowMs(deps)
    };
    await writeOrder(store, declined);
    await processTap(env, {
      idempotencyKey: key,
      bookingId: '',
      deviceUuid: order.deviceUuid,
      ravMutavTerminalNumber: order.ravMutavTerminalNumber,
      sdkRequest: order.sdkRequest,
      sdkResponse
    }, deps);
    return publicKioskOrder(declined);
  }

  let processed = await processTap(env, {
    idempotencyKey: key,
    bookingId: '',
    deviceUuid: order.deviceUuid,
    ravMutavTerminalNumber: order.ravMutavTerminalNumber,
    sdkRequest: order.sdkRequest,
    sdkResponse
  }, deps);
  if (!processed?.ok && processed?.retry) {
    processed = await processTap(env, {
      idempotencyKey: key,
      bookingId: '',
      deviceUuid: order.deviceUuid,
      ravMutavTerminalNumber: order.ravMutavTerminalNumber,
      sdkRequest: order.sdkRequest,
      sdkResponse
    }, deps);
  }
  if (!processed?.ok) {
    return {
      ok: false,
      status: 'error',
      settled: false,
      channel: 'tap',
      orderId,
      amount: roundMoney(order.amount),
      error: processed?.code || 'PROCESS_FAILED',
      dealNumber: '',
      documentNumber: '',
      documentUrl: '',
      invoiceOk: false,
      mock: isCardcomMock(env),
      message: processed?.message || 'החיוב לא הושלם'
    };
  }

  let invoice = { ok: false, documentNumber: '', documentUrl: '' };
  try {
    invoice = await createInvoice(env, {
      dealNumber: processed.dealNumber,
      idempotencyKey: key,
      bookingId: '',
      amount: order.amount,
      name: 'לקוח',
      description: descriptionOf({ description: `עגלת קפה ${orderId}` })
    }, deps);
  } catch (err) {
    invoice = { ok: false, message: err?.message || '' };
  }

  const review = String(processed.review || '');
  const next = {
    ...order,
    status: review ? 'review' : 'approved',
    dealNumber: String(processed.dealNumber || ''),
    approval: String(processed.approval || approvalFromSdk(sdkResponse) || ''),
    last4: String(processed.last4 || last4FromSdk(sdkResponse) || ''),
    documentNumber: String(invoice.documentNumber || ''),
    documentUrl: String(invoice.documentUrl || ''),
    mock: isCardcomMock(env),
    message: review ? messageFor('review') : (invoice.ok ? 'החיוב נקלט' : 'החיוב נקלט. החשבונית לא הופקה.'),
    at: nowMs(deps)
  };
  await writeOrder(store, next);
  if (next.status === 'approved') await creditBasaltTopupIfTagged(env, next, deps);
  return publicKioskOrder(next);
}

async function cardcomPost(env, url, body, deps) {
  if (isCardcomMock(env)) {
    if (url === LOW_PROFILE_CREATE_URL) {
      const id = `lp-${mockDealNumber(String(body.Amount) + String(body.ReturnValue || ''))}`;
      return {
        ok: true,
        status: 200,
        data: { ResponseCode: 0, Url: `https://secure.cardcom.solutions/mock/lp/${id}`, LowProfileId: id }
      };
    }
    if (url === LOW_PROFILE_RESULT_URL) {
      const order = deps.order;
      const deal = mockDealNumber(body.LowProfileId);
      return {
        ok: true,
        status: 200,
        data: {
          ResponseCode: 0,
          ReturnValue: order?.orderId || '',
          TransactionInfo: {
            ResponseCode: 0,
            TranzactionId: deal,
            Amount: order ? roundMoney(order.amount) : 0,
            ApprovalNumber: 'MOCKOK',
            Last4CardDigitsString: '4242'
          }
        }
      };
    }
  }
  const fetchImpl = deps.fetchImpl || fetch;
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    const error = new Error('Cardcom לא ענה');
    error.code = 'CARDCOM_TIMEOUT';
    error.cause = err;
    throw error;
  }
}

export async function createKioskLink(env, body, deps = {}) {
  const store = storeOf(env, deps);
  const orderId = assertKioskOrderId(body?.orderId);
  singlePayment(body);
  const amount = roundMoney(body?.amount);
  const max = kioskLinkMaxIls(env);
  if (!(amount > 0)) throw fail('BAD_AMOUNT', 'סכום החיוב חייב להיות גדול מאפס');
  if (amount > max) {
    throw fail('AMOUNT_TOO_HIGH', `הסכום גבוה מהמותר לדף תשלום (${formatAmount(max)} ₪)`);
  }
  const existing = await readOrder(store, orderId);
  if (existing?.status === 'approved' || existing?.status === 'review') {
    return { ...publicKioskOrder(existing), idempotent: true };
  }
  if (existing?.status === 'awaiting_tap' && nowMs(deps) - Number(existing.at || 0) < KIOSK_ATTEMPT_TTL_MS) {
    throw fail('IN_PROGRESS', 'הזמנה זו ממתינה להצמדת כרטיס');
  }
  if (existing?.channel === 'link' && existing.status === 'pending' && existing.url) {
    if (Math.abs(roundMoney(existing.amount) - amount) > 0.009) {
      throw fail('AMOUNT_CHANGED', 'להזמנה כבר נפתח דף תשלום בסכום אחר');
    }
    return { ...publicKioskOrder(existing), idempotent: true };
  }

  const origin = kioskPublicOrigin(env);
  const creds = cardcomCreds(env);
  const description = descriptionOf(body);
  const payload = buildHypLowProfileBody({
    masof: String(creds.terminalNumber),
    apiName: creds.apiName,
    apiPassword: creds.apiPassword
  }, {
    amount,
    tash: 1,
    order: orderId,
    clientName: 'לקוח',
    productName: description,
    tokenize: false,
    invoice: false,
    successUrl: `${origin}/api/payments/kiosk/done`,
    failUrl: `${origin}/api/payments/kiosk/done?result=failed`
  });
  payload.Operation = 'ChargeOnly';
  payload.WebHookUrl = `${origin}/api/payments/kiosk/webhook`;
  payload.ProductName = description;

  const posted = await cardcomPost(env, LOW_PROFILE_CREATE_URL, payload, deps);
  const code = Number(posted.data?.ResponseCode);
  const url = posted.data?.Url || posted.data?.url || '';
  const lowProfileId = String(posted.data?.LowProfileId || posted.data?.LowProfileCode || '');
  if (!url || !lowProfileId || (Number.isFinite(code) && code !== 0)) {
    throw fail('LINK_FAILED', posted.data?.Description || 'יצירת דף התשלום נכשלה');
  }
  const order = {
    orderId,
    channel: 'link',
    status: 'pending',
    amount,
    payments: 1,
    idempotencyKey: linkIdempotencyKey(orderId),
    lowProfileId,
    url,
    mock: isCardcomMock(env),
    message: 'ממתין לתשלום בדף',
    at: nowMs(deps)
  };
  await writeOrder(store, order);
  await store.put(lpKey(lowProfileId), { orderId });
  return publicKioskOrder(order);
}

export function kioskWebhookFields(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    orderId: String(src.ReturnValue || src.returnValue || src.Order || src.order || src.orderId || '').trim(),
    lowProfileId: String(src.LowProfileId || src.lowProfileId || src.LowProfileCode || src.lowprofilecode || '').trim()
  };
}

async function orderForConfirm(store, { orderId, lowProfileId }) {
  if (lowProfileId) {
    const mapped = await store.get(lpKey(lowProfileId));
    if (mapped?.orderId) {
      if (orderId && mapped.orderId !== orderId) return { mismatch: true, order: null };
      const order = await readOrder(store, mapped.orderId);
      return { mismatch: false, order };
    }
  }
  if (!orderId) return { mismatch: false, order: null };
  const order = await readOrder(store, orderId);
  if (!order) return { mismatch: false, order: null };
  if (lowProfileId && order.lowProfileId && lowProfileId !== order.lowProfileId) {
    return { mismatch: true, order };
  }
  return { mismatch: false, order };
}

export async function confirmKioskLink(env, rawFields, deps = {}) {
  const fields = kioskWebhookFields(rawFields);
  const store = storeOf(env, deps);
  const hintedOrder = fields.orderId ? assertKioskOrderId(fields.orderId) : '';
  const lowProfileId = fields.lowProfileId;
  const found = await orderForConfirm(store, { orderId: hintedOrder, lowProfileId });
  if (found.mismatch) {
    return { ok: false, status: 'pending', settled: false, message: 'מזהה הדף לא תואם להזמנה' };
  }
  const order = found.order;
  if (!order || order.channel !== 'link') {
    return { ok: true, status: 'unknown', settled: false, paid: false, message: 'אין דף תשלום להזמנה' };
  }
  if (order.status === 'approved' || order.status === 'review') {
    if (order.status === 'approved') await creditBasaltTopupIfTagged(env, order, deps);
    return { ...publicKioskOrder(order), idempotent: true, paid: order.status === 'approved' };
  }
  const lpId = String(lowProfileId || order.lowProfileId || '').trim();
  if (!lpId || (order.lowProfileId && lpId !== order.lowProfileId)) {
    return { ...publicKioskOrder(order), paid: false };
  }
  const creds = cardcomCreds(env);
  const posted = await cardcomPost(env, LOW_PROFILE_RESULT_URL, {
    TerminalNumber: creds.terminalNumber,
    ApiName: creds.apiName,
    ApiPassword: creds.apiPassword,
    LowProfileId: lpId
  }, { ...deps, order });
  if (!isHypLowProfilePaid(posted.data)) {
    return { ...publicKioskOrder(order), paid: false };
  }
  const params = lpResultToHypParams(posted.data, order.orderId);
  const paidAmount = roundMoney(params.Amount);
  if (Math.abs(paidAmount - roundMoney(order.amount)) > 0.009) {
    const review = {
      ...order,
      status: 'review',
      dealNumber: String(params.Id || ''),
      approval: String(params.ACode || ''),
      last4: String(params.L4digit || ''),
      message: messageFor('review'),
      at: nowMs(deps)
    };
    await writeOrder(store, review);
    return publicKioskOrder(review);
  }
  const dealNumber = String(params.Id || '').trim();
  let documentNumber = String(params.Hesh || '');
  let documentUrl = '';
  if (dealNumber && !documentNumber) {
    try {
      const invoice = await createInvoice(env, {
        dealNumber,
        idempotencyKey: order.idempotencyKey,
        bookingId: '',
        amount: order.amount,
        name: 'לקוח',
        description: descriptionOf({ description: `עגלת קפה ${order.orderId}` })
      }, deps);
      documentNumber = String(invoice.documentNumber || '');
      documentUrl = String(invoice.documentUrl || '');
    } catch {
      documentNumber = '';
    }
  }
  const next = {
    ...order,
    status: 'approved',
    dealNumber,
    approval: String(params.ACode || ''),
    last4: String(params.L4digit || ''),
    documentNumber,
    documentUrl,
    mock: isCardcomMock(env),
    message: documentNumber ? 'החיוב נקלט' : 'החיוב נקלט. החשבונית לא הופקה.',
    at: nowMs(deps)
  };
  await writeOrder(store, next);
  if (next.status === 'approved') await creditBasaltTopupIfTagged(env, next, deps);
  return { ...publicKioskOrder(next), paid: true };
}

export async function readKioskOrder(env, orderId, deps = {}) {
  const store = storeOf(env, deps);
  const id = assertKioskOrderId(orderId);
  const order = await readOrder(store, id);
  if (!order) return null;
  return publicKioskOrder(order);
}

export function kioskDoneHtml(result) {
  const paid = result?.status === 'approved';
  const title = paid ? 'התשלום נקלט' : 'התשלום לא הושלם';
  const detail = paid
    ? 'אפשר לסגור את הדף ולחזור לעגלה.'
    : 'לא אושר חיוב. אפשר לסגור את הדף ולנסות שוב מהעגלה.';
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a"><main style="text-align:center;padding:28px 18px;max-width:420px"><p style="margin:0;font-size:22px;font-weight:900">${title}</p><p style="margin:14px 0 0;font-size:15px;line-height:1.45">${detail}</p></main></body></html>`;
}

export { memoryStore };
