import { describe, expect, it } from 'vitest';
import { cabinPartyError, cabinPartySummaryHe, cabinPartyTotals, normalizeCabinParties } from './cabinParty.js';

describe('per-cabin guest party', () => {
  it('caps adults+children at catalog occupancy and keeps crib out of the count', () => {
    const rows = normalizeCabinParties(['hill-1'], { 'hill-1': { adults: 6, children: 4, crib: true, occupant_phone: '0500000001' } });
    expect(rows[0]).toMatchObject({ adults: 6, children: 1, crib: true, max: 7 });
    expect(cabinPartyError(rows)).toBe('');
    expect(cabinPartyTotals(rows)).toEqual({ adults: 6, children: 1, cribs: 1 });
    expect(cabinPartySummaryHe(rows)).toMatch(/מיטת תינוק/);
  });

  it('requires at least one adult per cabin', () => {
    const rows = normalizeCabinParties(['hill-1', 'hill-2'], {
      'hill-1': { adults: 2, children: 0, crib: false, occupant_phone: '0501111111' },
      'hill-2': { adults: 2, children: 1, crib: true, occupant_phone: '0502222222' }
    });
    expect(rows).toHaveLength(2);
    expect(cabinPartyTotals(rows).children).toBe(1);
    expect(cabinPartyError(normalizeCabinParties(['hill-1'], { 'hill-1': { occupant_phone: '' } }))).toBe('');
    expect(cabinPartyError(normalizeCabinParties(['hill-1', 'hill-2'], {
      'hill-1': { occupant_phone: '0501111111' },
      'hill-2': { occupant_phone: '' }
    }))).toMatch(/טלפון/);
  });
});
