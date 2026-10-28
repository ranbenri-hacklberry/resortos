// Ran 2026-10-28: manager-only HYP Pay payment link ("💳 קישור תשלום") from a room scan / typed room.
// HYP API: GET https://pay.hyp.co.il/p/?action=payRequest&iCommand=CREATE (developers.hyp.co.il/pay/reference/actions).
// Safety: real CREATE only when HYP_PAYLINK_ENABLED=true AND HYP_PAYLINK_DRY_RUN is not 'true'.
// Credentials are read from env only and are never logged, stored or echoed back.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BookingRow } from '../integration/resortos.js';
import { displayPhone, phoneFromReply } from './guestLink.js';

export interface PayLinkDraft {
  roomId: string;
  roomLabel: string;
  bookingId: string;
  guestName: string;
  phone: string;
  amountAgorot: number;
  description: string;
}

export interface PayLinkResult {
  ok: boolean;
  dryRun: boolean;
  payRequestId?: string;
  paymentURL?: string;
  ccode?: string;
  error?: string;
}

export interface PayLinkClient {
  create(draft: PayLinkDraft): Promise<PayLinkResult>;
}

export function payLinkConfig(env: NodeJS.ProcessEnv = process.env) {
  const masof = env.HYP_PAYLINK_MASOF || env.HYP_A_MASOF || '';
  const passp = env.HYP_PAYLINK_PASSP || env.HYP_A_PASSP || '';
  const enabled = String(env.HYP_PAYLINK_ENABLED || '').toLowerCase() === 'true';
  const dryRun = !enabled || String(env.HYP_PAYLINK_DRY_RUN || '').toLowerCase() === 'true';
  return {
    baseUrl: env.HYP_BASE_URL || 'https://pay.hyp.co.il/p/',
    masof,
    passp,
    enabled,
    dryRun,
    missing: [!masof && 'HYP_A_MASOF', !passp && 'HYP_A_PASSP'].filter(Boolean) as string[],
  };
}

/** Builds the CREATE query (no secrets in the return used for logs: see redactUrl). */
export function buildCreateUrl(draft: PayLinkDraft, cfg: ReturnType<typeof payLinkConfig>): string {
  const q = new URLSearchParams({
    action: 'payRequest',
    iCommand: 'CREATE',
    Masof: cfg.masof,
    PassP: cfg.passp,
    Amount: (draft.amountAgorot / 100).toFixed(2),
    Coin: '1',
    ClientName: draft.guestName || 'אורח',
    cell: draft.phone,
    Info: draft.description,
    UTF8: 'True',
    UTF8out: 'True',
  });
  const base = cfg.baseUrl.endsWith('/') ? cfg.baseUrl : `${cfg.baseUrl}/`;
  return `${base}?${q.toString()}`;
}

export function redactUrl(url: string): string {
  return url.replace(/([?&](?:PassP|Masof|KEY)=)[^&]*/gi, '$1***');
}

export function parseCreateResponse(body: string): PayLinkResult {
  const text = String(body || '').trim();
  if (!text || /<html|<!doctype/i.test(text)) return { ok: false, dryRun: false, error: 'html_or_empty_response' };
  const p = new URLSearchParams(text);
  const ccode = p.get('CCode') ?? undefined;
  const paymentURL = p.get('paymentURL') || undefined;
  const payRequestId = p.get('payRequestId') || undefined;
  if ((ccode === undefined || ccode === '0') && paymentURL && payRequestId) {
    return { ok: true, dryRun: false, payRequestId, paymentURL, ccode: ccode ?? '0' };
  }
  return { ok: false, dryRun: false, ccode, error: p.get('errMsg') || `CCode=${ccode ?? '?'}` };
}

