import test from 'node:test';
import assert from 'node:assert/strict';
import { departuresAuthorized, parseDeparturesQuery, departureRow } from './checkoutDepartures.js';

const req = (h) => ({ headers: { get: (k) => h[k] ?? null } });
const TOKEN_RE = /^tok_[A-Za-z0-9_]+$/;

test('auth requires configured key and exact match', () => {
  assert.equal(departuresAuthorized(req({ 'x-resortos-departures-key': 'abc' }), {}), false);
  assert.equal(departuresAuthorized(req({ 'x-resortos-departures-key': 'abd' }), { CHECKOUT_DEPARTURES_KEY: 'abc' }), false);
  assert.equal(departuresAuthorized(req({ 'x-resortos-departures-key': 'abc' }), { CHECKOUT_DEPARTURES_KEY: 'abc' }), true);
});

test('query parsing', () => {
  assert.deepEqual(parseDeparturesQuery('https://x/api/checkout/departures?date=bad', TOKEN_RE), { error: 'DATE_REQUIRED' });
  const q = parseDeparturesQuery('https://x/api/checkout/departures?date=2026-10-22&tokens=tok_a,evil,tok_b', TOKEN_RE);
  assert.deepEqual(q, { date: '2026-10-22', tokens: ['tok_a', 'tok_b'] });
});

test('row filter + late overlay, no PII beyond phone', () => {
  const row = { id: 'b', checkout_token: 'tok_a', unit_id: 'k681', check_out_date: '2026-10-21', guest_name: 'X', total_price_agorot: 1, stay: { late_until: '11:00+1', folio: [1] } };
  const r = departureRow(row, '2026-10-22');
  assert.equal(r.stay.late_until, '11:00+1');
  assert.equal(r.guest_name, undefined); assert.equal(r.stay.folio, undefined);
  assert.equal(departureRow({ ...row, check_out_date: '2026-10-25' }, '2026-10-22'), null);
});
