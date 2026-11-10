import { fetchPostgrest } from '../api/_db.js';
import { buildHypLowProfileBody, isHypLowProfilePaid, lpResultToHypParams } from './hypPay.js';
import {
  DOCUMENT_URL,
  FALLBACK_INVOICE_EMAIL,
  LOW_PROFILE_CREATE_URL,
  LOW_PROFILE_RESULT_URL,
  MANUAL_CHARGE_URL,
  TAP_LIST_URL,
  TAP_PREPARE_URL,
  TAP_PROCESS_URL,
  applyCardcomPayment,
  approvalFromSdk,
  assertIdempotencyKey,
  assertQuoteAmount,
  attachDocument,
  bookingSummary,
  buildCreateDocumentBody,
  buildPrepareDeviceBody,
  buildProcessBody,
  cardcomCreds,
  formatAmount,
  isCardcomMock,
  last4FromSdk,
  mockDealNumber,
  mockDocumentResponse,
  mockPrepareResponse,
  mockProcessResponse,
  parseDocumentResponse,
  parsePrepareDevice,
  parseProcessResponse,
  parseSdkPayload,
  publicPaymentResult,
  redactSecrets,
  roundMoney,
  sdkAmount,
  sdkSucceeded,
  splitInstallments
} from './cardcomTapCore.js';
import {
  invoiceMailboxConfigured,
  triggerMailboxIngestViaServer
} from './cardcomInvoiceMailbox.js';

const memoryBuckets = new Map();

export function memoryStore() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async put(key, value) {
      map.set(key, value);
      return true;
    }
  };
}

function kvStore(kv) {
  return {
    async get(key) {
      const raw = await kv.get(String(key));
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async put(key, value) {
      await kv.put(String(key), JSON.stringify(value));
      return true;
    }
  };
}

export function createCardcomStore(env) {
  if (env?.CARDCOM_STORE) return env.CARDCOM_STORE;
  const kv = env?.CARDCOM_KV || env?.CHECKOUT_KV;
  if (kv && typeof kv.get === 'function' && typeof kv.put === 'function') return kvStore(kv);
  const id = 'isolate';
  if (!memoryBuckets.has(id)) memoryBuckets.set(id, memoryStore());
  return memoryBuckets.get(id);
}

function idemKey(key) {
  return `cardcom:idem:${key}`;
}

function dealKey(dealNumber) {
  return `cardcom:deal:${dealNumber}`;
}

async function postJson(fetchImpl, url, body, timeoutMs = 30000) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  return { ok: response.ok, status: response.status, data };
}

async function cardcomPost(env, url, body, deps) {
  if (isCardcomMock(env)) return { ok: true, status: 200, data: mockCardcomBody(url, body) };
  const fetchImpl = deps.fetchImpl || fetch;
  try {
    return await postJson(fetchImpl, url, body);
  } catch (err) {
    const error = new Error('Cardcom לא ענה');
    error.code = 'CARDCOM_TIMEOUT';
    error.cause = err;
    throw error;
  }
}

