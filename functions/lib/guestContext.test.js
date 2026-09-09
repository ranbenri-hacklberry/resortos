import test from 'node:test';
import assert from 'node:assert/strict';
import { mapBookingStatus, pickGuestStay, toReservation } from './guestContext.js';
import { normalizeGuestPhone } from './guestPhone.js';

test('normalizes Israeli mobiles and WhatsApp sender ids', () => {
  assert.equal(normalizeGuestPhone('054-807-6123').e164, '+972548076123');
  assert.equal(normalizeGuestPhone('+972548076123').tail, '548076123');
  assert.equal(normalizeGuestPhone('972548076123@c.us').local, '0548076123');
  assert.equal(normalizeGuestPhone('whatsapp:0548076123').e164, '+972548076123');
});

test('maps booking statuses to the bot contract', () => {
  assert.equal(mapBookingStatus('CHECKED_IN'), 'checked_in');
  assert.equal(mapBookingStatus('CANCELED'), 'cancelled');
  assert.equal(mapBookingStatus('CONFIRMED'), 'confirmed');
  assert.equal(mapBookingStatus('PENDING'), 'confirmed');
});

test('prefers a stay that is in-house today over a later booking', () => {
  const rows = [
    { unit_id: 'k673', check_in_date: '2026-09-01', check_out_date: '2026-09-03', booking_status: 'CONFIRMED', guest_name: 'Later' },
    { unit_id: 'k671', check_in_date: '2026-08-21', check_out_date: '2026-08-23', booking_status: 'CHECKED_IN', guest_name: 'Now', adults_count: 2, children_count: 1 }
  ];
  const { primary, reason } = pickGuestStay(rows, '2026-08-22');
  assert.equal(reason, 'active');
  assert.equal(primary.unit_id, 'k671');
  assert.equal(toReservation(primary).partySize, 3);
});

test('desk payment on the replica is not wiped by a later unpaid sync', async () => {
  const { mergeDeskAwareStays } = await import('./guestContextStore.js');
  const merged = mergeDeskAwareStays(
    [{ id: 'b1', payment_status: 'UNPAID', clearing_payments: [] }],
    [{ id: 'b1', payment_status: 'PAID', payment_mode: 'CASH', clearing_payments: [{ amount_agorot: 104000, source: 'CASH' }] }]
  );
  assert.equal(merged[0].payment_status, 'PAID');
  assert.equal(merged[0].payment_mode, 'CASH');
});

test('falls back to the nearest upcoming stay', () => {
  const rows = [
    { unit_id: 'k671', check_in_date: '2026-07-01', check_out_date: '2026-07-03', booking_status: 'CHECKED_OUT' },
    { unit_id: 'k674', check_in_date: '2026-08-28', check_out_date: '2026-08-30', booking_status: 'CONFIRMED' }
  ];
  const { primary, reason } = pickGuestStay(rows, '2026-08-22');
  assert.equal(reason, 'upcoming');
  assert.equal(primary.unit_id, 'k674');
});
