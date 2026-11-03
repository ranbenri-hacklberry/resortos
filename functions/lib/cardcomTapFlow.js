import { buildSdkSaleInput, mockSdkTransaction } from './cardcomTapCore.js';

/**
 * One charge attempt: quote, register the phone if needed, tap, then
 * ProcessSDKTransaction and the invoice. A declined tap is not sent again.
 * A lost Cardcom reply is retried with the same idempotency key and the same
 * SDK payload. The card is not tapped a second time.
 */
export async function runTapCharge({ api, tap, amount, payments, bookingId }) {
  const idempotencyKey = await api.createKey();
  const quote = await api.quote({
    amount,
    payments,
    bookingId: bookingId || '',
    channel: 'tap',
    idempotencyKey
  });
  if (!quote?.ok) return quote;
  if (quote.dealNumber) {
    return {
      ok: true,
      idempotent: true,
      dealNumber: quote.dealNumber,
      amount: quote.amount,
      documentNumber: quote.documentNumber || '',
      documentUrl: quote.documentUrl || '',
      invoiceOk: Boolean(quote.documentNumber || quote.documentUrl),
      message: 'החיוב כבר נקלט'
    };
  }

  const profile = await tap.deviceProfile();
  let session = await tap.loadSession();
  if (!session?.sessionKey || session.sapakMutavNumber == null) {
    const prepared = await register(api, tap, profile);
    if (!prepared.ok) return prepared;
    session = prepared.session;
  }

  const input = buildSdkSaleInput({
    amount: quote.amount,
    payments: quote.payments,
    sapakMutavNumber: session.sapakMutavNumber
  });

  let sdk = await tap.performTransaction(input, session.sessionKey);
  if (sdk?.event === 'register_needed') {
    const prepared = await register(api, tap, profile);
    if (!prepared.ok) return prepared;
    session = prepared.session;
    sdk = await tap.performTransaction(input, session.sessionKey);
  }
  const response = sdkPayload(sdk);
  if (String(response?.response_code || sdk?.response_code || '') !== '00') {
    return {
      ok: false,
      code: 'SDK_DECLINED',
      message: sdk?.message || 'הכרטיס לא אושר'
    };
  }

  const processed = await api.process({
    idempotencyKey: quote.idempotencyKey,
    bookingId: bookingId || '',
    deviceUuid: profile.deviceUuid,
    ravMutavTerminalNumber: session.ravMutavTerminalNumber,
    sdkRequest: input,
    sdkResponse: response
  });
  if (!processed?.ok && processed?.retry) {
    const again = await api.process({
      idempotencyKey: quote.idempotencyKey,
      bookingId: bookingId || '',
      deviceUuid: profile.deviceUuid,
      ravMutavTerminalNumber: session.ravMutavTerminalNumber,
      sdkRequest: input,
      sdkResponse: response
    });
    if (!again?.ok) return { ...again, tapped: true };
    return finish(api, again, quote, bookingId);
  }
  if (!processed?.ok) return { ...processed, tapped: true };
  return finish(api, processed, quote, bookingId);
}

async function register(api, tap, profile) {
  const prepared = await api.prepare({
    deviceUuid: profile.deviceUuid,
    manufacturer: profile.manufacturer,
    model: profile.model
  });
  if (!prepared?.ok) return prepared;
  const registered = await tap.registerDevice(prepared.tpn, prepared.merchantCode);
  if (!registered?.sessionKey && !registered?.session_key) {
    return { ok: false, code: 'REGISTER_FAILED', message: registered?.message || 'רישום המכשיר נכשל' };
  }
  const session = {
    ...prepared,
    sessionKey: registered.sessionKey || registered.session_key
  };
  await tap.saveSession(session);
  return { ok: true, session };
}

function sdkPayload(sdk) {
  if (sdk?.payload) {
    try {
      return JSON.parse(sdk.payload);
    } catch {
      return sdk;
    }
  }
  return sdk;
}

async function finish(api, processed, quote, bookingId) {
  let invoice = { ok: false };
  try {
    invoice = await api.invoice({
      dealNumber: processed.dealNumber,
      idempotencyKey: quote.idempotencyKey,
      bookingId: bookingId || '',
      amount: quote.amount
    });
  } catch (err) {
    invoice = { ok: false, message: err?.message || '' };
  }
  return {
    ok: true,
    dealNumber: processed.dealNumber,
    amount: quote.amount,
    documentNumber: invoice.documentNumber || '',
    documentUrl: invoice.documentUrl || '',
    invoiceOk: Boolean(invoice.ok),
    message: invoice.ok ? 'החיוב נקלט' : 'החיוב נקלט. החשבונית לא הופקה.'
  };
}

export function memoryTap(profile) {
  let session = null;
  return {
    async deviceProfile() {
      return profile;
    },
    async loadSession() {
      return session;
    },
    async saveSession(next) {
      session = next;
    },
    async registerDevice() {
      return { event: 'success', sessionKey: 'mock-session', session_key: 'mock-session' };
    },
    async performTransaction(inputObject, sessionKey) {
      return mockSdkTransaction(inputObject, sessionKey);
    }
  };
}
