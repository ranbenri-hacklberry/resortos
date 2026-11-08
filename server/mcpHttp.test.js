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

function priorityToken(handlerOauth) {
  const client = handlerOauth.register({ redirectUris: ['https://grok.com/callback'], name: 'grok' });
  return handlerOauth.issueCode({
    clientId: client.id,
    redirectUri: 'https://grok.com/callback',
    codeChallenge: s256('verifier-verifier-verifier-verifier'),
    method: 'S256',
    username: 'priority',
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

function tokenForUser(handlerOauth, username) {
  const client = handlerOauth.register({ redirectUris: ['https://grok.com/callback'], name: 'grok' });
  return handlerOauth.issueCode({
    clientId: client.id,
    redirectUri: 'https://grok.com/callback',
    codeChallenge: s256('verifier-verifier-verifier-verifier'),
    method: 'S256',
    username,
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
  const patchedBookings = new Map();
  const oauth = createOauthService({
    store: createMemoryOauthStore(),
    verifyStaff: async (username) => {
      if (username === 'daniel') return { id: 'daniel', username: 'daniel', role: 'MANAGER', display_name: 'דניאל שוקרון', tenant_id: 't', is_active: true };
      if (username === 'ran') return { id: 'ran', username: 'ran', role: 'MANAGER', display_name: 'רן', tenant_id: 't', is_active: true };
      if (username === 'natasha') return { id: 'natasha', username: 'natashamcp', role: 'MANAGER', display_name: 'נטשה', tenant_id: 't', is_active: true };
      if (username === 'adam') return { id: 'adam', username: 'adam', role: 'MANAGER', display_name: 'אדם', tenant_id: 't', is_active: true };
      if (username === 'priority') return { id: 'priority', username: 'priority', role: 'PRIORITY', display_name: 'פריוריטי', tenant_id: 't', is_active: true };
      return { id: 'h', username, role: 'HOUSEKEEPING', is_active: true };
    }
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
    loadCatalog: extra.loadCatalog || (async () => [{ id: 'k680', name: 'מול הנוף 1', property_id: 'mool', base_price_agorot: 120000 }]),
    loadUnits: async () => [{ id: 'k680', name: 'מול הנוף 1', operational_status: 'READY' }],
    loadBookings: extra.loadBookings || (async () => bookings),
    loadBookingById: extra.loadBookingById || (async (_user, id) => {
      if (patchedBookings.has(id)) return patchedBookings.get(id);
      return bookings.rows.find((row) => row.id === id) || null;
    }),
    patchBooking: extra.patchBooking || (async (_user, id, patch) => {
      calls.push({ action: 'patch', id, patch });
      const existing = patchedBookings.get(id) || bookings.rows.find((row) => row.id === id);
      const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
      patchedBookings.set(id, updated);
      return updated;
    }),
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
    loadStaff: extra.loadStaff || (async (id) => {
      if (id === 'priority') return { id: 'priority', role: 'PRIORITY', is_active: true, allowed_units: [] };
      if (id === 'adam') return { id: 'adam', role: 'MANAGER', is_active: true, allowed_units: [] };
      if (id === 'ran') return { id: 'ran', role: 'MANAGER', is_active: true, allowed_units: [] };
      if (id === 'natasha') return { id: 'natasha', role: 'MANAGER', is_active: true, allowed_units: [] };
      return { id: 'daniel', role: 'MANAGER', is_active: true, allowed_units: [] };
    }),
    refreshBanks: async () => {
      calls.push({ action: 'refresh' });
      return { connections: [{ providerId: 'fibi', status: 'FETCHING' }] };
    }
  });
  return { handler, oauth, calls, patchedBookings };
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
  assert.deepEqual(calls, [{ action: 'refresh' }]);
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

test('resortos_record_payment is listed for connected users', async () => {
  const { handler, oauth } = harness();
  const managerIssued = await managerToken(oauth);
  const managerList = await call(handler, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, managerIssued.access_token);
  const managerNames = managerList.json.result.tools.map((item) => item.name);
  assert.equal(managerNames.includes('resortos_record_payment'), true);

  const priorityIssued = await priorityToken(oauth);
  const priorityList = await call(handler, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, priorityIssued.access_token);
  const priorityNames = priorityList.json.result.tools.map((item) => item.name);
  assert.equal(priorityNames.includes('resortos_record_payment'), true);
  assert.equal(priorityNames.includes('resortos_guest_page'), true);
  assert.equal(priorityNames.includes('resortos_finance_refresh'), false);
});

test('resortos_record_payment records a payment and updates status', async () => {
  const { handler, oauth, calls } = harness();
  const issued = await managerToken(oauth);
  const result = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'resortos_record_payment',
      arguments: {
        booking_id: 'b1',
        amount_ils: 650,
        date: '2026-11-06',
        method: 'CARD',
        txn: '269149464',
        approval: '0834838',
        last4: '7717',
        collector: 'מנהל'
      }
    }
  }, issued.access_token);
  assert.equal(result.status, 200);
  const content = result.json.result.structuredContent;
  assert.equal(content.id, 'b1');
  assert.equal(content.recorded, true);
  assert.equal(content.receipts_ils, '1150.00');
  assert.equal(content.balance_ils, '650.00');
  assert.equal(content.payment_status, 'PARTIAL');

  assert.equal(calls.length, 1);
  const patch = calls[0];
  assert.equal(patch.action, 'patch');
  assert.equal(patch.id, 'b1');
  assert.equal(patch.patch.payment_status, 'PARTIAL');
  assert.equal(patch.patch.clearing_payments.length, 2);
});

test('resortos_record_payment returns 404 for unknown booking', async () => {
  const { handler, oauth } = harness();
  const issued = await managerToken(oauth);
  const result = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'resortos_record_payment',
      arguments: {
        booking_id: 'unknown_booking',
        amount_ils: 100,
        method: 'CASH'
      }
    }
  }, issued.access_token);
  assert.equal(result.status, 404);
  assert.equal(result.json.error, 'BOOKING_NOT_FOUND');
});

