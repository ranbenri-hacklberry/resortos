import { describe, expect, it } from 'vitest';
import { cabinIdsBlocked, commissionIls, dateStrip, isCabinDateBlocked, nextStayRange, stayBlocked } from './agentAvailability.js';

const blocked = [
  { cabin_id: 'k671', start_date: '2026-08-29', end_date: '2026-08-31' }
];

describe('agent availability (no PII)', () => {
  it('blocks occupied nights without needing guest names', () => {
    expect(isCabinDateBlocked(blocked, 'k671', '2026-08-29')).toBe(true);
    expect(isCabinDateBlocked(blocked, 'k671', '2026-08-30')).toBe(true);
    expect(isCabinDateBlocked(blocked, 'k671', '2026-08-31')).toBe(false);
    expect(isCabinDateBlocked(blocked, 'k673', '2026-08-29')).toBe(false);
    expect(stayBlocked(blocked, 'k671', '2026-08-28', '2026-08-30')).toBe(true);
    expect(stayBlocked(blocked, 'k671', '2026-08-31', '2026-09-02')).toBe(false);
  });

  it('calculates 10% commission on the gross stay', () => {
    expect(commissionIls(5000, 0.1)).toBe(500);
  });

  it('picks check-in then check-out on the second tap', () => {
    const start = nextStayRange({}, '2026-09-01', { today: '2026-08-29', blocked, cabinId: 'k671' });
    expect(start).toMatchObject({ checkIn: '2026-09-01', checkOut: '2026-09-02', pickingOut: true });
    const end = nextStayRange(start, '2026-09-04', { today: '2026-08-29', blocked, cabinId: 'k671' });
    expect(end).toMatchObject({ checkIn: '2026-09-01', checkOut: '2026-09-04', pickingOut: false });
  });

  it('flags only the occupied cabins in a multi-unit stay', () => {
    expect(cabinIdsBlocked(blocked, ['k671', 'k673'], '2026-08-29', '2026-08-31')).toEqual(['k671']);
    expect(dateStrip('2026-08-29', 2).map((col) => col.iso)).toEqual(['2026-08-29', '2026-08-30']);
    expect(dateStrip('2026-08-29', 90)).toHaveLength(90);
  });
});
