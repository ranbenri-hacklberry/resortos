import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDCOM_INVOICE_WA_BOOKING_SELECT,
  buildCardcomInvoiceWaBookingQuery,
  unitLabelForInvoiceMessage,
  formatGuestInvoiceDeliveryMessage
} from './lib/cardcomTerminalService.js';

test('invoice WhatsApp booking select omits unit_name (column does not exist)', () => {
  assert.equal(CARDCOM_INVOICE_WA_BOOKING_SELECT.includes('unit_name'), false);
  assert.match(CARDCOM_INVOICE_WA_BOOKING_SELECT, /guest_phone/);
  assert.match(CARDCOM_INVOICE_WA_BOOKING_SELECT, /\bunit_id\b/);
});

test('booking query encodes id and uses safe select', () => {
  const q = buildCardcomInvoiceWaBookingQuery('kin_680_76182');
  assert.equal(q.startsWith('hotelos_bookings?'), true);
  assert.match(q, /id=eq\.kin_680_76182/);
  assert.equal(q.includes('unit_name'), false);
  assert.ok(q.includes('select=id%2Cguest_name%2Cguest_phone%2Cunit_id') || q.includes('select=id,guest_name,guest_phone,unit_id'));
});

test('unitLabelForInvoiceMessage drops internal unit ids', () => {
  assert.equal(unitLabelForInvoiceMessage({ unit_id: 'k680' }), '');
  assert.equal(unitLabelForInvoiceMessage({}, 'k680'), '');
  assert.equal(unitLabelForInvoiceMessage({}, 'kin_680_76182'), '');
  assert.equal(unitLabelForInvoiceMessage({}, 'מול הנוף 1'), 'מול הנוף 1');
});

test('invoice delivery message stays generic without a real unit name', () => {
  const msg = formatGuestInvoiceDeliveryMessage('https://example.test/inv', '11', unitLabelForInvoiceMessage({}, 'k680'));
  assert.match(msg, /חשבונית המס קבלה מס׳ 11/);
  assert.equal(msg.includes('k680'), false);
  assert.match(msg, /עבור השהייה שלך:/);
});
