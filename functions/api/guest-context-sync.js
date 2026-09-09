import { errorJson, json } from './_db.js';
import { blockedRangesFromRows, compactStayRow, groupRowsByPhoneTail, mergeDeskAwareStays } from '../lib/guestContextStore.js';
import { ensureEdgeTables, upsertEdgeAgents } from '../lib/edgeAgentStore.js';

function mailboxOk(request, env) {
  const secret = String(env?.CHECKOUT_MAILBOX_SECRET || '').trim();
  const provided = String(request.headers.get('x-hotelos-mailbox') || '').trim();
  return Boolean(secret) && secret === provided;
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (request.method !== 'POST') return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
    if (!mailboxOk(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
    if (!env?.STAY_DB) return json({ error: 'DB_MISSING' }, 503);

    let body = {};
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON', 400, 'BAD_REQUEST');
    }

    const rows = Array.isArray(body.rows) ? body.rows : [];
    const groups = groupRowsByPhoneTail(rows);
    const now = new Date().toISOString();
    const incoming = rows.map((row) => compactStayRow(row));
    let previousStays = [];
    try {
      const existing = await env.STAY_DB.prepare('SELECT payload FROM guest_context WHERE id = ?1').bind('all').first();
      const packed = existing?.payload ? JSON.parse(existing.payload) : null;
      previousStays = Array.isArray(packed?.stays) ? packed.stays : [];
    } catch {
      previousStays = [];
    }
    const payload = JSON.stringify({
      syncedAt: now,
      byTail: Object.fromEntries(groups),
      blocked: blockedRangesFromRows(rows),
      units: Array.isArray(body.units) ? body.units : [],
      stays: mergeDeskAwareStays(incoming, previousStays),
      deskStaff: Array.isArray(body.deskStaff) ? body.deskStaff.filter((row) => row?.username && row?.pass) : []
    });
    await ensureEdgeTables(env);
    const agentsUpserted = await upsertEdgeAgents(env, body.agents);

    await env.STAY_DB.prepare(
      'CREATE TABLE IF NOT EXISTS guest_context (id TEXT PRIMARY KEY, payload TEXT NOT NULL, synced_at TEXT NOT NULL)'
    ).run();
    await env.STAY_DB.prepare(
      'INSERT OR REPLACE INTO guest_context (id, payload, synced_at) VALUES (?1, ?2, ?3)'
    ).bind('all', payload, now).run();

    return json({ ok: true, phones: groups.size, rows: rows.length, agents: agentsUpserted, syncedAt: now });
  } catch (err) {
    return json({ error: 'SYNC_FAILED', message: String(err?.message || err).slice(0, 180) }, 500);
  }
}