test('resortos_record_payment returns 400 for bad amount', async () => {
  const { handler, oauth } = harness();
  const issued = await managerToken(oauth);
  const result = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'resortos_record_payment',
      arguments: {
        booking_id: 'b1',
        amount_ils: -100,
        method: 'CASH'
      }
    }
  }, issued.access_token);
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'INVALID_AMOUNT');
});

test('resortos_record_payment is idempotent on replay', async () => {
  const { handler, oauth, calls } = harness();
  const issued = await managerToken(oauth);
  const args = {
    booking_id: 'b1',
    amount_ils: 650,
    date: '2026-11-06',
    method: 'CARD',
    txn: 'unique_txn_123',
    approval: '0834838'
  };
  const first = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'resortos_record_payment', arguments: args }
  }, issued.access_token);
  assert.equal(first.json.result.structuredContent.recorded, true);
  assert.equal(calls.length, 1);

  const second = await call(handler, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'resortos_record_payment', arguments: args }
  }, issued.access_token);
  assert.equal(second.json.result.structuredContent.idempotent, true);
  assert.equal(calls.length, 1);
});

test('resortos_record_payment updates payment_status to PAID when fully paid', async () => {
  const { handler, oauth, calls } = harness({
    loadBookingById: async (_user, id) => id === 'b2' ? {
      id: 'b2',
      unit_id: 'k680',
      guest_name: 'אורח',
      check_in_date: '2026-10-16',
      check_out_date: '2026-10-17',
      booking_status: 'CONFIRMED',
      payment_status: 'UNPAID',
      total_price_agorot: 100000,
      deposit_agorot: 0,
      clearing_payments: []
    } : null
  });
  const issued = await managerToken(oauth);
  const result = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'resortos_record_payment',
      arguments: {
        booking_id: 'b2',
        amount_ils: 1000,
        method: 'CARD'
      }
    }
  }, issued.access_token);
  assert.equal(result.status, 200);
  const content = result.json.result.structuredContent;
  assert.equal(content.payment_status, 'PAID');
  assert.equal(content.balance_ils, '0.00');
  assert.equal(calls[0].patch.payment_status, 'PAID');
});

test('resortos_record_payment rejects unauthenticated callers', async () => {
  const { handler } = harness();
  const result = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'resortos_record_payment',
      arguments: {
        booking_id: 'b1',
        amount_ils: 100,
        method: 'CASH'
      }
    }
  }, '');
  assert.equal(result.status, 401);
});

