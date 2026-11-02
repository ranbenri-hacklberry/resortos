import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSdkSaleInput,
  parseChargeLink,
  splitInstallments,
  TAP_PHYSICAL_LIMIT_ILS
} from './cardcomTapCore.js';
import { memoryTap, runTapCharge } from './cardcomTapFlow.js';
import {
  createInvoice,
  createPaymentLink,
  manualCharge,
  memoryStore,
  prepareDevice,
  processTap,
  quoteCharge,
  signDashboardSession
} from './cardcomTap.js';
import { onRequest } from '../api/payments/cardcom/[[path]].js';
import {
  DOCUMENT_URL,
  LOW_PROFILE_CREATE_URL,
  MANUAL_CHARGE_URL,
  TAP_PREPARE_URL,
  TAP_PROCESS_URL
} from './cardcomTapCore.js';

function booking(overrides = {}) {
  return {
    id: 'b1',
    checkout_token: 'tok_stay1',
    guest_name: 'דנה לוי',
    guest_email: 'dana@example.com',
    guest_phone: '0500000000',
    unit_id: 'k7',
    total_price_agorot: 2000,
    payment_status: 'UNPAID',
    clearing_payments: [],
    ...overrides
  };
}

function testEnv(fetchImpl) {
  return {
    CARDCOM_API_NAME: 'api-name',
    CARDCOM_API_PASSWORD: 'secret-password',
    CARDCOM_TERMINAL: '1000',
    CHECKOUT_MAILBOX_SECRET: 'mailbox-secret',
    CARDCOM_STORE: memoryStore(),
    CARDCOM_BOOKINGS: { tok_stay1: booking() },
    fetchImpl
  };
}

function scriptedFetch(script) {
  const calls = [];
  let i = 0;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    if (step === 'timeout') throw new Error('network down');
    const data = typeof step === 'function' ? step(url, body) : step;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(data)
    };
  };
  return { fetchImpl, calls };
}

const sdkOk = {
  response_code: '00',
  transaction_id: 'tx-1',
  ApprovalNumber: '445566',
  CardNumber: '4580123412345678'
};

test('installments keep the total and use credit type 8 above one payment', () => {
  const one = splitInstallments(20, 1);
  assert.deepEqual(one, {
    numberOfPayments: 1,
    firstPaymentSum: 0,
    otherPaymentsSum: 0,
    creditType: 1,
    amount: 20
  });
  const two = splitInstallments(30, 2);
  assert.equal(two.firstPaymentSum, 15);
  assert.equal(two.otherPaymentsSum, 15);
  assert.equal(two.creditType, 8);
  const three = splitInstallments(10, 3);
  assert.equal(three.firstPaymentSum, 3.34);
  assert.equal(three.otherPaymentsSum, 3.33);
  assert.equal(Number((three.firstPaymentSum + three.otherPaymentsSum * 2).toFixed(2)), 10);
});

test('sdk sale input matches the Tap field names', () => {
  const input = buildSdkSaleInput({ amount: 20, payments: 1, sapakMutavNumber: '77' });
  assert.equal(input.type, 'SALE');
  assert.equal(input.amount, '20.00');
  assert.equal(input.lang, 'iw');
  assert.equal(input.CustomObject.CreditType, 1);
  assert.equal(input.CustomObject.NumberOfPayments, 1);
  assert.equal(input.CustomObject.FirstPaymentSum, 0);
  assert.equal(input.CustomObject.OtherPaymentsSum, 0);
  assert.equal(input.CustomObject.SapakMutavNumber, '77');
  assert.equal(input.CustomObject.TransactionUniqueIdForQuery, '');
  assert.equal(input.CustomObject.AllowFullCardNumberInResponse, true);
});

test('quote rejects a deep-link amount above the booking balance and above the tap limit', async () => {
  const env = testEnv();
  await assert.rejects(
    () => quoteCharge(env, { amount: 30, payments: 1, bookingId: 'tok_stay1', channel: 'tap', idempotencyKey: 'idem-over-1' }),
    (err) => err.code === 'OVER_BALANCE'
  );
  await assert.rejects(
    () => quoteCharge(env, { amount: TAP_PHYSICAL_LIMIT_ILS + 1, payments: 1, channel: 'tap', idempotencyKey: 'idem-limit-1' }),
    (err) => err.code === 'TAP_LIMIT'
  );
});

