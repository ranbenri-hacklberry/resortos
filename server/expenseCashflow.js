import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildExpenseCashflow } from '../src/lib/expenseCashflow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function checksPath() {
  const candidates = [
    process.env.HOTELOS_CHECKS_PATH,
    path.resolve(__dirname, '..', 'data', 'checks.json'),
    path.resolve(__dirname, '..', '..', 'private', 'deferred-checks', 'checks.json'),
    path.join(os.homedir(), 'Documents', 'Max', 'private', 'deferred-checks', 'checks.json')
  ].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file)) || candidates[0];
}

export function getExpenseCashflow() {
  const file = checksPath();
  if (!fs.existsSync(file)) {
    const err = new Error('CASHFLOW_SOURCE_MISSING');
    err.status = 404;
    throw err;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const checks = Array.isArray(data) ? data : (data.checks || []);
  return buildExpenseCashflow(checks, { from: '2026-10' });
}
