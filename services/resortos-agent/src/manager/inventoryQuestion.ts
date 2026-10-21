/**
 * Manager inventory over WhatsApp (Ran 2026-10-20).
 *  - Stock questions ("כמה נייר טואלט יש במלאי?") → read-only GET /api/inventory/items, short answer.
 *  - Transfers ("העברתי 21 חבילות נייר טואלט למחסן בגבעת יואב") → dry-run POST /api/inventory/transfer,
 *    summary + explicit confirm word "אשר העברה" (never a bare yes) → commit:true.
 * Managers only (caller enforces). All DB access goes through the ResortOS bridge.
 */

export interface InventoryItem { id: number; name: string; unit?: string | null; location?: string | null; current_stock?: number | null; settings?: { base_name?: string } | null }
/** Same item at another location is stored as "<base> · <location>" (unique name index); group by base. */
const baseName = (it: InventoryItem) => String(it.settings?.base_name || it.name);
export interface TransferPlan {
  item: string; unit?: string | null; quantity: number;
  from: { id: number; location: string | null; before: number; after: number };
  to: { id: number | null; name?: string; location: string; before: number; after: number; create: boolean };
}
export interface InventoryClient {
  listItems(): Promise<InventoryItem[]>;
  transfer(p: { item_id: number; quantity: number; to_location: string; confirmed_by?: string; commit?: boolean }): Promise<{ transfer?: TransferPlan; ok?: boolean; error?: string; status?: number }>;
}

export const TRANSFER_CONFIRM_WORD = 'אשר העברה';
export const TRANSFER_CANCEL_WORD = 'בטל העברה';
const PENDING_TTL_MS = 15 * 60 * 1000;

export function createInventoryClient(cfg: { bridgeUrl: string; businessId: string; fetch?: typeof fetch }): InventoryClient {
  const f = cfg.fetch || fetch;
  async function call(method: 'GET' | 'POST', p: string, body?: unknown) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const r = await f(`${cfg.bridgeUrl}${p}`, {
        method, signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-resortos-agent': 'true' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const txt = await r.text();
      let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
      return { ok: r.ok, status: r.status, data };
    } finally { clearTimeout(timer); }
  }
  return {
    async listItems() {
      const r = await call('GET', `/api/inventory/items?business_id=${cfg.businessId}`);
      if (!r.ok) throw new Error(`inventory ${r.status}`);
      return Array.isArray(r.data?.items) ? r.data.items : [];
    },
    async transfer(p) {
      const r = await call('POST', '/api/inventory/transfer', { business_id: cfg.businessId, ...p });
      return r.ok ? r.data : { error: r.data?.error || `HTTP_${r.status}`, status: r.status };
    },
  };
}