test('tap flow records one payment and a second submit does not call Cardcom again', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    (url) => {
      if (url === TAP_PREPARE_URL) {
        return {
          ResponseCode: 0,
          TPN: 'TPN1',
          MerchantCode: 'MC1',
          SapakMutavNumber: '77',
          RavMutavTerminalNumber: 654321
        };
      }
      if (url === TAP_PROCESS_URL) return { ResponseCode: 0, DealNumber: 205078451 };
      if (url === DOCUMENT_URL) return { ResponseCode: 0, DocumentNumber: '9001', DocumentUrl: 'https://example.test/doc/9001' };
      return { ResponseCode: 0 };
    }
  ]);
  const env = testEnv(fetchImpl);
  const deps = { store: env.CARDCOM_STORE, fetchImpl };
  const quote = await quoteCharge(env, {
    amount: 20,
    payments: 2,
    bookingId: 'tok_stay1',
    channel: 'tap',
    idempotencyKey: 'idem-tap-0001'
  }, deps);
  assert.equal(quote.amount, 20);
  assert.equal(quote.split.creditType, 8);
  const prepared = await prepareDevice(env, {
    deviceUuid: 'device-1',
    manufacturer: 'Samsung',
    model: 'A54'
  }, deps);
  assert.equal(prepared.sapakMutavNumber, '77');
  assert.equal(JSON.stringify(prepared).includes('secret-password'), false);

  const sdkRequest = buildSdkSaleInput({
    amount: quote.amount,
    payments: quote.payments,
    sapakMutavNumber: prepared.sapakMutavNumber
  });
  const processed = await processTap(env, {
    idempotencyKey: quote.idempotencyKey,
    bookingId: 'tok_stay1',
    deviceUuid: 'device-1',
    ravMutavTerminalNumber: prepared.ravMutavTerminalNumber,
    sdkRequest,
    sdkResponse: sdkOk
  }, deps);
  assert.equal(processed.ok, true);
  assert.equal(processed.dealNumber, '205078451');
  assert.equal(processed.last4, '5678');
  assert.equal(processed.recorded, true);
  assert.equal(JSON.stringify(processed).includes('4580123412345678'), false);
  assert.equal(JSON.stringify(processed).includes('secret-password'), false);

  const again = await processTap(env, {
    idempotencyKey: quote.idempotencyKey,
    bookingId: 'tok_stay1',
    deviceUuid: 'device-1',
    ravMutavTerminalNumber: prepared.ravMutavTerminalNumber,
    sdkRequest,
    sdkResponse: sdkOk
  }, deps);
  assert.equal(again.idempotent, true);
  assert.equal(again.dealNumber, processed.dealNumber);
  assert.equal(calls.filter((call) => call.url === TAP_PROCESS_URL).length, 1);

  const outbound = calls.find((call) => call.url === TAP_PROCESS_URL);
  assert.equal(outbound.body.ApiPassword, 'secret-password');
  assert.equal(outbound.body.TerminalNumber, 1000);
  assert.equal(outbound.body.RavMutavTerminalNumber, 654321);
  assert.equal(typeof outbound.body.SdkRequest, 'string');
  assert.equal(outbound.body.SdkRequest.includes('20.00'), true);

  const invoice = await createInvoice(env, {
    dealNumber: processed.dealNumber,
    idempotencyKey: quote.idempotencyKey,
    bookingId: 'tok_stay1',
    amount: 20
  }, deps);
  assert.equal(invoice.documentNumber, '9001');
  const invoiceAgain = await createInvoice(env, {
    dealNumber: processed.dealNumber,
    idempotencyKey: quote.idempotencyKey,
    amount: 20
  }, deps);
  assert.equal(invoiceAgain.idempotent, true);
  assert.equal(calls.filter((call) => call.url === DOCUMENT_URL).length, 1);

  const stored = env.CARDCOM_BOOKINGS.tok_stay1;
  assert.equal(stored.clearing_payments.length, 1);
  assert.equal(stored.clearing_payments[0].deal_number, '205078451');
  assert.equal(stored.clearing_payments[0].document_number, '9001');
  assert.equal(stored.payment_status, 'PAID');
  assert.equal(JSON.stringify(stored).includes('4580123412345678'), false);
});

