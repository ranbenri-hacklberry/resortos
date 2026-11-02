/**
 * Pure Cardcom Tap helpers shared by the Pages function and the mobile app.
 * No secrets and no I/O. Amounts in the link are checked again on the server.
 */

const LINK_KEYS = new Set(['booking', 'amount', 'payments']);

export function parseAmountIls(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = Math.round(Number(text) * 100) / 100;
  if (!(amount > 0) || amount > 100000) return null;
  return amount;
}

export function normalizePayments(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  return n;
}

/**
 * CreditType from the Tap spec: 1 one payment, 6 credit, 8 regular installments.
 * Staff "number of payments" maps to 8. Remainder agorot sits on the first payment.
 */
export function buildPaymentFields(amountIls, payments) {
  const count = normalizePayments(payments) || 1;
  const agorot = Math.round(Number(amountIls) * 100);
  if (count === 1) {
    return { NumberOfPayments: 1, FirstPaymentSum: 0, OtherPaymentsSum: 0, CreditType: 1 };
  }
  const other = Math.floor(agorot / count);
  const first = agorot - other * (count - 1);
  return {
    NumberOfPayments: count,
    FirstPaymentSum: first / 100,
    OtherPaymentsSum: other / 100,
    CreditType: 8
  };
}

export function buildSdkRequest({
  type = 'SALE',
  amount,
  payments,
  sapakMutavNumber,
  customerName = '',
  customerEmail = '',
  phone = '',
  holderId = ''
} = {}) {
  const fields = buildPaymentFields(amount, payments);
  return {
    type: type === 'REFUND' ? 'REFUND' : 'SALE',
    amount: Number(amount).toFixed(2),
    lang: 'iw',
    CustomObject: {
      CustomerName: String(customerName || ''),
      CustomerEmail: String(customerEmail || ''),
      PhoneNumber: String(phone || ''),
      HolderID: String(holderId || ''),
      NumberOfPayments: fields.NumberOfPayments,
      FirstPaymentSum: fields.FirstPaymentSum,
      OtherPaymentsSum: fields.OtherPaymentsSum,
      CreditType: fields.CreditType,
      SapakMutavNumber: String(sapakMutavNumber || ''),
      TransactionUniqueIdForQuery: '',
      AllowFullCardNumberInResponse: true
    }
  };
}

export function asObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readSdkResponseCode(sdkResponse) {
  const value = asObject(sdkResponse);
  const nested = asObject(value.raw);
  const code = value.response_code ?? value.responseCode ?? nested.response_code ?? nested.responseCode;
  return code == null ? '' : String(code);
}

const SECRET_KEY = /cardnumber|card_number|fullcard|pan|cvv|track|de48|apipassword|password|session_?key/i;

export function redact(value) {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = redact(item);
    }
    return out;
  }
  if (typeof value === 'string') {
    return value.replace(/\b\d{13,19}\b/g, '****');
  }
  return value;
}

export function parseChargeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw.includes('://') ? raw : `https://resortos.app/${raw.replace(/^\//, '')}`);
  } catch {
    return null;
  }
  const scheme = url.protocol.replace(':', '');
  const hostOk = scheme === 'resortos' || url.hostname === 'resortos.app' || url.hostname === 'www.resortos.app';
  if (!hostOk) return null;
  const path = url.pathname.replace(/\/$/, '');
  const isCharge = path === '/charge' || (scheme === 'resortos' && (url.hostname === 'charge' || path === '/charge'));
  if (!isCharge) return null;
  for (const key of url.searchParams.keys()) {
    if (!LINK_KEYS.has(key)) {
      const err = new Error('LINK_PARAM');
      err.code = 'LINK_PARAM';
      throw err;
    }
  }
  const booking = url.searchParams.get('booking') || '';
  const amountText = url.searchParams.get('amount');
  const payments = normalizePayments(url.searchParams.get('payments') || '1') || 1;
  return {
    booking,
    amount: amountText == null || amountText === '' ? null : parseAmountIls(amountText),
    payments
  };
}

export function paidAgorot(booking) {
  const clearing = Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [];
  return clearing.reduce((sum, item) => sum + (Number(item.amount_agorot) || 0), 0);
}