test('resortos_booking_contact allows Daniel, Ran, and Natasha and returns all contact fields', async () => {
  const sampleBookings = {
    rows: [
      {
        id: 'kin_76154',
        unit_id: 'k680',
        guest_name: 'יוסי סוויסה',
        guest_phone: '0541112233',
        guest_email: 'swissa@example.com',
        company_name: 'אלפא הייטק בע"מ',
        tax_id: '515998877',
        check_in_date: '2026-11-10',
        check_out_date: '2026-11-12',
        special_requests: 'kinorot:76154'
      }
    ],
    truncated: false
  };

  const { handler, oauth } = harness({
    loadBookings: async () => sampleBookings,
    loadCatalog: async () => [{ id: 'k680', name: 'Ⓐ29 מול הנוף · בקתה 1', property_id: 'mool' }]
  });

  for (const user of ['daniel', 'ran', 'natasha']) {
    const token = await tokenForUser(oauth, user);
    const result = await call(handler, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'resortos_booking_contact',
        arguments: {}
      }
    }, token.access_token);

    assert.equal(result.status, 200, `User ${user} should be authorized`);
    const page = result.json.result.structuredContent;
    assert.equal(page.count, 1);
    const item = page.items[0];

    // Guest full name
    assert.equal(item.guest_name, 'יוסי סוויסה');

    // Phone (E.164 + local format)
    assert.equal(item.phone.e164, '+972541112233');
    assert.equal(item.phone.local, '054-111-2233');
    assert.equal(item.phone_e164, '+972541112233');
    assert.equal(item.phone_local, '054-111-2233');

    // Email
    assert.equal(item.email, 'swissa@example.com');

    // Invoice name/company + ח.פ. if set
    assert.equal(item.invoice_details.company_name, 'אלפא הייטק בע"מ');
    assert.equal(item.invoice_details.tax_id, '515998877');
    assert.equal(item.invoice_details.formatted, 'אלפא הייטק בע"מ ח.פ. 515998877');
    assert.equal(item.company_name, 'אלפא הייטק בע"מ');
    assert.equal(item.tax_id, '515998877');

    // Booking id / kin id
    assert.equal(item.booking_id, 'kin_76154');
    assert.equal(item.id, 'kin_76154');
    assert.equal(item.kin_id, '76154');

    // Unit (Hebrew name)
    assert.equal(item.unit_id, 'k680');
    assert.equal(item.unit_name, 'Ⓐ29 מול הנוף · בקתה 1');

    // Dates
    assert.equal(item.check_in_date, '2026-11-10');
    assert.equal(item.check_out_date, '2026-11-12');
  }
});

test('resortos_booking_contact denies unauthorized managers and non-managers', async () => {
  const { handler, oauth } = harness();

  // Adam is a MANAGER, but not in authorized list (Ran, Daniel, Natasha)
  const adamToken = await tokenForUser(oauth, 'adam');
  const adamRes = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'resortos_booking_contact', arguments: {} }
  }, adamToken.access_token);
  assert.equal(adamRes.status, 403);

  // Priority user
  const priorityTokenObj = await priorityToken(oauth);
  const prioRes = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'resortos_booking_contact', arguments: {} }
  }, priorityTokenObj.access_token);
  assert.equal(prioRes.status, 403);
});

test('resortos_bookings with include_contact returns phone only to authorized managers', async () => {
  const sampleBookings = {
    rows: [
      {
        id: 'b10',
        unit_id: 'k680',
        guest_name: 'שרה כהן',
        guest_phone: '0529998877',
        guest_email: 'sara@example.com',
        check_in_date: '2026-11-10',
        check_out_date: '2026-11-12'
      }
    ],
    truncated: false
  };

  const { handler, oauth } = harness({
    loadBookings: async () => sampleBookings,
    loadCatalog: async () => [{ id: 'k680', name: 'מול הנוף 1', property_id: 'mool' }]
  });

  // 1. Authorized manager (Daniel) gets phone
  const danielToken = await tokenForUser(oauth, 'daniel');
  const authRes = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'resortos_bookings',
      arguments: { include_contact: true }
    }
  }, danielToken.access_token);
  assert.equal(authRes.status, 200);
  const authItem = authRes.json.result.structuredContent.items[0];
  assert.equal(authItem.phone.e164, '+972529998877');
  assert.equal(authItem.phone.local, '052-999-8877');
  assert.equal(authItem.email, 'sara@example.com');

  // 2. Unauthorized caller (Adam) gets NO phone
  const adamToken = await tokenForUser(oauth, 'adam');
  const unauthRes = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'resortos_bookings',
      arguments: { include_contact: true }
    }
  }, adamToken.access_token);
  assert.equal(unauthRes.status, 200);
  const unauthItem = unauthRes.json.result.structuredContent.items[0];
  assert.equal(unauthItem.phone, undefined);
  assert.equal(unauthItem.guest_phone, undefined);
  assert.equal(unauthItem.email, undefined);
});