function mockCardcomBody(url, body) {
  if (url === TAP_PREPARE_URL) return mockPrepareResponse();
  if (url === TAP_PROCESS_URL) return mockProcessResponse(body.SdkResponse);
  if (url === DOCUMENT_URL) {
    const deal = body?.DealNumbers?.[0]?.DealNumber || '0';
    return mockDocumentResponse(deal);
  }
  if (url === LOW_PROFILE_CREATE_URL) {
    const id = `lp-${mockDealNumber(JSON.stringify(body.Amount) + String(body.ReturnValue || ''))}`;
    return { ResponseCode: 0, Url: `https://secure.cardcom.solutions/mock/lp/${id}`, LowProfileId: id };
  }
  if (url === LOW_PROFILE_RESULT_URL) {
    return {
      ResponseCode: 0,
      TransactionInfo: {
        ResponseCode: 0,
        TranzactionId: mockDealNumber(body.LowProfileId),
        Amount: 0,
        ApprovalNumber: 'MOCKOK'
      }
    };
  }
  if (url === MANUAL_CHARGE_URL) {
    return {
      ResponseCode: 0,
      Description: 'mock',
      TranzactionId: mockDealNumber(body.ExternalUniqTranId || body.CardNumber),
      ApprovalNumber: 'MOCKOK',
      Last4CardDigitsString: String(body.CardNumber || '').slice(-4),
      Amount: body.Amount
    };
  }
  if (url === TAP_LIST_URL) return { ResponseCode: 0, Transactions: [] };
  return { ResponseCode: 0 };
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

export async function signDashboardSession(env, user, exp = Date.now() + 7 * 24 * 60 * 60 * 1000) {
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

export async function verifyDashboardSession(env, token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
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

export async function sessionFromRequest(env, request) {
  const header = request.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  return verifyDashboardSession(env, token);
}

function guestToken(id) {
  return /^tok_[A-Za-z0-9_-]+$/.test(String(id || ''));
}

export async function loadBooking(env, id) {
  const key = String(id || '').trim();
  if (!key) return null;
  if (env?.CARDCOM_BOOKINGS && env.CARDCOM_BOOKINGS[key]) {
    return { booking: env.CARDCOM_BOOKINGS[key], source: 'injected', token: key };
  }
  if (guestToken(key)) {
    try {
      const { readBooking } = await import('../api/checkout/[[path]].js');
      const booking = await readBooking(env, key);
      if (booking) return { booking, source: 'guest', token: key };
    } catch (err) {
      console.warn('[cardcom booking]', err?.message || err);
    }
  }
  const safe = key.replace(/[^A-Za-z0-9_-]/g, '');
  if (safe) {
    const response = await fetchPostgrest(
      `/hotelos_bookings?or=(id.eq.${encodeURIComponent(safe)},checkout_token.eq.${encodeURIComponent(safe)})&deleted_at=is.null&limit=1`,
      { method: 'GET' },
      env
    );
    if (response?.ok) {
      const rows = await response.json().catch(() => []);
      const booking = Array.isArray(rows) ? rows[0] : null;
      if (booking) {
        return {
          booking,
          source: 'postgrest',
          token: booking.checkout_token || safe,
          id: booking.id || safe
        };
      }
    }
  }
  return null;
}

async function saveBooking(env, loaded, booking) {
  if (!loaded) return false;
  if (loaded.source === 'injected') {
    env.CARDCOM_BOOKINGS[loaded.token] = booking;
    return true;
  }
  if (loaded.source === 'guest') {
    const { persistGuestRow } = await import('../api/checkout/[[path]].js');
    return Boolean(await persistGuestRow(env, loaded.token, booking));
  }
  if (loaded.source === 'postgrest' && loaded.id) {
    const response = await fetchPostgrest(
      `/hotelos_bookings?id=eq.${encodeURIComponent(loaded.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          clearing_payments: booking.clearing_payments || [],
          payment_status: booking.payment_status,
          payment_mode: booking.payment_mode
        })
      },
      env
    );
    return Boolean(response?.ok);
  }
  return false;
}

function fail(code, message, extra = {}) {
  const err = new Error(message || code);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

export async function quoteCharge(env, body, deps = {}) {
  const store = deps.store || createCardcomStore(env);
  const key = assertIdempotencyKey(body.idempotencyKey || crypto.randomUUID());
  const existing = await store.get(idemKey(key));
  if (existing?.status === 'done' && existing.public) {
    return { ...existing.public, idempotent: true, idempotencyKey: key };
  }
  if (existing && existing.status !== 'quoted') {
    return {
      ok: true,
      idempotencyKey: key,
      idempotent: true,
      amount: existing.amount,
      payments: existing.payments,
      channel: existing.channel || body.channel || 'tap',
      split: existing.split,
      booking: existing.booking || null,
      url: existing.url,
      lowProfileId: existing.lowProfileId
    };
  }
  if (existing?.status === 'quoted') {
    return {
      ok: true,
      idempotencyKey: key,
      idempotent: true,
      amount: existing.amount,
      payments: existing.payments,
      channel: existing.channel,
      split: existing.split,
      booking: existing.booking || null
    };
  }
  const channel = ['tap', 'link', 'manual'].includes(body.channel) ? body.channel : 'tap';
  const bookingId = String(body.bookingId || body.booking || '').trim();
  const loaded = bookingId ? await loadBooking(env, bookingId) : null;
  let split;
  try {
    split = assertQuoteAmount({
      amount: body.amount,
      payments: body.payments,
      channel,
      booking: loaded?.booking || null,
      bookingId
    });
  } catch (err) {
    throw err;
  }
  const summary = bookingSummary(loaded?.booking);
  const record = {
    status: 'quoted',
    at: Date.now(),
    amount: split.amount,
    payments: split.numberOfPayments,
    channel,
    split,
    bookingId,
    booking: summary
  };
  await store.put(idemKey(key), record);
  return {
    ok: true,
    idempotencyKey: key,
    amount: split.amount,
    payments: split.numberOfPayments,
    channel,
    split: {
      numberOfPayments: split.numberOfPayments,
      firstPaymentSum: split.firstPaymentSum,
      otherPaymentsSum: split.otherPaymentsSum,
      creditType: split.creditType
    },
    booking: summary
  };
}

export async function prepareDevice(env, body, deps = {}) {
  const creds = cardcomCreds(env);
  const payload = buildPrepareDeviceBody(creds, body || {});
  const posted = await cardcomPost(env, TAP_PREPARE_URL, payload, deps);
  const prepared = parsePrepareDevice(posted.data);
  return { ok: true, ...prepared };
}

async function commitPayment(env, store, { key, loaded, booking, dealNumber, amount, payments, channel, approval, last4, review, document }) {
  const existingDeal = await store.get(dealKey(dealNumber));
  let nextBooking = booking;
  let recorded = false;
  if (loaded && nextBooking && !existingDeal) {
    const applied = applyCardcomPayment(nextBooking, {
      dealNumber,
      idempotencyKey: key,
      amount,
      payments,
      channel,
      approval,
      last4,
      review: review || '',
      documentNumber: document?.documentNumber || '',
      documentUrl: document?.documentUrl || ''
    });
    nextBooking = applied.row;
    recorded = await saveBooking(env, loaded, nextBooking);
    if (loaded.source === 'injected') recorded = true;
  } else if (existingDeal) {
    recorded = Boolean(existingDeal.recorded);
  }
  const result = publicPaymentResult({
    dealNumber,
    amount,
    payments,
    approval,
    last4,
    channel,
    bookingId: loaded?.token || booking?.checkout_token || booking?.id || '',
    recorded,
    review: review || '',
    documentNumber: document?.documentNumber || existingDeal?.documentNumber || '',
    documentUrl: document?.documentUrl || existingDeal?.documentUrl || '',
    message: review ? 'החיוב נקלט וסומן לבדיקה' : 'החיוב נקלט'
  });
  await store.put(dealKey(dealNumber), { ...result, recorded });
  await store.put(idemKey(key), { status: 'done', public: result, dealNumber });

  const hasDocument = Boolean(document?.documentNumber || existingDeal?.documentNumber);
  const guestEmail = String(booking?.guest_email || '').trim().toLowerCase();
  const needsMailboxCheck = !hasDocument && invoiceMailboxConfigured(env) && (
    !guestEmail || guestEmail === FALLBACK_INVOICE_EMAIL.toLowerCase()
  );

  if (needsMailboxCheck && recorded) {
    const payment = {
      txn: dealNumber,
      deal_number: dealNumber,
      amount_agorot: Math.round(amount * 100),
      gateway: 'cardcom'
    };
    triggerMailboxIngestViaServer(env, {
      payment,
      guestEmail,
      bookingId: booking?.id || loaded?.id || ''
    }).catch(() => {});
  }

  return result;
}

export async function processTap(env, body, deps = {}) {
  const store = deps.store || createCardcomStore(env);
  const key = assertIdempotencyKey(body.idempotencyKey);
  const existing = await store.get(idemKey(key));
  if (existing?.status === 'done' && existing.public) {
    return { ...existing.public, idempotent: true };
  }

  const sdkRequest = parseSdkPayload(body.sdkRequest);
  const sdkResponse = parseSdkPayload(body.sdkResponse);
  const amount = sdkAmount(sdkRequest) || roundMoney(body.amount);
  const payments = Number(sdkRequest?.CustomObject?.NumberOfPayments || body.payments || existing?.payments || 1);
  const bookingId = String(body.bookingId || existing?.bookingId || '').trim();
  const tapped = sdkSucceeded(sdkResponse);

  if (!tapped) {
    const declined = {
      ok: false,
      code: 'SDK_DECLINED',
      message: 'הכרטיס לא אושר',
      responseCode: String(sdkResponse?.response_code || sdkResponse?.event || ''),
      idempotent: false
    };
    await store.put(idemKey(key), { status: 'done', public: declined });
    return declined;
  }

  if (existing?.status === 'processing' && Date.now() - Number(existing.startedAt || 0) < 20000) {
    return {
      ok: false,
      code: 'IN_PROGRESS',
      message: 'החיוב כבר בטיפול. המתינו רגע ואל תצמידו את הכרטיס שוב.',
      retry: true
    };
  }

  if (existing?.status === 'unknown' && existing.dealNumber) {
    return commitPayment(env, store, {
      key,
      loaded: null,
      booking: null,
      dealNumber: existing.dealNumber,
      amount: existing.amount,
      payments: existing.payments,
      channel: 'tap',
      approval: existing.approval,
      last4: existing.last4,
      review: existing.review
    });
  }

  let review = '';
  let loaded = null;
  if (bookingId) {
    loaded = await loadBooking(env, bookingId);
    if (!loaded) review = 'BOOKING_NOT_FOUND';
    else {
      const due = bookingSummary(loaded.booking)?.due ?? 0;
      const total = Number(loaded.booking.total_price_agorot) || 0;
      if (!(total > 0)) review = review || 'BOOKING_AMOUNT_UNKNOWN';
      else if (amount > due + 0.009) review = review || 'OVER_BALANCE';
    }
  }
  if (existing?.status === 'quoted' && Math.abs(roundMoney(existing.amount) - amount) > 0.009) {
    review = review || 'AMOUNT_CHANGED';
  }

  if (existing?.status === 'unknown') {
    const found = await lookupDeal(env, existing, deps);
    if (found) {
      return commitPayment(env, store, {
        key,
        loaded,
        booking: loaded?.booking || null,
        dealNumber: found,
        amount,
        payments,
        channel: 'tap',
        approval: approvalFromSdk(sdkResponse),
        last4: last4FromSdk(sdkResponse),
        review
      });
    }
    if ((existing.attempts || 0) >= 2) {
      return {
        ok: false,
        code: 'UNCONFIRMED',
        message: 'אין אישור סופי מקארדקום. אל תצמידו את הכרטיס שוב לפני בדיקה.',
        retry: false
      };
    }
  }

  const attempts = (existing?.attempts || 0) + 1;
  const inflight = {
    status: 'processing',
    startedAt: Date.now(),
    attempts,
    at: existing?.at || new Date().toISOString(),
    amount,
    payments,
    bookingId,
    channel: 'tap',
    approval: approvalFromSdk(sdkResponse),
    review,
    deviceUuid: String(body.deviceUuid || ''),
    ravMutavTerminalNumber: body.ravMutavTerminalNumber,
    sdkRequest: redactSecrets(sdkRequest),
    sdkResponse: redactSecrets(sdkResponse)
  };
  await store.put(idemKey(key), inflight);

  const creds = cardcomCreds(env);
  let posted;
  try {
    posted = await cardcomPost(env, TAP_PROCESS_URL, buildProcessBody(creds, {
      deviceUuid: body.deviceUuid,
      ravMutavTerminalNumber: body.ravMutavTerminalNumber,
      sdkRequest: body.sdkRequest,
      sdkResponse: body.sdkResponse
    }), deps);
  } catch (err) {
    if (err.code === 'CARDCOM_TIMEOUT') {
      await store.put(idemKey(key), { ...inflight, status: 'unknown' });
      return {
        ok: false,
        code: 'UNCONFIRMED',
        message: 'קארדקום לא ענה. אל תחייבו שוב. נסו שוב את אותו חיוב בעוד רגע.',
        retry: true
      };
    }
    throw err;
  }

  let parsed;
  try {
    parsed = parseProcessResponse(posted.data);
  } catch (err) {
    const rejected = {
      ok: false,
      code: err.code || 'PROCESS_FAILED',
      message: err.message,
      responseCode: err.responseCode ?? posted.data?.ResponseCode
    };
    await store.put(idemKey(key), { status: 'done', public: rejected });
    return rejected;
  }

  return commitPayment(env, store, {
    key,
    loaded,
    booking: loaded?.booking || null,
    dealNumber: parsed.dealNumber,
    amount,
    payments,
    channel: 'tap',
    approval: approvalFromSdk(sdkResponse),
    last4: last4FromSdk(sdkResponse),
    review
  });
}

async function lookupDeal(env, pending, deps) {
  if (!pending?.approval && !pending?.amount) return '';
  const creds = cardcomCreds(env);
  const from = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 19);
  const to = new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 19);
  let posted;
  try {
    posted = await cardcomPost(env, TAP_LIST_URL, {
      ApiName: creds.apiName,
      ApiPassword: creds.apiPassword,
      TerminalNumber: creds.terminalNumber,
      FromDate: from,
      ToDate: to
    }, deps);
  } catch {
    return '';
  }
  const rows = posted.data?.Transactions || posted.data?.transactions || [];
  const hit = rows.find((row) => {
    const approval = String(row.ApprovalNumber || '').trim();
    const amount = roundMoney(row.Amount);
    if (pending.approval && approval && approval === pending.approval) return true;
    return pending.amount && Math.abs(amount - roundMoney(pending.amount)) < 0.009 && approval;
  });
  return hit ? String(hit.DealNumber || '').trim() : '';
}

export async function createInvoice(env, body, deps = {}) {
  const store = deps.store || createCardcomStore(env);
  const dealNumber = String(body.dealNumber || '').trim();
  if (!dealNumber) throw fail('MISSING_DEAL', 'חסר מספר עסקה');
  const cached = await store.get(dealKey(dealNumber));
  if (cached?.documentNumber) {
    return {
      ok: true,
      idempotent: true,
      dealNumber,
      documentNumber: cached.documentNumber,
      documentUrl: cached.documentUrl || ''
    };
  }
  const key = body.idempotencyKey ? assertIdempotencyKey(body.idempotencyKey) : '';
  const pending = key ? await store.get(idemKey(key)) : null;
  const bookingId = String(body.bookingId || pending?.public?.bookingId || pending?.bookingId || '').trim();
  const loaded = bookingId ? await loadBooking(env, bookingId) : null;
  const booking = loaded?.booking;
  const amount = roundMoney(body.amount || pending?.public?.amount || pending?.amount || 0);
  const creds = cardcomCreds(env);
  const posted = await cardcomPost(env, DOCUMENT_URL, buildCreateDocumentBody(creds, {
    dealNumber,
    amount,
    name: booking?.guest_name || body.name,
    email: booking?.guest_email || '',
    phone: booking?.guest_phone || '',
    description: body.description || (booking?.unit_id ? `שהייה ${booking.unit_id}` : 'שהייה במיאליס'),
    sendSms: body.sendSms === true
  }), deps);
  const document = parseDocumentResponse(posted.data);
  if (loaded && booking) {
    const next = attachDocument(booking, dealNumber, document);
    await saveBooking(env, loaded, next);
  }
  const publicResult = {
    ...(cached || pending?.public || {}),
    ok: true,
    dealNumber,
    documentNumber: document.documentNumber,
    documentUrl: document.documentUrl
  };
  await store.put(dealKey(dealNumber), publicResult);
  if (pending?.status === 'done') {
    await store.put(idemKey(key), {
      status: 'done',
      public: { ...pending.public, documentNumber: document.documentNumber, documentUrl: document.documentUrl },
      dealNumber
    });
  }
  return {
    ok: true,
    dealNumber,
    documentNumber: document.documentNumber,
    documentUrl: document.documentUrl
  };
}

export async function createPaymentLink(env, body, deps = {}) {
  const quoted = await quoteCharge(env, { ...body, channel: 'link' }, deps);
  if (quoted.idempotent && quoted.url) return quoted;
  const store = deps.store || createCardcomStore(env);
  const key = quoted.idempotencyKey;
  const saved = await store.get(idemKey(key));
  if (saved?.url && saved?.lowProfileId) {
    return { ok: true, idempotent: true, idempotencyKey: key, url: saved.url, lowProfileId: saved.lowProfileId, amount: saved.amount };
  }
  const creds = cardcomCreds(env);
  const order = String(body.bookingId || body.booking || key).slice(0, 250);
  const payload = buildHypLowProfileBody({
    masof: String(creds.terminalNumber),
    apiName: creds.apiName,
    apiPassword: creds.apiPassword
  }, {
    amount: quoted.amount,
    tash: quoted.payments,
    order,
    clientName: quoted.booking?.guestName || body.name || 'אורח',
    productName: 'ResortOS',
    tokenize: false,
    invoice: false
  });
  const posted = await cardcomPost(env, LOW_PROFILE_CREATE_URL, payload, deps);
  const code = Number(posted.data?.ResponseCode);
  const url = posted.data?.Url || posted.data?.url || '';
  const lowProfileId = String(posted.data?.LowProfileId || posted.data?.LowProfileCode || '');
  if (!url || (Number.isFinite(code) && code !== 0)) {
    throw fail('LINK_FAILED', posted.data?.Description || 'יצירת קישור התשלום נכשלה');
  }
  await store.put(idemKey(key), {
    ...(saved || {}),
    status: 'link',
    url,
    lowProfileId,
    amount: quoted.amount,
    payments: quoted.payments,
    bookingId: String(body.bookingId || body.booking || ''),
    channel: 'link'
  });
  return { ok: true, idempotencyKey: key, url, lowProfileId, amount: quoted.amount, payments: quoted.payments };
}

export async function paymentLinkStatus(env, body, deps = {}) {
  const store = deps.store || createCardcomStore(env);
  const key = assertIdempotencyKey(body.idempotencyKey);
  const saved = await store.get(idemKey(key));
  if (saved?.status === 'done' && saved.public) return { ...saved.public, idempotent: true };
  const lowProfileId = String(body.lowProfileId || saved?.lowProfileId || '').trim();
  if (!lowProfileId) throw fail('MISSING_LINK', 'אין קישור לבדיקה');
  const creds = cardcomCreds(env);
  const posted = await cardcomPost(env, LOW_PROFILE_RESULT_URL, {
    TerminalNumber: creds.terminalNumber,
    ApiName: creds.apiName,
    ApiPassword: creds.apiPassword,
    LowProfileId: lowProfileId
  }, deps);
  if (!isHypLowProfilePaid(posted.data)) {
    return { ok: true, paid: false, lowProfileId };
  }
  const params = lpResultToHypParams(posted.data, saved?.bookingId || '');
  const loaded = saved?.bookingId ? await loadBooking(env, saved.bookingId) : null;
  const dealNumber = String(params.Id || '').trim() || mockDealNumber(lowProfileId);
  return commitPayment(env, store, {
    key,
    loaded,
    booking: loaded?.booking || null,
    dealNumber,
    amount: roundMoney(params.Amount || saved?.amount),
    payments: saved?.payments || 1,
    channel: 'link',
    approval: params.ACode || '',
    last4: params.L4digit || '',
    review: ''
  });
}

export async function manualCharge(env, body, deps = {}) {
  const quoted = await quoteCharge(env, { ...body, channel: 'manual' }, deps);
  const store = deps.store || createCardcomStore(env);
  const key = quoted.idempotencyKey;
  const saved = await store.get(idemKey(key));
  if (saved?.status === 'done' && saved.public) return { ...saved.public, idempotent: true };
  if (saved?.status === 'processing' && Date.now() - Number(saved.startedAt || 0) < 45000) {
    return {
      ok: false,
      code: 'IN_PROGRESS',
      message: 'החיוב כבר בטיפול. אל תקלידו את הכרטיס שוב.',
      retry: true
    };
  }
  if (saved?.status === 'unknown' && (saved.attempts || 0) >= 2 && !saved.dealNumber) {
    return {
      ok: false,
      code: 'UNCONFIRMED',
      message: 'אין אישור סופי מקארדקום. אל תקלידו את הכרטיס שוב לפני בדיקה.',
      retry: false
    };
  }

  const pan = String(body.cardNumber || '').replace(/\D/g, '');
  const exp = String(body.expiry || '').replace(/\D/g, '');
  const cvv = String(body.cvv || '').replace(/\D/g, '');
  if (pan.length < 13 || pan.length > 19 || exp.length < 4 || cvv.length < 3) {
    throw fail('BAD_CARD', 'פרטי הכרטיס חסרים');
  }
  const expMonth = exp.slice(0, 2);
  const expYear = exp.slice(-2);
  if (saved?.status === 'unknown' && (saved.attempts || 0) >= 1 && saved.dealNumber) {
    return commitPayment(env, store, {
      key,
      loaded: saved.bookingId ? await loadBooking(env, saved.bookingId) : null,
      booking: null,
      dealNumber: saved.dealNumber,
      amount: quoted.amount,
      payments: quoted.payments,
      channel: 'manual',
      approval: '',
      last4: pan.slice(-4)
    });
  }
  const inflight = {
    status: 'processing',
    startedAt: Date.now(),
    attempts: (saved?.attempts || 0) + 1,
    amount: quoted.amount,
    payments: quoted.payments,
    bookingId: String(body.bookingId || body.booking || ''),
    channel: 'manual'
  };
  await store.put(idemKey(key), inflight);
  const creds = cardcomCreds(env);
  const split = splitInstallments(quoted.amount, quoted.payments);
  let posted;
  try {
    posted = await cardcomPost(env, MANUAL_CHARGE_URL, {
      TerminalNumber: creds.terminalNumber,
      ApiName: creds.apiName,
      ApiPassword: creds.apiPassword,
      Amount: roundMoney(quoted.amount),
      CardNumber: pan,
      CardExpirationMMYY: `${expMonth}${expYear}`,
      CVV2: cvv,
      NumOfPayments: split.numberOfPayments,
      FirstPayment: split.numberOfPayments === 1 ? undefined : split.firstPaymentSum,
      ConstPayment: split.numberOfPayments === 1 ? undefined : split.otherPaymentsSum,
      ISOCoinId: 1,
      ExternalUniqTranId: key,
      ExternalUniqTranIdResponse: true,
      CardOwnerInformation: {
        FullName: String(body.name || quoted.booking?.guestName || 'אורח'),
        IdentityNumber: String(body.holderId || '').replace(/\D/g, '') || undefined
      }
    }, deps);
  } catch (err) {
    if (err.code === 'CARDCOM_TIMEOUT') {
      await store.put(idemKey(key), { ...inflight, status: 'unknown' });
      return {
        ok: false,
        code: 'UNCONFIRMED',
        message: 'קארדקום לא ענה. אל תקלידו את הכרטיס שוב. נסו שוב עם אותו חיוב.',
        retry: true
      };
    }
    throw err;
  }
  const code = Number(posted.data?.ResponseCode);
  const dealNumber = String(posted.data?.TranzactionId || posted.data?.DealNumber || '').trim();
  if (code !== 0 || !dealNumber) {
    const rejected = {
      ok: false,
      code: 'MANUAL_DECLINED',
      message: posted.data?.Description || 'הכרטיס לא אושר'
    };
    await store.put(idemKey(key), { status: 'done', public: rejected });
    return rejected;
  }
  const bookingId = String(body.bookingId || body.booking || '');
  const loaded = bookingId ? await loadBooking(env, bookingId) : null;
  return commitPayment(env, store, {
    key,
    loaded,
    booking: loaded?.booking || null,
    dealNumber,
    amount: quoted.amount,
    payments: quoted.payments,
    channel: 'manual',
    approval: String(posted.data?.ApprovalNumber || ''),
    last4: String(posted.data?.Last4CardDigitsString || pan.slice(-4)).replace(/\D/g, '').slice(-4)
  });
}

export function clientError(err) {
  return {
    ok: false,
    error: err.code || 'CARDCOM_ERROR',
    message: err.message || 'שגיאה'
  };
}

export { formatAmount, redactSecrets };
