import { describe, it, expect, vi, beforeEach } from 'vitest';
import realRooms from '../../data/rooms.json' with { type: 'json' };
import { createPipeline } from '../pipeline.js';
import { detectInventoryIntent } from '../llm/client.js';
import {
  parseTransfer, isInventoryQuestion, findItems, answerStockQuestion, resolveLocation, handleManagerInventory,
  _clearPendingTransfers, createInventoryClient, type InventoryClient, type InventoryItem,
} from './inventoryQuestion.js';

const ITEMS: InventoryItem[] = [
  { id: 1, name: 'נייר טואלט', unit: 'חבילה', location: 'מחסן טוסקנה (C/27)', current_stock: 40 },
  { id: 2, name: 'מגבות גדולות', unit: 'יח׳', location: 'מחסן טוסקנה (C/27)', current_stock: 12 },
  { id: 3, name: 'מגבות גדולות', unit: 'יח׳', location: 'מחסן גבעת יואב', current_stock: 3 },
  { id: 4, name: 'נייר מגבת', unit: 'גליל', location: 'מחסן טוסקנה (C/27)', current_stock: 8 },
  { id: 5, name: 'קפסולות קפה', unit: 'יח׳', location: 'מחסן מאיה', current_stock: 200 },
];
function fakeClient(items = ITEMS) {
  const transfer = vi.fn(async (p: any) => {
    const src = items.find((i) => i.id === p.item_id)!;
    if ((src.current_stock || 0) < p.quantity) return { error: `INSUFFICIENT_STOCK: ${src.current_stock} < ${p.quantity}`, status: 409 };
    const tgt = items.find((i) => i.name === src.name && i.location === p.to_location);
    const plan = { item: src.name, unit: src.unit, quantity: p.quantity,
      from: { id: src.id, location: src.location!, before: src.current_stock!, after: src.current_stock! - p.quantity },
      to: { id: tgt?.id ?? null, location: p.to_location, before: tgt?.current_stock ?? 0, after: (tgt?.current_stock ?? 0) + p.quantity, create: !tgt } };
    return p.commit ? { ok: true, transfer: plan } : { dry_run: true, transfer: plan };
  });
  return { listItems: vi.fn(async () => items), transfer } as InventoryClient & { transfer: typeof transfer; listItems: any };
}
beforeEach(() => _clearPendingTransfers());

describe('parsing + intent', () => {
  it('parses Ran\'s transfer sentence', () => {
    expect(parseTransfer('העברתי 21 חבילות נייר טואלט למחסן בגבעת יואב')).toEqual({ quantity: 21, itemText: 'נייר טואלט', toLocation: 'מחסן בגבעת יואב', fromText: undefined });
    expect(parseTransfer('תרשמי העברה של 21 חבילות נייר טואלט למחסן בגבעת יואב')?.quantity).toBe(21);
    expect(parseTransfer('העברתי 4 מגבות גדולות ממחסן טוסקנה למחסן גבעת יואב')).toMatchObject({ itemText: 'מגבות גדולות', fromText: 'מחסן טוסקנה', toLocation: 'מחסן גבעת יואב' });
    expect(parseTransfer('העברתי את האורח לחדר 3')).toBeNull();
  });
  it('detects stock questions but not room/ops messages', () => {
    expect(detectInventoryIntent('כמה נייר טואלט יש במלאי?')).toBe('INVENTORY_QUERY');
    expect(detectInventoryIntent('כמה קפסולות נשארו?')).toBe('INVENTORY_QUERY');
    expect(detectInventoryIntent('העברתי 21 חבילות נייר טואלט למחסן בגבעת יואב')).toBe('INVENTORY_TRANSFER');
    for (const t of ['נורית 3 מוכן', 'מי נכנס לבתי נורית בסופ״ש', 'כן', 'חסר נייר טואלט בטוסקנה 2']) expect(detectInventoryIntent(t)).toBeNull();
    expect(isInventoryQuestion('')).toBe(false);
  });
  it('fuzzy Hebrew match picks נייר טואלט and not נייר מגבת', () => {
    expect(findItems('כמה נייר טואלט יש במלאי', ITEMS).map((i) => i.id)).toEqual([1]);
    expect(findItems('טואלט', ITEMS).map((i) => i.id)).toEqual([1]);
    expect(findItems('המגבות הגדולות', ITEMS).map((i) => i.id)).toEqual([2, 3]);
  });
  it('maps "מחסן בגבעת יואב" onto an existing location, or a clean new name', () => {
    expect(resolveLocation('מחסן בגבעת יואב', ['מחסן גבעת יואב', 'מחסן טוסקנה (C/27)'])).toBe('מחסן גבעת יואב');
    expect(resolveLocation('מחסן בגבעת יואב', ['מחסן טוסקנה (C/27)'])).toBe('מחסן גבעת יואב');
  });
});

