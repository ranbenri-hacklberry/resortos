import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPaymentFields,
  buildSdkRequest,
  parseChargeUrl,
  redact,
  runTapCharge
} from './cardcomTapCore.js';
import { handleCardcomRequest, signDashboardToken } from './cardcomTap.js';

function memoryKv() {
  const data = new Map();
  return {
    async get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async put(key, value) {
      data.set(key, value);
    }
  };
}

function bookingFixture() {
  return {
    id: 'book-today-002',
    guest_name: 'שירה לוי',
    unit_id: 'k827',
    checkout_token: 'tok_testbooking01',
    total_price_agorot: 180000,
    deposit_agorot: 0,
    payment_status: 'UNPAID',
    clearing_payments: []
  };
}

function harness(booking = bookingFixture()) {
  const saved = [];
  const env = {
    CHECKOUT_MAILBOX_SECRET: 'test-secret',
    CARDCOM_TAP_MOCK: '1',
    CHECKOUT_KV: memoryKv()
  };
  const deps = {
    async loadBooking(_env, id) {
      if (!booking || (booking.id !== id && booking.checkout_token !== id)) return null;
      return { booking, token: booking.checkout_token };
    },
    async saveBooking(_env, next) {
      saved.push(JSON.parse(JSON.stringify(next)));
      booking = next;
      return { ok: true, booking: next };
    }
  };
  return {
    env,
    deps,
    saved,
    current() {
      return booking;
    }
  };
}

async function authed(env) {
  return signDashboardToken(env, {
    username: 'max',
    display_name: 'מקס (רני)',
    role: 'MANAGER',
    phone: '0506102416'
  });
}

async function call(env, deps, token, method, path, body) {
  const url = new URL(`https://resortos.app${path}`);
  const res = await handleCardcomRequest(new Request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: token ? `Bearer ${token}` : ''
    },
    body: method === 'GET' ? undefined : JSON.stringify(body || {})
  }), env, { ...deps, path: path.split('/').filter(Boolean).pop() });
  const data = await res.json();
  return { status: res.status, data };
}

test('payment split puts the agorot remainder on the first installment', () => {
  assert.deepEqual(buildPaymentFields(20, 1), {
    NumberOfPayments: 1,
    FirstPaymentSum: 0,
    OtherPaymentsSum: 0,
    CreditType: 1
  });
  const three = buildPaymentFields(10, 3);
  assert.equal(three.CreditType, 8);
  assert.equal(three.NumberOfPayments, 3);
  assert.equal(Math.round((three.FirstPaymentSum + three.OtherPaymentsSum * 2) * 100), 1000);
  const request = buildSdkRequest({ amount: 20, payments: 1, sapakMutavNumber: 'M1' });
  assert.equal(request.amount, '20.00');
  assert.equal(request.lang, 'iw');
  assert.equal(request.CustomObject.TransactionUniqueIdForQuery, '');
  assert.equal(request.CustomObject.SapakMutavNumber, 'M1');
});

test('charge links carry only booking, amount, and payments', () => {
  const parsed = parseChargeUrl('resortos://charge?booking=book-today-002&amount=20&payments=2');
  assert.equal(parsed.booking, 'book-today-002');
  assert.equal(parsed.amount, 20);
  assert.equal(parsed.payments, 2);
  assert.equal(parseChargeUrl('https://resortos.app/charge?booking=book-today-002&amount=20.50').amount, 20.5);
  assert.throws(() => parseChargeUrl('resortos://charge?booking=1&amount=20&apiPassword=secret'), /LINK_PARAM/);
});

test('redact drops card numbers and passwords', () => {
  const clean = redact({
    response_code: '00',
    CardNumber: '4580123412341234',
    note: 'pan 4580123412341234 ok',
    ApiPassword: 'super-secret-pass'
  });
  assert.equal(clean.response_code, '00');
  assert.equal(clean.CardNumber, undefined);
  assert.equal(clean.ApiPassword, undefined);
  assert.equal(clean.note.includes('4580123412341234'), false);
});

test('dashboard token is required', async () => {
  const { env, deps } = harness();
  const denied = await call(env, deps, '', 'POST', '/api/payments/cardcom/reserve', {});
  assert.equal(denied.status, 401);
});

