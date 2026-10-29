import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createMcpHandler } from './mcpHttp.js';
import { createMemoryOauthStore, createOauthService, s256 } from './mcpAuth.js';
import { guestAccessCodes, guestPageUrl, lockboxVisibleToGuest, projectGuestPage } from '../src/lib/guestPageRead.js';
import { guestStayUrl } from '../src/lib/guestStayUrl.js';
import { CATALOG_LOCKBOX, RAMOT_GATE_CODE } from '../functions/lib/unitNames.js';

const booking = {
  id: 'b1',
  unit_id: 'k680',
  guest_name: 'אורח לדוגמה',
  guest_phone: '0500000000',
  check_in_date: '2026-10-25',
  check_out_date: '2026-10-27',
  booking_status: 'CONFIRMED',
  checkout_token: 'tok_test_guest',
  special_requests: '|tz:123456782|in:15:00|out:11:00',
  payment_status: 'PARTIAL',
  total_price_agorot: 180000,
  clearing_payments: [{ amount_agorot: 50000, last4: '4242' }]
};

function response() {
  const headers = {};
  return {
    statusCode: 0,
    headers,
    body: '',
    setHeader(key, value) { headers[String(key).toLowerCase()] = value; },
    getHeader(key) { return headers[String(key).toLowerCase()]; },
    end(body) { this.body = body == null ? '' : String(body); }
  };
}

function handlerFor({ role = 'MANAGER', rows = [booking] } = {}) {
  const oauth = createOauthService({
    store: createMemoryOauthStore(),
    verifyStaff: async (username) => ({
      id: username,
      username,
      role,
      display_name: username,
      tenant_id: 't',
      is_active: true
    })
  });
  const handler = createMcpHandler({
    oauth,
    loadStaff: async () => ({ id: 'staff', username: 'staff', role, is_active: true, allowed_units: [] }),
    loadGuestBookings: async (_user, query = {}) => {
      if (query.booking_id) return rows.filter((row) => row.id === query.booking_id);
      return rows;
    },
    loadCatalog: async () => [],
    loadUnits: async () => [],
    loadBookings: async () => ({ rows: [], truncated: false }),
    loadWorkLog: async () => [],
    loadProcedures: async () => [],
    loadDocuments: async () => [],
    loadExpenses: async () => [],
    loadBankOverview: async () => ({ connections: [], accounts: [] }),
    loadBankTransactions: async () => ({ items: [] }),
    refreshBanks: async () => ({ connections: [] })
  });
  return { handler, oauth };
}

async function tokenFor(oauth, username) {
  const client = oauth.register({ redirectUris: ['https://grok.com/callback'], name: 'grok' });
  const code = await oauth.issueCode({
    clientId: client.id,
    redirectUri: 'https://grok.com/callback',
    codeChallenge: s256('verifier-verifier-verifier-verifier'),
    method: 'S256',
    username,
    password: 'secret',
    resource: 'https://studio.example/mcp'
  });
  return oauth.exchange({
    code,
    verifier: 'verifier-verifier-verifier-verifier',
    clientId: client.id,
    redirectUri: 'https://grok.com/callback',
    resource: 'https://studio.example/mcp'
  });
}

async function call(handler, body, token) {
  const res = response();
  await handler({
    method: 'POST',
    url: '/mcp',
    headers: { host: 'studio.example', 'x-forwarded-proto': 'https', authorization: token ? `Bearer ${token}` : '' },
    body
  }, res);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
}

test('guest page matches the stay link and hides phone and payment', () => {
  const page = projectGuestPage(booking);
  assert.equal(page.guest_page_url, guestStayUrl('tok_test_guest'));
  assert.equal(page.guest_page_url, guestPageUrl('tok_test_guest'));
  assert.equal(page.access.door_code, CATALOG_LOCKBOX.k680);
  assert.equal(page.access.gate_code, RAMOT_GATE_CODE);
  assert.equal(page.access.visible_to_guest_now, false);
  assert.equal(page.house_rules.check_out_shabbat, '13:00');
  assert.equal(page.house_rules.late_checkout_motzash_ils, 250);
  assert.equal(page.call_button, readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8').match(/"INSTAY_CALL_ME":\s*"([^"]+)"/)[1]);
  assert.equal(page.unit_name.includes('מול הנוף'), true);
  const encoded = JSON.stringify(page);
  assert.equal(encoded.includes('0500000000'), false);
  assert.equal(encoded.includes('4242'), false);
  assert.equal(encoded.includes('123456782'), false);
  assert.equal(encoded.includes('total_price'), false);
  assert.equal(encoded.includes('guest_phone'), false);
  const checkedIn = projectGuestPage({ ...booking, booking_status: 'CHECKED_IN' });
  assert.equal(checkedIn.access.visible_to_guest_now, true);
  assert.equal(lockboxVisibleToGuest(booking), false);
});

test('a booking code wins, and an empty stay uses the unit code', async () => {
  const ownStay = { door_pin: '9001', gate_code: '#1111' };
  const own = projectGuestPage({ ...booking, id: 'own', stay: ownStay });
  const plain = projectGuestPage({ ...booking, id: 'plain', stay: { door_pin: '', gate_code: '' } });
  assert.deepEqual(guestAccessCodes({ ...booking, stay: ownStay }), {
    door_code: '9001',
    gate_code: '#1111',
    gate_mode: 'code'
  });
  assert.equal(own.access.door_code, '9001');
  assert.equal(own.access.gate_code, '#1111');
  assert.equal(plain.access.door_code, CATALOG_LOCKBOX.k680);
  assert.equal(plain.access.gate_code, RAMOT_GATE_CODE);
  const hill = projectGuestPage({ ...booking, id: 'hill', unit_id: 'hill-1', stay: {} });
  assert.equal(hill.access.gate_code, '');
  assert.ok(hill.access.door_code);
  assert.notEqual(hill.access.door_code, '9001');

  const { handler, oauth } = handlerFor({
    rows: [
      { ...booking, id: 'own', stay: ownStay },
      { ...booking, id: 'plain', stay: {} }
    ]
  });
  const issued = await tokenFor(oauth, 'rani');
  for (const name of ['resortos_guest_page', 'resortos_guest_page_print']) {
    const withCodes = await call(handler, {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name, arguments: { booking_id: 'own' } }
    }, issued.access_token);
    const without = await call(handler, {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name, arguments: { booking_id: 'plain' } }
    }, issued.access_token);
    assert.equal(withCodes.json.result.structuredContent.access.door_code, '9001');
    assert.equal(withCodes.json.result.structuredContent.access.gate_code, '#1111');
    assert.equal(without.json.result.structuredContent.access.door_code, CATALOG_LOCKBOX.k680);
    assert.equal(without.json.result.structuredContent.access.gate_code, RAMOT_GATE_CODE);
  }
});

