import { describe, expect, it } from 'vitest';
import { calendarInventory, visibleInventory } from './units.js';

const live = [
  { id: 'hill-1', name: 'צימר בגבעה 1', is_active: true, sort_order: 1 },
  { id: 'hill-2', name: 'צימר בגבעה 2', is_active: true, sort_order: 2 }
];

describe('calendarInventory', () => {
  it('keeps live units when ACL is empty (see all)', () => {
    expect(calendarInventory(live, [], 't').map((u) => u.id)).toEqual(['hill-1', 'hill-2']);
  });

  it('does not blank the board on a mismatched ACL', () => {
    expect(visibleInventory(live, ['missing-id']).map((u) => u.id)).toEqual(['hill-1', 'hill-2']);
  });

  it('falls back to canonical seed when Dexie is empty', () => {
    const rows = calendarInventory([], [], 't');
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.some((u) => u.id === 'hill-1')).toBe(true);
  });
});
