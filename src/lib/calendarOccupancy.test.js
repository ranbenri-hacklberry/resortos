import { describe, expect, it } from 'vitest';
import { barsToDrawOnCell, coveringStayOnDate, spanBarPixels, stayCardTone, stayCellSlice, staySlicesOnCell } from './calendarOccupancy.js';

const today = '2026-09-03';
const leaver = {
  id: 'kin_680_72917',
  guest_name: 'זיו',
  check_in_date: '2026-08-31',
  check_out_date: '2026-09-03',
  booking_status: 'CHECKED_IN'
};
const arriver = {
  id: 'kin_680_70233',
  guest_name: 'שלי',
  check_in_date: '2026-09-03',
  check_out_date: '2026-09-05',
  booking_status: 'CONFIRMED'
};
const inHouse = {
  id: 'kin_694_72988',
  guest_name: 'עדינה',
  check_in_date: '2026-09-02',
  check_out_date: '2026-09-04',
  booking_status: 'CONFIRMED'
};

describe('same-day turnover bars', () => {
  it('covers the arrival night, not the checkout stub', () => {
    expect(coveringStayOnDate([leaver, arriver], today, today)?.id).toBe(arriver.id);
  });

  it('draws one arrival bar on check-in day', () => {
    const { occupying, bars } = barsToDrawOnCell([leaver, arriver], today, today, { isToday: true });
    expect(occupying.id).toBe(arriver.id);
    expect(bars.map((row) => row.id)).toEqual([arriver.id]);
  });

  it('does not paint a second bar on a middle night', () => {
    const { occupying, bars } = barsToDrawOnCell([inHouse], '2026-09-03', today, { isToday: true });
    expect(occupying.id).toBe(inHouse.id);
    expect(bars).toEqual([]);
  });
});

describe('mid-day cell slices', () => {
  it('starts at noon on check-in and ends at noon on checkout', () => {
    expect(stayCellSlice(arriver, '2026-09-03')).toEqual({ role: 'checkin', showLabel: true, showMeta: false });
    expect(stayCellSlice(arriver, '2026-09-04')).toEqual({ role: 'middle', showLabel: false, showMeta: false });
    expect(stayCellSlice(arriver, '2026-09-05')).toEqual({ role: 'checkout', showLabel: false, showMeta: true });
  });

  it('paints leaver morning and arriver afternoon on the same day', () => {
    const slices = staySlicesOnCell([leaver, arriver], today, today);
    expect(slices.map((row) => `${row.role}:${row.booking.id}`)).toEqual([
      `checkout:${leaver.id}`,
      `checkin:${arriver.id}`
    ]);
  });
});

describe('spanBarPixels', () => {
  it('places one mid-check-in bar in pixels on the unit row', () => {
    const bar = spanBarPixels(inHouse, '2026-09-01', 24, 72, 112);
    expect(bar).toEqual({ right: 112 + 72 + 36, width: 2 * 72 - 4, nights: 2 });
  });

  it('keeps a one-night card wide enough for a first name', () => {
    const bar = spanBarPixels({
      check_in_date: '2026-09-04',
      check_out_date: '2026-09-05'
    }, '2026-09-01', 10, 72, 112);
    expect(bar.nights).toBe(1);
    expect(bar.width).toBeGreaterThanOrEqual(62);
  });

  it('keeps an in-house stay visible when check-in is before the window', () => {
    const bar = spanBarPixels(leaver, '2026-09-01', 24, 72, 112);
    expect(bar.right).toBe(112 + 2);
    expect(bar.width).toBeGreaterThan(50);
  });

  it('extends a clipped check-in to noon on the real checkout day', () => {
    const bar = spanBarPixels({
      check_in_date: '2026-09-06',
      check_out_date: '2026-09-10'
    }, '2026-09-07', 14, 86, 112);
    expect(bar.nights).toBe(3);
    expect(bar.right).toBe(114);
    expect(bar.width).toBe(3 * 86 + 43 - 2);
  });
});

describe('stay card tone', () => {
  it('keeps unpaid cards red even after check-in', () => {
    const sapir = {
      check_in_date: '2026-09-03',
      check_out_date: '2026-09-05',
      booking_status: 'CHECKED_IN',
      payment_status: 'UNPAID'
    };
    expect(stayCardTone(sapir, { today: '2026-09-04' })).toBe('unpaid');
    expect(stayCardTone({ ...sapir, payment_status: 'PAID', stay: { hyp: { paid: true } } }, { today: '2026-09-04' })).toBe('inhouse');
    expect(stayCardTone({ ...sapir, payment_mode: 'VOUCHER', total_price_agorot: 0 }, { today: '2026-09-04' })).toBe('inhouse');
    expect(stayCardTone({
      ...sapir,
      check_in_date: '2026-09-10',
      check_out_date: '2026-09-12',
      booking_status: 'CONFIRMED',
      payment_status: 'PAID',
      stay: { hyp: { paid: true } }
    }, { today: '2026-09-04' })).toBe('paid');
  });
});
