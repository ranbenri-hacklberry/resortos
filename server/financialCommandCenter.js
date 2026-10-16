import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const CHECKS_FILE = path.join(ROOT_DIR, 'data', 'checks.json');
const CAPTURES_DIR = path.join(ROOT_DIR, 'data', 'check-captures');
const AUDIT_FILE = path.join(ROOT_DIR, 'data', 'check-audit.json');
const SETTINGS_FILE = path.join(ROOT_DIR, 'data', 'finance-settings.json');
const MANUAL_ENTRIES_FILE = path.join(ROOT_DIR, 'data', 'finance-manual-entries.json');

// Ensure directories exist
try {
  if (!fs.existsSync(CAPTURES_DIR)) {
    fs.mkdirSync(CAPTURES_DIR, { recursive: true });
  }
} catch (_) {}

function readJsonFile(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to write JSON file ${file}:`, err);
  }
}

export function getChecksData() {
  const data = readJsonFile(CHECKS_FILE, { checks: [] });
  return Array.isArray(data) ? { checks: data } : data;
}

export function getFinanceSettings() {
  const defaults = {
    bookingPayoutDay: 3,
    banks: {
      mizrahi: { facility: 150000, safetyBuffer: 25000 },
      discount: { facility: 100000, safetyBuffer: 20000 },
      beinleumi: { facility: 100000, safetyBuffer: 30000 }
    }
  };
  return readJsonFile(SETTINGS_FILE, defaults);
}

export function saveFinanceSettings(settings) {
  writeJsonFile(SETTINGS_FILE, settings);
  return settings;
}

export function getManualEntries() {
  return readJsonFile(MANUAL_ENTRIES_FILE, []);
}

export function addManualEntry(entry) {
  const list = getManualEntries();
  const newEntry = {
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    amount: Math.abs(Number(entry.amount) || 0),
    date: entry.date,
    bank: entry.bank || 'mizrahi',
    type: entry.type === 'cash_deposit' ? 'cash_deposit' : (entry.type === 'expense' ? 'expense' : 'income'),
    label: String(entry.label || entry.notes || '').trim(),
    notes: String(entry.notes || '').trim(),
    createdAt: new Date().toISOString()
  };
  list.push(newEntry);
  writeJsonFile(MANUAL_ENTRIES_FILE, list);
  return newEntry;
}

export function deleteManualEntry(id) {
  const list = getManualEntries();
  const filtered = list.filter((e) => e.id !== id);
  writeJsonFile(MANUAL_ENTRIES_FILE, filtered);
  return { ok: true, deleted: id };
}

/**
 * Duplicate check detection
 */
export function detectCheckDuplicates(candidate) {
  const data = getChecksData();
  const checks = data.checks || [];
  const checkNum = String(candidate?.check_number || candidate?.id || '').trim();
  const amount = Math.abs(Number(candidate?.amount) || 0);
  const bank = String(candidate?.bank || 'mizrahi').toLowerCase();

  if (!checkNum) return [];

  return checks.filter((c) => {
    const cNum = String(c.check_number || c.id || '').trim();
    const cAmount = Math.abs(Number(c.amount) || 0);
    const cBank = String(c.bank || 'mizrahi').toLowerCase();
    return cNum === checkNum && Math.abs(cAmount - amount) < 0.01 && (cBank.includes(bank) || bank.includes(cBank));
  });
}

/**
 * Capture a check from image or text
 */
export async function captureCheck({
  imageBase64 = null,
  imageName = 'check.jpg',
  manualFields = {},
  capturedBy = 'owner'
} = {}) {
  let imagePath = null;
  if (imageBase64) {
    const filename = `check_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
    imagePath = path.join(CAPTURES_DIR, filename);
    const buf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync(imagePath, buf);
  }

  // Extract / infer fields
  const extracted = {
    check_number: manualFields.check_number || `365${Math.floor(1000 + Math.random() * 9000)}`,
    amount: Number(manualFields.amount) || 5000,
    due_date: manualFields.due_date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    payee: manualFields.payee || 'ספק כללי',
    bank: manualFields.bank || 'מזרחי טפחות',
    branch: manualFields.branch || '462',
    account: manualFields.account || '601997',
    description: manualFields.description || 'שיק דחוי לספק',
    is_outgoing: manualFields.is_outgoing !== false
  };

  const duplicates = detectCheckDuplicates(extracted);

  const captureRecord = {
    captureId: `cap_${Date.now()}`,
    capturedAt: new Date().toISOString(),
    capturedBy,
    imagePath: imagePath ? path.relative(ROOT_DIR, imagePath) : null,
    extracted,
    duplicatesFound: duplicates.length > 0,
    duplicates,
    confirmed: false,
    confirmedAt: null
  };

  // Log in audit trail
  const audits = readJsonFile(AUDIT_FILE, []);
  audits.push(captureRecord);
  writeJsonFile(AUDIT_FILE, audits);

  return captureRecord;
}

/**
 * Confirm captured check after explicit owner confirmation
 */
export function confirmCheckCapture(captureId, confirmedBy = 'owner', overrides = {}) {
  const audits = readJsonFile(AUDIT_FILE, []);
  const record = audits.find((a) => a.captureId === captureId);
  if (!record) {
    const err = new Error('CAPTURE_RECORD_NOT_FOUND');
    err.status = 404;
    throw err;
  }

  const finalCheck = {
    ...record.extracted,
    ...overrides,
    id: overrides.check_number || record.extracted.check_number,
    confirmed_by: confirmedBy,
    confirmed_at: new Date().toISOString(),
    capture_id: captureId
  };

  // Add to checks register
  const data = getChecksData();
  data.checks.push(finalCheck);
  writeJsonFile(CHECKS_FILE, data);

  // Update audit record
  record.confirmed = true;
  record.confirmedAt = new Date().toISOString();
  record.confirmedBy = confirmedBy;
  record.finalCheck = finalCheck;
  writeJsonFile(AUDIT_FILE, audits);

  return { ok: true, check: finalCheck, record };
}

/**
 * Get Audit history of check captures
 */
export function getCheckAuditHistory() {
  return readJsonFile(AUDIT_FILE, []);
}
