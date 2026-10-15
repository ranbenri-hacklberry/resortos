/**
 * One-time pairing with ResortOS "agent connections" (server/agentConnections.js).
 *
 *   npm run connect
 *
 * 1. Requests a connection with the `room_status` permission and prints a 4-character match code.
 * 2. A MANAGER approves it in ResortOS (Settings → Connected agents), checking the same code.
 * 3. This script receives the credential ONCE and prints it. Put it in RESORTOS_TOKEN.
 *
 * ResortOS currently only accepts client kinds "codex" | "cursor"; we use "cursor" with an explicit label so the
 * audit log shows "ResortOS WhatsApp Agent". Add a dedicated kind to AGENT_CLIENTS if you want it listed separately.
 */
import { randomBytes } from 'node:crypto';

const base = process.env.RESORTOS_URL ?? 'http://127.0.0.1:4038';
const pollSecret = randomBytes(24).toString('hex');

const r = await fetch(`${base}/api/ops/agent-connections/requests`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ client: 'cursor', label: 'ResortOS WhatsApp Agent', permissions: ['room_status'], poll_secret: pollSecret }),
});
if (!r.ok) throw new Error(`request failed: HTTP ${r.status} ${await r.text()}`);
const { connection } = (await r.json()) as { connection: { id: string; match_code: string; expires_at: string } };
console.log(`\nMatch code: ${connection.match_code}   (expires ${connection.expires_at})\nAsk a ResortOS manager to approve connection ${connection.id}...\n`);

for (;;) {
  await new Promise((res) => setTimeout(res, 3000));
  const p = await fetch(`${base}/api/ops/agent-connections/requests/${encodeURIComponent(connection.id)}`, {
    headers: { 'x-resortos-poll': pollSecret },
  });
  if (!p.ok) throw new Error(`poll failed: HTTP ${p.status}`);
  const body = (await p.json()) as { connection: { status: string }; credential: string | null };
  if (body.credential) {
    console.log(`Approved. Credential (shown once):\n\nRESORTOS_TOKEN=${body.credential}\n`);
    break;
  }
  if (['rejected', 'expired', 'revoked'].includes(body.connection.status)) throw new Error(`connection ${body.connection.status}`);
}
