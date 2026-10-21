/**
 * Full-content conversation log (Ran 2026-10-20): one JSON line per inbound / outbound message,
 * written to services/resortos-agent/logs/conversations-YYYY-MM-DD.jsonl (Israel date),
 * independent of the process cwd or where stdout is redirected. Override dir with CHLOE_CONVERSATION_LOG_DIR,
 * disable with CHLOE_CONVERSATION_LOG=0. Secrets (API keys, bearer tokens, JWTs) are redacted.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ConversationEntry {
  direction: 'inbound' | 'outbound' | 'result';
  jid?: string | null;
  text?: string | null;
  route?: string;
  handled?: boolean;
  reason?: string;
}

const DEFAULT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'logs');

export function conversationLogDir(): string {
  return process.env.CHLOE_CONVERSATION_LOG_DIR || DEFAULT_DIR;
}

export function redactSecrets(text: string): string {
  return String(text ?? '')
    .replace(/\b(sk|rk|pk)-[A-Za-z0-9_-]{16,}/g, '[REDACTED_KEY]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED_JWT]')
    .replace(/\b(?:AKIA|ghp_|gho_|github_pat_|xox[bpas]-|AIza)[A-Za-z0-9_-]{12,}/g, '[REDACTED_KEY]')
    .replace(/\b((?:api[_-]?key|service[_-]?role|secret|password|token)\s*[:=]\s*)\S+/gi, '$1[REDACTED]');
}

function israelDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
}

export function logConversation(entry: ConversationEntry, now: Date = new Date()): void {
  if (process.env.CHLOE_CONVERSATION_LOG === '0') return;
  if (process.env.VITEST && !process.env.CHLOE_CONVERSATION_LOG_DIR) return; // tests never write the real log
  try {
    const dir = conversationLogDir();
    mkdirSync(dir, { recursive: true });
    const row = {
      ts: now.toISOString(),
      ts_il: now.toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }),
      direction: entry.direction,
      from: entry.direction === 'outbound' ? 'chloe' : entry.jid || null,
      to: entry.direction === 'outbound' ? entry.jid || null : 'chloe',
      route: entry.route,
      ...(entry.handled !== undefined ? { handled: entry.handled } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
      text: entry.text == null ? null : redactSecrets(entry.text),
    };
    appendFileSync(join(dir, `conversations-${israelDate(now)}.jsonl`), JSON.stringify(row) + '\n', 'utf8');
  } catch {
    // logging must never break message handling
  }
}
