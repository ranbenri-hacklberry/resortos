import test from 'node:test';
import assert from 'node:assert/strict';
import { filterUnassignedPendingMatches, isUnassignedPendingMatch, linkedDealIdsFromSeen } from './cardcomPendingFilter.js';

// Snapshot of the 11 live pending rows (2026-11-09), trimmed to the relevant fields.
const live = [
  { deal_id: '268711314', amount: 500, status: 'pending', document_number: '2' },
  { deal_id: '268827530', amount: 900, status: 'pending', document_number: '3' },
  { deal_id: '269051534', amount: 180, status: 'pending', document_number: null },
  { deal_id: '269058034', amount: 180, status: 'pending', document_number: null },
  { deal_id: '269066327', amount: 1, status: 'pending', document_number: '5', is_test: false },
  { deal_id: '269231434', amount: 1400, status: 'pending', document_number: null },
  { deal_id: '269231462', amount: 200, status: 'pending', document_number: '8' },
  { deal_id: '269231488', amount: 700, status: 'pending', document_number: '9' },
  { deal_id: '269335582', amount: 600, status: 'pending', document_number: null },
  { deal_id: '269337493', amount: 500, status: 'pending', document_number: null },
  { deal_id: '269350928', amount: 500, status: 'pending', document_number: null },
  { deal_id: '268657792', amount: 1, status: 'test', document_number: '1' }
];
const seen = [
  { deal_id: '269231462', status: 'linked', linked_booking_id: 'kin_691_75491' },
  { deal_id: '269231488', status: 'linked', linked_booking_id: 'kin_691_75491' },
  { deal_id: '269231434', status: 'seen', linked_booking_id: null }
];

test('only deals with no booking and no document stay unassigned (live snapshot)', () => {
  const out = filterUnassignedPendingMatches(live, { linkedDealIds: linkedDealIdsFromSeen(seen) }).map((m) => m.deal_id);
  assert.deepEqual(out, ['269051534', '269058034', '269231434', '269335582', '269337493', '269350928']);
});

test('LowProfile/payment-link deal with a Cardcom document is not unassigned', () => {
  assert.equal(isUnassignedPendingMatch({ deal_id: '1', status: 'pending', document_number: '12' }), false);
  assert.equal(isUnassignedPendingMatch({ deal_id: '1', status: 'pending', invoice_number: '12' }), false);
});

test('₪1 test charge with invoice is not unassigned; without invoice it stays visible', () => {
  assert.equal(isUnassignedPendingMatch({ deal_id: '2', amount: 1, status: 'pending', is_test: true, document_number: '5' }), false);
  assert.equal(isUnassignedPendingMatch({ deal_id: '2', amount: 1, status: 'pending', is_test: true }), true);
});

test('pending row is ignored when the deal is already linked or has a selected booking', () => {
  assert.equal(isUnassignedPendingMatch({ deal_id: '3', status: 'pending' }, { linkedDealIds: new Set(['3']) }), false);
  assert.equal(isUnassignedPendingMatch({ deal_id: '3', status: 'pending', selected_booking_id: 'b1' }), false);
  assert.equal(isUnassignedPendingMatch({ deal_id: '3', status: 'ignored' }), false);
});
