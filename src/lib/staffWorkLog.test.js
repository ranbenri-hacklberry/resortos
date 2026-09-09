import { describe, expect, it } from 'vitest';
import { countMonthlyCleans, israelMonthStart, isHousekeepingCompletion } from './staffWorkLog.js';

describe('staff work log', () => {
  it('uses the first of the Israel month', () => {
    expect(israelMonthStart('2026-09-18')).toBe('2026-09-01');
  });

  it('counts only housekeeping completions this month', () => {
    const rows = [
      { domain: 'HOUSEKEEPING', completed_at: '2026-09-02T08:10:00.000Z' },
      { domain: 'MAINTENANCE', completed_at: '2026-09-02T09:10:00.000Z' },
      { domain: 'HOUSEKEEPING', completed_at: '2026-08-30T08:10:00.000Z' }
    ];
    expect(rows.filter(isHousekeepingCompletion)).toHaveLength(2);
    expect(countMonthlyCleans(rows, '2026-09')).toBe(1);
  });
});
