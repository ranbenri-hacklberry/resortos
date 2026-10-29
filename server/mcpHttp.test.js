import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpHandler } from './mcpHttp.js';
import { createMemoryOauthStore, createOauthService, s256 } from './mcpAuth.js';

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

function managerToken(handlerOauth) {
  const client = handlerOauth.register({ redirectUris: ['https://grok.com/callback'], name: 'grok' });
  return handlerOauth.issueCode({
    clientId: client.id,
    redirectUri: 'https://grok.com/callback',
    codeChallenge: s256('verifier-verifier-verifier-verifier'),
    method: 'S256',
    username: 'daniel',
    password: 'secret',
    resource: 'https://studio.example/mcp'
  }).then((code) => handlerOauth.exchange({
    code,
    verifier: 'verifier-verifier-verifier-verifier',
    clientId: client.id,
    redirectUri: 'https://grok.com/callback',
    resource: 'https://studio.example/mcp'
  }));
}

function harness(extra = {}) {
  const calls = [];
  const oauth = createOauthService({
    store: createMemoryOauthStore(),
    verifyStaff: async (username) => (
      username === 'daniel'
        ? { id: 'daniel', username: 'daniel', role: 'MANAGER', display_name: 'דניאל', tenant_id: 't', is_active: true }
        : { id: 'h', username, role: 'HOUSEKEEPING', is_active: true }
    )
  });
  const bookings = {
    rows: [{
      id: 'b1',
      unit_id: 'k680',
      guest_name: 'אורח',
      guest_phone: '0500000000',
      check_in_date: '2026-10-16',
      check_out_date: '2026-10-17',
      booking_status: 'CONFIRMED',
      payment_status: 'PARTIAL',
      total_price_agorot: 180000,
      deposit_agorot: 0,
      clearing_payments: [{ amount_agorot: 50000, source: 'CASH', last4: '4242' }],
      special_requests: '|tz:123456782'
    }],
    truncated: false
  };
  const handler = createMcpHandler({
    oauth,
    now: () => new Date('2026-10-23T06:00:00Z'),
    loadCatalog: async () => [{ id: 'k680', name: 'מול הנוף 1', property_id: 'mool', base_price_agorot: 120000 }],
    loadUnits: async () => [{ id: 'k680', name: 'מול הנוף 1', operational_status: 'READY' }],
    loadBookings: extra.loadBookings || (async () => bookings),
    loadWorkLog: async () => [],
    loadProcedures: async () => [{ id: 'sop1', domain: 'ניקיון', title: 'יציאה', steps: ['מיטות'] }],
    loadDocuments: async () => [{ id: 'doc1', title: 'נוהל', html: '<p>שלום</p>', updatedAt: '2026-10-01' }],
    loadExpenses: async () => [{ id: 'e1', supplier: 'ספק', invoice_no: '9', date: '2026-10-02', subtotal: 100, vat: 18, total: 118, paid: true }],
    loadBankOverview: async () => ({
      userId: 'secret-user',
      connections: [{ id: 'c1', providerId: 'fibi', status: 'ACTIVE', accounts: 1, cards: 1, loans: 0 }],
      accounts: [{ id: 'a1', accountType: 'CARD', currency: 'ILS', accountNumber: '4580123412341234', parsedAccount: { number: '395140' }, displayBalance: { amount: 12.5, currency: 'ILS' } }]
    }),
    loadBankTransactions: async () => ({ items: [{ id: 'tx1', amount: 12.5, currency: 'ILS', transactionDate: '2026-10-20' }], nextPage: null }),
    loadStaff: async () => ({ id: 'daniel', role: 'MANAGER', is_active: true, allowed_units: [] }),
    refreshBanks: async () => {
      calls.push('refresh');
      return { connections: [{ providerId: 'fibi', status: 'FETCHING' }] };
    }
  });
  return { handler, oauth, calls };
}

async function call(handler, body, token) {
  const res = response();
  await handler({
    method: 'POST',
    url: '/mcp',
    headers: {
      host: 'studio.example',
      'x-forwarded-proto': 'https',
      authorization: token ? `Bearer ${token}` : ''
    },
    body
  }, res);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null, headers: res.headers };
}

test('mcp rejects a caller without a manager token', async () => {
  const { handler } = harness();
  const res = response();
  await handler({ method: 'POST', url: '/mcp', headers: { host: 'studio.example', 'x-forwarded-proto': 'https' }, body: { jsonrpc: '2.0', id: 1, method: 'initialize' } }, res);
  assert.equal(res.statusCode, 401);
  assert.match(res.headers['www-authenticate'], /oauth-protected-resource/);
});