test('mock tap flow charges once and replays the same deal', async () => {
  const box = harness();
  const token = await authed(box.env);
  const device = { uuid: 'device-android-1', manufacturer: 'Samsung', model: 'A54' };
  const tap = {
    session: null,
    async getSession() { return this.session; },
    async setSession(value) { this.session = value; },
    async registerDevice() { return { sessionKey: 'sess-1' }; },
    async performTransaction() {
      return { response_code: '00', raw: { response_code: '00', transaction_id: 't1', CardNumber: '4580123412341234' } };
    }
  };
  let taps = 0;
  const realPerform = tap.performTransaction.bind(tap);
  tap.performTransaction = async (...args) => {
    taps += 1;
    return realPerform(...args);
  };
  const ctx = {
    idempotencyKey: 'charge-key-001',
    bookingId: 'book-today-002',
    amount: 20,
    payments: 1,
    device,
    customerName: 'שירה לוי',
    tap,
    call: (method, path, body) => call(box.env, box.deps, token, method, path, body).then((res) => res.data)
  };
  const first = await runTapCharge(ctx);
  const second = await runTapCharge(ctx);
  assert.equal(first.ok, true);
  assert.equal(first.stage, 'done');
  assert.equal(second.replay, true);
  assert.equal(second.dealNumber, first.dealNumber);
  assert.equal(taps, 1);
  assert.equal(box.saved.length, 1);
  assert.equal(box.current().clearing_payments.length, 1);
  assert.equal(box.current().clearing_payments[0].source, 'CARDCOM_TAP');
  assert.equal(box.current().clearing_payments[0].ref, first.dealNumber);
  assert.equal(JSON.stringify(first).includes('4580123412341234'), false);
  assert.equal(JSON.stringify(first).includes('ApiPassword'), false);
  assert.ok(first.invoice.documentNumber);
});

test('server rejects a tap above the booking balance and above 300 ILS', async () => {
  const box = harness();
  const token = await authed(box.env);
  const overDue = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/reserve', {
    idempotencyKey: 'charge-key-over',
    bookingId: 'book-today-002',
    amount: 1802,
    payments: 1,
    channel: 'link'
  });
  assert.equal(overDue.data.code, 'AMOUNT_MISMATCH');
  const overTap = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/reserve', {
    idempotencyKey: 'charge-key-300',
    bookingId: 'book-today-002',
    amount: 301,
    payments: 1,
    channel: 'tap',
    deviceUuid: 'device-android-1'
  });
  assert.equal(overTap.data.code, 'TAP_LIMIT');
  assert.equal(box.saved.length, 0);
});

test('a lost ProcessSDKTransaction response is not sent twice', async () => {
  const box = harness();
  box.env.CARDCOM_TAP_MOCK = '0';
  box.env.CARDCOM_API_NAME = 'api-name';
  box.env.CARDCOM_API_PASSWORD = 'super-secret-pass';
  box.env.CARDCOM_TERMINAL = '123456';
  const token = await authed(box.env);
  const calls = [];
  box.deps.fetchImpl = async (url, opts) => {
    const payload = JSON.parse(opts.body);
    calls.push({ url, payload });
    assert.equal(payload.ApiPassword, 'super-secret-pass');
    if (String(url).endsWith('PrepareDevice')) {
      return Response.json({
        ResponseCode: 0,
        TPN: 'TPN1',
        MerchantCode: 'MC1',
        SapakMutavNumber: 'SM1',
        RavMutavTerminalNumber: 654321
      });
    }
    if (String(url).endsWith('ProcessSDKTransaction')) {
      throw new Error('timeout');
    }
    if (String(url).endsWith('GetTransactions')) {
      return Response.json({
        ResponseCode: 0,
        Transactions: [{ DealNumber: '205078451', Amount: '20.00' }]
      });
    }
    if (String(url).endsWith('CreateDocument')) {
      assert.equal(payload.DealNumbers[0].DealNumber, '205078451');
      assert.equal(payload.ApiPassword, 'super-secret-pass');
      return Response.json({ ResponseCode: 0, DocumentNumber: '1001', DocumentUrl: 'https://example.test/doc' });
    }
    throw new Error(`unexpected ${url}`);
  };
  const prepared = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/prepare', {
    deviceUuid: 'device-android-1',
    manufacturer: 'Samsung',
    model: 'A54'
  });
  assert.equal(prepared.data.ok, true);
  assert.equal(prepared.data.ApiPassword, undefined);
  await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/reserve', {
    idempotencyKey: 'charge-key-timeout',
    bookingId: 'book-today-002',
    amount: '20.00',
    payments: 2,
    channel: 'tap',
    deviceUuid: 'device-android-1'
  });
  const sdkRequest = buildSdkRequest({ amount: 20, payments: 2, sapakMutavNumber: 'SM1' });
  const first = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/process', {
    idempotencyKey: 'charge-key-timeout',
    amount: '20.00',
    payments: 2,
    ravMutavTerminalNumber: 654321,
    sdkRequest,
    sdkResponse: { response_code: '00', transaction_id: 'abc' }
  });
  assert.equal(first.data.code, 'PROCESS_UNKNOWN');
  assert.equal(first.data.doNotChargeAgain, true);
  const second = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/process', {
    idempotencyKey: 'charge-key-timeout'
  });
  assert.equal(second.data.ok, true);
  assert.equal(second.data.dealNumber, '205078451');
  const third = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/process', {
    idempotencyKey: 'charge-key-timeout'
  });
  assert.equal(third.data.replay, true);
  assert.equal(calls.filter((item) => item.url.endsWith('ProcessSDKTransaction')).length, 1);
  assert.equal(box.current().clearing_payments.length, 1);
  const invoice = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/invoice', {
    idempotencyKey: 'charge-key-timeout',
    dealNumber: '205078451',
    name: 'שירה לוי'
  });
  const invoiceAgain = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/invoice', {
    idempotencyKey: 'charge-key-timeout',
    dealNumber: '205078451'
  });
  assert.equal(invoice.data.documentNumber, '1001');
  assert.equal(invoiceAgain.data.replay, true);
  assert.equal(calls.filter((item) => item.url.endsWith('CreateDocument')).length, 1);
  assert.equal(JSON.stringify(invoice.data).includes('super-secret-pass'), false);
});

