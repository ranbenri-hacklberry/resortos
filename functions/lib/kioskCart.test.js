import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOCUMENT_URL,
  LOW_PROFILE_CREATE_URL,
  LOW_PROFILE_RESULT_URL,
  TAP_PREPARE_URL,
  TAP_PROCESS_URL
} from './cardcomTapCore.js';
import { memoryStore } from './cardcomTap.js';
import { onRequest as cardcomOnRequest } from '../api/payments/cardcom/[[path]].js';
import { onRequest } from '../api/payments/kiosk/[[path]].js';
import {
  KIOSK_ATTEMPT_TTL_MS,
  completeKioskTap,
  confirmKioskLink,
  createKioskLink,
  kioskOrderKey,
  prepareKioskTap,
  publicKioskOrder,
  readKioskOrder
} from './kioskCart.js';

const TOKEN = 'kiosk-token-0123456789';
const PAN = '4580123412345678';

function scriptedFetch(script) {
  const calls = [];
  let i = 0;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body });
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    if (step === 'timeout') throw new Error('network down');
    const data = typeof step === 'function' ? step(url, body) : step;
    return { ok: true, status: 200, text: async () => JSON.stringify(data) };
  };
  return { fetchImpl, calls };
}

function envWith(fetchImpl, extra = {}) {
  return {
    CARDCOM_API_NAME: 'api-name',
    CARDCOM_API_PASSWORD: 'secret-password',
    CARDCOM_TERMINAL: '1000',
    CARDCOM_KIOSK_TOKEN: TOKEN,
    CARDCOM_STORE: memoryStore(),
    fetchImpl,
    ...extra
  };
}

function depsOf(env) {
  return { store: env.CARDCOM_STORE, fetchImpl: env.fetchImpl };
}

const device = { deviceUuid: 'device-1', manufacturer: 'Samsung', model: 'A54' };

function prepareScript() {
  return (url) => {
    if (String(url).includes('PrepareDevice')) {
      return {
        ResponseCode: 0,
        TPN: 'TPN-DEVICE',
        MerchantCode: 'MC-DEVICE',
        SapakMutavNumber: '77',
        RavMutavTerminalNumber: 654321
      };
    }
    return { ResponseCode: 0 };
  };
}

test('kiosk routes reject a missing token, a short token, and a dashboard-shaped bearer', async () => {
  const env = envWith(async () => { throw new Error('should not call cardcom'); });
  const open = await onRequest({
    request: new Request('https://resortos.app/api/payments/kiosk/prepare', { method: 'POST', body: '{}' }),
    env: { ...env, CARDCOM_KIOSK_TOKEN: '' },
    params: { path: ['prepare'] }
  });
  assert.equal(open.status, 503);

  const denied = await onRequest({
    request: new Request('https://resortos.app/api/payments/kiosk/prepare', {
      method: 'POST',
      headers: { authorization: 'Bearer not-the-token', 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 12, orderId: 'cart-1' })
    }),
    env,
    params: { path: ['prepare'] }
  });
  assert.equal(denied.status, 401);

  const deskStillNeedsItsOwnSession = await cardcomOnRequest({
    request: new Request('https://resortos.app/api/payments/cardcom/quote', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 12, payments: 1, idempotencyKey: 'idem-desk-kiosk-1' })
    }),
    env,
    params: { path: ['quote'] }
  });
  assert.equal(deskStillNeedsItsOwnSession.status, 401);
});

