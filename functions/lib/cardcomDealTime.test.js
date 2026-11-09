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
