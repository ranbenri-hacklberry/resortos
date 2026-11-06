/**
 * Pure Cardcom Tap helpers shared by the Pages function and the mobile app.
 * No secrets, no network, no Node builtins.
 *
 * Amounts in this file are shekels (₪). Booking totals in ResortOS stay in agorot
 * (100 agorot = 1 ₪).
 */

export const TAP_PREPARE_URL = 'https://secure.cardcom.solutions/api/v11/TapTransactions/PrepareDevice';
export const TAP_PROCESS_URL = 'https://secure.cardcom.solutions/api/v11/TapTransactions/ProcessSDKTransaction';
export const TAP_LIST_URL = 'https://secure.cardcom.solutions/api/v11/TapTransactions/GetTransactions';
export const TAP_DEVICES_URL = 'https://secure.cardcom.solutions/api/v11/TapTransactions/GetDevices';
export const DOCUMENT_URL = 'https://secure.cardcom.solutions/api/v11/Documents/CreateDocument';
export const LOW_PROFILE_CREATE_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create';
export const LOW_PROFILE_RESULT_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult';
export const MANUAL_CHARGE_URL = 'https://secure.cardcom.solutions/api/v11/Transactions/Transaction';

export const TAP_PHYSICAL_LIMIT_ILS = 300;
export const WALK_IN_MAX_ILS = 20000;
export const MAX_PAYMENTS = 12;
export const FALLBACK_INVOICE_EMAIL = 'mialeesresort@mialees.com';

const SECRET_KEYS = new Set([
  'apipassword',
  'apiname',
  'password',
  'passp',
  'cvv',
  'cvv2',
  'cardnumber',
  'card_number',
  'pan',
  'track2',
  'session_key',
  'sessionkey'
]);

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function moneyToAgorot(value) {
  return Math.round(roundMoney(value) * 100);
}

export function formatAmount(value) {
  return roundMoney(value).toFixed(2);
}

export function assertIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    const err = new Error('מזהה החיוב חסר או לא תקין');
    err.code = 'BAD_IDEMPOTENCY_KEY';
    throw err;
  }
  return key;
}

export function cardcomConfigured(env) {
  return Boolean(
    String(env?.CARDCOM_API_NAME || '').trim()
    && String(env?.CARDCOM_API_PASSWORD || '').trim()
    && String(env?.CARDCOM_TERMINAL || '').replace(/\D/g, '')
  );
}

export function cardcomCreds(env) {
  const apiName = String(env?.CARDCOM_API_NAME || '').trim();
  const apiPassword = String(env?.CARDCOM_API_PASSWORD || '').trim();
  const terminal = String(env?.CARDCOM_TERMINAL || '').replace(/\D/g, '');
  if (!apiName || !apiPassword || !terminal) {
    const err = new Error('Cardcom עדיין לא הוגדר בשרת');
    err.code = 'CARDCOM_NOT_CONFIGURED';
    throw err;
  }
  return {
    apiName,
    apiPassword,
    terminalNumber: Number(terminal)
  };
}

