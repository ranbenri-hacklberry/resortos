import { describe, expect, it } from 'vitest';
import { bedInventoryFor, bedPrepLine, requestedBedSetup, resolveBedPrep } from './bedInventory';

const room = {
  setups: [
    { id: 'joined', label: 'מיטה זוגית' },
    { id: 'split', label: 'שתי מיטות נפרדות' },
  ],
};

describe('bed inventory', () => {
  it('does not invent a room list', () => {
    expect(bedInventoryFor('k680')).toBeNull();
    expect(resolveBedPrep({ inventory: null, request: 'joined' }).status).toBe('awaiting-inventory');
  });

  it('shows a compatible request and flags one the room cannot do', () => {
    expect(resolveBedPrep({ inventory: room, request: 'split' })).toMatchObject({
      status: 'confirmed',
      label: 'שתי מיטות נפרדות',
    });
    expect(resolveBedPrep({ inventory: room, request: 'sofa' }).status).toBe('review');
  });

  it('waits for a choice when several setups exist and none was asked', () => {
    expect(resolveBedPrep({ inventory: room }).status).toBe('pending');
    expect(resolveBedPrep({
      inventory: { setups: [{ id: 'joined', label: 'מיטה זוגית' }] },
    }).status).toBe('only');
  });

  it('reads a setup note from the reservation without treating it as the room inventory', () => {
    expect(requestedBedSetup({ special_requests: 'מיטות נפרדות בבקשה' })).toBe('split');
    expect(requestedBedSetup({ stay: { bed_setup: 'joined' } })).toBe('joined');
    expect(requestedBedSetup({ special_requests: 'לול לתינוק' })).toBe('');
  });

  it('does not invent a double bed when only the headcount is known', () => {
    expect(bedPrepLine(resolveBedPrep({ inventory: null }))).toBe('סידור מיטות: אין מידע');
    expect(bedPrepLine(resolveBedPrep({ inventory: null, request: 'split' }))).toBe('סידור מיטות: מיטות נפרדות');
  });
});