import { describe, expect, it } from 'vitest';
import { savePriorityStatusDrafts } from './priorityStatus';
import { canEditPriorityStatuses, isPriorityOnly } from './staffRoles';

const unit = {
  id: 'k1',
  name: 'פירנצה 1',
  operational_status: 'DIRTY',
  staff_occupancy: 'OCCUPIED'
};

describe('priority status permissions', () => {
  it('gives a Priority user the same status edits as a manager', () => {
    expect(isPriorityOnly('PRIORITY')).toBe(true);
    expect(canEditPriorityStatuses('PRIORITY')).toBe(true);
    expect(canEditPriorityStatuses('MANAGER')).toBe(true);
    expect(canEditPriorityStatuses('OPS_MANAGER')).toBe(true);
    expect(canEditPriorityStatuses('HOUSEKEEPING')).toBe(false);
    expect(canEditPriorityStatuses('RECEPTION')).toBe(false);
  });
});

describe('savePriorityStatusDrafts', () => {
  it('keeps lodging occupancy when cleaning is marked ready', async () => {
    const calls = [];
    const result = await savePriorityStatusDrafts({
      tenantId: 't',
      units: [unit],
      drafts: { k1: { clean: 'READY' } },
      pushUnitToCloud: async (patch) => { calls.push(patch); }
    });
    expect(result.saved).toEqual(['k1']);
    expect(result.failed).toEqual([]);
    expect(calls[0].operational_status).toBe('READY');
    expect(calls[0].staff_occupancy).toBeUndefined();
  });

  it('changes lodging without changing the cleaning status', async () => {
    const calls = [];
    const result = await savePriorityStatusDrafts({
      tenantId: 't',
      units: [unit],
      drafts: { k1: { stay: 'VACANT' } },
      pushUnitToCloud: async (patch) => { calls.push(patch); }
    });
    expect(result.saved).toEqual(['k1']);
    expect(calls).toHaveLength(1);
    expect(calls[0].staff_occupancy).toBe('VACANT');
    expect(calls[0].operational_status).toBeUndefined();
  });

  it('assigns a housekeeper without changing lodging or cleaning', async () => {
    const calls = [];
    const result = await savePriorityStatusDrafts({
      tenantId: 't',
      units: [{ ...unit, assigned_staff: '' }],
      drafts: { k1: { staff: 'אוסנת' } },
      pushUnitToCloud: async (patch) => { calls.push(patch); }
    });
    expect(result.saved).toEqual(['k1']);
    expect(calls).toHaveLength(1);
    expect(calls[0].assigned_staff).toBe('אוסנת');
    expect(calls[0].staff_occupancy).toBeUndefined();
    expect(calls[0].operational_status).toBeUndefined();
  });

  it('turns a clean unit dirty when a housekeeper is assigned', async () => {
    const calls = [];
    const result = await savePriorityStatusDrafts({
      tenantId: 't',
      units: [{ ...unit, operational_status: 'READY', assigned_staff: '' }],
      drafts: { k1: { staff: 'אוסנת' } },
      pushUnitToCloud: async (patch) => { calls.push(patch); }
    });
    expect(result.saved).toEqual(['k1']);
    expect(calls.map((patch) => patch.operational_status || patch.assigned_staff)).toEqual(['DIRTY', 'אוסנת']);
    expect(calls.every((patch) => patch.staff_occupancy == null)).toBe(true);
  });

  it('marks a unit ready for a guest without the inspection reason', async () => {
    const calls = [];
    const result = await savePriorityStatusDrafts({
      tenantId: 't',
      units: [unit],
      drafts: { k1: { stay: 'VACANT', clean: 'READY', weekMark: 'ready' } },
      pushUnitToCloud: async (patch) => { calls.push(patch); }
    });
    expect(result.saved).toEqual(['k1']);
    expect(calls.map((patch) => patch.custom_reason || patch.staff_occupancy)).toEqual(['מוכן לאורח', 'VACANT']);
    expect(calls[0].operational_status).toBe('READY');
  });

  it('marks a unit as waiting for inspection', async () => {
    const calls = [];
    const result = await savePriorityStatusDrafts({
      tenantId: 't',
      units: [{ ...unit, staff_occupancy: 'VACANT' }],
      drafts: { k1: { stay: 'VACANT', clean: 'READY', weekMark: 'inspect' } },
      pushUnitToCloud: async (patch) => { calls.push(patch); }
    });
    expect(result.saved).toEqual(['k1']);
    expect(calls[0].operational_status).toBe('READY');
    expect(calls[0].custom_reason).toBe('ממתין לביקורת מנהל');
  });

  it('keeps the draft when saving fails', async () => {
    const result = await savePriorityStatusDrafts({
      tenantId: 't',
      units: [unit],
      drafts: { k1: { clean: 'IN_PROGRESS', stay: 'VACANT' } },
      pushUnitToCloud: async () => { throw new Error('FORBIDDEN'); }
    });
    expect(result.saved).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].remain).toEqual({ clean: 'IN_PROGRESS', stay: 'VACANT' });
    expect(result.failed[0].error).toBe('FORBIDDEN');
  });
});
