import type { CleanerProfile } from '../config.js';
import { matchesCleaner } from '../pipeline.js';

/**
 * Ran 2026-10-31: a message sent manually through POST /api/messages/send (route http_send) to a guest
 * puts that guest chat into human takeover, so Chloe stops auto-replying.
 * Not for: /api/alerts/send, groups (@g.us / broadcast), staff or managers (data/cleaners.json / live staff),
 * or a request that sets keep_auto:true (system notifications).
 */
export function shouldTakeoverOnManualSend(p: {
  url: string;
  body: Record<string, unknown> | null | undefined;
  targetJid: string;
  staff: CleanerProfile[];
}): boolean {
  if (p.url !== '/api/messages/send') return false;
  const body = p.body || {};
  const keep = body.keep_auto ?? body.keepAuto;
  if (keep === true || keep === 'true' || keep === 1 || keep === '1') return false;
  const jid = String(p.targetJid || '');
  if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return false;
  if ((p.staff || []).some((c) => matchesCleaner(c, jid))) return false;
  return true;
}
