import { describe, expect, it } from 'vitest';
import { resolveFinanceMonth } from './dailyCollection.js';

describe('resolveFinanceMonth', () => {
  it('stays on the current month when it has rows', () => {
    expect(resolveFinanceMonth([
      { stayDate: '2026-09-02' },
      { stayDate: '2026-08-20' }
    ], { todayKey: '2026-09' })).toBe('2026-09');
  });

  it('falls back to the latest row month when the current month is empty', () => {
    expect(resolveFinanceMonth([
      { stayDate: '2026-08-21' },
      { stayDate: '2026-07-10' }
    ], { todayKey: '2026-09' })).toBe('2026-08');
  });
});
