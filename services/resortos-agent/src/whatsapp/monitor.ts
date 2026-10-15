import { DisconnectReason } from '@whiskeysockets/baileys';

export type ReconnectDecision =
  | { action: 'reconnect'; delayMs: number; level: 'debug' | 'warn' }
  | { action: 'stop'; level: 'fatal'; reason: string };

/** Extract the HTTP-like status code Baileys attaches to a Boom error. */
export function statusCodeOf(err: unknown): number | undefined {
  return (err as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

/**
 * Pure decision function for connection.update closes.
 * - loggedOut            -> stop, critical alert (session must be re-paired by QR)
 * - connectionLost / restartRequired / timedOut / etc. -> quiet reconnect with backoff
 */
export function decideReconnect(statusCode: number | undefined, attempt: number): ReconnectDecision {
  if (statusCode === DisconnectReason.loggedOut) {
    return { action: 'stop', level: 'fatal', reason: 'Logged out from WhatsApp. Delete auth_info_baileys and re-scan QR.' };
  }
  if (statusCode === DisconnectReason.restartRequired) {
    return { action: 'reconnect', delayMs: 0, level: 'debug' }; // expected right after pairing
  }
  const delayMs = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
  const quiet = statusCode === DisconnectReason.connectionLost || statusCode === DisconnectReason.connectionClosed;
  return { action: 'reconnect', delayMs, level: quiet ? 'debug' : 'warn' };
}

/** Periodic keep-alive: sends an "available" presence so the socket never idles out. */
export class KeepAlive {
  private timer?: NodeJS.Timeout;
  constructor(private ping: () => Promise<unknown>, private intervalMs = 25_000, private onError: (e: unknown) => void = () => {}) {}

  start(): void {
    this.stop();
    this.timer = setInterval(() => {
      this.ping().catch(this.onError);
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
