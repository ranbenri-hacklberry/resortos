import { describe, expect, it } from 'vitest';
import { decideWatch, freshWatchState } from './watchDecision.js';

const minute = 60 * 1000;

describe('agent health watch', () => {
  it('stays quiet during a short reconnect', () => {
    const first = decideWatch(freshWatchState(), { up: true, whatsapp: 'connecting' }, 0);
    expect(first.action).toBe('none');
    const second = decideWatch(first.state, { up: false }, 2 * minute);
    expect(second.action).toBe('none');
  });

  it('restarts once the outage passes the grace period, then alerts if it stays down', () => {
    const down = decideWatch(freshWatchState(), { up: false }, 0);
    const restart = decideWatch(down.state, { up: false }, 3 * minute);
    expect(restart.action).toBe('restart');
    const waiting = decideWatch(restart.state, { up: true, whatsapp: 'connecting' }, 3 * minute + 30 * 1000);
    expect(waiting.action).toBe('none');
    const alert = decideWatch(waiting.state, { up: false }, 3 * minute + 90 * 1000);
    expect(alert.action).toBe('alert');
    const again = decideWatch(alert.state, { up: false }, 20 * minute);
    expect(again.action).toBe('none');
  });

  it('sends a recovery note only after an alert', () => {
    const quiet = decideWatch({ badSince: 0, restartedAt: 0, alerted: false }, { up: true, whatsapp: 'open' }, minute);
    expect(quiet.action).toBe('none');
    const back = decideWatch({ badSince: 0, restartedAt: 0, alerted: true }, { up: true, whatsapp: 'open' }, minute);
    expect(back.action).toBe('recovered');
    expect(back.state.alerted).toBe(false);
  });
});