// ---------- Hebrew fuzzy matching ----------
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
export function normHe(s: string): string {
  return String(s || '').replace(/[\u0591-\u05C7]/g, '').replace(/[״"׳'`.,!?()\-/:]/g, ' ')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c]).toLowerCase().replace(/\s+/g, ' ').trim();
}
const STOP = new Set(['כמה', 'יש', 'נשאר', 'נשארו', 'עוד', 'מלאי', 'במלאי', 'המלאי', 'מחסנ', 'מחסן', 'במחסנ', 'במחסן', 'של', 'את', 'מה', 'לנו',
  'סטוק', 'stock', 'inventory', 'how', 'many', 'much', 'כל', 'מצב', 'בדוק', 'בדקי', 'תבדקי', 'תגידי', 'לי', 'האמ', 'אמ', 'יחידות', 'חבילות', 'קרטונימ', 'שקימ', 'יח']);
function tokens(s: string): string[] { return normHe(s).split(' ').filter(Boolean); }
function stripPrefix(t: string): string[] {
  const out = [t];
  let cur = t;
  for (let i = 0; i < 2 && cur.length > 2 && /^[הבלמוש]/.test(cur); i++) { cur = cur.slice(1); out.push(cur); }
  return out;
}
function tokenHit(q: string, nameToks: string[]): boolean {
  const vs = stripPrefix(q);
  return nameToks.some((n) => vs.some((v) => v.length >= 2 && (n === v || stripPrefix(n).includes(v) || (v.length >= 3 && (n.startsWith(v) || v.startsWith(n) && n.length >= 3)))));
}
/** Score 0..1: fraction of query tokens found in the item name. */
export function matchScore(query: string, name: string): number {
  const q = tokens(query).filter((t) => !STOP.has(t) && !STOP.has(stripPrefix(t).slice(-1)[0]));
  if (!q.length) return 0;
  const n = tokens(name);
  const hits = q.filter((t) => tokenHit(t, n)).length;
  const coverage = n.filter((t) => q.some((x) => tokenHit(x, [t]))).length / n.length;
  return (hits / q.length) * 0.7 + coverage * 0.3;
}
export function findItems(query: string, items: InventoryItem[]): InventoryItem[] {
  const scored = items.map((it) => ({ it, s: matchScore(query, baseName(it)) })).filter((x) => x.s >= 0.6);
  if (!scored.length) return [];
  const best = Math.max(...scored.map((x) => x.s));
  return scored.filter((x) => x.s >= best - 0.05).map((x) => x.it);
}

// ---------- intent detection ----------
const INV_WORD = /(?:מלאי|במחסן|מחסנים|stock|inventory)/i;
export function isInventoryQuestion(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 160 || parseTransfer(t)) return false;
  return INV_WORD.test(t) || /^כמה\s+.+\s+(?:נשאר|נשארו|יש\s+לנו|יש\s+במחסן)/.test(t);
}

export interface ParsedTransfer { quantity: number; itemText: string; toLocation: string; fromText?: string }
const UNIT_WORDS = /^(?:חבילות|חבילה|יחידות|יחידה|יח׳?|קרטונים|קרטון|שקים|שק|גלילים|בקבוקים|ארגזים)\s+/;
export function parseTransfer(text: string): ParsedTransfer | null {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  const m = t.match(/^(?:(?:תרשמי|תרשום|רשמי|רשום)\s+)?(?:העברתי|העברנו|העבירו|העביר|העברה\s+של|הועברו|הועבר|עברו)\s+(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!m) return null;
  const quantity = Number(m[1]);
  let rest = m[2].replace(UNIT_WORDS, '');
  const to = rest.match(/^(.*?)\s(?:אל\s+|ל)(ה?מחסן.*)$/) || rest.match(/^(.*)\s(?:אל\s+|ל)(\S.*)$/);
  if (!to) return null;
  let itemText = to[1].trim();
  const toLocation = to[2].replace(/^ה(?=מחסן)/, '').trim();
  let fromText: string | undefined;
  const fm = itemText.match(/^(.*?)\s(?:מה|מ)(מחסן.*)$/);
  if (fm) { itemText = fm[1].trim(); fromText = fm[2].trim(); }
  itemText = itemText.replace(UNIT_WORDS, '').replace(/^של\s+/, '').trim();
  if (!quantity || !itemText || !toLocation) return null;
  return { quantity, itemText, toLocation, fromText };
}

/** Map free text ("מחסן בגבעת יואב") to an existing location when one clearly matches. */
export function resolveLocation(text: string, known: string[]): string {
  const strip = (s: string) => tokens(s).map((x) => stripPrefix(x).slice(-1)[0]).filter((x) => x !== 'מחסנ' && x !== 'חסנ');
  const q = strip(text);
  let best = { loc: '', s: 0 };
  for (const loc of known) {
    const l = tokens(loc).filter((x) => x !== 'מחסנ');
    if (!l.length || !q.length) continue;
    const s = q.filter((x) => tokenHit(x, l)).length / Math.max(q.length, l.length);
    if (s > best.s) best = { loc, s };
  }
  if (best.s >= 0.99) return best.loc;
  return String(text).replace(/^מחסן\s+ב(?=\S{2,})/, 'מחסן ').trim();
}

/** Every meaningful word of `text` (minus "מחסן") appears in `loc`, e.g. "מחסן טוסקנה" ⊂ "מחסן טוסקנה (C/27)". */
export function locationMentioned(text: string, loc?: string | null): boolean {
  if (!loc) return false;
  const q = tokens(text).map((x) => (x === 'מחסנ' ? '' : x)).filter(Boolean);
  const l = tokens(loc).filter((x) => x !== 'מחסנ');
  return q.length > 0 && q.every((x) => tokenHit(x, l));
}

const fmtQty = (n: number | null | undefined) => (n === null || n === undefined ? 'לא נספר' : String(Math.round(Number(n) * 1000) / 1000));
function line(it: InventoryItem): string {
  return `${baseName(it)}: ${fmtQty(it.current_stock)}${it.unit ? ' ' + it.unit : ''}${it.location ? ` (${it.location})` : ''}`;
}

export function answerStockQuestion(text: string, items: InventoryItem[]): string {
  const hits = findItems(text, items);
  if (!hits.length) return 'לא מצאתי פריט כזה במלאי. איך הוא רשום? (למשל "כמה נייר טואלט יש במלאי")';
  const names = [...new Set(hits.map(baseName))];
  if (names.length > 3) return `מצאתי כמה פריטים: ${names.slice(0, 5).join(', ')}. לאיזה התכוונת?`;
  const shown = hits.slice(0, 6).map(line);
  if (hits.length > 6) shown.push(`ועוד ${hits.length - 6} מיקומים`);
  return `📦 ${shown.join('\n')}`;
}

// ---------- pending transfers ----------
interface Pending { itemId: number; quantity: number; toLocation: string; summary: string; at: number }
const pending = new Map<string, Pending>();
export function _clearPendingTransfers() { pending.clear(); }

function summaryOf(p: TransferPlan): string {
  const u = p.unit ? ` ${p.unit}` : '';
  return `העברה: ${p.quantity}${u} ${p.item}\n` +
    `מ: ${p.from.location || 'ללא מיקום'} (${fmtQty(p.from.before)} → ${fmtQty(p.from.after)})\n` +
    `אל: ${p.to.location} (${fmtQty(p.to.before)} → ${fmtQty(p.to.after)})${p.to.create ? ' – שורה חדשה במחסן הזה' : ''}`;
}

/**
 * Returns a reply when the message is an inventory matter for this manager, else null.
 * key = normalized sender phone; by = manager name.
 */
export async function handleManagerInventory(text: string, key: string, by: string, client: InventoryClient, now = Date.now()): Promise<string | null> {
  const t = String(text || '').trim();
  const p = pending.get(key);
  if (p && now - p.at > PENDING_TTL_MS) pending.delete(key);
  const live = pending.get(key);
  if (live && normHe(t) === normHe(TRANSFER_CONFIRM_WORD)) {
    pending.delete(key);
    const r = await client.transfer({ item_id: live.itemId, quantity: live.quantity, to_location: live.toLocation, confirmed_by: by, commit: true });
    if (r?.ok && r.transfer) return `✅ נרשם במלאי.\n${summaryOf(r.transfer)}`;
    return `❌ ההעברה לא נרשמה (${r?.error || 'שגיאה'}). המלאי לא השתנה.`;
  }
  if (live && normHe(t) === normHe(TRANSFER_CANCEL_WORD)) { pending.delete(key); return 'בוטל. המלאי לא השתנה.'; }

  const tr = parseTransfer(t);
  if (tr) {
    const items = await client.listItems();
    let hits = findItems(tr.itemText, items);
    if (tr.fromText) hits = hits.filter((h) => locationMentioned(tr.fromText!, h.location));
    if (!hits.length) return `לא מצאתי "${tr.itemText}" במלאי, אז אין ממה להעביר. איך הפריט רשום?`;
    const names = [...new Set(hits.map(baseName))];
    if (names.length > 1) return `לאיזה פריט התכוונת? ${names.slice(0, 5).join(' / ')}`;
    const toLocation = resolveLocation(tr.toLocation, [...new Set(items.map((i) => i.location).filter(Boolean) as string[])]);
    const sources = hits.filter((h) => normHe(h.location || '') !== normHe(toLocation) && (Number(h.current_stock) || 0) > 0);
    if (!sources.length) return `אין מלאי של ${names[0]} מחוץ ל${toLocation}.\n${hits.slice(0, 4).map(line).join('\n')}`;
    if (sources.length > 1) return `מאיזה מחסן? כתוב שוב עם המקור, למשל "העברתי ${tr.quantity} ${names[0]} ממחסן X ל${toLocation}"\n${sources.slice(0, 5).map(line).join('\n')}`;
    const r = await client.transfer({ item_id: sources[0].id, quantity: tr.quantity, to_location: toLocation });
    if (!r?.transfer) {
      if (String(r?.error || '').startsWith('INSUFFICIENT_STOCK')) return `אין מספיק: ${line(sources[0])}. לא רשמתי כלום.`;
      return `לא הצלחתי להכין את ההעברה (${r?.error || 'שגיאה'}). לא רשמתי כלום.`;
    }
    const summary = summaryOf(r.transfer);
    pending.set(key, { itemId: sources[0].id, quantity: tr.quantity, toLocation, summary, at: now });
    return `${summary}\n\nלרישום במלאי כתוב: *${TRANSFER_CONFIRM_WORD}*\nלביטול: ${TRANSFER_CANCEL_WORD}`;
  }

  if (isInventoryQuestion(t)) {
    const items = await client.listItems();
    return answerStockQuestion(t, items);
  }
  return null;
}
