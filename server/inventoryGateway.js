// Manager-only inventory endpoints (added 2026-10-19, approved by Ran).
// All DB access stays server-side through the bridge's existing Supabase client config.
// Soft-archive only: rows are never hard-deleted. Reusable for invoice-created items later.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Paths overridable via env (tests point them at a temp dir so they never touch the real audit log).
const outDir = () => process.env.INVENTORY_EXPORT_DIR || path.join(ROOT, 'data', 'inventory-exports');
const auditFile = () => process.env.INVENTORY_AUDIT_FILE || path.join(ROOT, 'data', 'inventory-audit.jsonl');
const MAX_ROWS = 5000;

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}
function dbKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}
function dbLabel() {
  try {
    const u = new URL(supabaseUrl());
    const local = ['127.0.0.1', 'localhost', '::1'].includes(u.hostname);
    return { kind: local ? 'local' : 'cloud', host: `${u.hostname}${u.port ? ':' + u.port : ''}` };
  } catch { return { kind: 'unknown', host: '' }; }
}

async function rest(method, pathAndQuery, body, extraHeaders = {}) {
  const key = dbKey();
  const response = await fetch(`${supabaseUrl()}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!response.ok) {
    const err = new Error(data?.message || response.statusText);
    err.status = response.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

function audit(entry) {
  try {
    fs.mkdirSync(path.dirname(auditFile()), { recursive: true });
    fs.appendFileSync(auditFile(), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  } catch (err) { console.error('[inventory audit]', err.message); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cleanBusinessIds(v) {
  const list = (Array.isArray(v) ? v : v ? [v] : []).map(String).map((s) => s.trim()).filter(Boolean);
  if (list.some((s) => !UUID.test(s))) { const e = new Error('INVALID_BUSINESS_ID'); e.status = 400; throw e; }
  return list;
}
function cleanIds(v) {
  const list = (Array.isArray(v) ? v : v ? [v] : []).map((x) => Number(x));
  if (list.some((n) => !Number.isInteger(n) || n <= 0)) { const e = new Error('INVALID_IDS'); e.status = 400; throw e; }
  return list;
}

// Archive marker lives in the existing settings jsonb (no schema change):
// settings.archived_at / settings.archived_by / settings.archive_reason
const ACTIVE = 'settings->>archived_at=is.null';
const ARCHIVED = 'settings->>archived_at=not.is.null';
const ARCHIVE_KEYS = ['archived_at', 'archived_by', 'archive_reason'];
const isArchived = (r) => Boolean(r?.settings && typeof r.settings === 'object' && r.settings.archived_at);

async function listItems({ businessIds = [], ids = [], includeArchived = false, archivedOnly = false } = {}) {
  const parts = ['select=*', 'order=business_id.asc,id.asc', `limit=${MAX_ROWS}`];
  if (businessIds.length) parts.push(`business_id=in.(${businessIds.join(',')})`);
  if (ids.length) parts.push(`id=in.(${ids.join(',')})`);
  if (archivedOnly) parts.push(ARCHIVED);
  else if (!includeArchived) parts.push(ACTIVE);
  const rows = await rest('GET', `inventory_items?${parts.join('&')}`);
  return { rows: Array.isArray(rows) ? rows : [], archiveMarker: 'settings.archived_at' };
}

function countBy(rows) {
  const out = {};
  for (const r of rows) {
    const b = r.business_id || 'none';
    out[b] = out[b] || { total: 0, active: 0, archived: 0 };
    out[b].total += 1;
    if (isArchived(r)) out[b].archived += 1; else out[b].active += 1;
  }
  return out;
}

async function preflight() {
  const q = async (sql) => {
    try { return await rest('POST', 'rpc/run_sql', { query_text: sql }); } catch (err) { return { error: err.message }; }
  };
  const triggers = await q("select trigger_name, action_timing, event_manipulation from information_schema.triggers where event_object_schema='public' and event_object_table='inventory_items' order by 1,3");
  const sync = await q("select key, case when key='remote_service_key' then (case when value is null or value='' or value like 'your_%' then 'placeholder' else 'set' end) when key='remote_url' then regexp_replace(value,'^https?://([^/]+).*$','\\1') else value end as value from public.sync_settings order by key");
  const queue = await q("select status, count(*)::int as n, max(created_at) as last from public.sync_queue where table_name='inventory_items' group by status");
  return { db: dbLabel(), triggers, sync_settings: sync, sync_queue_inventory: queue };
}
function toCsv(rows) {
  const cols = [...rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set())].filter((k) => k !== 'embedding');
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\ufeff' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

function writeSnapshot(label, rows) {
  const OUT_DIR = outDir();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(OUT_DIR, `${label}-${ts}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(rows, null, 2), 'utf8');
  fs.writeFileSync(`${base}.csv`, toCsv(rows), 'utf8');
  return { json: path.relative(ROOT, `${base}.json`), csv: path.relative(ROOT, `${base}.csv`) };
}

