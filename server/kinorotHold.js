import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { israelToday } from '../src/lib/cabinAccess.js';
import {
  holdThroughTomorrow,
  kinorotPlaceId,
  reservationIdFromLocation,
  unavailableHoldFields,
  unitOptionFromHtml
} from '../src/lib/kinorotHold.js';
import {
  kinorotLogin,
  kinorotRequest,
  loadKinorotJar,
  saveKinorotJar
} from './syncKinorotCalendar.js';

const BASE = 'https://app.kinorotgo.co.il';

function fail(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function loggedOut(html) {
  return /name="pass"|הכניסו את פרטי ההתחברות/.test(String(html || '').slice(0, 8000));
}

export async function createUnavailableHold({ unitId, today = israelToday() } = {}) {
  const placeId = kinorotPlaceId(String(unitId || ''));
  if (!placeId) throw fail('היחידה לא מחוברת לכינורות', 400);
  const { checkIn, checkOut } = holdThroughTomorrow(today);
  const jar = loadKinorotJar();
  let form = await kinorotRequest(`${BASE}/bookres.php?hp=1`, jar);
  if (loggedOut(form.text) || !form.text.includes('reservation-form')) {
    await kinorotLogin(jar);
    saveKinorotJar(jar);
    form = await kinorotRequest(`${BASE}/bookres.php?hp=1`, jar);
  }
  const option = unitOptionFromHtml(form.text, placeId);
  if (!option) throw fail('כינורות לא מצא את היחידה', 502);
  const availability = await kinorotRequest(
    `${BASE}/ajax_check_availability.php?unitid=${encodeURIComponent(placeId)}&start=${encodeURIComponent(checkIn)}&end=${encodeURIComponent(checkOut)}`,
    jar
  );
  let available = false;
  try {
    available = JSON.parse(availability.text || '{}').available === true;
  } catch {
    available = false;
  }
  if (!available) throw fail('הלילה הזה כבר תפוס בכינורות', 409);
  const body = new FormData();
  for (const [key, value] of Object.entries(unavailableHoldFields({ option, checkIn, checkOut }))) {
    body.append(key, value);
  }
  const saved = await kinorotRequest(`${BASE}/reservationnew-page-3-080726.php`, jar, {
    method: 'POST',
    body,
    followRedirect: false,
    headers: {
      Referer: `${BASE}/bookres.php?hp=1`,
      Origin: BASE
    }
  });
  saveKinorotJar(jar);
  const resId = reservationIdFromLocation(saved.location);
  if (!resId) throw fail('כינורות לא שמר את החסימה', 502);
  return {
    ok: true,
    unitId: String(unitId),
    placeId,
    resId,
    checkIn,
    checkOut,
    guestName: 'לא זמין'
  };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  createUnavailableHold({ unitId: process.argv[2] })
    .then((row) => {
      process.stdout.write(JSON.stringify(row));
    })
    .catch((err) => {
      process.stderr.write(String(err?.message || err));
      process.exit(Number(err?.status) || 1);
    });
}
