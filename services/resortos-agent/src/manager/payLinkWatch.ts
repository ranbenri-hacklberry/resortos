// Ran 2026-10-28: after a guest pays a Chloe payment link, save the invoice link with the booking record.
// Mechanism: HYP has no per-link notify URL for payRequest, so we POLL server-to-server:
//   GET pay.hyp.co.il/p/?action=payRequest&iCommand=LIST&Masof&PassP → status 3 = Paid
//   (developers.hyp.co.il/pay/reference/actions#get-a-list-of-payment-links).
// Authenticity: nothing inbound is trusted — every fact comes from our own authenticated HTTPS call to HYP.
// LIST does not return the transaction id; a TransactionFinder (HYP transactions report, matched by
// amount + Info/booking + date) supplies it, then PrintHesh (APISign, type=EZCOUNT) gives the invoice link.
// Writes ONLY a local append-only file (hyp-paylink-paid.jsonl). No DB writes, no guest messages.
// Off unless HYP_PAYLINK_WATCH_ENABLED=true.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { payLinkStorePath, readPayLinks, shekelText } from './hypPayLink.js';
import { hypInvoiceLink } from './cashInvoice.js';

export interface ListedLink { payRequestId: string; status: string; Amount?: string; dateCreated?: string }
export interface TransactionFinder {
  /** Return the HYP TransId for a paid link, or undefined if not (yet) unambiguous. */
  find(link: { payRequestId: string; bookingId: string; amountAgorot: number; description: string; createdAt: string }): Promise<string | undefined>;
}

export function payLinkWatchConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    enabled: String(env.HYP_PAYLINK_WATCH_ENABLED || '').toLowerCase() === 'true',
    intervalMs: Math.max(60_000, Number(env.HYP_PAYLINK_WATCH_INTERVAL_MS) || 5 * 60_000),
    baseUrl: env.HYP_BASE_URL || 'https://pay.hyp.co.il/p/',
    masof: env.HYP_PAYLINK_MASOF || env.HYP_B_MASOF || '',
    passp: env.HYP_PAYLINK_PASSP || env.HYP_B_PASSP || '',
    key: env.HYP_PAYLINK_KEY || env.HYP_B_KEY || '',
  };
}

export function paidStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.HYP_PAYLINK_PAID_STORE || join(env.DATA_DIR || join(process.cwd(), 'data'), 'hyp-paylink-paid.jsonl');
}

function readJsonl(path: string): Array<Record<string, any>> {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any;
}

export function parseListResponse(body: string): ListedLink[] | null {
  const text = String(body || '').trim();
  if (!text.startsWith('[')) return null; // CCode=… or html → not a list
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr.filter((x) => x && x.payRequestId).map((x) => ({ ...x, payRequestId: String(x.payRequestId), status: String(x.status) })) : null;
  } catch { return null; }
}

export interface WatchDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  finder?: TransactionFinder;
  /** Optional: tell the manager who created the link (never the guest). */
  notifyManager?: (jid: string, text: string) => Promise<void>;
  linksPath?: string;
  paidPath?: string;
}

/** One poll. Returns what was newly recorded. Idempotent per payRequestId. */
export async function pollPaidLinks(deps: WatchDeps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const cfg = payLinkWatchConfig(env);
  const linksPath = deps.linksPath || payLinkStorePath(env);
  const paidPath = deps.paidPath || paidStorePath(env);
  const done = new Set(readJsonl(paidPath).filter((r) => r.status === 'paid_linked' || r.status === 'paid_no_trans' && r.final).map((r) => String(r.payRequestId)));
  const open = readPayLinks(linksPath).filter((e: any) => e?.result?.ok && !e.result.dryRun && e.result.payRequestId && !done.has(String(e.result.payRequestId))) as any[];
  if (!open.length) return [];
  if (!cfg.masof || !cfg.passp) return [];
  const base = cfg.baseUrl.endsWith('/') ? cfg.baseUrl : `${cfg.baseUrl}/`;
  const url = `${base}?${new URLSearchParams({ action: 'payRequest', iCommand: 'LIST', Masof: cfg.masof, PassP: cfg.passp }).toString()}`;
  let listed: ListedLink[] | null = null;
  try { listed = parseListResponse(await (await fetchImpl(url, { method: 'GET' })).text()); } catch { listed = null; }
  if (!listed) return [];
  const byId = new Map(listed.map((l) => [l.payRequestId, l]));
  const seenPending = new Set(readJsonl(paidPath).map((r) => String(r.payRequestId)));
  const out: Array<Record<string, any>> = [];
  for (const e of open) {
    const id = String(e.result.payRequestId);
    const l = byId.get(id);
    if (!l || l.status !== '3') continue;
    const transId = deps.finder ? await deps.finder.find({ payRequestId: id, bookingId: e.bookingId, amountAgorot: e.amountAgorot, description: e.description, createdAt: e.at }).catch(() => undefined) : undefined;
    const invoiceUrl = transId ? await hypInvoiceLink(transId, fetchImpl, cfg) : undefined;
    const rec = {
      at: new Date().toISOString(), payRequestId: id, bookingId: e.bookingId, roomLabel: e.roomLabel, amountAgorot: e.amountAgorot,
      status: invoiceUrl ? 'paid_linked' : 'paid_no_trans', transId, invoiceUrl,
    };
    if (rec.status === 'paid_no_trans' && seenPending.has(id)) continue; // already noted once; keep retrying silently
    if (!existsSync(dirname(paidPath))) mkdirSync(dirname(paidPath), { recursive: true });
    appendFileSync(paidPath, `${JSON.stringify(rec)}\n`);
    out.push(rec);
    if (deps.notifyManager && e.createdByJid) {
      const text = `💳 שולם קישור תשלום: *${e.roomLabel}* · ${shekelText(e.amountAgorot)}${e.guestName ? ` · ${e.guestName}` : ''}.${invoiceUrl ? '\nהחשבונית נשמרה עם ההזמנה.' : '\nהחשבונית ב-HYP; קישור עוד לא נשמר.'}`;
      await deps.notifyManager(String(e.createdByJid), text).catch(() => undefined);
    }
  }
  return out;
}

export function startPayLinkWatch(deps: WatchDeps = {}): (() => void) | undefined {
  const cfg = payLinkWatchConfig(deps.env || process.env);
  if (!cfg.enabled) return undefined;
  const t = setInterval(() => { void pollPaidLinks(deps).catch(() => undefined); }, cfg.intervalMs);
  t.unref?.();
  return () => clearInterval(t);
}
