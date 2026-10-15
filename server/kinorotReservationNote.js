import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  reservationFormFields,
  reservationNoteFromHtml,
  withReservationNote
} from '../src/lib/kinorotReservationNote.js';
import {
  kinorotLogin,
  kinorotRequest,
  loadKinorotJar,
  saveKinorotJar
} from './syncKinorotCalendar.js';

const BASE = 'https://app.kinorotgo.co.il';
const REQUIRED = ['guestname', 'checkin', 'checkout', 'res', 'unit[]', 'price[]'];

function fail(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function loggedOut(html) {
  return /name="pass"|הכניסו את פרטי ההתחברות/.test(String(html || '').slice(0, 8000));
}

async function reservationHtml(resId, jar) {
  let page = await kinorotRequest(`${BASE}/bookres.php?res=${encodeURIComponent(resId)}&hp=1`, jar);
  if (loggedOut(page.text) || !page.text.includes('reservation-form')) {
    await kinorotLogin(jar);
    saveKinorotJar(jar);
    page = await kinorotRequest(`${BASE}/bookres.php?res=${encodeURIComponent(resId)}&hp=1`, jar);
  }
  if (!page.text.includes('reservation-form')) throw fail('כינורות לא פתח את ההזמנה', 502);
  return page.text;
}

function assertReservationFields(fields) {
  const values = new Map(fields);
  const missing = REQUIRED.filter((name) => !String(values.get(name) || '').trim());
  if (missing.length) throw fail('כינורות החזיר הזמנה חלקית', 502);
}

export async function readKinorotReservationNote(resId) {
  const id = String(resId || '').trim();
  if (!/^\d+$/.test(id)) throw fail('הזמנה לא תקינה', 400);
  const jar = loadKinorotJar();
  const html = await reservationHtml(id, jar);
  saveKinorotJar(jar);
  return { ok: true, resId: id, note: reservationNoteFromHtml(html) };
}

export async function writeKinorotReservationNote(resId, note) {
  const id = String(resId || '').trim();
  if (!/^\d+$/.test(id)) throw fail('הזמנה לא תקינה', 400);
  const text = String(note || '').slice(0, 4000);
  const jar = loadKinorotJar();
  const html = await reservationHtml(id, jar);
  const fields = withReservationNote(reservationFormFields(html), text);
  assertReservationFields(fields);
  const body = new FormData();
  for (const [name, value] of fields) body.append(name, value);
  const saved = await kinorotRequest(`${BASE}/reservationnew-page-3-080726.php`, jar, {
    method: 'POST',
    body,
    followRedirect: false,
    headers: {
      Referer: `${BASE}/bookres.php?res=${id}&hp=1`,
      Origin: BASE
    }
  });
  saveKinorotJar(jar);
  if (!/res=\d+/.test(saved.location || '') && saved.status >= 400) {
    throw fail('כינורות לא שמר את ההערה', 502);
  }
  const check = await readKinorotReservationNote(id);
  if (check.note.trim() !== text.trim()) throw fail('כינורות לא שמר את ההערה', 502);
  return check;
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const command = process.argv[2];
  const resId = process.argv[3];
  const run = command === 'set'
    ? writeKinorotReservationNote(resId, JSON.parse(fs.readFileSync(0, 'utf8')).note)
    : readKinorotReservationNote(resId);
  run
    .then((row) => process.stdout.write(JSON.stringify(row)))
    .catch((err) => {
      process.stderr.write(String(err?.message || err));
      process.exit(Number(err?.status) || 1);
    });
}