function who(req) { return req.staffUser?.username || req.staffUser?.name || 'manager'; }
function fail(res, err) { res.status(Number(err.status) || 500).json({ error: err.message || 'INVENTORY_FAILED', code: err.code }); }

export function registerInventoryRoutes(app, guard) {
  app.get('/api/inventory/items', guard, async (req, res) => {
    try {
      const businessIds = cleanBusinessIds(req.query.business_id ? String(req.query.business_id).split(',') : []);
      const includeArchived = ['1', 'true', 'yes'].includes(String(req.query.include_archived || '').toLowerCase());
      const archivedOnly = ['1', 'true', 'yes'].includes(String(req.query.archived_only || '').toLowerCase());
      const { rows, archiveMarker } = await listItems({ businessIds, includeArchived, archivedOnly });
      const slim = String(req.query.full || '') !== '1';
      res.json({
        db: dbLabel(), archive_marker: archiveMarker, count: rows.length, counts: countBy(rows),
        items: slim ? rows.map(({ embedding, ...r }) => r) : rows,
      });
    } catch (err) { fail(res, err); }
  });

  app.post('/api/inventory/export', guard, async (req, res) => {
    try {
      const businessIds = cleanBusinessIds(req.body?.business_ids || req.body?.business_id);
      const { rows, archiveMarker } = await listItems({ businessIds, includeArchived: true });
      const files = writeSnapshot('export', rows.map(({ embedding, ...r }) => r));
      audit({ action: 'export', by: who(req), business_ids: businessIds, count: rows.length, files });
      res.json({ db: dbLabel(), archive_marker: archiveMarker, count: rows.length, counts: countBy(rows), files, items: rows.map(({ embedding, ...r }) => r) });
    } catch (err) { fail(res, err); }
  });

  app.get('/api/inventory/preflight', guard, async (req, res) => {
    try { res.json(await preflight()); } catch (err) { fail(res, err); }
  });

  async function setArchived(req, res, archive) {
    try {
      const businessIds = cleanBusinessIds(req.body?.business_ids || req.body?.business_id);
      const ids = cleanIds(req.body?.ids);
      if (!businessIds.length && !ids.length) { const e = new Error('SCOPE_REQUIRED'); e.status = 400; throw e; }
      const reason = String(req.body?.reason || '').slice(0, 300) || null;
      if (archive && !reason) { const e = new Error('REASON_REQUIRED'); e.status = 400; throw e; }
      const dryRun = Boolean(req.body?.dry_run);
      const { rows } = await listItems({ businessIds, ids, includeArchived: !archive, archivedOnly: !archive });
      const targets = rows.map((r) => r.id);
      if (dryRun || !targets.length) {
        return res.json({ dry_run: dryRun, action: archive ? 'archive' : 'restore', matched: targets.length, ids: targets, counts: countBy(rows) });
      }
      const snapshot = writeSnapshot(archive ? 'pre-archive' : 'pre-restore', rows.map(({ embedding, ...r }) => r));
      const at = new Date().toISOString();
      const by = who(req);
      const updated = [];
      const failed = [];
      for (const row of rows) {
        const base = row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings) ? { ...row.settings } : {};
        let settings;
        if (archive) settings = { ...base, archived_at: at, archived_by: by, archive_reason: reason };
        else { settings = { ...base }; for (const k of ARCHIVE_KEYS) delete settings[k]; }
        try {
          const out = await rest('PATCH', `inventory_items?id=eq.${row.id}&${archive ? ACTIVE : ARCHIVED}`, { settings }, { Prefer: 'return=representation' });
          if (Array.isArray(out) && out.length) updated.push(row.id); else failed.push({ id: row.id, error: 'NO_MATCH' });
        } catch (err) { failed.push({ id: row.id, error: err.message }); }
      }
      audit({ action: archive ? 'archive' : 'restore', by, business_ids: businessIds, ids_requested: ids, matched: targets.length, updated: updated.length, failed, ids: updated, reason, snapshot });
      res.json({ ok: failed.length === 0, action: archive ? 'archive' : 'restore', matched: targets.length, updated: updated.length, failed, ids: updated, snapshot });
    } catch (err) { fail(res, err); }
  }

  // Create inventory items from a manager-confirmed invoice. Dry-run unless commit === true.
  // Requires confirmed_by + invoice reference; never called automatically.
  const ITEM_FIELDS = ['name', 'category', 'unit', 'current_stock', 'cost_per_unit', 'supplier', 'supplier_id', 'location',
    'low_stock_threshold_units', 'display_unit', 'base_unit', 'supplier_product_name', 'case_quantity'];
  const META_FIELDS = ['sku', 'pack', 'invoice_line', 'line_total', 'qty_unit_note', 'invoice_date', 'supplier_vat', 'invoice_image'];
  app.post('/api/inventory/items', guard, async (req, res) => {
    try {
      const businessId = cleanBusinessIds(req.body?.business_id)[0];
      if (!businessId) { const e = new Error('BUSINESS_ID_REQUIRED'); e.status = 400; throw e; }
      const confirmedBy = String(req.body?.confirmed_by || '').trim();
      const invoiceRef = String(req.body?.invoice_ref || '').trim();
      if (!confirmedBy || !invoiceRef) { const e = new Error('CONFIRMATION_REQUIRED: confirmed_by and invoice_ref'); e.status = 400; throw e; }
      const input = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!input.length || input.length > 200) { const e = new Error('ITEMS_REQUIRED (1-200)'); e.status = 400; throw e; }
      const rows = input.map((it, i) => {
        const row = { business_id: businessId };
        for (const k of ITEM_FIELDS) if (it?.[k] !== undefined && it?.[k] !== '') row[k] = it[k];
        for (const k of ['name', 'category', 'unit']) {
          if (!String(row[k] || '').trim()) { const e = new Error(`ITEM_${i}_${k.toUpperCase()}_REQUIRED`); e.status = 400; throw e; }
        }
        const meta = {};
        for (const k of META_FIELDS) if (it?.[k] !== undefined && it?.[k] !== null && it?.[k] !== '') meta[k] = it[k];
        row.settings = { ...meta, source: 'invoice', invoice_ref: invoiceRef, confirmed_by: confirmedBy, confirmed_at: new Date().toISOString() };
        row.last_count_source = 'invoice';
        return row;
      });
      // Duplicate guard: an active item of this business with the same invoice_ref + sku (or name when no sku)
      const existing = await rest('GET', `inventory_items?select=id,name,settings&business_id=eq.${businessId}&${ACTIVE}&settings->>invoice_ref=eq.${encodeURIComponent(invoiceRef)}&limit=${MAX_ROWS}`);
      const keyOf = (r) => `${r.settings?.sku || ''}|${r.settings?.sku ? '' : String(r.name || '').trim()}`;
      const seen = new Map((Array.isArray(existing) ? existing : []).map((r) => [keyOf(r), r.id]));
      const fresh = [];
      const skipped = [];
      for (const r of rows) {
        const k = keyOf(r);
        if (seen.has(k)) skipped.push({ name: r.name, sku: r.settings?.sku || null, existing_id: seen.get(k) });
        else { seen.set(k, null); fresh.push(r); }
      }
      if (req.body?.commit !== true) return res.json({ dry_run: true, would_create: fresh.length, skipped, rows: fresh });
      if (!fresh.length) return res.json({ ok: true, created: 0, ids: [], skipped });
      const out = await rest('POST', 'inventory_items', fresh, { Prefer: 'return=representation' });
      const createdRows = Array.isArray(out) ? out.map((r) => ({ id: r.id, name: r.name, sku: r.settings?.sku || null })) : [];
      const created = createdRows.map((r) => r.id);
      audit({ action: 'create', by: who(req), business_id: businessId, invoice_ref: invoiceRef, confirmed_by: confirmedBy, created, items: createdRows, skipped });
      res.json({ ok: true, created: created.length, ids: created, items: createdRows, skipped });
    } catch (err) { fail(res, err); }
  });

  // Narrow metadata update (category / location only). Dry-run unless commit === true.
  const UPDATE_FIELDS = ['category', 'location'];
  app.post('/api/inventory/items/update', guard, async (req, res) => {
    try {
      const businessId = cleanBusinessIds(req.body?.business_id)[0];
      const ids = cleanIds(req.body?.ids);
      if (!businessId || !ids.length) { const e = new Error('BUSINESS_ID_AND_IDS_REQUIRED'); e.status = 400; throw e; }
      const confirmedBy = String(req.body?.confirmed_by || '').trim();
      if (!confirmedBy) { const e = new Error('CONFIRMED_BY_REQUIRED'); e.status = 400; throw e; }
      const set = req.body?.set && typeof req.body.set === 'object' ? req.body.set : {};
      const keys = Object.keys(set);
      if (!keys.length || keys.some((k) => !UPDATE_FIELDS.includes(k))) { const e = new Error(`ONLY_FIELDS_ALLOWED: ${UPDATE_FIELDS.join(',')}`); e.status = 400; throw e; }
      for (const k of keys) {
        if (typeof set[k] !== 'string' || !set[k].trim() || set[k].length > 120) { const e = new Error(`INVALID_${k.toUpperCase()}`); e.status = 400; throw e; }
        set[k] = set[k].trim();
      }
      const { rows } = await listItems({ businessIds: [businessId], ids });
      const found = new Set(rows.map((r) => r.id));
      const missing = ids.filter((id) => !found.has(id));
      const changes = rows.map((r) => ({ id: r.id, name: r.name, before: Object.fromEntries(keys.map((k) => [k, r[k]])), after: set }));
      if (req.body?.commit !== true) return res.json({ dry_run: true, matched: rows.length, missing, changes });
      if (missing.length) { const e = new Error(`IDS_NOT_ACTIVE_IN_BUSINESS: ${missing.join(',')}`); e.status = 409; throw e; }
      const snapshot = writeSnapshot('pre-update', rows.map(({ embedding, ...r }) => r));
      const out = await rest('PATCH', `inventory_items?business_id=eq.${businessId}&id=in.(${ids.join(',')})&${ACTIVE}`, set, { Prefer: 'return=representation' });
      const updated = Array.isArray(out) ? out.map((r) => r.id) : [];
      audit({ action: 'update', by: who(req), business_id: businessId, confirmed_by: confirmedBy, set, ids: updated, changes, snapshot });
      res.json({ ok: updated.length === ids.length, updated: updated.length, ids: updated, snapshot });
    } catch (err) { fail(res, err); }
  });

  // Receive stock from a manager-confirmed invoice for EXISTING items: increments current_stock only,
  // records invoice_ref in settings.receipts. Dry-run unless commit === true. Idempotent per invoice_ref.
  app.post('/api/inventory/items/receive', guard, async (req, res) => {
    try {
      const businessId = cleanBusinessIds(req.body?.business_id)[0];
      if (!businessId) { const e = new Error('BUSINESS_ID_REQUIRED'); e.status = 400; throw e; }
      const confirmedBy = String(req.body?.confirmed_by || '').trim();
      const invoiceRef = String(req.body?.invoice_ref || '').trim();
      if (!confirmedBy || !invoiceRef) { const e = new Error('CONFIRMATION_REQUIRED: confirmed_by and invoice_ref'); e.status = 400; throw e; }
      const input = Array.isArray(req.body?.lines) ? req.body.lines : [];
      if (!input.length || input.length > 200) { const e = new Error('LINES_REQUIRED (1-200)'); e.status = 400; throw e; }
      const lines = input.map((l, i) => {
        const id = Number(l?.id); const qty = Number(l?.qty);
        if (!Number.isInteger(id) || id <= 0) { const e = new Error(`LINE_${i}_ID_INVALID`); e.status = 400; throw e; }
        if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) { const e = new Error(`LINE_${i}_QTY_INVALID`); e.status = 400; throw e; }
        return { id, qty, sku: l?.sku ? String(l.sku).slice(0, 40) : null, unit_price: Number.isFinite(Number(l?.unit_price)) ? Number(l.unit_price) : null, invoice_line: Number.isInteger(Number(l?.invoice_line)) ? Number(l.invoice_line) : null };
      });
      const ids = [...new Set(lines.map((l) => l.id))];
      if (ids.length !== lines.length) { const e = new Error('DUPLICATE_IDS_IN_REQUEST'); e.status = 400; throw e; }
      const { rows } = await listItems({ businessIds: [businessId], ids });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const missing = ids.filter((id) => !byId.has(id));
      if (missing.length) { const e = new Error(`IDS_NOT_ACTIVE_IN_BUSINESS: ${missing.join(',')}`); e.status = 409; throw e; }
      const plan = [];
      const skipped = [];
      for (const l of lines) {
        const r = byId.get(l.id);
        const receipts = Array.isArray(r.settings?.receipts) ? r.settings.receipts : [];
        if (receipts.some((x) => String(x?.invoice_ref) === invoiceRef) || String(r.settings?.invoice_ref || '') === invoiceRef) {
          skipped.push({ id: r.id, name: r.name, reason: 'ALREADY_RECEIVED_FOR_INVOICE' });
          continue;
        }
        const before = Number(r.current_stock) || 0;
        plan.push({ id: r.id, name: r.name, sku: l.sku || r.settings?.sku || null, before, add: l.qty, after: Math.round((before + l.qty) * 1000) / 1000, row: r, line: l });
      }
      const view = plan.map(({ row, line, ...p }) => p);
      if (req.body?.commit !== true) return res.json({ dry_run: true, would_update: plan.length, changes: view, skipped });
      if (!plan.length) return res.json({ ok: true, updated: 0, ids: [], changes: [], skipped });
      const snapshot = writeSnapshot('pre-receive', plan.map((p) => { const { embedding, ...r } = p.row; return r; }));
      const at = new Date().toISOString();
      const updated = [];
      const failed = [];
      for (const p of plan) {
        const base = p.row.settings && typeof p.row.settings === 'object' && !Array.isArray(p.row.settings) ? { ...p.row.settings } : {};
        const receipt = { invoice_ref: invoiceRef, qty: p.add, unit_price: p.line.unit_price, invoice_line: p.line.invoice_line, confirmed_by: confirmedBy, at };
        const settings = { ...base, receipts: [...(Array.isArray(base.receipts) ? base.receipts : []), receipt], last_receipt: receipt };
        const guardStock = p.row.current_stock === null || p.row.current_stock === undefined ? 'current_stock=is.null' : `current_stock=eq.${p.row.current_stock}`;
        try {
          const out = await rest('PATCH', `inventory_items?id=eq.${p.id}&business_id=eq.${businessId}&${guardStock}&${ACTIVE}`, { current_stock: p.after, settings }, { Prefer: 'return=representation' });
          if (Array.isArray(out) && out.length) updated.push(p.id); else failed.push({ id: p.id, error: 'CHANGED_CONCURRENTLY_OR_NO_MATCH' });
        } catch (err) { failed.push({ id: p.id, error: err.message }); }
      }
      audit({ action: 'receive', by: who(req), business_id: businessId, invoice_ref: invoiceRef, confirmed_by: confirmedBy, changes: view, updated, failed, skipped, snapshot });
      res.json({ ok: failed.length === 0, updated: updated.length, ids: updated, changes: view, failed, skipped, snapshot });
    } catch (err) { fail(res, err); }
  });

  // Transfer stock between locations (added 2026-10-20, approved by Ran). Dry-run unless commit === true.
  // Source row is decremented (rejected if insufficient); the same item's row at to_location is incremented,
  // or created (copying the item's descriptive fields) when none exists. Optimistic concurrency like /receive.
  const normLoc = (s) => String(s || '').replace(/[״"׳']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const COPY_FIELDS = ['name', 'category', 'unit', 'cost_per_unit', 'supplier', 'supplier_id', 'low_stock_threshold_units',
    'display_unit', 'base_unit', 'supplier_product_name', 'case_quantity'];
  app.post('/api/inventory/transfer', guard, async (req, res) => {
    try {
      const b = req.body || {};
      const businessId = cleanBusinessIds(b.business_id)[0];
      if (!businessId) { const e = new Error('BUSINESS_ID_REQUIRED'); e.status = 400; throw e; }
      const qty = Number(b.quantity);
      if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) { const e = new Error('QUANTITY_INVALID'); e.status = 400; throw e; }
      const toLocation = String(b.to_location || '').trim();
      if (!toLocation || toLocation.length > 120) { const e = new Error('TO_LOCATION_REQUIRED'); e.status = 400; throw e; }
      const fromLocation = String(b.from_location || '').trim();
      const confirmedBy = String(b.confirmed_by || '').trim();
      if (b.commit === true && !confirmedBy) { const e = new Error('CONFIRMED_BY_REQUIRED'); e.status = 400; throw e; }
      const { rows } = await listItems({ businessIds: [businessId] });
      let source;
      if (b.item_id !== undefined && b.item_id !== null && b.item_id !== '') {
        const id = cleanIds(b.item_id)[0];
        source = rows.find((r) => r.id === id);
        if (!source) { const e = new Error(`ITEM_NOT_ACTIVE_IN_BUSINESS: ${id}`); e.status = 409; throw e; }
      } else {
        const name = String(b.name || '').trim();
        if (!name) { const e = new Error('ITEM_ID_OR_NAME_REQUIRED'); e.status = 400; throw e; }
        const cands = rows.filter((r) => normLoc(r.name) === normLoc(name) && normLoc(r.location) !== normLoc(toLocation)
          && (!fromLocation || normLoc(r.location) === normLoc(fromLocation)));
        if (cands.length !== 1) {
          return res.status(409).json({ error: cands.length ? 'AMBIGUOUS_SOURCE' : 'SOURCE_NOT_FOUND', candidates: cands.map((r) => ({ id: r.id, name: r.name, location: r.location, current_stock: r.current_stock })) });
        }
        source = cands[0];
      }
      if (fromLocation && normLoc(source.location) !== normLoc(fromLocation)) { const e = new Error('SOURCE_LOCATION_MISMATCH'); e.status = 409; throw e; }
      if (normLoc(source.location) === normLoc(toLocation)) { const e = new Error('SAME_LOCATION'); e.status = 400; throw e; }
      const before = Number(source.current_stock) || 0;
      if (before < qty) { const e = new Error(`INSUFFICIENT_STOCK: ${before} < ${qty}`); e.status = 409; throw e; }
      const target = rows.find((r) => r.id !== source.id && normLoc(r.name) === normLoc(source.name) && normLoc(r.location) === normLoc(toLocation)) || null;
      const round = (n) => Math.round(n * 1000) / 1000;
      const plan = {
        item: source.name, unit: source.unit, quantity: qty,
        from: { id: source.id, location: source.location || null, before, after: round(before - qty) },
        to: target
          ? { id: target.id, location: target.location, before: Number(target.current_stock) || 0, after: round((Number(target.current_stock) || 0) + qty), create: false }
          : { id: null, location: toLocation, before: 0, after: qty, create: true },
      };
      if (b.commit !== true) return res.json({ dry_run: true, transfer: plan });
      const snapshot = writeSnapshot('pre-transfer', [source, target].filter(Boolean).map(({ embedding, ...r }) => r));
      const at = new Date().toISOString();
      const by = who(req);
      const rec = { qty, from_id: source.id, from_location: source.location || null, to_location: plan.to.location, confirmed_by: confirmedBy, at };
      const withLog = (row, entry) => {
        const base = row?.settings && typeof row.settings === 'object' && !Array.isArray(row.settings) ? { ...row.settings } : {};
        return { ...base, transfers: [...(Array.isArray(base.transfers) ? base.transfers : []), entry], last_transfer: entry };
      };
      const eqStock = (r) => (r.current_stock === null || r.current_stock === undefined ? 'current_stock=is.null' : `current_stock=eq.${r.current_stock}`);
      const dec = await rest('PATCH', `inventory_items?id=eq.${source.id}&business_id=eq.${businessId}&${eqStock(source)}&${ACTIVE}`,
        { current_stock: plan.from.after, settings: withLog(source, { ...rec, direction: 'out' }) }, { Prefer: 'return=representation' });
      if (!Array.isArray(dec) || !dec.length) {
        audit({ action: 'transfer', by, business_id: businessId, ok: false, error: 'CHANGED_CONCURRENTLY_OR_NO_MATCH', transfer: plan, snapshot });
        const e = new Error('CHANGED_CONCURRENTLY_OR_NO_MATCH'); e.status = 409; throw e;
      }
      let targetId = target?.id || null;
      try {
        if (target) {
          const inc = await rest('PATCH', `inventory_items?id=eq.${target.id}&business_id=eq.${businessId}&${eqStock(target)}&${ACTIVE}`,
            { current_stock: plan.to.after, settings: withLog(target, { ...rec, direction: 'in' }) }, { Prefer: 'return=representation' });
          if (!Array.isArray(inc) || !inc.length) throw new Error('TARGET_CHANGED_CONCURRENTLY_OR_NO_MATCH');
        } else {
          const row = { business_id: businessId, location: toLocation, current_stock: qty, last_count_source: 'transfer' };
          for (const k of COPY_FIELDS) if (source[k] !== undefined && source[k] !== null) row[k] = source[k];
          const sku = source.settings?.sku;
          const entry = { ...rec, direction: 'in' };
          row.settings = { ...(sku ? { sku } : {}), source: 'transfer', transferred_from: source.id, confirmed_by: confirmedBy, confirmed_at: at, transfers: [entry], last_transfer: entry };
          const out = await rest('POST', 'inventory_items', [row], { Prefer: 'return=representation' });
          targetId = Array.isArray(out) && out[0] ? out[0].id : null;
          if (!targetId) throw new Error('TARGET_CREATE_FAILED');
        }
      } catch (err) {
        // Roll the source back, guarded on the value we just wrote.
        let rolledBack = false;
        try {
          const rb = await rest('PATCH', `inventory_items?id=eq.${source.id}&business_id=eq.${businessId}&current_stock=eq.${plan.from.after}`,
            { current_stock: source.current_stock ?? null, settings: source.settings ?? {} }, { Prefer: 'return=representation' });
          rolledBack = Array.isArray(rb) && rb.length > 0;
        } catch { /* reported below */ }
        audit({ action: 'transfer', by, business_id: businessId, ok: false, error: err.message, rolled_back: rolledBack, transfer: plan, snapshot });
        const e = new Error(`${err.message}${rolledBack ? ' (source rolled back)' : ' (SOURCE_ROLLBACK_FAILED)'}`); e.status = 409; throw e;
      }
      plan.to.id = targetId;
      audit({ action: 'transfer', by, business_id: businessId, ok: true, confirmed_by: confirmedBy, transfer: plan, snapshot });
      res.json({ ok: true, transfer: plan, snapshot });
    } catch (err) { fail(res, err); }
  });

  app.post('/api/inventory/archive', guard, (req, res) => setArchived(req, res, true));
  app.post('/api/inventory/restore', guard, (req, res) => setArchived(req, res, false));
}
