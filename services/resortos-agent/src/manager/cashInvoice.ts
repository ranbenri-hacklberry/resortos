// Ran 2026-10-28: invoice (EZcount via HYP) for a cash collection a manager already confirmed.
// HYP API: action=soft&TransType=Cash (developers.hyp.co.il/pay/reference/actions#create-an-invoice-for-an-offline-transaction).
// Safety:
// - feature flag HYP_CASH_INVOICE_ENABLED=true AND booking id in HYP_CASH_INVOICE_BOOKINGS (allowlist; empty = nobody).
// - idempotency: one record per key (booking + amount + collection id); any existing record blocks a second issue.
// - a "pending" record is written BEFORE the HYP call; an ambiguous failure (network / html / unknown) becomes
//   "review" and is never retried automatically. Only a clear CCode≠0 rejection is "failed".
// - credentials come from env only and are never logged or stored.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface CashInvoiceRequest {
  key: string;
  bookingId: string;
  roomLabel: string;
  guestName: string;
  amountAgorot: number;
  email?: string;
  createdBy: string;
}

export type CashInvoiceStatus = 'pending' | 'issued' | 'failed' | 'review' | 'dry_run';

export interface CashInvoiceResult {
  status: CashInvoiceStatus | 'duplicate' | 'not_allowed';
  transId?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  ccode?: string;
  error?: string;
}

export function cashInvoiceConfig(env: NodeJS.ProcessEnv = process.env) {
  const enabled = String(env.HYP_CASH_INVOICE_ENABLED || '').toLowerCase() === 'true';
  const allow = String(env.HYP_CASH_INVOICE_BOOKINGS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const dryRun = String(env.HYP_CASH_INVOICE_DRY_RUN || '').toLowerCase() === 'true';
  return {
    enabled,
    allow,
    dryRun,
    baseUrl: env.HYP_BASE_URL || 'https://pay.hyp.co.il/p/',
    masof: env.HYP_PAYLINK_MASOF || env.HYP_B_MASOF || '',
    passp: env.HYP_PAYLINK_PASSP || env.HYP_B_PASSP || '',
    key: env.HYP_PAYLINK_KEY || env.HYP_B_KEY || '',
  };
}

/** Only flagged + allowlisted bookings may ever get a cash invoice. */
export function cashInvoiceAllowed(bookingId: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = cashInvoiceConfig(env);
  return cfg.enabled && !!bookingId && cfg.allow.includes(String(bookingId));
}

export function validEmail(e?: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
}

export function cashInvoiceKey(bookingId: string, amountAgorot: number, collectionId: string): string {
  return `cash:${bookingId}:${Math.round(amountAgorot)}:${collectionId}`;
}

export function buildCashInvoiceUrl(req: CashInvoiceRequest, cfg: ReturnType<typeof cashInvoiceConfig>): string {
  const amount = (req.amountAgorot / 100).toFixed(2);
  const desc = `לינה ${req.roomLabel}`.replace(/[\[\]~]/g, ' ').trim().slice(0, 100);
  const email = validEmail(req.email) ? String(req.email).trim() : '';
  const q = new URLSearchParams({
    action: 'soft',
    Masof: cfg.masof,
    PassP: cfg.passp,
    Amount: amount,
    TransType: 'Cash',
    ClientName: (req.guestName || 'אורח').slice(0, 60),
    UserId: '000000000',
    Info: `מזומן · ${req.roomLabel} · הזמנה ${req.bookingId}`.slice(0, 120),
    Pritim: 'True',
    heshDesc: `[0~${desc}~1~${amount}]`,
    'EZ.lang': 'he',
    SendHesh: email ? 'True' : 'False',
    UTF8: 'True',
    UTF8out: 'True',
  });
  if (email) q.set('email', email);
  const base = cfg.baseUrl.endsWith('/') ? cfg.baseUrl : `${cfg.baseUrl}/`;
  return `${base}?${q.toString()}`;
}

/** Classify the soft response: clear success / clear rejection / ambiguous. */
export function parseSoftResponse(body: string): CashInvoiceResult {
  const text = String(body || '').trim();
  if (!text || /<html|<!doctype/i.test(text)) return { status: 'review', error: 'html_or_empty_response' };
  const p = new URLSearchParams(text);
  const ccode = p.get('CCode');
  if (ccode === null) return { status: 'review', error: 'no_ccode' };
  if (ccode === '0') {
    const id = p.get('Id') || '';
    if (!id || id === '0') return { status: 'review', ccode, error: 'no_trans_id' };
    return { status: 'issued', ccode, transId: id, invoiceNumber: (p.get('Hesh') || '').replace(/^EZ$/, '') || undefined };
  }
  return { status: 'failed', ccode, error: p.get('errMsg') || `CCode=${ccode}` };
}

export function cashInvoiceStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.HYP_CASH_INVOICE_STORE || join(env.DATA_DIR || join(process.cwd(), 'data'), 'hyp-cash-invoices.jsonl');
}