test('the fifth device is accepted and the sixth is refused', async () => {
  const box = harness();
  const token = await authed(box.env);
  for (let i = 1; i <= 5; i += 1) {
    const res = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/prepare', {
      deviceUuid: `device-000${i}`,
      manufacturer: 'Samsung',
      model: 'A54'
    });
    assert.equal(res.data.ok, true, res.data.message);
  }
  const sixth = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/prepare', {
    deviceUuid: 'device-0006',
    manufacturer: 'Samsung',
    model: 'A54'
  });
  assert.equal(sixth.data.code, 'DEVICE_LIMIT');
});

test('manual entry and payment link do not echo the card or double-record', async () => {
  const box = harness();
  const token = await authed(box.env);
  const manual = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/manual', {
    idempotencyKey: 'manual-key-001',
    bookingId: 'book-today-002',
    amount: 50,
    payments: 1,
    cardNumber: '4580123412341234',
    expMonth: '12',
    expYear: '30',
    cvv: '123',
    holderName: 'שירה לוי'
  });
  assert.equal(manual.data.ok, true);
  assert.equal(manual.data.last4, '1234');
  assert.equal(JSON.stringify(manual.data).includes('4580123412341234'), false);
  const again = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/manual', {
    idempotencyKey: 'manual-key-001',
    bookingId: 'book-today-002',
    amount: 50,
    payments: 1,
    cardNumber: '4580123412341234',
    expMonth: '12',
    expYear: '30',
    cvv: '123'
  });
  assert.equal(again.data.replay, true);
  assert.equal(again.data.dealNumber, manual.data.dealNumber);
  const link = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/link', {
    idempotencyKey: 'link-key-0001',
    bookingId: 'book-today-002',
    amount: 80,
    payments: 2
  });
  assert.equal(link.data.ok, true);
  assert.match(link.data.payUrl, /^https:\/\/secure\.cardcom\.solutions\/mock\/lp\//);
  const sameLink = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/link', {
    idempotencyKey: 'link-key-0001',
    bookingId: 'book-today-002',
    amount: 80,
    payments: 2
  });
  assert.equal(sameLink.data.payUrl, link.data.payUrl);
  const paid = await call(box.env, box.deps, token, 'POST', '/api/payments/cardcom/link-status', {
    idempotencyKey: 'link-key-0001'
  });
  assert.equal(paid.data.ok, true);
  assert.equal(box.current().clearing_payments.length, 2);
  const sources = box.current().clearing_payments.map((item) => item.source).sort();
  assert.deepEqual(sources, ['CARDCOM_LINK', 'CARDCOM_MANUAL']);
});
