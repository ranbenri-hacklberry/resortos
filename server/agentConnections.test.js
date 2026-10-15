import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agentAllows,
  assertAgentTransport,
  createAgentConnectionService,
  createMemoryStore,
  readinessOf,
  resolveUnit,
  scopeAgentUnitPatch,
  statusWriteMatches,
} from './agentConnections.js';

function manager(extra = {}) {
  return {
    id: 'mgr',
    tenant_id: '22222222-2222-2222-2222-222222222222',
    role: 'MANAGER',
    display_name: 'רני',
    is_active: true,
    allowed_units: ['k676'],
    ...extra,
  };
}

function serviceAt(start) {
  let clock = start.getTime();
  const staff = new Map([['mgr', manager()]]);
  const api = createAgentConnectionService({
    store: createMemoryStore(),
    loadStaff: async (id) => staff.get(String(id)) || null,
    now: () => new Date(clock),
    sealKey: Buffer.alloc(32, 7),
  });
  return {
    api,
    staff,
    advance(ms) { clock += ms; },
  };
}

const secret = 'poll-secret-that-is-at-least-32-characters';

test('approval delivers one credential only to the initiating poll secret', async () => {
  const { api } = serviceAt(new Date('2026-10-11T08:00:00Z'));
  const opened = await api.requestConnection({
    client: 'codex',
    permissions: ['room_status'],
    pollSecret: secret,
    tenantId: manager().tenant_id,
  });
  assert.equal(opened.credential, null);
  assert.equal(opened.connection.match_code.length, 4);
  assert.equal(opened.connection.client_label, 'Codex');
  assert.deepEqual(opened.connection.permissions, ['read', 'room_status']);

  await assert.rejects(() => api.decide({ role: 'HOUSEKEEPING', tenant_id: manager().tenant_id, id: 'x' }, opened.connection.id, 'approve'), /FORBIDDEN/);
  const approved = await api.decide(manager(), opened.connection.id, 'approve');
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approved_by_name, 'רני');

  await assert.rejects(() => api.poll({ id: opened.connection.id, pollSecret: 'wrong-secret-wrong-secret-wrong-secret' }), /NOT_FOUND/);
  const first = await api.poll({ id: opened.connection.id, pollSecret: secret });
  assert.match(first.credential, /^ros_agent_/);
  const second = await api.poll({ id: opened.connection.id, pollSecret: secret });
  assert.equal(second.credential, null);

  const user = await api.authenticate(first.credential);
  assert.equal(user.agent_connection_id, opened.connection.id);
  assert.equal(user.allowed_units[0], 'k676');
  assert.equal(agentAllows(user, 'room_status'), true);
});

test('rejection and expiration never issue a credential', async () => {
  const { api, advance } = serviceAt(new Date('2026-10-11T08:00:00Z'));
  const rejected = await api.requestConnection({
    client: 'cursor',
    permissions: ['read'],
    pollSecret: secret,
    tenantId: manager().tenant_id,
  });
  await api.decide(manager(), rejected.connection.id, 'reject');
  const afterReject = await api.poll({ id: rejected.connection.id, pollSecret: secret });
  assert.equal(afterReject.connection.status, 'rejected');
  assert.equal(afterReject.credential, null);

  const pending = await api.requestConnection({
    client: 'codex',
    permissions: ['read'],
    pollSecret: `${secret}-2`,
    tenantId: manager().tenant_id,
  });
  advance(11 * 60 * 1000);
  await assert.rejects(() => api.decide(manager(), pending.connection.id, 'approve'), /NOT_PENDING/);
  const expired = await api.poll({ id: pending.connection.id, pollSecret: `${secret}-2` });
  assert.equal(expired.connection.status, 'expired');
  assert.equal(expired.credential, null);
});

test('revocation blocks access immediately and keeps the audit', async () => {
  const { api } = serviceAt(new Date('2026-10-11T08:00:00Z'));
  const opened = await api.requestConnection({
    client: 'codex',
    permissions: ['read'],
    pollSecret: secret,
    tenantId: manager().tenant_id,
  });
  await api.decide(manager(), opened.connection.id, 'approve');
  const delivered = await api.poll({ id: opened.connection.id, pollSecret: secret });
  await api.revoke(manager(), opened.connection.id);
  assert.equal(await api.authenticate(delivered.credential), null);
  const audit = await api.auditOf(opened.connection.id);
  assert.deepEqual(audit.map((row) => row.action), ['request', 'approve', 'revoke']);
  const listed = await api.list(manager());
  assert.equal(listed.find((row) => row.id === opened.connection.id).status, 'revoked');
});

test('read-only access cannot update a room, and names must match one unit', () => {
  const reader = { agent_connection_id: 'ac_1', agent_permissions: ['read'] };
  assert.equal(agentAllows(reader, 'read'), true);
  assert.equal(agentAllows(reader, 'room_status'), false);
  const units = [
    { id: 'k676', name: 'בקתה 5' },
    { id: 'k677', name: 'בקתה 5' },
    { id: 'k680', name: 'בקתה 1' },
  ];
  assert.equal(resolveUnit(units, { unitId: 'k680' }).unit.id, 'k680');
  assert.equal(resolveUnit(units, { name: 'בקתה 5' }).error, 'UNIT_AMBIGUOUS');
  assert.equal(resolveUnit(units, { name: 'בקתה 9' }).error, 'UNIT_NOT_FOUND');
  const patched = scopeAgentUnitPatch(
    { id: 'k680', operational_status: 'DIRTY', base_price_agorot: 10 },
    { operational_status: 'READY', base_price_agorot: 999, custom_reason: 'ממתין לביקורת מנהל' }
  );
  assert.equal(patched.base_price_agorot, 10);
  assert.equal(patched.operational_status, 'READY');
});

test('inspection stays distinct from guest-ready, and a mismatched read is not success', () => {
  const inspection = {
    operational_status: 'READY',
    custom_reason: 'ממתין לביקורת מנהל',
    quality_inspections: [{ ratings: {}, source: 'calendar', note: 'סומן נקי מהיומן' }],
  };
  const ready = {
    operational_status: 'READY',
    custom_reason: '',
    quality_inspections: [{ ratings: { clean: 5 }, source: 'command' }],
  };
  assert.equal(readinessOf(inspection), 'awaiting_inspection');
  assert.equal(readinessOf(ready), 'ready');
  assert.equal(statusWriteMatches(inspection, ready), false);
  assert.equal(statusWriteMatches(inspection, inspection), true);
});

test('the helper may use tailscale or https, not open http', () => {
  assert.doesNotThrow(() => assertAgentTransport('https://resortos.app'));
  assert.doesNotThrow(() => assertAgentTransport('http://100.127.14.15:3001'));
  assert.throws(() => assertAgentTransport('http://example.com'), /INSECURE_TRANSPORT/);
});
