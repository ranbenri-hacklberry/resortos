#!/usr/bin/env node
/**
 * Live occupancy audit: Kinorot GO boards vs Studio hotelos_bookings.
 * Does not write to the database.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import {
  addDaysIso,
  bookingRow,
  dedupeIncomingOverlaps,
  scrapeKinorotBoards,
  todayIso
} from './syncKinorotCalendar.js';

const DAYS = Number(process.env.KINOROT_DAYS || 90);
const BACK_DAYS = Number(process.env.KINOROT_BACK_DAYS || 90);
process.env.KINOROT_DAYS = String(DAYS);
process.env.KINOROT_BACK_DAYS = String(BACK_DAYS);

function psqlJson(sql) {
  const env = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin'}`,
    PGPASSWORD: process.env.PGPASSWORD || 'postgres'
  };
  const result = spawnSync(
    '/opt/homebrew/bin/psql',
    ['-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '54322',
      '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { env, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'psql failed');
  }
  const raw = String(result.stdout || '').trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function namesClose(a, b) {
  const na = String(a || '').replace(/\s+/g, ' ').trim();
  const nb = String(b || '').replace(/\s+/g, ' ').trim();
  if (!na || !nb) return true;
  if (na === nb) return true;
  if (na === 'אורח' || nb === 'אורח') return true;
  return na.includes(nb) || nb.includes(na);
}

function overlaps(a, b) {
  return a.unit_id === b.unit_id
    && a.check_in_date < b.check_out_date
    && a.check_out_date > b.check_in_date;
}

const today = todayIso();
const from = addDaysIso(today, -BACK_DAYS);
const to = addDaysIso(today, DAYS);
console.log(`[compare] window ${from} → ${to} today=${today}`);

const { rows: scrapedRaw, unmapped } = await scrapeKinorotBoards();
const incoming = dedupeIncomingOverlaps(scrapedRaw.map((row) => bookingRow(row, today)));
const incomingById = new Map(incoming.map((row) => [row.id, row]));
console.log(`[compare] kinorot mapped stays ${incoming.length} unmapped tiles ${unmapped.length}`);

const studio = psqlJson(`
SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
FROM (
  SELECT id, unit_id, guest_name, check_in_date::text, check_out_date::text,
         booking_status, channel_source, deleted_at, updated_at
  FROM public.hotelos_bookings
  WHERE deleted_at IS NULL
    AND booking_status IS DISTINCT FROM 'CANCELED'
    AND check_out_date >= '${from}'::date
    AND check_in_date <= '${to}'::date
  ORDER BY check_in_date, unit_id
) t;
`);

const liveKin = studio.filter((row) => String(row.id || '').startsWith('kin_'));
const liveOther = studio.filter((row) => !String(row.id || '').startsWith('kin_'));
const studioById = new Map(liveKin.map((row) => [row.id, row]));

const missingInStudio = incoming.filter((row) => !studioById.has(row.id));
const extraInStudio = liveKin.filter((row) => !incomingById.has(row.id)
  && row.check_out_date >= today);
const dateOrUnitMismatch = incoming.flatMap((row) => {
  const have = studioById.get(row.id);
  if (!have) return [];
  const diffs = [];
  if (have.unit_id !== row.unit_id) diffs.push(`unit ${have.unit_id}→${row.unit_id}`);
  if (have.check_in_date !== row.check_in_date) diffs.push(`in ${have.check_in_date}→${row.check_in_date}`);
  if (have.check_out_date !== row.check_out_date) diffs.push(`out ${have.check_out_date}→${row.check_out_date}`);
  if (!namesClose(have.guest_name, row.guest_name)) diffs.push(`guest "${have.guest_name}"→"${row.guest_name}"`);
  if (!diffs.length) return [];
  return [{
    id: row.id,
    guest: row.guest_name,
    unit: row.unit_id,
    cin: row.check_in_date,
    cout: row.check_out_date,
    diffs
  }];
});

const localOverlaps = [];
for (const kin of incoming) {
  for (const other of liveOther) {
    if (!overlaps(kin, other)) continue;
    localOverlaps.push({
      kin_id: kin.id,
      kin_guest: kin.guest_name,
      local_id: other.id,
      local_guest: other.guest_name,
      unit_id: kin.unit_id,
      kin: `${kin.check_in_date}→${kin.check_out_date}`,
      local: `${other.check_in_date}→${other.check_out_date}`,
      source: other.channel_source || ''
    });
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  today,
  window: { from, to, days: DAYS, backDays: BACK_DAYS },
  counts: {
    kinorotStays: incoming.length,
    unmappedTiles: unmapped.length,
    studioLiveKin: liveKin.length,
    studioLiveOther: liveOther.length,
    missingInStudio: missingInStudio.length,
    extraInStudio: extraInStudio.length,
    fieldMismatches: dateOrUnitMismatch.length,
    localOverlaps: localOverlaps.length
  },
  missingInStudio: missingInStudio.slice(0, 80).map((row) => ({
    id: row.id,
    guest: row.guest_name,
    unit: row.unit_id,
    cin: row.check_in_date,
    cout: row.check_out_date
  })),
  extraInStudio: extraInStudio.slice(0, 80).map((row) => ({
    id: row.id,
    guest: row.guest_name,
    unit: row.unit_id,
    cin: row.check_in_date,
    cout: row.check_out_date,
    status: row.booking_status
  })),
  fieldMismatches: dateOrUnitMismatch.slice(0, 80),
  localOverlaps: localOverlaps.slice(0, 80),
  unmapped: unmapped.slice(0, 40)
};

const out = process.env.KINOROT_COMPARE_OUT || '/tmp/kinorot-occupancy-compare.json';
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.counts, null, 2));
console.log(`[compare] wrote ${out}`);