test('the call button text is the guest page label', () => {
  const source = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
  const label = source.match(/"INSTAY_CALL_ME":\s*"([^"]+)"/)[1];
  assert.equal(projectGuestPage(booking).call_button, label);
});

test('a manager can read a guest page and a missing booking is 404', async () => {
  const { handler, oauth } = handlerFor();
  const issued = await tokenFor(oauth, 'rani');
  const found = await call(handler, {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'resortos_guest_page', arguments: { booking_id: 'b1' } }
  }, issued.access_token);
  assert.equal(found.status, 200);
  const page = found.json.result.structuredContent;
  assert.equal(page.guest_page_url, 'https://resortos.app/stay/tok_test_guest');
  assert.equal(JSON.stringify(page).includes('0500000000'), false);
  const missing = await call(handler, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'resortos_guest_page', arguments: { booking_id: 'missing' } }
  }, issued.access_token);
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error, 'NOT_FOUND');
});

test('an operations manager is forbidden and Priority can read only the guest page', async () => {
  const ops = handlerFor({ role: 'OPS_MANAGER' });
  await assert.rejects(() => tokenFor(ops.oauth, 'barak'), (err) => err.status === 403);
  const priority = handlerFor({ role: 'PRIORITY' });
  const issued = await tokenFor(priority.oauth, 'zuki');
  const listed = await call(priority.handler, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, issued.access_token);
  const names = listed.json.result.tools.map((item) => item.name);
  assert.deepEqual(names, ['resortos_guest_page', 'resortos_guest_page_print']);
  const page = await call(priority.handler, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'resortos_guest_page', arguments: { booking_id: 'b1' } }
  }, issued.access_token);
  assert.equal(page.status, 200);
  const money = await call(priority.handler, {
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'resortos_booking_money', arguments: {} }
  }, issued.access_token);
  assert.equal(money.status, 403);
  assert.equal(money.json.error, 'FORBIDDEN');
});

test('there is no guest-page print url', async () => {
  const { handler, oauth } = handlerFor();
  const issued = await tokenFor(oauth, 'rani');
  const printed = await call(handler, {
    jsonrpc: '2.0', id: 4, method: 'tools/call',
    params: { name: 'resortos_guest_page_print', arguments: { booking_id: 'b1' } }
  }, issued.access_token);
  const body = printed.json.result.structuredContent;
  assert.equal(body.print_url, null);
  assert.match(body.reason, /work-order\.html/);
  assert.equal(body.guest_page_url, 'https://resortos.app/stay/tok_test_guest');
});

test('a date range lists links without codes', async () => {
  const { handler, oauth } = handlerFor();
  const issued = await tokenFor(oauth, 'rani');
  const listed = await call(handler, {
    jsonrpc: '2.0', id: 5, method: 'tools/call',
    params: { name: 'resortos_guest_page', arguments: { from: '2026-10-01', to: '2026-10-31' } }
  }, issued.access_token);
  const item = listed.json.result.structuredContent.items[0];
  assert.equal(item.booking_id, 'b1');
  assert.equal(item.guest_page_url, 'https://resortos.app/stay/tok_test_guest');
  assert.equal(item.print_url, null);
  assert.equal(Object.hasOwn(item, 'access'), false);
});

test('a live guest page url opens the same booking', { skip: process.env.RESORTOS_LIVE_GUEST_PAGE !== '1' }, async () => {
  const { loadGuestBookings } = await import('./mcpData.js');
  const rows = await loadGuestBookings(
    { id: 'live', role: 'MANAGER', is_active: true, tenant_id: '22222222-2222-2222-2222-222222222222' },
    { from: '2026-10-25', to: '2026-10-25' }
  );
  const row = rows.find((item) => item.checkout_token && item.guest_name);
  assert.ok(row);
  const url = guestPageUrl(row.checkout_token);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  const api = await fetch(`https://resortos.app/api/checkout/${encodeURIComponent(row.checkout_token)}`);
  assert.equal(api.status, 200);
  const body = await api.json();
  assert.equal(body.id, row.id);
  assert.equal(String(body.guest_name || '').includes(String(row.guest_name).split(/\s+/)[0]), true);
});
