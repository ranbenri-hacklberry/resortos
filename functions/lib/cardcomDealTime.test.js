import test from 'node:test';
import assert from 'node:assert/strict';
import {
  israelWallTimeToIso,
  normalizeCardcomDealTime,
  formatCardcomDealDateTimeHe
} from './cardcomDealTime.js';

test('israelWallTimeToIso treats Cardcom local as Asia/Jerusalem (winter +02)', () => {
  // 2026-11-08 is Israel standard time (UTC+2)
  const iso = israelWallTimeToIso('2026-11-08T13:54:51');
  assert.equal(iso, '2026-11-08T11:54:51.000Z');
});

test('normalizeCardcomDealTime corrects legacy +00:00 tagging of Israel wall clock', () => {
  const iso = normalizeCardcomDealTime('2026-11-08T13:54:51+00:00');
  assert.equal(iso, '2026-11-08T11:54:51.000Z');
  const he = formatCardcomDealDateTimeHe('2026-11-08T13:54:51+00:00');
  assert.equal(he, '08.11 13:54');
});

test('normalizeCardcomDealTime keeps real non-zero offsets as absolute instants', () => {
  const iso = normalizeCardcomDealTime('2026-11-08T13:54:51+02:00');
  assert.equal(iso, '2026-11-08T11:54:51.000Z');
});

test('formatCardcomDealDateTimeHe is dd.mm HH:MM Asia/Jerusalem', () => {
  assert.equal(formatCardcomDealDateTimeHe('2026-11-05T11:54:38+00:00'), '05.11 11:54');
});

test('formatCardcomDealDateTimeHe does not double-shift already-normalized UTC from pending API', () => {
  // Cardcom CreateDate wall 15:51 IL persisted as +00:00 (legacy).
  assert.equal(formatCardcomDealDateTimeHe('2026-11-07T15:51:50+00:00'), '07.11 15:51');
  // Pending endpoint emits normalizeCardcomDealTime(...) → true UTC .000Z
  assert.equal(formatCardcomDealDateTimeHe('2026-11-07T13:51:50.000Z'), '07.11 15:51');
  // Iska: wall 14:10 IL
  assert.equal(formatCardcomDealDateTimeHe('2026-11-08T14:10:35+00:00'), '08.11 14:10');
  assert.equal(formatCardcomDealDateTimeHe('2026-11-08T12:10:35.000Z'), '08.11 14:10');
});

test('normalize then format is stable (idempotent display)', () => {
  const raw = '2026-11-07T15:51:50+00:00';
  const once = normalizeCardcomDealTime(raw);
  assert.equal(once, '2026-11-07T13:51:50.000Z');
  assert.equal(formatCardcomDealDateTimeHe(raw), '07.11 15:51');
  assert.equal(formatCardcomDealDateTimeHe(once), '07.11 15:51');
  assert.equal(formatCardcomDealDateTimeHe(normalizeCardcomDealTime(once)), '07.11 15:51');
});
