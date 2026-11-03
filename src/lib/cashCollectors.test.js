import { describe, expect, it } from 'vitest';
import { cashCollectorChoices, DEFAULT_CASH_COLLECTOR } from './cashCollectors';

describe('cash collectors', () => {
  it('defaults to the operations manager and lists only managers', () => {
    const names = cashCollectorChoices([
      { username: 'rani', display_name: 'רני', role: 'MANAGER' },
      { username: 'adam', display_name: 'אדם', role: 'MANAGER' },
      { username: 'daniels', display_name: 'DanielS', role: 'MANAGER' },
      { username: 'barak', display_name: 'ברק', role: 'OPS_MANAGER' },
      { username: 'zuki', display_name: 'צוקי', role: 'PRIORITY' },
      { username: 'shiva', display_name: 'שיווה', role: 'HOUSEKEEPING' }
    ]);
    expect(names[0]).toBe('ברק');
    expect(names).toContain('רני');
    expect(names).toContain('אדם');
    expect(names).toContain('DanielS');
    expect(names).not.toContain('צוקי');
    expect(names).not.toContain('שיווה');
    expect(names.slice(1)).toEqual([...names.slice(1)].sort((a, b) => a.localeCompare(b, 'he')));
  });

  it('keeps Barak when the staff list is empty', () => {
    expect(cashCollectorChoices([])).toEqual([DEFAULT_CASH_COLLECTOR]);
  });
});