test('a timeout does not record twice when the same tap is submitted again', async () => {
  let processCalls = 0;
  const { fetchImpl } = scriptedFetch([
    (url) => {
      if (String(url).includes('GetTransactions')) {
        return { ResponseCode: 0, Transactions: [] };
      }
      processCalls += 1;
      if (processCalls === 1) throw new Error('network down');
      return { ResponseCode: 0, DealNumber: 3001 };
    }
  ]);
  const env = testEnv(fetchImpl);
  const deps = { store: env.CARDCOM_STORE, fetchImpl };
  await quoteCharge(env, {
    amount: 10,
    payments: 1,
    bookingId: 'tok_stay1',
    channel: 'tap',
    idempotencyKey: 'idem-retry-1'
  }, deps);
  const sdkRequest = buildSdkSaleInput({ amount: 10, payments: 1, sapakMutavNumber: '77' });
  const payload = {
    idempotencyKey: 'idem-retry-1',
    bookingId: 'tok_stay1',
    deviceUuid: 'device-1',
    ravMutavTerminalNumber: 654321,
    sdkRequest,
    sdkResponse: { ...sdkOk, transaction_id: 'tx-retry' }
  };
  const first = await processTap(env, payload, deps);
  assert.equal(first.code, 'UNCONFIRMED');
  assert.equal(env.CARDCOM_BOOKINGS.tok_stay1.clearing_payments.length, 0);
  const second = await processTap(env, payload, deps);
  assert.equal(second.ok, true);
  assert.equal(second.dealNumber, '3001');
  const third = await processTap(env, payload, deps);
  assert.equal(third.idempotent, true);
  assert.equal(env.CARDCOM_BOOKINGS.tok_stay1.clearing_payments.length, 1);
  assert.equal(processCalls, 2);
});

test('manual entry and payment link are idempotent and never echo the card number', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    (url) => {
      if (url === MANUAL_CHARGE_URL) {
        return { ResponseCode: 0, TranzactionId: '777', ApprovalNumber: '1', Last4CardDigitsString: '4242' };
      }
      if (url === LOW_PROFILE_CREATE_URL) {
        return { ResponseCode: 0, Url: 'https://secure.cardcom.solutions/pay/lp', LowProfileId: 'lp1' };
      }
      return { ResponseCode: 0 };
    }
  ]);
  const env = testEnv(fetchImpl);
  const deps = { store: env.CARDCOM_STORE, fetchImpl };
  const card = {
    amount: 15,
    payments: 1,
    bookingId: 'tok_stay1',
    idempotencyKey: 'idem-manual-1',
    cardNumber: '4580123412344242',
    expiry: '12/30',
    cvv: '123',
    holderId: '000000000'
  };
  const charged = await manualCharge(env, card, deps);
  assert.equal(charged.dealNumber, '777');
  assert.equal(charged.last4, '4242');
  const replay = await manualCharge(env, card, deps);
  assert.equal(replay.idempotent, true);
  assert.equal(calls.filter((call) => call.url === MANUAL_CHARGE_URL).length, 1);
  assert.equal(JSON.stringify(charged).includes('4580123412344242'), false);
  assert.equal(env.CARDCOM_BOOKINGS.tok_stay1.clearing_payments.length, 1);

  const link = await createPaymentLink(env, {
    amount: 5,
    payments: 1,
    bookingId: 'tok_stay1',
    idempotencyKey: 'idem-link-1'
  }, deps);
  assert.equal(link.url.includes('https://'), true);
  const linkAgain = await createPaymentLink(env, {
    amount: 5,
    payments: 1,
    bookingId: 'tok_stay1',
    idempotencyKey: 'idem-link-1'
  }, deps);
  assert.equal(linkAgain.idempotent, true);
  assert.equal(calls.filter((call) => call.url === LOW_PROFILE_CREATE_URL).length, 1);
  assert.equal(calls.some((call) => JSON.stringify(call.body).includes('secret-password') && call.body.ApiPassword), true);
});