test('prepare builds the desk SDK sale and complete records the deal and invoice', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    prepareScript(),
    (url) => {
      if (String(url).includes('ProcessSDKTransaction')) return { ResponseCode: 0, DealNumber: 4242 };
      if (String(url).includes('CreateDocument')) {
        return { ResponseCode: 0, DocumentNumber: 'D1', DocumentUrl: 'https://example.test/d1' };
      }
      return { ResponseCode: 0 };
    }
  ]);
  const env = envWith(fetchImpl);
  const deps = depsOf(env);
  const prepared = await prepareKioskTap(env, { ...device, amount: 18.5, orderId: 'cart-1001' }, deps);
  assert.equal(prepared.status, 'awaiting_tap');
  assert.equal(prepared.resume, false);
  assert.equal(prepared.sdkRequest.amount, '18.50');
  assert.equal(prepared.sdkRequest.type, 'SALE');
  assert.equal(prepared.sdkRequest.CustomObject.CreditType, 1);
  assert.equal(prepared.sdkRequest.CustomObject.SapakMutavNumber, '77');
  assert.equal(prepared.tpn, 'TPN-DEVICE');
  assert.equal(JSON.stringify(prepared).includes('secret-password'), false);

  const again = await prepareKioskTap(env, { ...device, amount: 18.5, orderId: 'cart-1001' }, deps);
  assert.equal(again.resume, true);
  assert.equal(again.idempotencyKey, prepared.idempotencyKey);
  assert.equal(calls.filter((call) => call.url === TAP_PREPARE_URL).length, 1);

  const cached = await prepareKioskTap(env, {
    ...device,
    amount: 9,
    orderId: 'cart-1002',
    sapakMutavNumber: '77',
    ravMutavTerminalNumber: 654321
  }, deps);
  assert.equal(cached.tpn, '');
  assert.equal(calls.filter((call) => call.url === TAP_PREPARE_URL).length, 1);

  const sdkResponse = {
    response_code: '00',
    transaction_id: 'tx-1',
    ApprovalNumber: '445566',
    CardNumber: PAN
  };
  const done = await completeKioskTap(env, {
    orderId: 'cart-1001',
    idempotencyKey: prepared.idempotencyKey,
    ravMutavTerminalNumber: prepared.ravMutavTerminalNumber,
    sdkResponse
  }, deps);
  assert.equal(done.ok, true);
  assert.equal(done.status, 'approved');
  assert.equal(done.dealNumber, '4242');
  assert.equal(done.documentNumber, 'D1');
  assert.equal(done.documentUrl, 'https://example.test/d1');
  assert.equal(done.invoiceOk, true);
  assert.equal(done.last4, '5678');
  assert.equal(JSON.stringify(done).includes(PAN), false);
  assert.equal(JSON.stringify(done).includes('secret-password'), false);
  assert.equal(JSON.stringify(done).includes('TPN-DEVICE'), false);
  const stored = await env.CARDCOM_STORE.get(kioskOrderKey('cart-1001'));
  assert.equal(JSON.stringify(stored).includes(PAN), false);
  assert.equal(calls.filter((call) => call.url === TAP_PROCESS_URL).length, 1);
  assert.equal(calls.filter((call) => call.url === DOCUMENT_URL).length, 1);
  const replay = await completeKioskTap(env, {
    orderId: 'cart-1001',
    idempotencyKey: prepared.idempotencyKey,
    ravMutavTerminalNumber: prepared.ravMutavTerminalNumber,
    sdkResponse
  }, deps);
  assert.equal(replay.idempotent, true);
  assert.equal(calls.filter((call) => call.url === TAP_PROCESS_URL).length, 1);

  const listed = await readKioskOrder(env, 'cart-1001', deps);
  assert.equal(listed.status, 'approved');
  assert.equal(JSON.stringify(listed).includes('MC-DEVICE'), false);
  assert.equal(publicKioskOrder(stored).merchantCode, undefined);
});

test('forceRegister keeps the attempt and asks Cardcom to prepare the device again', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    prepareScript(),
    () => ({
      ResponseCode: 0,
      TPN: 'TPN-2',
      MerchantCode: 'MC-2',
      SapakMutavNumber: '88',
      RavMutavTerminalNumber: 654322
    })
  ]);
  const env = envWith(fetchImpl);
  const deps = depsOf(env);
  const first = await prepareKioskTap(env, { ...device, amount: 8, orderId: 'cart-rereg' }, deps);
  const second = await prepareKioskTap(env, {
    ...device,
    amount: 8,
    orderId: 'cart-rereg',
    forceRegister: true
  }, deps);
  assert.equal(second.idempotencyKey, first.idempotencyKey);
  assert.equal(second.resume, false);
  assert.equal(second.tpn, 'TPN-2');
  assert.equal(second.sdkRequest.CustomObject.SapakMutavNumber, '88');
  assert.equal(calls.filter((call) => call.url === TAP_PREPARE_URL).length, 2);
});

