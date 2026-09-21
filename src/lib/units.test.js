import { describe, expect, it } from 'vitest';
import { calendarInventory, unitCalendarLines, visibleInventory } from './units.js';

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
    expect(rows[0].id).toBe('k826');
    expect(rows[1].id).toBe('k827');
    expect(rows.some((u) => u.id === 'k618')).toBe(false);
  });
});

describe('unitCalendarLines', () => {
  it('merges complex and cabin number on one line and drops בקתה', () => {
    expect(unitCalendarLines("טאג' מאהל · בקתה 1")).toEqual({
      primary: "טאג' מאהל 1",
      secondary: ''
    });
    expect(unitCalendarLines('בתי נורית 3')).toEqual({
      primary: 'בתי נורית 3',
      secondary: ''
    });
    expect(unitCalendarLines('מול הנוף · בקתה 2')).toEqual({
      primary: 'מול הנוף 2',
      secondary: ''
    });
  });
});
