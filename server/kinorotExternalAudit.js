import { externalAuditRowsFromDiff } from '../src/lib/kinorotAudit.js';
import { insertKinorotAudit, recentOurWrites } from './kinorotAuditLog.js';

export async function recordExternalKinorotChanges(changes, { now = new Date(), windowMs = 10 * 60 * 1000 } = {}) {
  const total = (changes?.created?.length || 0) + (changes?.updated?.length || 0) + (changes?.removed?.length || 0);
  if (!total) return { ok: true, inserted: 0 };

  const sinceIso = new Date(Date.now() - windowMs).toISOString();
  let recentWrites = [];
  try {
    recentWrites = await recentOurWrites({ sinceIso });
  } catch (err) {
    console.warn('[kinorot-audit] could not load recent writes:', err?.message || err);
    recentWrites = [];
  }

  const rows = externalAuditRowsFromDiff({ changes, recentWrites, now, windowMs });
  if (!rows.length) return { ok: true, inserted: 0 };
  return insertKinorotAudit(rows);
}
