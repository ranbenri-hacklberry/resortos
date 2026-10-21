// Tests for POST /api/inventory/transfer — fully mocked (fake app + in-memory PostgREST stub). Never touches a DB.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-transfer-'));
process.env.INVENTORY_AUDIT_FILE = path.join(TMP, 'audit.jsonl');
process.env.INVENTORY_EXPORT_DIR = path.join(TMP, 'exports');
process.env.SUPABASE_URL = 'http://stub.invalid';
const { registerInventoryRoutes } = await import('./inventoryGateway.js');

const BIZ = '22222222-2222-2222-2222-222222222222';
let table; let nextId; let failTargetPatch;
beforeEach(() => {
  nextId = 100; failTargetPatch = false;
  table = [
    { id: 1, business_id: BIZ, name: 'נייר טואלט', unit: 'חבילה', category: 'ניקיון', location: 'מחסן טוסקנה (C/27)', current_stock: 40, settings: { sku: 'TP1' } },
    { id: 2, business_id: BIZ, name: 'מגבות', unit: 'יח׳', category: 'מצעים', location: 'מחסן טוסקנה (C/27)', current_stock: 10, settings: {} },
    { id: 3, business_id: BIZ, name: 'מגבות', unit: 'יח׳', category: 'מצעים', location: 'מחסן גבעת יואב', current_stock: 5, settings: {} },
  ];
  try { fs.rmSync(process.env.INVENTORY_AUDIT_FILE); } catch {}
});

function filterRows(q) {
  return table.filter((r) => {
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit'].includes(k)) continue;
      if (k === 'settings->>archived_at') { if (v === 'is.null' && r.settings?.archived_at) return false; continue; }
      if (v.startsWith('eq.')) { if (String(r[k]) !== v.slice(3)) return false; }
      else if (v === 'is.null') { if (r[k] !== null && r[k] !== undefined) return false; }
      else if (v.startsWith('in.(')) { if (!v.slice(4, -1).split(',').includes(String(r[k]))) return false; }
    }
    return true;
  });
}
globalThis.fetch = async (url, init) => {
  const u = new URL(url); const q = u.searchParams; const body = init.body ? JSON.parse(init.body) : undefined;
  let out;
  if (init.method === 'GET') out = filterRows(q);
  else if (init.method === 'PATCH') {
    const hit = filterRows(q);
    if (failTargetPatch && hit[0]?.id === 3 && body.current_stock > 5) out = [];
    else { hit.forEach((r) => Object.assign(r, body)); out = hit.map((r) => ({ ...r })); }
  } else if (init.method === 'POST') { out = body.map((r) => { const row = { id: nextId++, ...r }; table.push(row); return row; }); }
  return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(out) };
};

const routes = {};
registerInventoryRoutes({ get: (p, g, h) => { routes[`GET ${p}`] = h; }, post: (p, g, h) => { routes[`POST ${p}`] = h; } }, (_q, _s, n) => n());
async function call(body) {
  let status = 200; let json;
  const res = { status(c) { status = c; return this; }, json(j) { json = j; return this; } };
  await routes['POST /api/inventory/transfer']({ body, staffUser: { name: 'רני' } }, res);
  return { status, json };
}
const audits = () => (fs.existsSync(process.env.INVENTORY_AUDIT_FILE) ? fs.readFileSync(process.env.INVENTORY_AUDIT_FILE, 'utf8').trim().split('\n').map(JSON.parse) : []);

test('dry-run by default: no writes, shows plan to a new location', async () => {
  const r = await call({ business_id: BIZ, item_id: 1, quantity: 21, to_location: 'מחסן גבעת יואב' });
  assert.equal(r.status, 200); assert.equal(r.json.dry_run, true);
  assert.deepEqual([r.json.transfer.from.before, r.json.transfer.from.after, r.json.transfer.to.create, r.json.transfer.to.after], [40, 19, true, 21]);
  assert.equal(table.find((x) => x.id === 1).current_stock, 40); assert.equal(table.length, 3); assert.equal(audits().length, 0);
});

test('commit creates target row copying item fields, decrements source, audits', async () => {
  const r = await call({ business_id: BIZ, item_id: 1, quantity: 21, to_location: 'מחסן גבעת יואב', commit: true, confirmed_by: 'רני' });
  assert.equal(r.json.ok, true);
  assert.equal(table.find((x) => x.id === 1).current_stock, 19);
  const t = table.find((x) => x.id === r.json.transfer.to.id);
  assert.deepEqual([t.name, t.unit, t.location, t.current_stock, t.settings.sku], ['נייר טואלט', 'חבילה', 'מחסן גבעת יואב', 21, 'TP1']);
  const a = audits(); assert.equal(a.length, 1); assert.equal(a[0].action, 'transfer'); assert.equal(a[0].ok, true);
});

test('commit increments existing target row by name', async () => {
  const r = await call({ business_id: BIZ, name: 'מגבות', from_location: 'מחסן טוסקנה (C/27)', quantity: 4, to_location: 'מחסן גבעת יואב', commit: true, confirmed_by: 'רני' });
  assert.equal(r.json.ok, true);
  assert.equal(table.find((x) => x.id === 2).current_stock, 6); assert.equal(table.find((x) => x.id === 3).current_stock, 9); assert.equal(table.length, 3);
});

test('rejects insufficient stock, missing confirmed_by on commit, bad qty, same location', async () => {
  assert.equal((await call({ business_id: BIZ, item_id: 2, quantity: 11, to_location: 'X' })).status, 409);
  assert.equal((await call({ business_id: BIZ, item_id: 2, quantity: 1, to_location: 'X', commit: true })).status, 400);
  assert.equal((await call({ business_id: BIZ, item_id: 2, quantity: -1, to_location: 'X' })).status, 400);
  assert.equal((await call({ business_id: BIZ, item_id: 2, quantity: 1, to_location: 'מחסן טוסקנה (C/27)' })).status, 400);
  assert.equal(table.find((x) => x.id === 2).current_stock, 10);
});

test('ambiguous name without from_location returns candidates', async () => {
  table.push({ id: 4, business_id: BIZ, name: 'מגבות', unit: 'יח׳', location: 'מחסן מאיה', current_stock: 3, settings: {} });
  const r = await call({ business_id: BIZ, name: 'מגבות', quantity: 1, to_location: 'מחסן חדש' });
  assert.equal(r.status, 409); assert.equal(r.json.error, 'AMBIGUOUS_SOURCE'); assert.equal(r.json.candidates.length, 3);
});

test('target concurrency failure rolls source back', async () => {
  failTargetPatch = true;
  const r = await call({ business_id: BIZ, item_id: 2, quantity: 4, to_location: 'מחסן גבעת יואב', commit: true, confirmed_by: 'רני' });
  assert.equal(r.status, 409); assert.match(r.json.error, /rolled back/);
  assert.equal(table.find((x) => x.id === 2).current_stock, 10);
  assert.equal(audits()[0].ok, false);
});