export function createHypPayLinkClient(fetchImpl: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env): PayLinkClient {
  return {
    async create(draft) {
      const cfg = payLinkConfig(env);
      if (cfg.dryRun) return { ok: true, dryRun: true };
      if (cfg.missing.length) return { ok: false, dryRun: false, error: `missing_env:${cfg.missing.join(',')}` };
      try {
        const res = await fetchImpl(buildCreateUrl(draft, cfg), { method: 'GET' });
        return parseCreateResponse(await res.text());
      } catch (err) {
        return { ok: false, dryRun: false, error: `network:${(err as Error)?.name || 'error'}` };
      }
    },
  };
}

export function payLinkStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.HYP_PAYLINK_STORE || join(env.DATA_DIR || join(process.cwd(), 'data'), 'hyp-paylinks.jsonl');
}

/** Append-only local record per booking/phone (no credentials). */
export function recordPayLink(entry: PayLinkDraft & { createdBy: string; result: PayLinkResult }, path = payLinkStorePath()): void {
  try {
    if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch { /* never break the chat on a log failure */ }
}

export function readPayLinks(path = payLinkStorePath()): Array<Record<string, unknown>> {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any;
}

function paidAgorot(b: BookingRow): number {
  const rows = Array.isArray(b.clearing_payments) ? b.clearing_payments as Array<{ amount_agorot?: number }> : [];
  const clearing = rows.reduce((sum, row) => sum + (Number(row?.amount_agorot) || 0), 0);
  if (b.payment_status === 'PAID') return Math.max(Number(b.total_price_agorot) || 0, clearing);
  return clearing;
}

/** Balance due from the booking (total − clearing payments; PAID → 0). */
export function balanceDueAgorot(b: BookingRow): number {
  const total = Number(b.total_price_agorot) || 0;
  return Math.max(0, total - paidAgorot(b));
}

export function shekelText(agorot: number): string {
  const n = Math.round(agorot) / 100;
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: n % 1 ? 2 : 0 })}`;
}

/** "סכום 450" / "450" / "₪450.5" → agorot. Phones are never amounts. */
export function amountFromReply(raw: string): number | null {
  const t = String(raw || '').trim();
  if (phoneFromReply(t)) return null;
  const m = t.match(/^(?:סכום|amount)?\s*[:\-]?\s*₪?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:₪|ש"?ח|שקל(?:ים)?)?$/i);
  if (!m) return null;
  const v = Math.round(Number(m[1].replace(',', '.')) * 100);
  return v > 0 ? v : null;
}

export function payLinkPreview(d: PayLinkDraft, dryRun: boolean): string {
  return `💳 *קישור תשלום · ${d.roomLabel}*\n` +
    `• אורח: *${d.guestName || 'ללא שם'}*\n` +
    `• סכום לתשלום: *${shekelText(d.amountAgorot)}*\n` +
    `• טלפון לקישור: *${d.phone || 'חסר'}*\n` +
    `• תיאור: ${d.description}\n\n` +
    `לשינוי סכום כתוב סכום (למשל 450). לשינוי טלפון (למשל בן/בת הזוג) כתוב מספר נייד.\n` +
    (d.phone && d.amountAgorot > 0 ? `השב *כן* ליצירת הקישור ושליחתו בסמס, או *לא* לביטול.` : `חסר ${d.phone ? 'סכום' : 'מספר טלפון'} – כתוב אותו כדי להמשיך.`) +
    (dryRun ? `\n🧪 מצב בדיקה: לא ייווצר קישור אמיתי.` : '');
}

export function draftFromBooking(roomId: string, roomLabel: string, b: BookingRow): PayLinkDraft {
  const ref = String(b.external_ref || b.kinorot_id || b.res_id || b.id || '').slice(0, 40);
  return {
    roomId,
    roomLabel,
    bookingId: b.id,
    guestName: String(b.guest_name || '').trim(),
    phone: displayPhone(b.guest_phone),
    amountAgorot: balanceDueAgorot(b),
    description: `${roomLabel} · הזמנה ${ref}`.slice(0, 120),
  };
}
