import { describe, expect, it } from 'vitest';
import { agentLockLabel, agentLockOnNight, findOverlappingAgentLock, liveAgentLocks } from './agentLocks';

const locks = [
  {
    cabin_id: 'hill-1',
    start_date: '2026-09-10',
    end_date: '2026-09-12',
    expires_at: '2026-09-09T18:00:00.000Z',
    agent_name: 'דנה'
  }
];

describe('agentLocks', () => {
  it('drops expired holds', () => {
    expect(liveAgentLocks(locks, Date.parse('2026-09-09T18:00:01.000Z'))).toEqual([]);
    expect(liveAgentLocks(locks, Date.parse('2026-09-09T17:59:00.000Z'))).toHaveLength(1);
  });

  it('matches nights inside the hold and not checkout morning', () => {
    const now = Date.parse('2026-09-09T17:00:00.000Z');
    expect(agentLockOnNight(locks, 'hill-1', '2026-09-10', now)?.cabin_id).toBe('hill-1');
    expect(agentLockOnNight(locks, 'hill-1', '2026-09-11', now)?.cabin_id).toBe('hill-1');
    expect(agentLockOnNight(locks, 'hill-1', '2026-09-12', now)).toBeNull();
    expect(findOverlappingAgentLock(locks, 'hill-2', '2026-09-10', '2026-09-12', now)).toBeNull();
  });

  it('labels the hold for the staff board', () => {
    const now = Date.parse('2026-09-09T17:50:00.000Z');
    expect(agentLockLabel(locks[0], now)).toContain('דנה');
    expect(agentLockLabel(locks[0], now)).toContain('ממתין לתשלום');
    expect(agentLockLabel(locks[0], now)).toContain('10 דק');
  });
});
