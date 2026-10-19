import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWhatsAppReply,
  callerByPhone,
  inBarakWindow,
  offerText,
  OFFICE_IDS,
  otherCallers
} from './callDesk.js';

test('office recipients defaults to only Rani', () => {
  assert.deepEqual(OFFICE_IDS, ['rani']);
});

test('Barak can take the call or pass it to Rani or Tzuki', () => {
  const call = { phase: 'offer', guest_name: 'דנה', cabin: 'משרד', guest_phone: '0500000000' };
  assert.equal(callerByPhone('0503934696')?.id, 'barak');
  assert.deepEqual(otherCallers('barak').map((row) => row.id), ['rani', 'zuki']);
  assert.match(offerText(call, callerByPhone('972503934696')), /2 להעביר לרני/);
  assert.match(offerText(call, callerByPhone('972503934696')), /3 להעביר לצוקי/);
  const taken = applyWhatsAppReply(call, '972503934696', '1');
  assert.equal(taken.take.id, 'barak');
  assert.match(taken.reply, /1 נפתר/);
  const passed = applyWhatsAppReply(call, '0503934696', '2');
  assert.equal(passed.transferTo.id, 'rani');
});

test('after taking the call, 1 closes it and 2 asks for a note', () => {
  const call = { phase: 'taken', ownerId: 'barak' };
  assert.equal(applyWhatsAppReply(call, '972503934696', '1').close, 'resolved');
  assert.equal(applyWhatsAppReply(call, '972503934696', '2').ask, 'note');
  const noted = applyWhatsAppReply({ ...call, phase: 'note' }, '972503934696', 'האורח קיבל הסבר');
  assert.equal(noted.close, 'note');
  assert.equal(noted.note, 'האורח קיבל הסבר');
});

test('Barak is called on a weekday afternoon, not after nine and not on Shabbat', () => {
  assert.equal(inBarakWindow(new Date('2026-10-18T15:00:00+03:00'), 18 * 60), true);
  assert.equal(inBarakWindow(new Date('2026-10-18T21:05:00+03:00'), 18 * 60), false);
  assert.equal(inBarakWindow(new Date('2026-10-17T16:00:00+03:00'), 18 * 60), false);
  assert.equal(inBarakWindow(new Date('2026-10-16T17:50:00+03:00'), 17 * 60), false);
  assert.equal(inBarakWindow(new Date('2026-10-16T16:00:00+03:00'), 17 * 60), true);
});
