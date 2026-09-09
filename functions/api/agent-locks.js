import { errorJson, json } from './_db.js';
import { ensureEdgeTables, listPublicLocks } from '../lib/edgeAgentStore.js';

function mailboxOk(request, env) {
  const secret = String(env?.CHECKOUT_MAILBOX_SECRET || '').trim();
  const provided = String(request.headers.get('x-hotelos-mailbox') || '').trim();
  return Boolean(secret) && secret === provided;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'GET') return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  if (!mailboxOk(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
  if (!env?.STAY_DB) return json({ error: 'DB_MISSING' }, 503);
  try {
    await ensureEdgeTables(env);
    const locks = await listPublicLocks(env);
    return json({ locks }, 200, { 'cache-control': 'no-store' });
  } catch (err) {
    return json({ error: 'LOCKS_FAILED', message: String(err?.message || err).slice(0, 180) }, 500);
  }
}
