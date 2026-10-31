// Ran 2026-10-31: Kinorot sync must not mark CHECKED_OUT by date on checkout day; Chloe's guest_message reuses
// the self-checkout write path. All network is stubbed; no DB, no SMS.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'http://fake.invalid';
process.env.MICROPAY_TOKEN = '';
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? String(opts.body) : '' });
  return new Response(JSON.stringify([{ id: 'kin_t' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const sync = await import('./syncKinorotCalendar.js');
const comms = await import('./guestComms.js');

const row = (cin, cout) => ({ place: '808', resid: '1', unitId: 'k808', guest: 'Test', cin, cout, adults: 2, children: 0, infants: 0 });

test('sync: checkout today stays CONFIRMED (no date-based CHECKED_OUT)', () => {
  assert.equal(sync.kinorotBookingStatus('', '2026-10-30', '2026-10-31', '2026-10-31'), 'CONFIRMED');
  assert.equal(sync.kinorotBookingRow(row('2026-10-30', '2026-10-31'), '2026-10-31').booking_status, 'CONFIRMED');
});

test('sync SQL: update keeps CHECKED_OUT/CHECKED_IN, no date rule; closePast is strictly < today with auto_closed', () => {
  const r = sync.kinorotBookingRow(row('2026-10-30', '2026-10-31'), '2026-10-31');
  const sql = sync.kinorotBuildSql([r], '2026-10-31');
  assert.match(sql, /booking_status IN \('CHECKED_OUT', 'CHECKED_IN'\) THEN public\.hotelos_bookings\.booking_status/);
  assert.doesNotMatch(sql, /EXCLUDED\.check_out_date <= /);
  assert.doesNotMatch(sql, /check_out_date <= '2026-10-31'/);
  const close = sql.slice(sql.indexOf("SET booking_status = 'CHECKED_OUT'"));
  assert.match(close, /checkout_status = 'auto_closed'/);
  assert.match(close, /checked_out_at = COALESCE\(checked_out_at, now\(\)\)/);
  assert.match(close, /check_out_date < '2026-10-31'/);
  assert.match(close, /booking_status IN \('CHECKED_IN', 'CONFIRMED', 'PENDING'\)/); // never touches/reopens CHECKED_OUT
  assert.doesNotMatch(sql, /THEN 'CONFIRMED'/); // nothing reopens a CHECKED_OUT row
});

test('markBookingSelfDeparted: guest_message status + never overwrites an existing checkout', async () => {
  calls.length = 0;
  await comms.markBookingSelfDeparted('kin_t', '2026-10-31T09:05:00.000Z', 'guest_message');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /hotelos_bookings\?id=eq\.kin_t&booking_status=neq\.CHECKED_OUT$/);
  const body = JSON.parse(calls[0].body);
  assert.deepEqual([body.booking_status, body.checkout_status, body.checked_out_at], ['CHECKED_OUT', 'guest_message', '2026-10-31T09:05:00.000Z']);
});

test('markBookingSelfDeparted: default stays self_departed, unknown source falls back', async () => {
  calls.length = 0;
  await comms.markBookingSelfDeparted('kin_t', '2026-10-31T09:05:00.000Z');
  await comms.markBookingSelfDeparted('kin_t', '2026-10-31T09:05:00.000Z', 'auto_closed');
  for (const c of calls) {
    assert.doesNotMatch(c.url, /neq\.CHECKED_OUT/);
    assert.equal(JSON.parse(c.body).checkout_status, 'self_departed');
  }
});

test('side effects via Chloe (guest_message): marks departed, no farewell SMS', async () => {
  calls.length = 0;
  await comms.handleSelfCheckoutSideEffects({ id: 'kin_t', unit_id: 'k808', guest_phone: '0545550031', checkout_source: 'guest_message', checked_out_at: '2026-10-31T09:05:00.000Z' });
  const patch = calls.find((c) => c.method === 'PATCH' && /hotelos_bookings\?id=eq\.kin_t/.test(c.url));
  assert.ok(patch);
  assert.equal(JSON.parse(patch.body).checkout_status, 'guest_message');
  assert.equal(calls.some((c) => /micropay|guest_communications/i.test(c.url)), false);
});