export function isCardcomMock(env) {
  const flag = String(env?.CARDCOM_MOCK || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

/**
 * Installments for the Tap CustomObject.
 * One payment: CreditType 1 and both sums 0 (the total stays on `amount`).
 * Several payments: CreditType 8 (regular installments). Remainder agorot go on the first payment.
 * CreditType 6 (credit) is intentionally not used.
 */
export function splitInstallments(amountIls, payments) {
  const count = Math.round(Number(payments) || 1);
  const amount = roundMoney(amountIls);
  if (count < 1 || count > MAX_PAYMENTS) {
    const err = new Error('מספר התשלומים חייב להיות בין 1 ל-12');
    err.code = 'BAD_PAYMENTS';
    throw err;
  }
  if (!(amount > 0)) {
    const err = new Error('סכום החיוב חייב להיות גדול מאפס');
    err.code = 'BAD_AMOUNT';
    throw err;
  }
  if (count === 1) {
    return {
      numberOfPayments: 1,
      firstPaymentSum: 0,
      otherPaymentsSum: 0,
      creditType: 1,
      amount
    };
  }
  const agorot = moneyToAgorot(amount);
  const otherAgorot = Math.floor(agorot / count);
  const firstAgorot = agorot - otherAgorot * (count - 1);
  const first = roundMoney(firstAgorot / 100);
  const other = roundMoney(otherAgorot / 100);
  const check = roundMoney(first + other * (count - 1));
  if (Math.abs(check - amount) > 0.001) {
    const err = new Error('חלוקת התשלומים לא מסתכמת לסכום');
    err.code = 'SPLIT_MISMATCH';
    throw err;
  }
  return {
    numberOfPayments: count,
    firstPaymentSum: first,
    otherPaymentsSum: other,
    creditType: 8,
    amount
  };
}

export function buildSdkSaleInput({ amount, payments, sapakMutavNumber, customer = {}, type = 'SALE' }) {
  const split = splitInstallments(amount, payments);
  const kind = String(type || 'SALE').toUpperCase() === 'REFUND' ? 'REFUND' : 'SALE';
  return {
    type: kind,
    amount: formatAmount(split.amount),
    lang: 'iw',
    CustomObject: {
      CustomerName: String(customer.name || ''),
      CustomerEmail: String(customer.email || ''),
      PhoneNumber: String(customer.phone || ''),
      HolderID: String(customer.holderId || ''),
      NumberOfPayments: split.numberOfPayments,
      FirstPaymentSum: split.firstPaymentSum,
      OtherPaymentsSum: split.otherPaymentsSum,
      CreditType: split.creditType,
      SapakMutavNumber: String(sapakMutavNumber || ''),
      TransactionUniqueIdForQuery: '',
      AllowFullCardNumberInResponse: true
    }
  };
}

export function buildPrepareDeviceBody(creds, device) {
  const deviceUuid = String(device?.deviceUuid || device?.uuid || '').trim();
  const manufacturer = String(device?.manufacturer || '').trim();
  const model = String(device?.model || '').trim();
  if (!deviceUuid || !manufacturer || !model) {
    const err = new Error('חסרים פרטי המכשיר');
    err.code = 'BAD_DEVICE';
    throw err;
  }
  return {
    ApiName: creds.apiName,
    ApiPassword: creds.apiPassword,
    TerminalNumber: creds.terminalNumber,
    DeviceUUID: deviceUuid,
    DeviceManufacturer: manufacturer,
    DeviceModel: model
  };
}

export function parsePrepareDevice(data) {
  const code = Number(data?.ResponseCode);
  if (code !== 0) {
    const err = new Error(data?.Description || 'הכנת המכשיר נכשלה');
    err.code = 'PREPARE_FAILED';
    err.responseCode = data?.ResponseCode;
    throw err;
  }
  const tpn = String(data?.TPN || '').trim();
  const merchantCode = String(data?.MerchantCode || '').trim();
  const sapakMutavNumber = String(data?.SapakMutavNumber ?? '').trim();
  const ravMutavTerminalNumber = data?.RavMutavTerminalNumber;
  if (!tpn || !merchantCode || sapakMutavNumber === '' || ravMutavTerminalNumber == null || ravMutavTerminalNumber === '') {
    const err = new Error('Cardcom החזיר הכנת מכשיר חלקית');
    err.code = 'PREPARE_INCOMPLETE';
    throw err;
  }
  return {
    tpn,
    merchantCode,
    sapakMutavNumber,
    ravMutavTerminalNumber
  };
}

export function sdkSucceeded(sdkResponse) {
  return String(sdkResponse?.response_code ?? sdkResponse?.responseCode ?? '') === '00';
}

export function parseSdkPayload(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function sdkAmount(sdkRequest) {
  const parsed = parseSdkPayload(sdkRequest) || {};
  return roundMoney(parsed.amount ?? parsed.Amount);
}

export function buildProcessBody(creds, input) {
  const sdkRequest = input.sdkRequest;
  const sdkResponse = input.sdkResponse;
  return {
    ApiName: creds.apiName,
    ApiPassword: creds.apiPassword,
    TerminalNumber: creds.terminalNumber,
    RavMutavTerminalNumber: input.ravMutavTerminalNumber,
    DeviceUUID: String(input.deviceUuid || '').trim(),
    SdkRequest: typeof sdkRequest === 'string' ? sdkRequest : JSON.stringify(sdkRequest ?? {}),
    SdkResponse: typeof sdkResponse === 'string' ? sdkResponse : JSON.stringify(sdkResponse ?? {})
  };
}

export function parseProcessResponse(data) {
  const code = Number(data?.ResponseCode);
  const dealNumber = String(data?.DealNumber ?? data?.dealNumber ?? '').trim();
  if (code !== 0 || !dealNumber) {
    const err = new Error(data?.Description || 'Cardcom לא קלט את העסקה');
    err.code = 'PROCESS_FAILED';
    err.responseCode = data?.ResponseCode;
    throw err;
  }
  return {
    dealNumber,
    description: String(data?.Description || ''),
    responseCode: 0
  };
}

export function buildCreateDocumentBody(creds, input) {
  const dealNumber = String(input.dealNumber || '').trim();
  if (!dealNumber) {
    const err = new Error('חסר מספר עסקה לחשבונית');
    err.code = 'MISSING_DEAL';
    throw err;
  }
  const amount = roundMoney(input.amount);
  const customerEmail = String(input.email || '').trim();
  const invoiceEmail = customerEmail || FALLBACK_INVOICE_EMAIL;
  const phone = String(input.phone || '').trim();
  const name = String(input.name || '').trim() || 'אורח';
  return {
    ApiName: creds.apiName,
    ApiPassword: creds.apiPassword,
    IsSendSMS: Boolean(input.sendSms && phone),
    Document: {
      DocumentTypeToCreate: 'TaxInvoiceAndReceipt',
      Name: name,
      Email: invoiceEmail,
      Phone: phone || undefined,
      IsSendByEmail: true,
      Products: [{
        Description: String(input.description || 'שהייה במיאליס').slice(0, 200),
        UnitCost: amount,
        Quantity: 1,
        IsVatFree: false
      }],
      ISOCoinID: '1'
    },
    DealNumbers: [{ DealNumber: dealNumber }]
  };
}

export function parseDocumentResponse(data) {
  const code = Number(data?.ResponseCode);
  const documentNumber = String(data?.DocumentNumber ?? data?.documentNumber ?? '').trim();
  if (code !== 0 || !documentNumber) {
    const err = new Error(data?.Description || 'הפקת החשבונית נכשלה');
    err.code = 'INVOICE_FAILED';
    err.responseCode = data?.ResponseCode;
    throw err;
  }
  return {
    documentNumber,
    documentUrl: String(data?.DocumentUrl || data?.Url || ''),
    description: String(data?.Description || '')
  };
}

export function recordedPaidAgorot(booking) {
  const rows = Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [];
  return rows.reduce((sum, row) => sum + (Number(row?.amount_agorot) || 0), 0);
}

export function bookingDueAgorot(booking) {
  if (!booking) return 0;
  if (String(booking.payment_status || '').toUpperCase() === 'PAID') return 0;
  const total = Number(booking.total_price_agorot) || 0;
  return Math.max(0, total - recordedPaidAgorot(booking));
}

export function bookingDueIls(booking) {
  return roundMoney(bookingDueAgorot(booking) / 100);
}

export function bookingSummary(booking) {
  if (!booking) return null;
  return {
    id: String(booking.checkout_token || booking.id || ''),
    guestName: String(booking.guest_name || ''),
    unitId: String(booking.unit_id || ''),
    checkIn: String(booking.check_in_date || ''),
    checkOut: String(booking.check_out_date || ''),
    due: bookingDueIls(booking),
    total: roundMoney((Number(booking.total_price_agorot) || 0) / 100),
    paymentStatus: String(booking.payment_status || '')
  };
}

/**
 * Reject a charge the staff have not tapped yet when it is above what the booking still owes.
 * A tap that already happened is handled separately: the money may already have moved.
 */
export function assertQuoteAmount({ amount, payments, channel, booking, bookingId }) {
  const split = splitInstallments(amount, payments);
  const ils = split.amount;
  if (ils > WALK_IN_MAX_ILS) {
    const err = new Error('הסכום גבוה מהמותר בחיוב אחד');
    err.code = 'AMOUNT_TOO_HIGH';
    throw err;
  }
  if (channel === 'tap' && ils > TAP_PHYSICAL_LIMIT_ILS) {
    const err = new Error('כרטיס פיזי ב-Tap מוגבל ל-300 ש״ח. שלחו קישור תשלום לאורח.');
    err.code = 'TAP_LIMIT';
    throw err;
  }
  if (bookingId) {
    if (!booking) {
      const err = new Error('ההזמנה לא נמצאה. אי אפשר לאמת את הסכום.');
      err.code = 'BOOKING_NOT_FOUND';
      throw err;
    }
    const total = Number(booking.total_price_agorot) || 0;
    if (total <= 0) {
      const err = new Error('להזמנה אין סכום שמור. אי אפשר לאמת את החיוב.');
      err.code = 'BOOKING_AMOUNT_UNKNOWN';
      throw err;
    }
    const due = bookingDueIls(booking);
    if (ils > due + 0.009) {
      const err = new Error(`הסכום גבוה מהיתרה להזמנה (${due.toFixed(2)} ₪)`);
      err.code = 'OVER_BALANCE';
      err.due = due;
      throw err;
    }
  }
  return split;
}

export function applyCardcomPayment(row, payment) {
  const existing = Array.isArray(row?.clearing_payments) ? row.clearing_payments.slice() : [];
  const deal = String(payment.dealNumber || '').trim();
  const idem = String(payment.idempotencyKey || '').trim();
  const duplicate = existing.find((item) => (
    (deal && (item.deal_number === deal || item.txn === deal))
    || (idem && item.idempotency_key === idem)
  ));
  if (duplicate) {
    return { row: { ...row, clearing_payments: existing }, payment: duplicate, duplicate: true };
  }
  const entry = {
    gateway: 'cardcom',
    channel: payment.channel || 'tap',
    deal_number: deal,
    txn: deal,
    idempotency_key: idem,
    amount_agorot: moneyToAgorot(payment.amount),
    payments: Number(payment.payments) || 1,
    approval: String(payment.approval || ''),
    last4: String(payment.last4 || '').replace(/\D/g, '').slice(-4),
    document_number: String(payment.documentNumber || ''),
    document_url: String(payment.documentUrl || ''),
    review: String(payment.review || ''),
    acquirer: 'CARDCOM',
    at: payment.at || new Date().toISOString(),
    date: (payment.at || new Date().toISOString()).slice(0, 10)
  };
  const clearing = existing.concat(entry);
  const paid = clearing.reduce((sum, item) => sum + (Number(item.amount_agorot) || 0), 0);
  const total = Number(row?.total_price_agorot) || 0;
  const next = {
    ...row,
    clearing_payments: clearing,
    payment_mode: row?.payment_mode || 'CARD'
  };
  if (total > 0 && paid + 1 >= total) next.payment_status = 'PAID';
  else if (paid > 0) next.payment_status = next.payment_status === 'PAID' ? 'PAID' : 'PARTIAL';
  return { row: next, payment: entry, duplicate: false };
}

export function attachDocument(row, dealNumber, document) {
  const deal = String(dealNumber || '').trim();
  const clearing = Array.isArray(row?.clearing_payments) ? row.clearing_payments.map((item) => {
    if (item.deal_number !== deal && item.txn !== deal) return item;
    if (item.document_number) return item;
    return {
      ...item,
      document_number: document.documentNumber,
      document_url: document.documentUrl || ''
    };
  }) : [];
  return { ...row, clearing_payments: clearing };
}

export function last4FromSdk(sdkResponse) {
  const parsed = parseSdkPayload(sdkResponse) || {};
  const direct = String(
    parsed.last4
    || parsed.Last4
    || parsed.card_last4
    || parsed.CardNumber
    || ''
  );
  const digits = direct.replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-4);
  return '';
}

export function approvalFromSdk(sdkResponse) {
  const parsed = parseSdkPayload(sdkResponse) || {};
  return String(parsed.ApprovalNumber || parsed.approval_number || parsed.approval || '').trim();
}

const PAN_KEY = /card.?number|pan|track|cvv|fullcard/i;

export function redactSecrets(value, depth = 0) {
  if (value == null || depth > 8) return value;
  if (typeof value === 'string') {
    return value.replace(/\b\d{13,19}\b/g, (match) => `****${match.slice(-4)}`);
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEYS.has(String(key).toLowerCase()) || PAN_KEY.test(key)) {
      if (typeof item === 'string' && item.replace(/\D/g, '').length >= 4) {
        out[key] = `****${item.replace(/\D/g, '').slice(-4)}`;
      } else {
        out[key] = '[redacted]';
      }
      continue;
    }
    out[key] = redactSecrets(item, depth + 1);
  }
  return out;
}

export function publicPaymentResult(input) {
  return redactSecrets({
    ok: true,
    idempotent: Boolean(input.idempotent),
    dealNumber: String(input.dealNumber || ''),
    amount: roundMoney(input.amount),
    payments: Number(input.payments) || 1,
    approval: String(input.approval || ''),
    last4: String(input.last4 || ''),
    channel: input.channel || 'tap',
    bookingId: String(input.bookingId || ''),
    recorded: Boolean(input.recorded),
    review: String(input.review || ''),
    documentNumber: String(input.documentNumber || ''),
    documentUrl: String(input.documentUrl || ''),
    message: input.message || 'החיוב נקלט'
  });
}

export function mockDealNumber(seed) {
  const text = String(seed || 'mock');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
  return String(200000000 + (hash % 700000000));
}

export function mockPrepareResponse() {
  return {
    ResponseCode: 0,
    Description: 'mock',
    TPN: 'MOCKTPN',
    MerchantCode: 'MOCKMERCHANT',
    SapakMutavNumber: '1',
    RavMutavTerminalNumber: 1000
  };
}

export function mockProcessResponse(sdkResponse) {
  const parsed = parseSdkPayload(sdkResponse) || {};
  return {
    ResponseCode: 0,
    Description: 'mock',
    DealNumber: mockDealNumber(parsed.transaction_id || parsed.ApprovalNumber || 'tap')
  };
}

export function mockDocumentResponse(dealNumber) {
  return {
    ResponseCode: 0,
    Description: 'mock',
    DocumentNumber: `DOC-${dealNumber}`,
    DocumentUrl: `https://secure.cardcom.solutions/mock/doc/${encodeURIComponent(dealNumber)}`
  };
}

/**
 * Staff deep links carry a booking id, an amount, and a payment count.
 * Anything else in the query string is ignored, including names that look like secrets.
 */
export function parseChargeLink(url) {
  const text = String(url || '').trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.replace(/\/$/, '');
  const appScheme = scheme === 'resortos' && (host === 'charge' || path === '/charge');
  const universal = (scheme === 'https' || scheme === 'http')
    && (host === 'resortos.app' || host === 'www.resortos.app')
    && path === '/app/charge';
  if (!appScheme && !universal) return null;
  const bookingId = String(parsed.searchParams.get('booking') || '').trim();
  if (bookingId && !/^[A-Za-z0-9_-]{1,80}$/.test(bookingId)) return null;
  const amountRaw = parsed.searchParams.get('amount');
  const amount = amountRaw == null || amountRaw === '' ? null : roundMoney(amountRaw);
  const paymentsRaw = parsed.searchParams.get('payments');
  let payments = 1;
  if (paymentsRaw != null && paymentsRaw !== '') {
    const count = Math.round(Number(paymentsRaw));
    payments = count >= 1 && count <= MAX_PAYMENTS ? count : 1;
  }
  return {
    bookingId,
    amount: amount && amount > 0 ? amount : null,
    payments
  };
}

/** Same decisions as the Kotlin mock, so the debug build and the node flow stay aligned. */
export function mockSdkTransaction(inputObject, sessionKey) {
  if (!sessionKey || sessionKey === 'expired') {
    return {
      event: 'register_needed',
      message: 'צריך לרשום את המכשיר מחדש'
    };
  }
  const amount = formatAmount(inputObject?.amount);
  if (amount === '0.13') {
    const payload = { response_code: '05', message: 'נדחה' };
    return {
      event: 'success',
      response_code: '05',
      message: 'הכרטיס נדחה',
      payload: JSON.stringify(payload)
    };
  }
  const payload = {
    response_code: '00',
    transaction_id: `mock-${amount}`,
    ApprovalNumber: '00MOCK',
    status: 'APPROVED'
  };
  return {
    event: 'success',
    response_code: '00',
    transaction_id: payload.transaction_id,
    approval_number: payload.ApprovalNumber,
    message: '',
    payload: JSON.stringify(payload)
  };
}
