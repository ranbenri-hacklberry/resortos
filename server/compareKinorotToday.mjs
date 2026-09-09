#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { bookingRow, scrapeKinorotBoards, todayIso } from './syncKinorotCalendar.js';

const today = todayIso();
const { rows } = await scrapeKinorotBoards();
const mapped = rows.map((row) => bookingRow(row, today));
const occupying = mapped.filter((row) => row.check_in_date <= today && row.check_out_date > today);
const onBoardToday = mapped.filter((row) => row.check_in_date <= today && row.check_out_date >= today);

function units(sql) {
  const result = spawnSync(
    '/opt/homebrew/bin/psql',
    ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'postgres' }, encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(String(result.stdout || '[]').trim() || '[]');
}

const studio = units(`
SELECT COALESCE(json_agg(json_build_object(
  'unit_id', unit_id, 'guest_name', guest_name, 'id', id,
  'cin', check_in_date::text, 'cout', check_out_date::text
)), '[]'::json)
FROM hotelos_bookings
WHERE deleted_at IS NULL
  AND booking_status IS DISTINCT FROM 'CANCELED'
  AND check_in_date <= '${today}'::date
  AND check_out_date > '${today}'::date
`);
const studioUnits = new Set(studio.map((row) => row.unit_id));
const missing = occupying.filter((row) => !studioUnits.has(row.unit_id));
const extra = studio.filter((row) => !occupying.some((k) => k.unit_id === row.unit_id));
const checkoutToday = mapped.filter((row) => row.check_out_date === today);

console.log(JSON.stringify({
  today,
  kinorotInHouse: occupying.length,
  kinorotIncludingCheckoutToday: onBoardToday.length,
  studioInHouse: studio.length,
  missingOnStudio: missing.map((row) => ({
    unit: row.unit_id,
    guest: row.guest_name,
    cin: row.check_in_date,
    cout: row.check_out_date,
    id: row.id
  })),
  extraOnStudio: extra,
  checkoutTodayOnKinorot: checkoutToday.map((row) => ({
    unit: row.unit_id,
    guest: row.guest_name,
    cin: row.check_in_date
  }))
}, null, 2));
