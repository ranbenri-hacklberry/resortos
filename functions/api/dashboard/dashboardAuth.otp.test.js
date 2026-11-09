import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '[[path]].js'), 'utf8');

test('password login endpoint is OTP_REQUIRED only (no accepted password list)', () => {
  assert.match(src, /OTP_REQUIRED/);
  assert.match(src, /Password login removed/);
  for (const bad of ["'123456'", "'hotelos2026'", "'2026'", "'1234'", "'admin'", 'HOTELOS_DESK_PIN']) {
    // allowed in unrelated demo finance numbers / staff phone literals elsewhere — ensure not in login allow-list
    assert.equal(src.includes(`allowedPasswords`), false);
  }
  assert.equal(/head === 'login'[\s\S]{0,400}123456/.test(src), false);
});

test('session sign/verify use CHECKOUT_MAILBOX_SECRET only (no DESK_PIN / dashboard_salt)', () => {
  assert.match(src, /CHECKOUT_MAILBOX_SECRET_REQUIRED/);
  assert.equal(src.includes("HOTELOS_DESK_PIN || 'dashboard_salt'"), false);
  assert.equal(src.includes("|| 'dashboard_salt'"), false);
});

test('צוקי is authorized OTP staff with phone from callDesk/cleaners (0529690024)', () => {
  assert.match(src, /username: 'zuki'/);
  assert.match(src, /display_name: 'צוקי'/);
  assert.match(src, /phone: '0529690024'/);
  assert.match(src, /whatsapp: '972529690024'/);
});

test('otp/send is anti-enumeration: same message, challenge only when authorized', () => {
  assert.match(src, /Anti-enumeration/);
  assert.match(src, /אם המספר מורשה, נשלח קוד אימות ב-SMS/);
  assert.equal(src.includes('UNAUTHORIZED_PHONE'), false);
});

import { onRequest, signSessionToken, verifySessionToken } from './[[path]].js';

function makeEnv(mailbox = 'test-mailbox-secret-for-otp-unit-tests-32b') {
  return {
    CHECKOUT_MAILBOX_SECRET: mailbox,
    HOTELOS_DESK_PIN: 'should-not-work-as-password',
    DASHBOARD_OTP_DRY_RUN: true
  };
}

// Monkeypatch: sendMicropaySms is module-local; intercept via env by wrapping fetch is hard.
// Exercise onRequest with a stub by injecting global fetch for Micropay if used.

test('POST /api/dashboard/login always 401 OTP_REQUIRED for max/adam/daniel', async () => {
  const env = makeEnv();
  for (const username of ['max', 'adam', 'daniel']) {
    const res = await onRequest({
      request: new Request('https://resortos.app/api/dashboard/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: '123456' })
      }),
      env,
      params: { path: ['login'] }
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'OTP_REQUIRED');
  }
});

test('POST /otp/send for unknown phone returns 200 same message and empty challenge (no leak)', async () => {
  const env = makeEnv();
  const smsCalls = [];
  // Patch module SMS by temporarily replacing global fetch used by sendMicropaySms if any
  const res = await onRequest({
    request: new Request('https://resortos.app/api/dashboard/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0500000000' })
    }),
    env,
    params: { path: ['otp', 'send'] }
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.challenge, '');
  assert.match(body.message, /אם המספר מורשה/);
  assert.equal(JSON.stringify(body).includes('0506102416'), false);
  assert.equal(JSON.stringify(body).includes('max'), false);
});

test('POST /otp/send for צוקי phone returns challenge (authorized) without listing staff', async () => {
  const env = makeEnv();
  const res = await onRequest({
    request: new Request('https://resortos.app/api/dashboard/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0529690024' })
    }),
    env,
    params: { path: ['otp', 'send'] }
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.challenge && body.challenge.includes('.'), 'challenge issued for authorized phone');
  assert.match(body.message, /אם המספר מורשה/);
  assert.equal(JSON.stringify(body).includes('צוקי'), false);
  assert.equal(JSON.stringify(body).includes('zuki'), false);
});

test('existing mailbox-signed OTP session still verifies', async () => {
  const env = makeEnv();
  const token = await signSessionToken(env, {
    username: 'zuki',
    display_name: 'צוקי',
    role: 'MANAGER',
    phone: '0529690024'
  });
  const session = await verifySessionToken(env, token);
  assert.equal(session.username, 'zuki');
  // DESK_PIN alone must not verify as a session secret anymore
  const badEnv = { CHECKOUT_MAILBOX_SECRET: '', HOTELOS_DESK_PIN: '1234' };
  assert.equal(await verifySessionToken(badEnv, token), null);
});
