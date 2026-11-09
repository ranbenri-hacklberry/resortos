import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterUnassignedPendingMatches,
  isUnassignedPendingMatch,
  linkedDealIdsFromSeen,
  cancelledDealKeySet,
  cancelledKeysFromSeen
} from './cardcomPendingFilter.js';

const snap = (overrides = {}) => ({
  deal_id: 'd1',
  status: 'pending',
  amount: 100,
  document_number: null,
  selected_booking_id: null,
  ...overrides
});

test('only deals with no booking and no document stay unassigned (live snapshot)', () => {
  const rows = [
    snap({ deal_id: 'a', document_number: '12' }),
    snap({ deal_id: 'b' }),
    snap({ deal_id: 'c', selected_booking_id: 'kin_1' }),
    snap({ deal_id: 'd', invoice_number: '9' }),
    snap({ deal_id: 'e' }),
    snap({ deal_id: 'f' })
  ];
  const out = filterUnassignedPendingMatches(rows);
  assert.deepEqual(out.map((r) => r.deal_id).sort(), ['b', 'e', 'f']);
});

test('LowProfile/payment-link deal with a Cardcom document is not unassigned', () => {
  assert.equal(isUnassignedPendingMatch(snap({ document_number: '2' })), false);
});

test('₪1 test charge with invoice is not unassigned; without invoice it stays visible', () => {
  assert.equal(isUnassignedPendingMatch(snap({ amount: 1, document_number: '1' })), false);
  assert.equal(isUnassignedPendingMatch(snap({ amount: 1 })), true);
});

test('linkedDealIdsFromSeen drops already-linked deal ids', () => {
  const ids = linkedDealIdsFromSeen([
    { deal_id: 'x', status: 'linked' },
    { deal_id: 'y', linked_booking_id: 'b1' },
    { deal_id: 'z', status: 'seen' }
  ]);
  assert.equal(ids.has('x'), true);
  assert.equal(ids.has('y'), true);
  assert.equal(ids.has('z'), false);
  assert.equal(isUnassignedPendingMatch(snap({ deal_id: 'x' }), { linkedDealIds: ids }), false);
});

test('cancel/refund sharing RRN or approval drops both original and cancel from unassigned', () => {
  const cancelKeys = cancelledDealKeySet([
    { deal_id: 'cancel-9', original_deal_id: 'charge-1', rrn: 'RRN99', approval: 'AP1', is_refund: true }
  ]);
  const charge = snap({ deal_id: 'charge-1', approval: 'AP1', rrn: 'RRN99' });
  const other = snap({ deal_id: 'charge-2', approval: 'AP2' });
  const cancelRow = snap({ deal_id: 'cancel-9', approval: 'AP1', rrn: 'RRN99' });
  assert.equal(isUnassignedPendingMatch(charge, { cancelledKeys: cancelKeys }), false);
  assert.equal(isUnassignedPendingMatch(cancelRow, { cancelledKeys: cancelKeys }), false);
  assert.equal(isUnassignedPendingMatch(other, { cancelledKeys: cancelKeys }), true);
  const filtered = filterUnassignedPendingMatches([charge, other, cancelRow], { cancelledKeys: cancelKeys });
  assert.deepEqual(filtered.map((r) => r.deal_id), ['charge-2']);
});

test('cancelledKeysFromSeen reads cancelled/refunded seen rows', () => {
  const keys = cancelledKeysFromSeen([
    { deal_id: 'c1', status: 'refunded', original_deal_id: 'o1', approval: 'A9' },
    { deal_id: 'keep', status: 'seen' }
  ]);
  assert.equal(keys.has('c1'), true);
  assert.equal(keys.has('o1'), true);
  assert.equal(keys.has('A9'), true);
  assert.equal(keys.has('keep'), false);
});


test("cancelledKeysFromSeen parses orig/rrn tags from entry_mode", () => {
  const keys = cancelledKeysFromSeen([
    { deal_id: "cancel-1", status: "refunded", approval_number: "APX", entry_mode: "orig:charge-9|rrn:RRN1" }
  ]);
  assert.equal(keys.has("cancel-1"), true);
  assert.equal(keys.has("charge-9"), true);
  assert.equal(keys.has("RRN1"), true);
  assert.equal(keys.has("APX"), true);
});