describe('stock answers', () => {
  it('short answer with qty, unit and location', () => {
    expect(answerStockQuestion('כמה נייר טואלט יש במלאי?', ITEMS)).toBe('📦 נייר טואלט: 40 חבילה (מחסן טוסקנה (C/27))');
    const t = answerStockQuestion('כמה מגבות גדולות במלאי', ITEMS);
    expect(t).toContain('מחסן גבעת יואב'); expect(t.split('\n')).toHaveLength(2);
  });
  it('never dumps the whole inventory', () => {
    expect(answerStockQuestion('מה יש במלאי', ITEMS)).toMatch(/לא מצאתי/);
    expect(answerStockQuestion('כמה שמפו יש במלאי', ITEMS)).toMatch(/לא מצאתי/);
  });
});

describe('suffixed per-location rows', () => {
  it('groups "<base> · <location>" rows under the base name', async () => {
    const items = [...ITEMS, { id: 9, name: 'נייר טואלט · מחסן גבעת יואב', unit: 'חבילה', location: 'מחסן גבעת יואב', current_stock: 21, settings: { base_name: 'נייר טואלט' } }];
    const t = answerStockQuestion('כמה נייר טואלט יש במלאי', items);
    expect(t).toContain('נייר טואלט: 40 חבילה (מחסן טוסקנה (C/27))'); expect(t).toContain('נייר טואלט: 21 חבילה (מחסן גבעת יואב)');
    const c = fakeClient(items);
    expect(await handleManagerInventory('העברתי 2 נייר טואלט למחסן מאיה', 'k2', 'רני', c)).toMatch(/מאיזה מחסן/);
  });
});