export function readCashInvoices(path = cashInvoiceStorePath()): Array<Record<string, any>> {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any;
}

function append(path: string, entry: Record<string, unknown>) {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

/** Latest record per booking (for the booking's invoice number + link). */
export function cashInvoicesForBooking(bookingId: string, path = cashInvoiceStorePath()) {
  return readCashInvoices(path).filter((r) => r.bookingId === bookingId);
}

export interface CashInvoiceClient {
  issue(req: CashInvoiceRequest): Promise<CashInvoiceResult>;
}

/** PrintHesh signed link (same as functions/lib/hypPay.js createHypInvoiceLink). Returns undefined if not possible. */
export async function hypInvoiceLink(transId: string, fetchImpl: typeof fetch, cfg: { baseUrl: string; masof: string; passp: string; key: string }): Promise<string | undefined> {
  if (!transId || !cfg.key || !cfg.passp || !cfg.masof) return undefined;
  const q = new URLSearchParams({ action: 'APISign', What: 'SIGN', Sign: 'True', KEY: cfg.key, PassP: cfg.passp, Masof: cfg.masof, ACTION: 'PrintHesh', type: 'EZCOUNT', TransId: transId });
  const base = cfg.baseUrl.endsWith('/') ? cfg.baseUrl : `${cfg.baseUrl}/`;
  try {
    const text = (await (await fetchImpl(`${base}?${q.toString()}`, { method: 'GET' })).text()).trim();
    if (!text || /<html/i.test(text)) return undefined;
    const p = new URLSearchParams(text);
    const cc = p.get('CCode');
    if (cc && cc !== '0') return undefined;
    if (!p.get('signature')) return undefined;
    return `${base}?${text}`;
  } catch { return undefined; }
}

export function createCashInvoiceClient(fetchImpl: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env, store = cashInvoiceStorePath(env)): CashInvoiceClient {
  return {
    async issue(req) {
      const cfg = cashInvoiceConfig(env);
      if (!cashInvoiceAllowed(req.bookingId, env)) return { status: 'not_allowed' };
      if (readCashInvoices(store).some((r) => r.key === req.key)) return { status: 'duplicate' };
      const base = { key: req.key, bookingId: req.bookingId, roomLabel: req.roomLabel, amountAgorot: req.amountAgorot, createdBy: req.createdBy };
      if (cfg.dryRun) { append(store, { ...base, status: 'dry_run' }); return { status: 'dry_run' }; }
      if (!cfg.masof || !cfg.passp) return { status: 'failed', error: 'missing_env' };
      append(store, { ...base, status: 'pending' });
      let result: CashInvoiceResult;
      try {
        const res = await fetchImpl(buildCashInvoiceUrl(req, cfg), { method: 'GET' });
        result = parseSoftResponse(await res.text());
      } catch (err) {
        result = { status: 'review', error: `network:${(err as Error)?.name || 'error'}` };
      }
      if (result.status === 'issued' && result.transId) result.invoiceUrl = await hypInvoiceLink(result.transId, fetchImpl, cfg);
      append(store, { ...base, status: result.status, transId: result.transId, invoiceNumber: result.invoiceNumber, invoiceUrl: result.invoiceUrl, ccode: result.ccode, error: result.error });
      return result;
    },
  };
}

export function cashInvoiceAskText(roomLabel: string, hasEmail: boolean): string {
  return hasEmail
    ? `🧾 להפיק חשבונית מס קבלה על המזומן בחדר *${roomLabel}*? (כן/לא)`
    : `🧾 להפיק חשבונית מס קבלה על המזומן בחדר *${roomLabel}*? אין מייל בהזמנה — שלח/י מייל של האורח, או "כן" להפקה בלי מייל, או "לא".`;
}

export function cashInvoiceResultText(roomLabel: string, r: CashInvoiceResult): string {
  switch (r.status) {
    case 'issued': return `✅ הופקה חשבונית${r.invoiceNumber ? ` מס' ${r.invoiceNumber}` : ''} על המזומן בחדר *${roomLabel}*.${r.invoiceUrl ? '' : ' הקישור לחשבונית לא נשמר — אפשר להוריד מ-HYP.'}`;
    case 'dry_run': return `🧪 מצב בדיקה: לא הופקה חשבונית אמיתית על *${roomLabel}*.`;
    case 'duplicate': return `כבר הופקה (או בטיפול) חשבונית על הגבייה הזו ב-*${roomLabel}*. לא הפקתי שוב.`;
    case 'not_allowed': return `הפקת חשבונית על מזומן עוד לא פתוחה להזמנה הזו.`;
    case 'review': return `⚠️ לא ברור אם החשבונית על *${roomLabel}* הופקה. לא ניסיתי שוב — סימנתי לבדיקה ידנית ב-HYP.`;
    default: return `❌ HYP דחו את הפקת החשבונית על *${roomLabel}*${r.ccode ? ` (קוד ${r.ccode})` : ''}. לא הופק מסמך.`;
  }
}