test('a declined tap is not captured and a physical amount over 300 never opens prepare', async () => {
  const { fetchImpl, calls } = scriptedFetch([prepareScript()]);
  const env = envWith(fetchImpl);
  const deps = depsOf(env);
  const prepared = await prepareKioskTap(env, { ...device, amount: '0.13', orderId: 'cart-decline' }, deps);
  const declined = await completeKioskTap(env, {
    orderId: 'cart-decline',
    idempotencyKey: prepared.idempotencyKey,
    ravMutavTerminalNumber: prepared.ravMutavTerminalNumber,
    sdkResponse: { response_code: '05' }
  }, deps);
  assert.equal(declined.status, 'declined');
  assert.equal(declined.ok, false);
  assert.equal(calls.filter((call) => call.url === TAP_PROCESS_URL).length, 0);

  await assert.rejects(
    () => prepareKioskTap(env, { ...device, amount: 301, orderId: 'cart-big' }, deps),
    (err) => err.code === 'TAP_LIMIT'
  );
  await assert.rejects(
    () => prepareKioskTap(env, { ...device, amount: 12, payments: 3, orderId: 'cart-parts' }, deps),
    (err) => err.code === 'KIOSK_SINGLE_PAYMENT'
  );
  assert.equal(calls.filter((call) => call.url === TAP_PREPARE_URL).length, 1);
});

test('a hosted payment page uses the kiosk webhook and confirms only after GetLpResult', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    (url) => {
      if (url === LOW_PROFILE_CREATE_URL) {
        return { ResponseCode: 0, Url: 'https://secure.cardcom.solutions/pay/cart', LowProfileId: 'lp-cart' };
      }
      if (url === LOW_PROFILE_RESULT_URL) {
        return {
          ResponseCode: 0,
          TransactionInfo: { ResponseCode: 1 }
        };
      }
      return { ResponseCode: 0 };
    }
  ]);
  const env = envWith(fetchImpl);
  const deps = depsOf(env);
  const link = await createKioskLink(env, { amount: 16, orderId: 'cart-qr' }, deps);
  assert.equal(link.url, 'https://secure.cardcom.solutions/pay/cart');
  assert.equal(link.status, 'pending');
  assert.equal(JSON.stringify(link).includes('secret-password'), false);
  const created = calls.find((call) => call.url === LOW_PROFILE_CREATE_URL);
  assert.equal(created.body.ApiPassword, 'secret-password');
  assert.equal(created.body.WebHookUrl, 'https://resortos.app/api/payments/kiosk/webhook');
  assert.equal(created.body.Operation, 'ChargeOnly');
  assert.equal(created.body.ProductName, 'עגלת קפה');
  assert.equal(String(created.body.WebHookUrl).includes('/api/payments/hyp/lp'), false);
  assert.equal(created.body.Document, undefined);

  const same = await createKioskLink(env, { amount: 16, orderId: 'cart-qr' }, deps);
  assert.equal(same.idempotent, true);
  assert.equal(calls.filter((call) => call.url === LOW_PROFILE_CREATE_URL).length, 1);
  await assert.rejects(
    () => createKioskLink(env, { amount: 17, orderId: 'cart-qr' }, deps),
    (err) => err.code === 'AMOUNT_CHANGED'
  );

  const waiting = await confirmKioskLink(env, { orderId: 'cart-qr', lowProfileId: 'lp-cart' }, deps);
  assert.equal(waiting.paid, false);
  assert.equal(waiting.status, 'pending');

  const mismatch = await confirmKioskLink(env, { orderId: 'cart-qr', lowProfileId: 'lp-other' }, deps);
  assert.equal(mismatch.status, 'pending');
  assert.equal(calls.filter((call) => call.url === LOW_PROFILE_RESULT_URL).length, 1);

  calls.length = 0;
  const paidFetch = scriptedFetch([
    (url) => {
      if (url === LOW_PROFILE_RESULT_URL) {
        return {
          ResponseCode: 0,
          ReturnValue: 'cart-qr',
          TransactionInfo: {
            ResponseCode: 0,
            TranzactionId: '8881',
            Amount: 16,
            ApprovalNumber: 'OK1',
            Last4CardDigitsString: '4242'
          }
        };
      }
      if (url === DOCUMENT_URL) {
        return { ResponseCode: 0, DocumentNumber: 'DOC-QR', DocumentUrl: 'https://example.test/qr' };
      }
      return { ResponseCode: 0 };
    }
  ]);
  env.fetchImpl = paidFetch.fetchImpl;
  deps.fetchImpl = paidFetch.fetchImpl;
  const paid = await confirmKioskLink(env, { LowProfileId: 'lp-cart', ReturnValue: 'cart-qr' }, deps);
  assert.equal(paid.status, 'approved');
  assert.equal(paid.dealNumber, '8881');
  assert.equal(paid.documentNumber, 'DOC-QR');
  assert.equal(paidFetch.calls.some((call) => call.url === DOCUMENT_URL), true);
  assert.equal(JSON.stringify(paid).includes('secret-password'), false);

  const early = await confirmKioskLink(env, { orderId: 'cart-qr' }, deps);
  assert.equal(early.idempotent, true);
  assert.equal(paidFetch.calls.filter((call) => call.url === LOW_PROFILE_RESULT_URL).length, 1);
});

