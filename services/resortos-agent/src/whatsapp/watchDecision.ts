export type WatchProbe = { up: boolean; whatsapp?: string };
export type WatchAction = 'none' | 'restart' | 'alert' | 'recovered';

export interface WatchState {
  badSince: number | null;
  restartedAt: number | null;
  alerted: boolean;
}

export const WATCH_GRACE_MS = 3 * 60 * 1000;
export const WATCH_AFTER_RESTART_MS = 90 * 1000;

export function freshWatchState(): WatchState {
  return { badSince: null, restartedAt: null, alerted: false };
}

/**
 * One health sample.
 * A short reconnect stays quiet. After the grace period the agent is restarted once.
 * If it is still down after that, one SMS goes out. Recovery sends one SMS only if an alert was sent.
 */
export function decideWatch(
  prev: WatchState,
  probe: WatchProbe,
  now: number,
  graceMs = WATCH_GRACE_MS,
  afterRestartMs = WATCH_AFTER_RESTART_MS,
): { state: WatchState; action: WatchAction } {
  const open = probe.up && probe.whatsapp === 'open';
  if (open) {
    return {
      state: freshWatchState(),
      action: prev.alerted ? 'recovered' : 'none',
    };
  }
  const badSince = prev.badSince ?? now;
  if (now - badSince < graceMs) {
    return { state: { badSince, restartedAt: null, alerted: false }, action: 'none' };
  }
  if (prev.restartedAt == null) {
    return { state: { badSince, restartedAt: now, alerted: false }, action: 'restart' };
  }
  if (!prev.alerted && now - prev.restartedAt >= afterRestartMs) {
    return { state: { badSince, restartedAt: prev.restartedAt, alerted: true }, action: 'alert' };
  }
  return { state: { badSince, restartedAt: prev.restartedAt, alerted: prev.alerted }, action: 'none' };
}
