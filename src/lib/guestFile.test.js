import { describe, expect, it } from 'vitest';
import { buildGuestFileHtml, guestFileFacts } from './guestFile.js';

const booking = {
  id: 'kin_676_74380',
  unit_id: 'k676',
  guest_name: 'Oscar Gomez',
  guest_phone: '+447832861697',
  check_in_date: '2026-10-04',
  check_out_date: '2026-10-17',
  adults_count: 2,
  children_count: 0,
  total_price_agorot: 173600,
  payment_status: 'UNPAID',
  special_requests: 'kinorot:74380|pax:2+0+0|ארוחת בוקר',
  booking_status: 'CONFIRMED'
};

describe('guest file', () => {
  it('fills the paper fields from the booking', () => {
    const facts = guestFileFacts(booking, {
      units: [
        { id: 'k676', name: 'בתי נורית 5', unit_type: 'cabin' },
        { id: 'k678', name: 'בתי נורית 7', unit_type: 'cabin' }
      ],
      bookings: [
        booking,
        { ...booking, id: 'kin_678_74380', unit_id: 'k678' }
      ]
    });
    expect(facts.guestName).toBe('Oscar Gomez');
    expect(facts.phone).toBe('+447832861697');
    expect(facts.nights).toBe(13);
    expect(facts.guests).toBe(2);
    expect(facts.roomCount).toBe(2);
    expect(facts.arrival).toBe('4/10/26');
    expect(facts.departure).toBe('17/10/26');
    expect(facts.roomNames).toEqual(['בתי נורית 5 · כספת 2350', 'בתי נורית 7 · כספת 2370']);
    expect(facts.breakfast).toBe(true);
    expect(facts.amount).toBe('₪1,736');
    const html = buildGuestFileHtml(booking, {
      units: [{ id: 'k676', name: 'בתי נורית 5', unit_type: 'cabin' }],
      bookings: [booking]
    });
    expect(html).toContain('תיק אורח');
    expect(html).toContain('Oscar Gomez');
    expect(html).toContain('כספת 2350');
    expect(html).toContain('class="room-line"');
    expect(html).toContain('class="checkin"');
    const notesAt = html.indexOf('הערות / הבטחות');
    const breakfastAt = html.indexOf('ארוחת בוקר');
    const notesEnd = html.indexOf('</section>', notesAt);
    expect(notesAt).toBeGreaterThan(0);
    expect(breakfastAt).toBeGreaterThan(notesAt);
    expect(breakfastAt).toBeLessThan(notesEnd);
    expect(html).not.toContain('breakfast-slot');
    expect(html).not.toContain('kinorot:74380');
    expect(html).toContain('שעת כניסה');
    expect(html).toContain('שעת יציאה');
  });

  it('prints check-in and check-out hours', () => {
    const html = buildGuestFileHtml({
      ...booking,
      special_requests: 'kinorot:74380|in:15:00|out:11:00'
    }, { units: [{ id: 'k676', name: 'בתי נורית 5' }], bookings: [booking] });
    expect(html).toContain('שעת כניסה');
    expect(html).toContain('15:00');
    expect(html).toContain('שעת יציאה');
    expect(html).toContain('11:00');
  });

  it('marks credit as paid and cash as still to collect', () => {
    const card = buildGuestFileHtml({
      ...booking,
      payment_status: 'PAID',
      payment_mode: 'CARD',
      clearing_payments: [{ source: 'CARD', amount_agorot: 173600 }]
    }, { units: [{ id: 'k676', name: 'בתי נורית 5' }], bookings: [] });
    expect(card).toContain('שולם באשראי');
    expect(card).not.toContain('צריך לקבל מזומן');

    const cash = buildGuestFileHtml({
      ...booking,
      payment_mode: 'CASH',
      payment_status: 'UNPAID',
      special_requests: 'kinorot:74380|תשלום מזומן'
    }, { units: [{ id: 'k676', name: 'בתי נורית 5' }], bookings: [] });
    expect(cash).toContain('צריך לקבל מזומן מהלקוח');
    expect(cash).toContain('☐');
    expect(cash).toContain('class="cash-due"');

    const collected = buildGuestFileHtml({
      ...booking,
      payment_mode: 'CASH',
      payment_status: 'PAID',
      special_requests: 'kinorot:74380|תשלום מזומן',
      clearing_payments: [{ source: 'CASH', amount_agorot: 173600 }]
    }, { units: [{ id: 'k676', name: 'בתי נורית 5' }], bookings: [] });
    expect(collected).toContain('☑ צריך לקבל מזומן מהלקוח');
  });

  it('prints a redeemed voucher instead of an amount due', () => {
    const html = buildGuestFileHtml({
      ...booking,
      payment_mode: 'VOUCHER',
      payment_status: 'PAID',
      total_price_agorot: 0,
      special_requests: 'kinorot:74859|pay:voucher'
    }, { units: [{ id: 'k676', name: 'בתי נורית 5' }], bookings: [] });
    expect(html).toContain('שובר נפדה');
    expect(html).not.toContain('צריך לקבל מזומן');
    expect(html).not.toContain('הסכום שהלקוח צריך לשלם');
  });
});
