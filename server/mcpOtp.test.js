import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtpGate } from './mcpOtp.js';
import { createMcpHandler } from './mcpHttp.js';
import { createMemoryOauthStore, createOauthService, s256 } from './mcpAuth.js';

const manager = {
  id: 'daniels',
  username: 'daniels',
  display_name: 'DanielS',
  role: 'MANAGER',
  tenant_id: 't',
  is_active: true
};

function gate(extra = {}) {
  const sent = [];
  const otp = createOtpGate({
    findManager: async (phone) => (phone === '0521111111' ? manager : null),
    sendSms: async (phone, code) => {
      sent.push({ phone, code });
      if (extra.failSend) throw Object.assign(new Error('down'), { status: 502 });
    },
    now: () => new Date('2026-10-23T06:00:00Z'),
    nextCode: () => '482193',
    ...extra
  });
  return { otp, sent };
}

test('a phone that is not a manager gets no SMS', async () => {
  const { otp, sent } = gate();
  const result = await otp.request('0500000000');
  assert.equal(result.accepted, true);
  assert.deepEqual(sent, []);
  assert.throws(() => otp.verify('0500000000', '482193'), /OTP_INVALID/);
});

test('the WhatsApp-only number is not texted', async () => {
  const { otp, sent } = gate();
  await otp.request('0548076123');
  assert.deepEqual(sent, []);
});

test('manager code approves once and is not reusable', async () => {
  const { otp, sent } = gate();
  await otp.request('972521111111');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].phone, '0521111111');
  const user = otp.verify('0521111111', '482193');
  assert.equal(user.id, 'daniels');
  assert.equal(user.phone, undefined);
  assert.throws(() => otp.verify('0506102416', '482193'), /OTP_INVALID/);
});

test('failed SMS does not leave an approved code', async () => {
  const { otp } = gate({ failSend: true });
  await assert.rejects(() => otp.request('0521111111'), /SMS_SEND_FAILED/);
  assert.throws(() => otp.verify('0521111111', '482193'), /OTP_INVALID/);
});

test('authorize page asks for a phone and does not ask for a password', async () => {
  const sent = [];
  const oauth = createOauthService({
    store: createMemoryOauthStore(),
    loopback: true,
    verifyStaff: async () => null
  });
  const client = oauth.register({ redirectUris: ['https://chatgpt.com/callback'], name: 'chatgpt' });
  const handler = createMcpHandler({
    oauth,
    otp: createOtpGate({
      findManager: async () => null,
      sendSms: async (phone, code) => sent.push({ phone, code }),
      nextCode: () => '111111'
    })
  });
  const headers = {};
  const res = {
    statusCode: 0,
    headers,
    body: '',
    setHeader(key, value) { headers[String(key).toLowerCase()] = value; },
    getHeader(key) { return headers[String(key).toLowerCase()]; },
    end(body) { this.body = body == null ? '' : String(body); }
  };
  await handler({
    method: 'POST',
    url: '/oauth/authorize',
    headers: { host: 'studio.example', 'x-forwarded-proto': 'https' },
    body: {
      step: 'send',
      phone: '0500000000',
      client_id: client.id,
      redirect_uri: 'https://chatgpt.com/callback',
      code_challenge: s256('verifier-verifier-verifier-verifier'),
      code_challenge_method: 'S256'
    }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /טלפון/);
  assert.equal(res.body.includes('סיסמה'), false);
  assert.equal(res.body.includes('111111'), false);
  assert.deepEqual(sent, []);
});