export function chargeableAgorot(booking) {
  const total = Number(booking?.total_price_agorot) || 0;
  const deposit = Number(booking?.deposit_agorot) || 0;
  const base = total > 0 ? total : deposit;
  return Math.max(0, base - paidAgorot(booking));
}

export function assertChargeAmount(booking, amountIls, channel) {
  const amount = parseAmountIls(amountIls);
  if (amount == null) return { ok: false, code: 'AMOUNT', message: 'הסכום לא תקין' };
  const agorot = Math.round(amount * 100);
  if (channel === 'tap' && agorot > 30000) {
    return { ok: false, code: 'TAP_LIMIT', message: 'בנגיעה אפשר לחייב עד 300 ש״ח' };
  }
  if (!booking) return { ok: true, amount, agorot, unlinked: true };
  const total = Number(booking.total_price_agorot) || 0;
  const deposit = Number(booking.deposit_agorot) || 0;
  if (total <= 0 && deposit <= 0) {
    return { ok: false, code: 'UNPRICED', message: 'להזמנה אין סכום שמור, אי אפשר לאמת את החיוב' };
  }
  const cap = chargeableAgorot(booking);
  if (cap <= 0) return { ok: false, code: 'ALREADY_PAID', message: 'ההזמנה כבר שולמה' };
  if (agorot > cap + 100) {
    return {
      ok: false,
      code: 'AMOUNT_MISMATCH',
      message: `הסכום גבוה מהיתרה (${(cap / 100).toFixed(2)} ש״ח)`,
      due_ils: cap / 100
    };
  }
  return { ok: true, amount, agorot, due_ils: cap / 100 };
}

export function paymentStatus(booking, payments) {
  const total = Number(booking?.total_price_agorot) || Number(booking?.deposit_agorot) || 0;
  const paid = (payments || []).reduce((sum, item) => sum + (Number(item.amount_agorot) || 0), 0);
  if (total > 0 && paid + 50 >= total) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return booking?.payment_status || 'UNPAID';
}

export function appendCardcomPayment(booking, { dealNumber, amountIls, payments, channel, at } = {}) {
  const ref = String(dealNumber || '');
  const list = Array.isArray(booking?.clearing_payments) ? booking.clearing_payments.slice() : [];
  if (ref && list.some((item) => String(item?.ref || '') === ref && String(item?.source || '').startsWith('CARDCOM'))) {
    return { booking, duplicate: true };
  }
  const source = channel === 'link' ? 'CARDCOM_LINK' : channel === 'manual' ? 'CARDCOM_MANUAL' : 'CARDCOM_TAP';
  const stamp = at || new Date().toISOString();
  list.push({
    source,
    amount_agorot: Math.round(Number(amountIls) * 100),
    date: stamp.slice(0, 10),
    at: stamp,
    ref,
    note: `Cardcom ${source} · ${payments || 1} תשלומים · עסקה ${ref}`
  });
  return {
    duplicate: false,
    booking: {
      ...booking,
      clearing_payments: list,
      payment_mode: 'CARD',
      payment_status: paymentStatus(booking, list),
      stay: {
        ...(booking?.stay && typeof booking.stay === 'object' ? booking.stay : {}),
        cardcom: { dealNumber: ref, channel: channel || 'tap', at: stamp }
      },
      updated_at: stamp
    }
  };
}

export async function mockDealNumber(idempotencyKey) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(idempotencyKey || '')));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return String((parseInt(hex.slice(0, 8), 16) % 900000000) + 100000000);
}

export function idempotencyKeyOk(value) {
  return /^[A-Za-z0-9_-]{8,80}$/.test(String(value || ''));
}

export function deviceUuidOk(value) {
  return /^[A-Za-z0-9_-]{8,80}$/.test(String(value || ''));
}

export function bookingIdOk(value) {
  if (value == null || value === '') return true;
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(value));
}

/**
 * Staff charge sequence: reserve and check the booking, then Tap, then one process call.
 * A timeout returns doNotChargeAgain so the phone is not tapped a second time.
 */
