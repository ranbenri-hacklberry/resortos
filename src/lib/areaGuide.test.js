import { describe, expect, it } from 'vitest';
import { RESTAURANTS, placesForCluster } from './areaGuide.js';

describe('placesForCluster', () => {
  it('shows המטבח only for Ramot, not Givat Yoav', () => {
    const ramot = placesForCluster(RESTAURANTS, 'ramot').map((row) => row.id);
    const givat = placesForCluster(RESTAURANTS, 'givat').map((row) => row.id);
    expect(ramot).toContain('food_hamitbach');
    expect(givat).not.toContain('food_hamitbach');
    expect(givat).toContain('food_fullbar');
  });
});
