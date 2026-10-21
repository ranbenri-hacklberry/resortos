// Supplier expenses (Ran 2026-10-21): own JSONL file store, no DB, separate from manual-entries / cash-flow.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultFile = () => process.env.EXPENSES_FILE || path.resolve(__dirname, '..', 'data', 'expenses.jsonl');

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
const str = (v, max = 120) => { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; return s ? s.slice(0, max) : null; };
const norm = (s) => String(s || '').replace(/[\s"'״׳.,\-]/g, '').toLowerCase();

export function readExpenses(file = defaultFile()) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function validateExpense(body) {
  const e = {
    supplier: str(body?.supplier, 80), date: str(body?.date, 10), invoice_no: str(String(body?.invoice_no ?? ''), 30),
    subtotal: num(body?.subtotal), vat: num(body?.vat), total: num(body?.total), category: str(body?.category, 40) || 'אחר', site: str(body?.site, 60) || null,
    paid: body?.paid === true ? true : body?.paid === false ? false : null,
    image_paths: Array.isArray(body?.image_paths) ? body.image_paths.filter((p) => typeof p === 'string' && p).slice(0, 5) : [],
    approved_by: str(body?.approved_by, 160), source: str(body?.source, 60) || 'manual',
  };
  const errors = [];
  if (!e.supplier) errors.push('supplier required');
  if (!e.invoice_no) errors.push('invoice_no required');
  if (e.total === null || e.total <= 0) errors.push('total must be > 0');
  if (e.date && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) errors.push('date must be YYYY-MM-DD');
  if (!e.approved_by) errors.push('approved_by required');
  return { e, errors };
}

/** Duplicate = same supplier (normalised) + invoice_no; if both have totals they must match too. */
export function findDuplicate(list, e) {
  return list.find((x) => norm(x.supplier) === norm(e.supplier) && String(x.invoice_no) === String(e.invoice_no)
    && (x.total == null || e.total == null || Math.abs(Number(x.total) - Number(e.total)) < 0.01)) || null;
}

export function addExpense(body, file = defaultFile(), now = () => new Date()) {
  const { e, errors } = validateExpense(body);
  if (errors.length) return { status: 400, body: { ok: false, error: errors.join('; ') } };
  const dup = findDuplicate(readExpenses(file), e);
  if (dup) return { status: 409, body: { ok: false, duplicate: true, existing: dup } };
  const rec = { id: `exp_${now().getTime()}_${Math.random().toString(36).slice(2, 7)}`, ...e, created_at: now().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(rec) + '\n');
  return { status: 201, body: { ok: true, expense: rec } };
}

export function registerExpenseRoutes(app, auth, opts = {}) {
  const file = () => opts.file || defaultFile();
  app.get('/api/finance/expenses', auth, (req, res) => {
    try {
      let list = readExpenses(file()).sort((a, b) => String(b.date || b.created_at).localeCompare(String(a.date || a.created_at)));
      if (req.query?.from) list = list.filter((x) => String(x.date || '') >= String(req.query.from));
      if (req.query?.to) list = list.filter((x) => String(x.date || '') <= String(req.query.to));
      const total = Math.round(list.reduce((a, x) => a + (Number(x.total) || 0), 0) * 100) / 100;
      res.json({ ok: true, count: list.length, total, expenses: list });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });
  app.post('/api/finance/expenses', auth, (req, res) => {
    try {
      const r = addExpense({ ...req.body, approved_by: req.body?.approved_by || req.staffUser?.username }, file());
      res.status(r.status).json(r.body);
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });
}
