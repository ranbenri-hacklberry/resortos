import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingsWindowQuery, contactDraft, contentRangeTotal, createSyncLock, googleContactsAutoSyncEnabled, isEligibleBooking, isScanComplete, planContacts, toE164, writesFor } from './googleContactsPlan.js';

const today = '2026-10-24';

function stay(patch) {
  return {
    id: 'b1',
    unit_id: 'k811',
    guest_name: 'דני כהן',
    guest_phone: '052-123-4567',
    check_in_date: '2026-10-23',
    check_out_date: '2026-10-25',
    booking_status: 'CONFIRMED',
    ...patch
  };
}

test('israeli mobiles become E.164 and other numbers are skipped', () => {
  assert.equal(toE164('052-123-4567'), '+972521234567');
  assert.equal(toE164('+972 52 123 4567'), '+972521234567');
  assert.equal(toE164('12345'), '');
  assert.equal(toE164(''), '');
});

test('eligibility uses booking status and Israel dates', () => {
  assert.equal(isEligibleBooking(stay({ check_in_date: '2026-11-06' }), today), true);
  assert.equal(isEligibleBooking(stay({ check_in_date: '2026-11-08' }), today), false);
  assert.equal(isEligibleBooking(stay({ booking_status: 'CHECKED_IN', check_in_date: '2026-09-01', check_out_date: '2026-09-03' }), today), true);
  assert.equal(isEligibleBooking(stay({ booking_status: 'CHECKED_OUT', check_in_date: '2026-10-20', check_out_date: '2026-10-22' }), today), true);
  assert.equal(isEligibleBooking(stay({ booking_status: 'CHECKED_OUT', check_out_date: '2026-10-20' }), today), false);
  assert.equal(isEligibleBooking(stay({ booking_status: 'CANCELED' }), today), false);
  assert.equal(isEligibleBooking(stay({ booking_status: 'PENDING' }), today), false);
  assert.equal(isEligibleBooking(stay({ deleted_at: '2026-10-01' }), today), false);
});

test('display name keeps the catalog unit and Hebrew', () => {
  const draft = contactDraft(stay({}));
  assert.equal(draft.displayName, "דני כהן | טאג' מאהל · 4");
  assert.match(draft.notes, /טאג' מאהל · בקתה 4/);
  assert.match(draft.notes, /23–25\/10/);
  assert.match(draft.notes, /כניסה 2026-10-23/);
  const toscana = contactDraft(stay({ unit_id: 'k687', guest_name: 'מאיה לוי' }));
  assert.equal(toscana.displayName, 'מאיה לוי | טוסקנה · 1');
});

test('one phone keeps the current stay and does not duplicate', () => {
  const plan = planContacts({
    today,
    scanComplete: true,
    googleRead: true,
    bookings: [
      stay({ id: 'later', check_in_date: '2026-11-01', check_out_date: '2026-11-03' }),
      stay({ id: 'now', booking_status: 'CHECKED_IN' })
    ]
  });
  assert.equal(plan.counts.create, 1);
  assert.equal(plan.actions[0].booking_id, 'now');
  assert.match(plan.actions[0].notes, /גם/);
});

test('unchanged hash is not sent again', () => {
  const once = planContacts({ today, scanComplete: true, googleRead: true, bookings: [stay({})] });
  const created = once.actions[0];
  const again = planContacts({
    today,
    scanComplete: true,
    googleRead: true,
    bookings: [stay({})],
    mappings: [{
      phone_e164: created.phone_e164,
      google_resource_name: 'people/1',
      content_hash: created.content_hash,
      managed: true
    }]
  });
  assert.equal(again.counts.unchanged, 1);
  assert.equal(again.counts.update, 0);
  assert.equal(again.counts.create, 0);
  assert.equal(writesFor(again, { liveEnabled: true, connected: true }).length, 0);
});

test('a new booking plans one create and a unit change plans one update', () => {
  const created = planContacts({ today, scanComplete: true, googleRead: true, bookings: [stay({})] });
  const writes = writesFor(created, { liveEnabled: true, connected: true });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].action, 'create');
  const moved = planContacts({
    today,
    scanComplete: true,
    googleRead: true,
    bookings: [stay({ unit_id: 'k687' })],
    mappings: [{
      phone_e164: writes[0].phone_e164,
      google_resource_name: 'people/1',
      content_hash: writes[0].content_hash,
      managed: true
    }]
  });
  const update = writesFor(moved, { liveEnabled: true, connected: true });
  assert.equal(update.length, 1);
  assert.equal(update[0].action, 'update');
  assert.match(update[0].display_name, /טוסקנה · 1/);
});

test('staff housing, the office, and a closed complex are not written or deleted', () => {
  const phone = '+972521234567';
  const mappings = [{ phone_e164: phone, google_resource_name: 'people/staff', managed: true, booking_id: 'b1' }];
  for (const booking of [
    stay({ unit_id: 'k678' }),
    stay({ unit_id: 'k679' }),
    stay({ unit_id: 'pilot-office' }),
    stay({ guest_name: 'מתחם סגור לא לבצע' })
  ]) {
    const plan = planContacts({ today, scanComplete: true, googleRead: true, bookings: [booking], mappings });
    assert.equal(plan.counts.create + plan.counts.update + plan.counts.remove, 0);
    assert.equal(writesFor(plan, { liveEnabled: true, connected: true }).length, 0);
  }
});