test('a charge link keeps the booking and the amount and drops anything else', () => {
  const parsed = parseChargeLink('resortos://charge?booking=tok_stay1&amount=20&payments=2&ApiPassword=nope&card=4580');
  assert.deepEqual(parsed, { bookingId: 'tok_stay1', amount: 20, payments: 2 });
  const universal = parseChargeLink('https://resortos.app/app/charge?booking=tok_stay1&amount=15.5');
  assert.equal(universal.bookingId, 'tok_stay1');
  assert.equal(universal.amount, 15.5);
  assert.equal(universal.payments, 1);
  assert.equal(parseChargeLink('https://resortos.app/dashboard?amount=20'), null);
  assert.equal(parseChargeLink('resortos://charge?booking=../secret&amount=10'), null);
});

test('the mock tap flow quotes, taps once, and records the deal', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    (url) => {
      if (String(url).includes('PrepareDevice')) {
        return {
          ResponseCode: 0,
          TPN: 'TPN1',
          MerchantCode: 'MC1',
          SapakMutavNumber: '77',
          RavMutavTerminalNumber: 654321
        };
      }
      if (String(url).includes('ProcessSDKTransaction')) return { ResponseCode: 0, DealNumber: 4242 };
      if (String(url).includes('CreateDocument')) return { ResponseCode: 0, DocumentNumber: 'D1', DocumentUrl: 'https://example.test/d1' };
      return { ResponseCode: 0, Transactions: [] };
    }
  ]);
  const env = testEnv(fetchImpl);
  const deps = { store: env.CARDCOM_STORE, fetchImpl };
  const api = {
    createKey: async () => 'idem-flow-0001',
    quote: (body) => quoteCharge(env, body, deps),
    prepare: (body) => prepareDevice(env, body, deps),
    process: (body) => processTap(env, body, deps),
    invoice: (body) => createInvoice(env, body, deps)
  };
  const tap = memoryTap({
    deviceUuid: 'device-1',
    manufacturer: 'Samsung',
    model: 'A54'
  });
  const result = await runTapCharge({
    api,
    tap,
    amount: 20,
    payments: 1,
    bookingId: 'tok_stay1'
  });
  assert.equal(result.ok, true);
  assert.equal(result.dealNumber, '4242');
  assert.equal(result.invoiceOk, true);
  assert.equal(calls.filter((call) => String(call.url).includes('ProcessSDKTransaction')).length, 1);
  assert.equal(env.CARDCOM_BOOKINGS.tok_stay1.clearing_payments.length, 1);

  const replay = await runTapCharge({
    api: { ...api, createKey: async () => 'idem-flow-0001' },
    tap,
    amount: 20,
    payments: 1,
    bookingId: 'tok_stay1'
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.dealNumber, '4242');
  assert.equal(calls.filter((call) => String(call.url).includes('ProcessSDKTransaction')).length, 1);
  assert.equal(env.CARDCOM_BOOKINGS.tok_stay1.clearing_payments.length, 1);
});

test('the worker route accepts a dashboard session and rejects everyone else', async () => {
  const env = {
    CARDCOM_API_NAME: 'api-name',
    CARDCOM_API_PASSWORD: 'secret-password',
    CARDCOM_TERMINAL: '1000',
    CARDCOM_MOCK: '1',
    CHECKOUT_MAILBOX_SECRET: 'mailbox-secret',
    CARDCOM_STORE: memoryStore(),
    CARDCOM_BOOKINGS: { tok_stay1: booking() }
  };
  const denied = await onRequest({
    request: new Request('https://resortos.app/api/payments/cardcom/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 20, payments: 1, idempotencyKey: 'idem-http-1' })
    }),
    env,
    params: { path: ['quote'] }
  });
  assert.equal(denied.status, 401);

  const token = await signDashboardSession(env, {
    username: 'max',
    display_name: 'מקס (רני)',
    role: 'MANAGER',
    phone: '0506102416'
  });
  const quoted = await onRequest({
    request: new Request('https://resortos.app/api/payments/cardcom/quote', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        amount: 20,
        payments: 1,
        bookingId: 'tok_stay1',
        channel: 'tap',
        idempotencyKey: 'idem-http-1'
      })
    }),
    env,
    params: { path: ['quote'] }
  });
  const body = await quoted.json();
  assert.equal(quoted.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.amount, 20);
  assert.equal(JSON.stringify(body).includes('secret-password'), false);
});
