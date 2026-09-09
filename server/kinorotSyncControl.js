import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUS_FILE = process.env.KINOROT_SYNC_STATUS_FILE || '/tmp/resortos-kinorot-sync-status.json';
const SCRIPT = path.join(ROOT, 'server', 'syncKinorotCalendar.js');

function emptyStatus() {
  return {
    running: false,
    lastOkAt: null,
    lastAttemptAt: null,
    lastError: null,
    rows: 0,
    journalUpdatedAt: null,
    changeId: null,
    changes: null
  };
}

export function readKinorotSyncStatus() {
  let status = emptyStatus();
  try {
    status = { ...status, ...JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')) };
  } catch {
    /* first run */
  }
  status.journalUpdatedAt = lastKinJournalIso();
  return status;
}

export function writeKinorotSyncStatus(patch) {
  const next = { ...readKinorotSyncStatus(), ...patch, journalUpdatedAt: lastKinJournalIso() };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(next, null, 2));
  return next;
}

function lastKinJournalIso() {
  const env = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin'}`,
    PGPASSWORD: process.env.PGPASSWORD || 'postgres'
  };
  const result = spawnSync(
    '/opt/homebrew/bin/psql',
    ['-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '54322', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c',
      "SELECT max(updated_at)::text FROM public.hotelos_bookings WHERE id LIKE 'kin\\_%' ESCAPE '\\' AND deleted_at IS NULL;"],
    { env, encoding: 'utf8' }
  );
  if (result.status !== 0) return null;
  const value = String(result.stdout || '').trim();
  return value && value !== '\\N' ? value : null;
}

export function startKinorotSync() {
  const current = readKinorotSyncStatus();
  if (current.running) return current;
  writeKinorotSyncStatus({
    running: true,
    lastAttemptAt: new Date().toISOString(),
    lastError: null
  });
  const child = spawn(process.execPath, [SCRIPT], {
    cwd: ROOT,
    env: process.env,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return readKinorotSyncStatus();
}
