import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import {
  applyCardcomPayment,
  assertQuoteAmount,
  attachDocument,
  bookingSummary,
  mockDocumentResponse,
  mockPrepareResponse,
  mockProcessResponse,
  parseDocumentResponse,
  parsePrepareDevice,
  parseProcessResponse,
  parseSdkPayload,
  publicPaymentResult,
  sdkSucceeded
} from '../../../functions/lib/cardcomTapCore.js';

const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};

export const paymentsMode = extra.paymentsMode || 'mock';
export const apiBase = String(extra.apiBase || 'https://resortos.app').replace(/\/$/, '');
export const dashboardUrl = extra.dashboardUrl || 'https://resortos.app/dashboard';

let token = '';
const idempotency = new Map();
const deals = new Map();
const bookings = {
  tok_demo: {
    id: 'tok_demo',
    checkout_token: 'tok_demo',
    guest_name: 'אורח לדוגמה',
    unit_id: 'ק7',
    total_price_agorot: 20000,
    payment_status: 'UNPAID',
    clearing_payments: []
  }
};

export function setSessionToken(value) {
  token = String(value || '');
}

export function getSessionToken() {
  return token;
}

export function createIdempotencyKey() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function demoBooking(id) {
  if (!id) return null;
  return bookings[id] || null;
}

async function livePost(path, body) {
  let response;
  try {
    response = await fetch(`${apiBase}/api/payments/cardcom/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body || {})
    });
  } catch {
    return { ok: false, code: 'OFFLINE', message: 'אין רשת. נסו שוב בעוד רגע.' };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok && data.ok !== true) {
    return {
      ok: false,
      code: data.error || data.code || 'HTTP',
      message: data.message || 'השרת לא אישר את הפעולה'
    };
  }
  return data;
}

function mockQuote(body) {
  const key = body.idempotencyKey;
  const existing = idempotency.get(key);
  if (existing?.public) return { ...existing.public, idempotent: true, idempotencyKey: key };
  const bookingId = String(body.bookingId || '');
  const booking = demoBooking(bookingId);
  if (bookingId && !booking && paymentsMode === 'mock') {
    return {
      ok: false,
      code: 'BOOKING_NOT_FOUND',
      message: 'במצב הדגמה אפשר בלי הזמנה, או עם ההזמנה tok_demo'
    };
  }
  try {
    const split = assertQuoteAmount({
      amount: body.amount,
      payments: body.payments,
      channel: body.channel || 'tap',
      booking,
      bookingId
    });
    const record = {
      status: 'quoted',
      amount: split.amount,
      payments: split.numberOfPayments,
      split,
      bookingId,
      channel: body.channel || 'tap'
    };
    idempotency.set(key, record);
    return {
      ok: true,
      idempotencyKey: key,
      amount: split.amount,
      payments: split.numberOfPayments,
      split,
      booking: bookingSummary(booking)
    };
  } catch (err) {
    return { ok: false, code: err.code || 'BAD_AMOUNT', message: err.message };
  }
}

function mockProcess(body) {
  const key = body.idempotencyKey;
  const existing = idempotency.get(key);
  if (existing?.public) return { ...existing.public, idempotent: true };
  const sdkResponse = parseSdkPayload(body.sdkResponse);
  if (!sdkSucceeded(sdkResponse)) {
    const declined = { ok: false, code: 'SDK_DECLINED', message: 'הכרטיס לא אושר' };
    idempotency.set(key, { ...(existing || {}), public: declined });
    return declined;
  }
  const dealNumber = String(mockProcessResponse(sdkResponse).DealNumber);
  const amount = Number(existing?.amount || 0);
  const booking = demoBooking(existing?.bookingId || body.bookingId);
  let recorded = false;
  if (booking) {
    const applied = applyCardcomPayment(booking, {
      dealNumber,
      idempotencyKey: key,
      amount,
      payments: existing?.payments || 1,
      channel: 'tap',
      approval: '00MOCK'
    });
    bookings[booking.checkout_token || booking.id] = applied.row;
    recorded = true;
  }
  const result = publicPaymentResult({
    dealNumber,
    amount,
    payments: existing?.payments || 1,
    approval: '00MOCK',
    channel: 'tap',
    bookingId: body.bookingId || '',
    recorded,
    message: 'החיוב נקלט'
  });
  deals.set(dealNumber, result);
  idempotency.set(key, { ...(existing || {}), public: result, dealNumber });
  return result;
}

function mockInvoice(body) {
  const cached = deals.get(String(body.dealNumber || ''));
  if (cached?.documentNumber) return { ok: true, idempotent: true, ...cached };
  const document = parseDocumentResponse(mockDocumentResponse(body.dealNumber));
  const booking = demoBooking(body.bookingId);
  if (booking) {
    bookings[booking.checkout_token || booking.id] = attachDocument(booking, body.dealNumber, document);
  }
  const result = {
    ok: true,
    dealNumber: String(body.dealNumber),
    documentNumber: document.documentNumber,
    documentUrl: document.documentUrl
  };
  deals.set(result.dealNumber, { ...(cached || {}), ...result });
  return result;
}

export function createPaymentsApi() {
  const mock = paymentsMode !== 'live';
  return {
    mode: mock ? 'mock' : 'live',
    createKey: async () => createIdempotencyKey(),
    quote: (body) => (mock ? Promise.resolve(mockQuote(body)) : livePost('quote', body)),
    prepare: (body) => {
      if (mock) {
        try {
          return Promise.resolve({ ok: true, ...parsePrepareDevice(mockPrepareResponse()) });
        } catch (err) {
          return Promise.resolve({ ok: false, message: err.message });
        }
      }
      return livePost('prepare', body);
    },
    process: (body) => (mock ? Promise.resolve(mockProcess(body)) : livePost('process', body)),
    invoice: (body) => (mock ? Promise.resolve(mockInvoice(body)) : livePost('invoice', body)),
    link: (body) => {
      if (!mock) return livePost('link', body);
      const quote = mockQuote({ ...body, channel: 'link' });
      if (!quote.ok) return Promise.resolve(quote);
      const url = `https://secure.cardcom.solutions/mock/lp/${quote.idempotencyKey}`;
      return Promise.resolve({ ok: true, url, lowProfileId: 'mock-link', amount: quote.amount });
    },
    manual: (body) => {
      if (!mock) return livePost('manual', body);
      const quote = mockQuote({ ...body, channel: 'manual' });
      if (!quote.ok) return Promise.resolve(quote);
      const pan = String(body.cardNumber || '').replace(/\D/g, '');
      if (pan.length < 13) return Promise.resolve({ ok: false, message: 'פרטי הכרטיס חסרים' });
      const dealNumber = String(mockProcessResponse({ transaction_id: quote.idempotencyKey }).DealNumber);
      const result = publicPaymentResult({
        dealNumber,
        amount: quote.amount,
        payments: quote.payments,
        last4: pan.slice(-4),
        channel: 'manual',
        bookingId: body.bookingId || '',
        recorded: false,
        message: 'החיוב נקלט'
      });
      idempotency.set(quote.idempotencyKey, { public: result });
      return Promise.resolve(result);
    }
  };
}

export function nativeTap() {
  return NativeModules.CardcomTap || null;
}

export function tapOnThisPhone() {
  return Platform.OS === 'android' && Boolean(NativeModules.CardcomTap);
}