test('resortos_booking_contact searches by Hebrew name spelling variants (סויסה / סוויסה)', async () => {
  const sampleBookings = {
    rows: [
      {
        id: 'b1',
        unit_id: 'k680',
        guest_name: 'יוסי סוויסה',
        guest_phone: '0541112233',
        check_in_date: '2026-11-10',
        check_out_date: '2026-11-12'
      },
      {
        id: 'b2',
        unit_id: 'k680',
        guest_name: 'משה סויסה',
        guest_phone: '0542223344',
        check_in_date: '2026-11-10',
        check_out_date: '2026-11-12'
      },
      {
        id: 'b3',
        unit_id: 'k680',
        guest_name: 'אבי כהן',
        guest_phone: '0543334455',
        check_in_date: '2026-11-10',
        check_out_date: '2026-11-12'
      }
    ],
    truncated: false
  };

  const { handler, oauth } = harness({
    loadBookings: async () => sampleBookings
  });
  const token = await tokenForUser(oauth, 'daniel');

  // Query "סויסה" (single vav) matches both "יוסי סוויסה" and "משה סויסה"
  const res1 = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'resortos_booking_contact',
      arguments: { name: 'סויסה' }
    }
  }, token.access_token);
  assert.equal(res1.status, 200);
  const items1 = res1.json.result.structuredContent.items;
  assert.equal(items1.length, 2);
  assert.deepEqual(items1.map((i) => i.id).sort(), ['b1', 'b2']);

  // Query "סוויסה" (double vav) also matches both
  const res2 = await call(handler, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'resortos_booking_contact',
      arguments: { name: 'סוויסה' }
    }
  }, token.access_token);
  assert.equal(res2.status, 200);
  const items2 = res2.json.result.structuredContent.items;
  assert.equal(items2.length, 2);
  assert.deepEqual(items2.map((i) => i.id).sort(), ['b1', 'b2']);
});

test('resortos_booking_contact searches by phone, kin_id, and dates', async () => {
  const sampleBookings = {
    rows: [
      {
        id: 'kin_76154',
        unit_id: 'k680',
        guest_name: 'אביגיל',
        guest_phone: '054-998-1122',
        check_in_date: '2026-11-05',
        check_out_date: '2026-11-07',
        special_requests: 'kinorot:76154'
      },
      {
        id: 'b20',
        unit_id: 'k680',
        guest_name: 'יונתן',
        guest_phone: '050-123-4567',
        check_in_date: '2026-11-20',
        check_out_date: '2026-11-22'
      }
    ],
    truncated: false
  };

  const { handler, oauth } = harness({
    loadBookings: async () => sampleBookings
  });
  const token = await tokenForUser(oauth, 'daniel');

  // Search by phone digits
  const resPhone = await call(handler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'resortos_booking_contact', arguments: { phone: '0549981122' } }
  }, token.access_token);
  assert.equal(resPhone.json.result.structuredContent.items.length, 1);
  assert.equal(resPhone.json.result.structuredContent.items[0].id, 'kin_76154');

  // Search by kin_id
  const resKin = await call(handler, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'resortos_booking_contact', arguments: { kin_id: '76154' } }
  }, token.access_token);
  assert.equal(resKin.json.result.structuredContent.items.length, 1);
  assert.equal(resKin.json.result.structuredContent.items[0].id, 'kin_76154');

  // Search by date range
  const resDate = await call(handler, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'resortos_booking_contact', arguments: { from: '2026-11-15', to: '2026-11-25' } }
  }, token.access_token);
  assert.equal(resDate.json.result.structuredContent.items.length, 1);
  assert.equal(resDate.json.result.structuredContent.items[0].id, 'b20');
});

test('resortos_booking_contact logs access with booking IDs without logging the phone number', async () => {
  const sampleBookings = {
    rows: [
      {
        id: 'b99',
        unit_id: 'k680',
        guest_name: 'יוסי',
        guest_phone: '0547778899',
        check_in_date: '2026-11-10',
        check_out_date: '2026-11-12'
      }
    ],
    truncated: false
  };

  const { handler, oauth } = harness({
    loadBookings: async () => sampleBookings
  });
  const token = await tokenForUser(oauth, 'daniel');

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(' '));
    originalLog(...args);
  };

  try {
    const res = await call(handler, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'resortos_booking_contact', arguments: {} }
    }, token.access_token);
    assert.equal(res.status, 200);

    // Verify audit log exists
    const auditLog = logs.find((l) => l.includes('tool=resortos_booking_contact'));
    assert.ok(auditLog, 'Audit log must be emitted');
    assert.ok(auditLog.includes('user=daniel'), 'Must include user');
    assert.ok(auditLog.includes('timestamp='), 'Must include timestamp');
    assert.ok(auditLog.includes('bookings=b99'), 'Must include booking id');

    // Strictly ensure phone is NEVER in the log
    assert.ok(!auditLog.includes('0547778899'), 'Phone must not be logged');
    assert.ok(!auditLog.includes('054-777-8899'), 'Phone must not be logged');
    assert.ok(!auditLog.includes('972547778899'), 'Phone must not be logged');
  } finally {
    console.log = originalLog;
  }
});

