import { describe, expect, it } from 'vitest';
import { cabinCatalog, cabinFactLine } from './cabinCatalog.js';

describe('cabin catalog facts', () => {
  it('exposes occupancy and in-cabin amenities from the 2026 inventory', () => {
    const hill = cabinCatalog('hill-1');
    expect(hill.maxOccupancy).toBe(7);
    expect(hill.features.join(' ')).toMatch(/ג׳קוזי|ג'קוזי/);
    expect(cabinFactLine('k689')).toMatch(/10/);
  });
});
