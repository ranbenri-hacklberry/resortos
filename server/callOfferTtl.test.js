import test from 'node:test';
import assert from 'node:assert/strict';
import { CALL_OFFER_TTL_MS, offerIsAnswerable, offerTimeMs } from './callMe.js';

const now = Date.parse('2026-10-28T13:45:00Z');
const iso = (ms) => new Date(ms).toISOString();

test('TTL is 2 hours', () => assert.equal(CALL_OFFER_TTL_MS, 2 * 60 * 60 * 1000));
test('stale offer (>2h) is ignored', () => {
  const call = { requested_at: iso(now - 19 * 3600_000), offered: ['rani'] };
  assert.equal(offerIsAnswerable(call, 'rani', now), false);
});
test('fresh offer is answerable', () => {
  const call = { requested_at: iso(now - 30 * 60_000), offered: ['rani'] };
  assert.equal(offerIsAnswerable(call, 'rani', now), true);
});
test('per-caller offered_at wins over requested_at (re-offer refreshes)', () => {
  const call = { requested_at: iso(now - 5 * 3600_000), offered_at: { rani: iso(now - 10 * 60_000) } };
  assert.equal(offerTimeMs(call, 'rani'), now - 10 * 60_000);
  assert.equal(offerIsAnswerable(call, 'rani', now), true);
});
test('offer older than the caller\'s open menu (since) is not answerable; newer is', () => {
  const call = { requested_at: iso(now - 20 * 60_000) };
  assert.equal(offerIsAnswerable(call, 'rani', now, now - 5 * 60_000), false);
  assert.equal(offerIsAnswerable(call, 'rani', now, now - 60 * 60_000), true);
});
test('missing timestamps → not answerable', () => assert.equal(offerIsAnswerable({}, 'rani', now), false));