export async function runTapCharge(ctx) {
  const key = ctx.idempotencyKey;
  const reserve = await ctx.call('POST', '/api/payments/cardcom/reserve', {
    idempotencyKey: key,
    bookingId: ctx.bookingId || '',
    amount: ctx.amount,
    payments: ctx.payments,
    channel: 'tap',
    deviceUuid: ctx.device.uuid
  });
  if (!reserve.ok && reserve.status !== 'unknown' && reserve.status !== 'submitted') {
    if (reserve.status === 'declined') {
      return { ok: false, stage: 'declined', message: reserve.message || 'הניסיון הקודם לא אושר' };
    }
    return { ok: false, stage: 'reserve', ...reserve };
  }
  if (reserve.alreadyDone || reserve.status === 'done') {
    return { ok: true, stage: 'done', replay: true, dealNumber: reserve.dealNumber, processed: reserve };
  }
  if (reserve.status === 'declined') {
    return { ok: false, stage: 'declined', message: reserve.message || 'הניסיון הקודם לא אושר' };
  }
  if (reserve.status === 'unknown' || reserve.status === 'submitted' || reserve.doNotChargeAgain) {
    const recovered = await ctx.call('POST', '/api/payments/cardcom/process', { idempotencyKey: key });
    if (!recovered.ok) return { ok: false, stage: 'process', doNotChargeAgain: true, ...recovered };
    return finishInvoice(ctx, recovered, reserve.guest_name || '');
  }

  let session = await ctx.tap.getSession();
  if (!session?.sessionKey || !session?.sapakMutavNumber) {
    const prep = await ctx.call('POST', '/api/payments/cardcom/prepare', {
      deviceUuid: ctx.device.uuid,
      manufacturer: ctx.device.manufacturer,
      model: ctx.device.model
    });
    if (!prep.ok) return { ok: false, stage: 'prepare', ...prep };
    const reg = await ctx.tap.registerDevice({ tpn: prep.TPN, merchantCode: prep.MerchantCode });
    if (!reg?.sessionKey) {
      return { ok: false, stage: 'register', message: reg?.message || 'הרשמת המכשיר נכשלה', ...reg };
    }
    session = {
      sessionKey: reg.sessionKey,
      sapakMutavNumber: prep.SapakMutavNumber,
      ravMutavTerminalNumber: prep.RavMutavTerminalNumber
    };
    await ctx.tap.setSession(session);
  }

  const sdkRequest = buildSdkRequest({
    type: ctx.type || 'SALE',
    amount: ctx.amount,
    payments: ctx.payments,
    sapakMutavNumber: session.sapakMutavNumber,
    customerName: ctx.customerName || reserve.guest_name || ''
  });
  const sdk = await ctx.tap.performTransaction({ sdkRequest, sessionKey: session.sessionKey });
  if (sdk?.registerNeeded) {
    await ctx.tap.setSession(null);
    return { ok: false, stage: 'register_needed', message: 'צריך לרשום את המכשיר מחדש' };
  }
  const responseCode = readSdkResponseCode(sdk?.raw || sdk);
  if (responseCode !== '00') {
    await ctx.call('POST', '/api/payments/cardcom/process', {
      idempotencyKey: key,
      deviceUuid: ctx.device.uuid,
      bookingId: ctx.bookingId || '',
      amount: ctx.amount,
      payments: ctx.payments,
      channel: 'tap',
      ravMutavTerminalNumber: session.ravMutavTerminalNumber,
      sdkRequest,
      sdkResponse: sdk?.raw || sdk
    });
    return { ok: false, stage: 'tap', message: sdk?.message || 'הנגיעה לא אושרה', response_code: responseCode };
  }

  const processed = await ctx.call('POST', '/api/payments/cardcom/process', {
    idempotencyKey: key,
    deviceUuid: ctx.device.uuid,
    bookingId: ctx.bookingId || '',
    amount: ctx.amount,
    payments: ctx.payments,
    channel: 'tap',
    ravMutavTerminalNumber: session.ravMutavTerminalNumber,
    sdkRequest,
    sdkResponse: sdk.raw || sdk
  });
  if (!processed.ok) return { ok: false, stage: 'process', doNotChargeAgain: true, ...processed };
  return finishInvoice(ctx, processed, ctx.customerName || reserve.guest_name || processed.guest_name || '');
}

async function finishInvoice(ctx, processed, name) {
  const invoice = await ctx.call('POST', '/api/payments/cardcom/invoice', {
    idempotencyKey: ctx.idempotencyKey,
    dealNumber: processed.dealNumber,
    name
  });
  return {
    ok: true,
    stage: 'done',
    dealNumber: processed.dealNumber,
    invoice,
    processed
  };
}
