import test from 'node:test';
import assert from 'node:assert/strict';
import { templateById } from '../src/lib/guestComms.js';

test('stay_link detection identifies correct message kinds', () => {
  const isStayLink = (kind, templateId) =>
    kind === 'stay_link' || templateId === 'checkin' || templateId === 'stay_link';

  assert.equal(isStayLink('stay_link', ''), true, 'kind stay_link triggers publish');
  assert.equal(isStayLink('', 'checkin'), true, 'template checkin triggers publish');
  assert.equal(isStayLink('', 'stay_link'), true, 'template stay_link triggers publish');
  assert.equal(isStayLink('manual', ''), false, 'kind manual does not trigger publish');
  assert.equal(isStayLink('', 'gate'), false, 'template gate does not trigger publish');
  assert.equal(isStayLink('manual', 'gate'), false, 'manual + gate does not trigger publish');
  assert.equal(isStayLink('stay_link', 'checkin'), true, 'combined stay_link + checkin triggers publish');
});

test('checkin and stay_link templates include checkout URL in message', () => {
  const checkinTpl = templateById('checkin');
  const stayLinkTpl = templateById('stay_link');

  assert.ok(checkinTpl, 'checkin template exists');
  assert.ok(stayLinkTpl, 'stay_link template exists');

  const checkinMsg = checkinTpl.build({
    unitName: 'כיפה אדומה',
    checkoutUrl: 'https://resortos.app/stay/tok_abc123'
  });
  assert.ok(checkinMsg.includes('כיפה אדומה'), 'checkin message includes unit name');
  assert.ok(checkinMsg.includes('https://resortos.app/stay/tok_abc123'), 'checkin message includes checkout URL');

  const stayLinkMsg = stayLinkTpl.build({
    unitName: 'בתי נורית',
    checkoutUrl: 'https://resortos.app/stay/tok_xyz789'
  });
  assert.ok(stayLinkMsg.includes('בתי נורית'), 'stay_link message includes unit name');
  assert.ok(stayLinkMsg.includes('https://resortos.app/stay/tok_xyz789'), 'stay_link message includes checkout URL');
});

test('guestComms module imports publishBookingToMailbox from checkoutMailbox', async () => {
  const fs = await import('node:fs');
  const guestCommsSource = fs.readFileSync(new URL('./guestComms.js', import.meta.url), 'utf8');

  assert.ok(
    guestCommsSource.includes("import { publishBookingToMailbox } from './checkoutMailbox.js'"),
    'guestComms.js imports publishBookingToMailbox'
  );
  assert.ok(
    guestCommsSource.includes('await publishBookingToMailbox(booking)'),
    'guestComms.js calls publishBookingToMailbox before sending'
  );
  assert.ok(
    guestCommsSource.includes("const isStayLink = kind === 'stay_link' || templateId === 'checkin' || templateId === 'stay_link'"),
    'guestComms.js detects stay_link messages'
  );
  assert.ok(
    guestCommsSource.includes('if (isStayLink && booking?.checkout_token)'),
    'guestComms.js only publishes when booking has checkout_token'
  );
  assert.ok(
    guestCommsSource.includes("error: 'PUBLISH_FAILED'"),
    'guestComms.js returns PUBLISH_FAILED error when publish fails'
  );
});

test('gate template does NOT include checkout URL', () => {
  const gateTpl = templateById('gate');
  assert.ok(gateTpl, 'gate template exists');

  const gateMsg = gateTpl.build({ gateCode: '#1234' });
  assert.ok(gateMsg.includes('#1234'), 'gate message includes gate code');
  assert.ok(!gateMsg.includes('https://resortos.app/stay/'), 'gate message does NOT include checkout URL');
});