test('the sync lock rejects an overlapping run', () => {
  const lock = createSyncLock();
  assert.equal(lock.tryEnter(), true);
  assert.equal(lock.tryEnter(), false);
  lock.leave();
  assert.equal(lock.tryEnter(), true);
  assert.equal(googleContactsAutoSyncEnabled({}), true);
  assert.equal(googleContactsAutoSyncEnabled({ GOOGLE_CONTACTS_AUTO_SYNC: '0' }), false);
});

test('a foreign Google contact is a conflict and is not overwritten', () => {
  const plan = planContacts({
    today,
    scanComplete: true,
    googleRead: true,
    bookings: [stay({})],
    googleContacts: [{ phone_e164: '+972521234567', resource_name: 'people/9', display_name: 'אבא', managed: false }]
  });
  assert.equal(plan.counts.conflict, 1);
  assert.equal(plan.counts.create, 0);
  assert.equal(plan.actions[0].existing_name, 'אבא');
});

test('a failed or partial booking scan does not remove contacts', () => {
  const mappings = [{ phone_e164: '+972521111111', google_resource_name: 'people/2', managed: true, booking_id: 'old' }];
  const partial = planContacts({ today, scanComplete: false, googleRead: true, bookings: [], mappings });
  assert.equal(partial.counts.remove, 0);
  assert.equal(partial.counts.blocked_remove, 1);
  assert.equal(partial.deletions_allowed, false);
  const unread = planContacts({ today, scanComplete: true, googleRead: false, bookings: [], mappings });
  assert.equal(unread.counts.remove, 1);
  assert.equal(writesFor(unread, { liveEnabled: true, connected: true }).length, 1);
  assert.equal(writesFor(partial, { liveEnabled: true, connected: true }).length, 0);
  const full = planContacts({ today, scanComplete: true, googleRead: true, bookings: [], mappings });
  assert.equal(full.counts.remove, 1);
});

test('a ResortOS marker in Google updates the same contact', () => {
  const plan = planContacts({
    today,
    scanComplete: true,
    googleRead: true,
    bookings: [stay({})],
    googleContacts: [{ phone_e164: '+972521234567', resource_name: 'people/4', display_name: 'ישן', managed: true }]
  });
  assert.equal(plan.counts.update, 1);
  assert.equal(plan.counts.create, 0);
  assert.equal(plan.actions[0].google_resource_name, 'people/4');
});

test('canceled booking stays only when the same phone has another eligible stay', () => {
  const plan = planContacts({
    today,
    scanComplete: true,
    googleRead: true,
    bookings: [
      stay({ id: 'gone', booking_status: 'CANCELED' }),
      stay({ id: 'next', check_in_date: '2026-10-28', check_out_date: '2026-10-30' })
    ]
  });
  assert.equal(plan.counts.create, 1);
  assert.equal(plan.actions[0].booking_id, 'next');
});

test('window query filters status, tenant and the -3/+14 day window on the server', () => {
  const q = bookingsWindowQuery('t1', today);
  assert.match(q, /tenant_id=eq\.t1/);
  assert.match(q, /deleted_at=is\.null/);
  assert.match(q, /booking_status=in\.\(CONFIRMED,CHECKED_IN,CHECKED_OUT\)/);
  assert.match(q, /check_out_date=gte\.2026-10-21/);
  assert.match(q, /check_in_date=lte\.2026-11-07/);
});

test('window edges agree with isEligibleBooking', () => {
  assert.equal(isEligibleBooking(stay({ check_in_date: '2026-11-07', check_out_date: '2026-11-09' }), today), true);
  assert.equal(isEligibleBooking(stay({ check_in_date: '2026-11-08', check_out_date: '2026-11-09' }), today), false);
  assert.equal(isEligibleBooking(stay({ check_in_date: '2026-10-19', check_out_date: '2026-10-21' }), today), true);
  assert.equal(isEligibleBooking(stay({ check_in_date: '2026-10-19', check_out_date: '2026-10-20' }), today), false);
});

test('content-range total parsing and scan completeness', () => {
  assert.equal(contentRangeTotal('0-999/3122'), 3122);
  assert.equal(contentRangeTotal('*/0'), 0);
  assert.equal(contentRangeTotal(''), null);
  assert.equal(isScanComplete(1000, 3122), false);
  assert.equal(isScanComplete(12, 12), true);
  assert.equal(isScanComplete(12, null), false);
});

test('a partial booking list never yields removals, even when live', () => {
  const mappings = [{ phone_e164: '+972521112222', google_resource_name: 'people/c1', managed: true, booking_id: 'old' }];
  const plan = planContacts({ bookings: [stay({})], mappings, googleContacts: [], today, scanComplete: isScanComplete(1000, 3122), googleRead: true });
  assert.equal(plan.counts.remove, 0);
  assert.equal(plan.counts.blocked_remove, 1);
  assert.equal(plan.deletions_allowed, false);
  assert.equal(writesFor(plan, { liveEnabled: true, connected: true }).some((w) => w.action === 'remove'), false);
});
