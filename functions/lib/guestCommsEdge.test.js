import assert from 'node:assert/strict';
import test from 'node:test';
import { handleGuestComms, signDashboardSession } from './guestCommsEdge.js';

const env = { CHECKOUT_MAILBOX_SECRET: 'test-secret' };

function memoryDb(seed = {}) {
  const comms = [...(seed.comms || [])];
  const bookings = [...(seed.bookings || [])];
  const automation = [...(seed.automation || [])];
  return {
    comms,
    async db(path, options = {}) {
      const [table, query = ''] = String(path).split('?');
      const params = new URLSearchParams(query);
      if (table === 'guest_communications' && (!options.method || options.method === 'GET')) {
        const bookingId = params.get('booking_id')?.replace(/^eq\./, '');
        return comms
          .filter((row) => !bookingId || row.booking_id === bookingId)
          .slice()
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      }
      if (table === 'guest_communications' && options.method === 'POST') {
        const row = {
          id: `c${comms.length + 1}`,
          created_at: '2026-11-06T12:00:00.000Z',
          ...options.body
        };
        comms.push(row);
        return [row];
      }
      if (table === 'hotelos_bookings') {
        const id = params.get('id')?.replace(/^eq\./, '');
        return bookings.filter((row) => row.id === id).slice(0, 1);
      }
      if (table === 'chat_automation_state' && options.method === 'POST') {
        automation.push(options.body);
        return [options.body];
      }
      if (table === 'chat_automation_state') return automation;
      throw new Error(`unexpected ${table} ${options.method || 'GET'}`);
    }
  };
}

async function authed(path, { method = 'GET', body, user = { username: 'max', display_name: 'מקס', role: 'MANAGER' } } = {}) {
  const token = await signDashboardSession(env, user);
  return new Request(`https://resortos.app/api/guest-comms${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

test('dashboard guest-comms rejects a missing session', async () => {
  const response = await handleGuestComms({
    request: new Request('https://resortos.app/api/guest-comms?booking_id=b1'),
    env,
    params: {}
  }, memoryDb());
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'UNAUTHORIZED');
});

test('dashboard list returns desk outbound SMS from the same table', async () => {
  const store = memoryDb({
    comms: [
      {
        id: 'in1',
        booking_id: 'b1',
        direction: 'inbound',
        channel: 'whatsapp',
        content: 'היי',
        created_at: '2026-11-06T10:00:00.000Z'
      },
      {
        id: 'sms1',
        booking_id: 'b1',
        direction: 'outbound',
        channel: 'sms',
        content: 'קישור לדף האורח',
        status: 'sent',
        created_at: '2026-11-06T11:00:00.000Z',
        metadata: { kind: 'stay_link', actor: 'desk' }
      }
    ]
  });
  const response = await handleGuestComms({
    request: await authed('?booking_id=b1'),
    env,
    params: { path: [] }
  }, store);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.rows.length, 2);
  assert.equal(body.rows[1].direction, 'outbound');
  assert.equal(body.rows[1].channel, 'sms');
});

test('dashboard SMS send is stored as outbound in guest_communications', async () => {
  const store = memoryDb({
    bookings: [{ id: 'b1', tenant_id: null, guest_phone: '0500000000', unit_id: 'k681', checkout_token: '' }]
  });
  const sent = [];
  const response = await handleGuestComms({
    request: await authed('/send', {
      method: 'POST',
      body: { booking_id: 'b1', channel: 'sms', kind: 'manual', message: 'שלום מהדשבורד' }
    }),
    env,
    params: { path: ['send'] }
  }, {
    ...store,
    async sendSms(_env, phone, message) {
      sent.push({ phone, message });
    }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.row.direction, 'outbound');
  assert.equal(body.row.channel, 'sms');
  assert.equal(body.row.status, 'sent');
  assert.equal(body.row.content, 'שלום מהדשבורד');
  assert.equal(body.row.metadata.actor, 'max');
  assert.deepEqual(sent, [{ phone: '0500000000', message: 'שלום מהדשבורד' }]);

  const listed = await handleGuestComms({
    request: await authed('?booking_id=b1'),
    env,
    params: {}
  }, store);
  const rows = (await listed.json()).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].direction, 'outbound');
});

test('a failed SMS is still stored so the thread shows it', async () => {
  const store = memoryDb({
    bookings: [{ id: 'b1', guest_phone: '0500000000', unit_id: 'k681' }]
  });
  const response = await handleGuestComms({
    request: await authed('/send', {
      method: 'POST',
      body: { booking_id: 'b1', message: 'לא נשלח', channel: 'sms' }
    }),
    env,
    params: { path: ['send'] }
  }, {
    ...store,
    async sendSms() {
      const err = new Error('SMS_FAILED');
      err.status = 502;
      throw err;
    }
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.row.direction, 'outbound');
  assert.equal(body.row.status, 'failed');
  assert.equal(store.comms.length, 1);
});

test('stay-link SMS is not sent when mailbox publish fails', async () => {
  const store = memoryDb({
    bookings: [{ id: 'b1', guest_phone: '0500000000', unit_id: 'k681', checkout_token: 'tok_abc' }]
  });
  let sent = 0;
  const response = await handleGuestComms({
    request: await authed('/send', {
      method: 'POST',
      body: { booking_id: 'b1', channel: 'sms', template_id: 'checkin', kind: 'stay_link' }
    }),
    env,
    params: { path: ['send'] }
  }, {
    ...store,
    async publish() {
      const err = new Error('down');
      err.status = 502;
      throw err;
    },
    async sendSms() { sent += 1; }
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'PUBLISH_FAILED');
  assert.equal(sent, 0);
  assert.equal(store.comms[0].status, 'failed');
  assert.equal(store.comms[0].direction, 'outbound');
});
