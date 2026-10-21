// Tests for /api/finance/expenses — fake app, temp file. Never touches a DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { registerExpenseRoutes } from './expenses.js';

function harness(authOk = true) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exp-')), 'expenses.jsonl');
  const routes = {};
  const app = { get: (p, a, h) => (routes[`GET ${p}`] = [a, h]), post: (p, a, h) => (routes[`POST ${p}`] = [a, h]) };
  const auth = (req, res, next) => (authOk ? ((req.staffUser = { username: 'chloe' }), next()) : res.status(401).json({ error: 'unauthorized' }));
  registerExpenseRoutes(app, auth, { file });
  const call = (key, req) => new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
    const [a, h] = routes[key];
    a(req, res, () => h(req, res));
  });
  return { file, call };
}
const body = { supplier: 'גרר הצפון', date: '2026-10-21', invoice_no: '3310', subtotal: 400, vat: 72, total: 472, category: 'רכב/גרירה', paid: true, image_paths: ['/x/a.jpg'], approved_by: 'רן' };

test('POST creates, GET lists', async () => {
  const h = harness();
  const r = await h.call('POST /api/finance/expenses', { body, query: {} });
  assert.equal(r.status, 201);
  assert.equal(r.body.expense.category, 'רכב/גרירה');
  assert.ok(r.body.expense.created_at);
  const g = await h.call('GET /api/finance/expenses', { query: {} });
  assert.equal(g.body.count, 1);
  assert.equal(g.body.total, 472);
});
test('duplicate supplier+invoice_no(+total) → 409', async () => {
  const h = harness();
  await h.call('POST /api/finance/expenses', { body, query: {} });
  const r = await h.call('POST /api/finance/expenses', { body: { ...body, supplier: 'גרר  הצפון' }, query: {} });
  assert.equal(r.status, 409);
  assert.equal(r.body.duplicate, true);
  const other = await h.call('POST /api/finance/expenses', { body: { ...body, total: 500 }, query: {} });
  assert.equal(other.status, 201);
});
test('validation → 400', async () => {
  const h = harness();
  const r = await h.call('POST /api/finance/expenses', { body: { supplier: 'x' }, query: {} });
  assert.equal(r.status, 400);
});
test('auth enforced (401)', async () => {
  const h = harness(false);
  const r = await h.call('POST /api/finance/expenses', { body, query: {} });
  assert.equal(r.status, 401);
  assert.equal(fs.existsSync(h.file), false);
});
