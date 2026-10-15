import assert from 'node:assert/strict';
import test from 'node:test';
import { ackBeaconAlerts, applyBeaconSample, beaconLine, beaconSmsText, normalizeBeaconAssets } from '../src/lib/assetBeacons.js';

const soda = {
  mac: 'fb:d0:1a:46:8d:59',
  name: 'סודסטרים',
  rssi: -74,
  is_present: true,
  status: 'SAFE',
  last_seen_sec: 4,
};

test('a beacon is described without inventing a signal', () => {
  const [asset] = normalizeBeaconAssets({ assets: [soda] });
  assert.equal(beaconLine(asset, true), 'סודסטרים · נקלט -74');
  assert.equal(beaconLine({ ...asset, present: false, status: 'ALERT_MISSING' }, true), 'סודסטרים · לא נקלט');
  assert.equal(beaconLine(asset, false), 'סודסטרים · אין קשר');
  assert.equal(beaconSmsText('סודסטרים'), 'סודסטרים לא נמצא במשרד. תבדקו שהוא לא יצא מהחדר.');
});

test('a short dropout does not alert, a full minute away does once', () => {
  const seen = applyBeaconSample(null, { online: true, assets: [soda] }, '2026-10-13T12:00:00.000Z');
  assert.deepEqual(seen.sms, []);
  assert.equal(seen.assets[0].present, true);
  const missing = { ...soda, is_present: false, status: 'ALERT_MISSING', rssi: null };
  const blip = applyBeaconSample(seen, { online: true, assets: [missing] }, '2026-10-13T12:00:20.000Z');
  assert.deepEqual(blip.sms, []);
  assert.equal(blip.alerts.length, 0);
  const back = applyBeaconSample(blip, { online: true, assets: [soda] }, '2026-10-13T12:00:40.000Z');
  assert.deepEqual(back.sms, []);
  assert.equal(back.alerts.length, 0);
  const gone = applyBeaconSample(back, { online: true, assets: [missing] }, '2026-10-13T12:01:00.000Z');
  assert.deepEqual(gone.sms, []);
  const held = applyBeaconSample(gone, { online: true, assets: [missing] }, '2026-10-13T12:02:00.000Z');
  assert.deepEqual(held.sms, ['סודסטרים']);
  assert.equal(held.alerts.length, 1);
  const still = applyBeaconSample(held, { online: true, assets: [missing] }, '2026-10-13T12:03:00.000Z');
  assert.deepEqual(still.sms, []);
  assert.equal(still.alerts.length, 1);
  const offline = applyBeaconSample(still, { online: false }, '2026-10-13T12:04:00.000Z');
  assert.equal(offline.online, false);
  assert.deepEqual(offline.sms, []);
  assert.equal(offline.assets[0].present, false);
});

test('a yard-level signal is not a theft, and a return closes the popup', () => {
  const baseline = applyBeaconSample(null, { online: true, assets: [soda] }, '2026-10-13T12:00:00.000Z');
  const yard = applyBeaconSample(baseline, {
    online: true,
    assets: [{ ...soda, rssi: -84, status: 'SUSPECT_OUTSIDE', is_present: true }],
  }, '2026-10-13T12:01:00.000Z');
  assert.equal(yard.assets[0].status, 'SUSPECT_OUTSIDE');
  assert.equal(yard.assets[0].present, true);
  assert.deepEqual(yard.sms, []);
  assert.equal(beaconLine(yard.assets[0], true), 'סודסטרים · בחצר -84');
  const missing = { ...soda, is_present: false, status: 'ALERT_MISSING' };
  const started = applyBeaconSample(baseline, { online: true, assets: [missing] }, '2026-10-13T12:04:00.000Z');
  const gone = applyBeaconSample(started, { online: true, assets: [missing] }, '2026-10-13T12:05:00.000Z');
  assert.equal(gone.alerts.length, 1);
  const acked = ackBeaconAlerts(gone, [gone.alerts[0].id]);
  assert.equal(acked.alerts.length, 0);
  const quiet = applyBeaconSample(acked, { online: true, assets: [missing] }, '2026-10-13T12:06:00.000Z');
  assert.deepEqual(quiet.sms, []);
  const returned = applyBeaconSample(gone, { online: true, assets: [soda] }, '2026-10-13T12:06:30.000Z');
  assert.equal(returned.alerts.length, 0);
});
