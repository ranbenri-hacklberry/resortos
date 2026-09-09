import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicAgent, staffAgentEmail } from './agentAccounts.js';

test('staff-linked agents use a stable email key and zero commission in public shape', () => {
  assert.equal(staffAgentEmail('abc'), 'staff:abc');
  const row = publicAgent({
    id: '1',
    name: 'מנהל',
    phone: '0500000002',
    email: 'staff:abc',
    commission_rate: 0,
    is_active: true
  });
  assert.equal(row.kind, 'staff');
  assert.equal(row.staff_id, 'abc');
  assert.equal(row.commission_rate, 0);
});