test('manager can list tools, read money, and refresh once', async () => {
  const { handler, oauth, calls } = harness();
  const issued = await managerToken(oauth);
  const listed = await call(handler, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, issued.access_token);
  const names = listed.json.result.tools.map((item) => item.name);
  assert.equal(names.includes('resortos_finance_refresh'), true);
  assert.equal(names.includes('resortos_http'), false);
  const money = await call(handler, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'resortos_booking_money', arguments: { property_id: 'mool' } }
  }, issued.access_token);
  const payload = money.json.result.structuredContent;
  assert.equal(payload.items[0].booking_value_ils, '1800.00');
  assert.equal(payload.items[0].receipts_ils, '500.00');
  assert.equal(JSON.stringify(payload).includes('0500000000'), false);
  assert.equal(JSON.stringify(payload).includes('4242'), false);
  assert.equal(JSON.stringify(payload).includes('123456782'), false);
  const banks = await call(handler, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'resortos_bank_accounts', arguments: {} } }, issued.access_token);
  const encoded = JSON.stringify(banks.json.result.structuredContent);
  assert.equal(encoded.includes('secret-user'), false);
  assert.equal(encoded.includes('395140'), false);
  assert.match(encoded, /••••5140/);
  const refreshed = await call(handler, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'resortos_finance_refresh', arguments: {} } }, issued.access_token);
  assert.equal(refreshed.json.result.structuredContent.refreshed, true);
  const limited = await call(handler, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'resortos_finance_refresh', arguments: {} } }, issued.access_token);
  assert.equal(limited.json.error.message, 'RATE_LIMIT');
  assert.deepEqual(calls, ['refresh']);
  const blocked = await call(handler, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'resortos_send_sms', arguments: {} } }, issued.access_token);
  assert.equal(blocked.json.error.message, 'UNKNOWN_TOOL');
});

test('booking tools pass the date window into the loader', async () => {
  const seen = [];
  const { handler, oauth } = harness({
    loadBookings: async (_user, query) => {
      seen.push(query);
      return { rows: [], truncated: query.to === '2026-01-01' };
    }
  });
  const issued = await managerToken(oauth);
  const args = { from: '2026-02-01', to: '2026-02-28', property_id: 'kinorot', unit_id: 'k811' };
  const bookings = await call(handler, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'resortos_bookings', arguments: args }
  }, issued.access_token);
  const money = await call(handler, {
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'resortos_booking_money', arguments: args }
  }, issued.access_token);
  const summary = await call(handler, {
    jsonrpc: '2.0', id: 4, method: 'tools/call',
    params: { name: 'resortos_finance_summary', arguments: { from: '2026-08-30', to: '2026-10-24', property_id: 'kinorot' } }
  }, issued.access_token);
  const stopped = await call(handler, {
    jsonrpc: '2.0', id: 5, method: 'tools/call',
    params: { name: 'resortos_bookings', arguments: { to: '2026-01-01' } }
  }, issued.access_token);
  assert.deepEqual(seen, [
    { from: '2026-02-01', to: '2026-02-28', property_id: 'kinorot', unit_id: 'k811' },
    { from: '2026-02-01', to: '2026-02-28', property_id: 'kinorot', unit_id: 'k811' },
    { from: '2026-08-30', to: '2026-10-24', property_id: 'kinorot', unit_id: '' },
    { from: '', to: '2026-01-01', property_id: '', unit_id: '' }
  ]);
  assert.equal(bookings.json.result.structuredContent.source_complete, true);
  assert.equal(money.json.result.structuredContent.source_complete, true);
  assert.equal(summary.json.result.structuredContent.complete, true);
  assert.equal(stopped.json.result.structuredContent.source_complete, false);
});

test('resortos_bookings exposes birthday and upsell fields in structuredContent', async () => {
  const { handler, oauth } = harness({
    loadBookings: async () => ({
      rows: [{
        id: 'b-party',
        property_id: 'mool',
        unit_id: 'k680',
        guest_name: 'יעל כהן',
        guest_phone: '0501234567',
        check_in_date: '2026-10-20',
        check_out_date: '2026-10-22',
        booking_status: 'CONFIRMED',
        is_birthday: true,
        birthday_note: 'עוגת יום הולדת ובלונים',
        upsell_description: 'ארוחת בוקר זוגית',
        upsell_price: 180.00
      }],
      truncated: false
    })
  });
  const issued = await managerToken(oauth);
  const response = await call(handler, {
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: { name: 'resortos_bookings', arguments: {} }
  }, issued.access_token);
  const items = response.json.result.structuredContent.items;
  assert.equal(items.length, 1);
  assert.equal(items[0].is_birthday, true);
  assert.equal(items[0].birthday_note, 'עוגת יום הולדת ובלונים');
  assert.equal(items[0].upsell_description, 'ארוחת בוקר זוגית');
  assert.equal(items[0].upsell_price, 180.00);
});

test('discovery document advertises the owner scope', async () => {
  const { handler } = harness();
  const res = response();
  await handler({ method: 'GET', url: '/.well-known/oauth-authorization-server', headers: { host: 'studio.example', 'x-forwarded-proto': 'https' } }, res);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.scopes_supported, ['resortos:owner']);
  assert.deepEqual(body.code_challenge_methods_supported, ['S256']);
  assert.equal(body.authorization_response_iss_parameter_supported, true);
});
