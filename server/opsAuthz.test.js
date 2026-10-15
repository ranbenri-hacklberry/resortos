import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canUseOps, isOpsLead, tenantOf, unitAllowed, visibleOpsRows } from './opsAuthz.js';

const housekeeper = {
  id: 's1',
  tenant_id: 'tenant-a',
  role: 'HOUSEKEEPING',
  allowed_units: ['k808', 'k809'],
  is_active: true
};

describe('opsAuthz', () => {
  it('takes tenant from the session, not a client field', () => {
    assert.equal(tenantOf({ tenant_id: 'from-session', business_id: 'other' }), 'from-session');
    assert.equal(tenantOf({ business_id: 'biz' }), 'biz');
  });

  it('limits a housekeeper to allowed units', () => {
    assert.equal(unitAllowed(housekeeper, 'k808'), true);
    assert.equal(unitAllowed(housekeeper, 'k999'), false);
  });

  it('lets a manager reach every unit in the session tenant', () => {
    const manager = { ...housekeeper, role: 'MANAGER', allowed_units: ['k808'] };
    assert.equal(isOpsLead(manager), true);
    assert.equal(unitAllowed(manager, 'k999'), true);
  });

  it('gives a Priority user manager unit scope without making them an ops lead', () => {
    const priority = { ...housekeeper, role: 'PRIORITY', allowed_units: ['k808'] };
    assert.equal(isOpsLead(priority), false);
    assert.equal(unitAllowed(priority, 'k999'), true);
  });

  it('treats an empty unit list as the whole property', () => {
    assert.equal(unitAllowed({ ...housekeeper, allowed_units: [] }, 'k1'), true);
  });

  it('rejects a session without a tenant', () => {
    assert.equal(canUseOps({ id: 's1', role: 'HOUSEKEEPING' }), false);
    assert.equal(canUseOps(housekeeper), true);
  });

  it('drops events for units outside the session list', () => {
    const units = [{ id: 'k808' }, { id: 'k999' }];
    const bookings = [{ unit_id: 'k808' }, { unit_id: 'k999' }];
    assert.deepEqual(visibleOpsRows(housekeeper, units, 'id').map((row) => row.id), ['k808']);
    assert.deepEqual(visibleOpsRows(housekeeper, bookings, 'unit_id').map((row) => row.unit_id), ['k808']);
    const manager = { ...housekeeper, role: 'MANAGER' };
    assert.equal(visibleOpsRows(manager, units, 'id').length, 2);
    assert.equal(visibleOpsRows(manager, bookings, 'unit_id').length, 2);
  });
});