describe('transfer flow', () => {
  it('dry-run → summary + confirm word; bare "כן" does not commit; "אשר העברה" commits', async () => {
    const c = fakeClient();
    const r1 = await handleManagerInventory('העברתי 21 חבילות נייר טואלט למחסן בגבעת יואב', 'k', 'רני', c);
    expect(r1).toContain('40 → 19'); expect(r1).toContain('מחסן גבעת יואב'); expect(r1).toContain('אשר העברה');
    expect(c.transfer).toHaveBeenCalledTimes(1); expect(c.transfer.mock.calls[0][0].commit).toBeUndefined();
    expect(await handleManagerInventory('כן', 'k', 'רני', c)).toBeNull();
    const r2 = await handleManagerInventory('אשר העברה', 'k', 'רני', c);
    expect(r2).toContain('✅'); expect(c.transfer.mock.calls[1][0]).toMatchObject({ item_id: 1, quantity: 21, to_location: 'מחסן גבעת יואב', commit: true, confirmed_by: 'רני' });
    expect(await handleManagerInventory('אשר העברה', 'k', 'רני', c)).toBeNull();
  });
  it('cancel and expiry never commit', async () => {
    const c = fakeClient();
    await handleManagerInventory('העברתי 2 נייר טואלט למחסן מאיה', 'k', 'רני', c, 0);
    expect(await handleManagerInventory('בטל העברה', 'k', 'רני', c, 1000)).toContain('בוטל');
    await handleManagerInventory('העברתי 2 נייר טואלט למחסן מאיה', 'k', 'רני', c, 0);
    expect(await handleManagerInventory('אשר העברה', 'k', 'רני', c, 16 * 60 * 1000)).toBeNull();
    expect(c.transfer.mock.calls.every((x) => !x[0].commit)).toBe(true);
  });
  it('insufficient stock / ambiguous source / unknown item', async () => {
    const c = fakeClient();
    expect(await handleManagerInventory('העברתי 50 נייר טואלט למחסן מאיה', 'k', 'רני', c)).toMatch(/אין מספיק/);
    expect(await handleManagerInventory('העברתי 2 מגבות גדולות למחסן מאיה', 'k', 'רני', c)).toMatch(/מאיזה מחסן/);
    expect(await handleManagerInventory('העברתי 2 מגבות גדולות ממחסן טוסקנה למחסן מאיה', 'k', 'רני', c)).toContain('12 → 10');
    expect(await handleManagerInventory('העברתי 2 שמפו למחסן מאיה', 'k', 'רני', c)).toMatch(/לא מצאתי/);
  });
  it('client calls the bridge endpoints with the agent header', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ items: ITEMS }) }));
    const c = createInventoryClient({ bridgeUrl: 'http://bridge', businessId: 'B', fetch: f as any });
    await c.listItems(); await c.transfer({ item_id: 1, quantity: 1, to_location: 'X' });
    expect((f.mock.calls[0] as any)[0]).toBe('http://bridge/api/inventory/items?business_id=B');
    expect((f.mock.calls[1] as any)[0]).toBe('http://bridge/api/inventory/transfer');
    expect(JSON.parse((f.mock.calls[1] as any)[1].body)).toEqual({ business_id: 'B', item_id: 1, quantity: 1, to_location: 'X' });
  });
});

describe('pipeline wiring', () => {
  const MANAGER = '972548317887'; const WORKER = '66812345678';
  function deps(inv: any) {
    const sent: string[] = [];
    const rooms = ((realRooms as any).rooms || realRooms) as any[];
    return Object.assign({
      send: vi.fn(async (_j: string, t: string) => void sent.push(t)), isAudio: () => false,
      extractText: (m: any) => m.message?.conversation ?? null, transcribe: vi.fn(),
      llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn(async (t: string) => t) },
      resortos: { markRoomReady: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn(), updateUnitStatus: vi.fn(), listUnits: vi.fn(async () => []), listBookings: vi.fn(async () => []) },
      cleaners: () => [{ phone: MANAGER, name: 'רני', role: 'MANAGER', language: 'he' }, { phone: WORKER, name: 'Som', role: 'CLEANER', language: 'th' }],
      rooms: () => rooms, log: { info() {}, warn() {}, error() {} }, inventory: inv,
    } as any, { sent });
  }
  const msg = (from: string, text: string) => ({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }) as any;
  it('manager gets stock answer and transfer confirmation', async () => {
    const c = fakeClient(); const d = deps(c); const p = createPipeline(d);
    await p.handleInbound(msg(MANAGER, 'כמה נייר טואלט יש במלאי?'));
    expect(d.sent.at(-1)).toContain('נייר טואלט: 40');
    await p.handleInbound(msg(MANAGER, 'העברתי 21 חבילות נייר טואלט למחסן בגבעת יואב'));
    expect(d.sent.at(-1)).toContain('אשר העברה');
    await p.handleInbound(msg(MANAGER, 'אשר העברה'));
    expect(d.sent.at(-1)).toContain('✅');
    expect(c.transfer.mock.calls.filter((x: any) => x[0].commit)).toHaveLength(1);
  });
  it('non-managers never reach inventory', async () => {
    const c = fakeClient(); const d = deps(c); const p = createPipeline(d);
    await p.handleInbound(msg(WORKER, 'כמה נייר טואלט יש במלאי?'));
    await p.handleInbound(msg('972500000001', 'העברתי 21 חבילות נייר טואלט למחסן בגבעת יואב'));
    expect(c.listItems).not.toHaveBeenCalled(); expect(c.transfer).not.toHaveBeenCalled();
  });
});