test('a paid webhook with a different amount is review, not approved', async () => {
  const { fetchImpl } = scriptedFetch([
    () => ({ ResponseCode: 0, Url: 'https://secure.cardcom.solutions/pay/x', LowProfileId: 'lp-x' })
  ]);
  const env = envWith(fetchImpl);
  const deps = depsOf(env);
  await createKioskLink(env, { amount: 10, orderId: 'cart-mismatch', description: 'הפוך' }, deps);
  env.fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(url === LOW_PROFILE_RESULT_URL ? {
      ResponseCode: 0,
      TransactionInfo: { ResponseCode: 0, TranzactionId: '99', Amount: 99, ApprovalNumber: 'ZZ' }
    } : { ResponseCode: 0 })
  });
  deps.fetchImpl = env.fetchImpl;
  const review = await confirmKioskLink(env, { lowProfileId: 'lp-x' }, deps);
  assert.equal(review.status, 'review');
  assert.equal(review.ok, false);
});

test('the worker webhook records a mock payment and the done page does not echo secrets', async () => {
  const env = envWith(null, { CARDCOM_MOCK: '1' });
  const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
  const opened = await onRequest({
    request: new Request('https://resortos.app/api/payments/kiosk/link', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ amount: 11, orderId: 'cart-hook' })
    }),
    env,
    params: { path: ['link'] }
  });
  const link = await opened.json();
  assert.equal(opened.status, 200);
  assert.equal(link.status, 'pending');
  assert.match(link.url, /^https:\/\//);
  assert.equal(JSON.stringify(link).includes('secret-password'), false);

  const hook = await onRequest({
    request: new Request('https://resortos.app/api/payments/kiosk/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ LowProfileId: link.lowProfileId, ReturnValue: 'cart-hook' })
    }),
    env,
    params: { path: ['webhook'] }
  });
  assert.equal(hook.status, 200);
  assert.equal(await hook.text(), 'ok');

  const order = await onRequest({
    request: new Request('https://resortos.app/api/payments/kiosk/orders?orderId=cart-hook', {
      headers: auth
    }),
    env,
    params: { path: ['orders'] }
  });
  const body = await order.json();
  assert.equal(body.status, 'approved');
  assert.equal(body.mock, true);
  assert.equal(body.invoiceOk, true);
  assert.equal(JSON.stringify(body).includes('secret-password'), false);
  assert.equal(JSON.stringify(body).includes('TPN'), false);

  const page = await onRequest({
    request: new Request(`https://resortos.app/api/payments/kiosk/done?Order=cart-hook&LowProfileId=${link.lowProfileId}`),
    env,
    params: { path: ['done'] }
  });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /התשלום נקלט/);
  assert.equal(html.includes('secret-password'), false);
  assert.equal(html.includes(TOKEN), false);

  const stale = Date.now() + KIOSK_ATTEMPT_TTL_MS + 5;
  assert.equal(typeof stale, 'number');
});
