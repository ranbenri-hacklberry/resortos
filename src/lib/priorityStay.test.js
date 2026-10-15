import { describe, expect, it } from 'vitest';
import { ARRIVAL_TODAY_LABEL, priorityDayCell, priorityDeskGuests, priorityShowsGuest, selectPriorityStay } from './priorityStay';

const today = '2026-10-12';

function booking(partial) {
  return {
    booking_status: 'CONFIRMED',
    guest_phone: '0500000000',
    ...partial
  };
}

describe('selectPriorityStay', () => {
  it('leaves a vacant cabin blank and keeps only the next date', () => {
    const stay = selectPriorityStay([
      booking({ id: 'future', unit_id: 'k678', guest_name: 'עתידי', check_in_date: '2026-10-22', check_out_date: '2026-10-24' })
    ], 'k678', today);
    expect(stay.booking).toBeNull();
    expect(stay.arrivalToday).toBe(false);
    expect(stay.nextStay).toBe('22.10');
  });

  it('shows a guest who is still in house, including checkout today', () => {
    const stay = selectPriorityStay([
      booking({ id: 'out', unit_id: 'k680', guest_name: 'יוצא', check_in_date: '2026-10-10', check_out_date: '2026-10-12', booking_status: 'CHECKED_OUT' }),
      booking({ id: 'later', unit_id: 'k680', guest_name: 'אחר כך', check_in_date: '2026-10-22', check_out_date: '2026-10-24' })
    ], 'k680', today);
    expect(stay.booking.guest_name).toBe('יוצא');
    expect(stay.arrivalToday).toBe(false);
    expect(stay.nextStay).toBe('22.10');
  });

  it('shows today\'s arrival and does not treat that date as the next booking', () => {
    const stay = selectPriorityStay([
      booking({ id: 'in', unit_id: 'k690', guest_name: 'מגיע', check_in_date: '2026-10-12', check_out_date: '2026-10-14' }),
      booking({ id: 'later', unit_id: 'k690', guest_name: 'אחר כך', check_in_date: '2026-11-02', check_out_date: '2026-11-04' })
    ], 'k690', today);
    expect(stay.booking.guest_name).toBe('מגיע');
    expect(stay.arrivalToday).toBe(true);
    expect(ARRIVAL_TODAY_LABEL).toBe('צ׳ק-אין היום');
    expect(stay.nextStay).toBe('2.11');
  });

  it('keeps the departing guest on a same-day turnover and dates the arrival as next', () => {
    const stay = selectPriorityStay([
      booking({ id: 'out', unit_id: 'k671', guest_name: 'יוצא', check_in_date: '2026-10-10', check_out_date: '2026-10-12' }),
      booking({ id: 'in', unit_id: 'k671', guest_name: 'נכנס', check_in_date: '2026-10-12', check_out_date: '2026-10-14' })
    ], 'k671', today);
    expect(stay.booking.guest_name).toBe('יוצא');
    expect(stay.arrivalToday).toBe(false);
    expect(stay.nextStay).toBe('12.10');
  });

  it('shows a calendar block that covers today as unavailable, not as a guest', () => {
    const stay = selectPriorityStay([
      booking({ id: 'hold', unit_id: 'k671', guest_name: 'לא זמין', check_in_date: '2026-10-10', check_out_date: '2026-10-20' }),
      booking({ id: 'later', unit_id: 'k671', guest_name: 'אחר כך', check_in_date: '2026-10-22', check_out_date: '2026-10-24' })
    ], 'k671', today);
    expect(stay.booking).toBeNull();
    expect(stay.holdLabel).toBe('לא זמין');
    expect(stay.hold.check_in_date).toBe('2026-10-10');
    expect(stay.nextStay).toBe('22.10');
  });

  it('keeps the calendar wording for renovation, closed, and dirty blocks', () => {
    expect(selectPriorityStay([
      booking({ id: 'h', unit_id: 'k671', guest_name: 'שיפוצים', check_in_date: '2026-10-01', check_out_date: '2026-10-18' })
    ], 'k671', today).holdLabel).toBe('שיפוצים');
    expect(selectPriorityStay([
      booking({ id: 'h', unit_id: 'k671', guest_name: 'מזגן מקולקל', check_in_date: '2026-10-07', check_out_date: '2026-10-16' })
    ], 'k671', today).holdLabel).toBe('מקולקל');
    expect(selectPriorityStay([
      booking({ id: 'h', unit_id: 'k671', guest_name: 'סגור', check_in_date: '2026-10-12', check_out_date: '2026-10-13' })
    ], 'k671', today).holdLabel).toBe('סגור');
    expect(selectPriorityStay([
      booking({ id: 'h', unit_id: 'k671', guest_name: 'לא נקי', check_in_date: '2026-10-11', check_out_date: '2026-10-15' })
    ], 'k671', today).holdLabel).toBe('לא נקי');
    expect(selectPriorityStay([
      booking({ id: 'h', unit_id: 'k671', guest_name: 'לא זמין', check_in_date: '2026-10-08', check_out_date: '2026-10-12' })
    ], 'k671', today).holdLabel).toBe('');
  });

  it('does not replace an in-house guest with a block', () => {
    const stay = selectPriorityStay([
      booking({ id: 'guest', unit_id: 'k671', guest_name: 'דני', check_in_date: '2026-10-10', check_out_date: '2026-10-14' }),
      booking({ id: 'hold', unit_id: 'k671', guest_name: 'לא זמין', check_in_date: '2026-10-10', check_out_date: '2026-10-20' })
    ], 'k671', today);
    expect(stay.booking.guest_name).toBe('דני');
    expect(stay.holdLabel).toBe('');
  });

  it('hides the guest on a vacant cabin and keeps an arrival and an occupied cabin', () => {
    expect(priorityShowsGuest({ stayKey: 'VACANT' })).toBe(false);
    expect(priorityShowsGuest({ stayKey: 'VACANT', arrivalToday: true })).toBe(true);
    expect(priorityShowsGuest({ stayKey: 'OCCUPIED' })).toBe(true);
    expect(priorityShowsGuest({ stayKey: 'VACANT', holdLabel: 'שיפוצים' })).toBe(false);
    expect(priorityShowsGuest({ stayKey: 'OCCUPIED', stayDraft: 'VACANT' })).toBe(false);
  });
});

describe('priorityDeskGuests', () => {
  const day = '2026-10-13';

  it('marks a same-day swap, a checkout, an arrival, and a guest staying another night', () => {
    const swap = priorityDeskGuests([
      booking({ id: 'out', unit_id: 'k689', guest_name: 'יוצא', check_in_date: '2026-10-11', check_out_date: '2026-10-13' }),
      booking({ id: 'in', unit_id: 'k689', guest_name: 'נכנס', check_in_date: '2026-10-13', check_out_date: '2026-10-14' })
    ], 'k689', day);
    expect(swap.roomStatus).toBe('החלפה');
    expect(swap.departing.guest_name).toBe('יוצא');
    expect(swap.arriving.guest_name).toBe('נכנס');

    const onlyOut = priorityDeskGuests([
      booking({ id: 'out', unit_id: 'k1', guest_name: 'יוצא', check_in_date: '2026-10-11', check_out_date: '2026-10-13' })
    ], 'k1', day);
    expect(onlyOut.roomStatus).toBe('צ׳ק אאוט');
    expect(onlyOut.arriving).toBeNull();

    const onlyIn = priorityDeskGuests([
      booking({ id: 'in', unit_id: 'k2', guest_name: 'נכנס', check_in_date: '2026-10-13', check_out_date: '2026-10-15' })
    ], 'k2', day);
    expect(onlyIn.roomStatus).toBe('צ׳ק אין');

    const stay = priorityDeskGuests([
      booking({ id: 'stay', unit_id: 'k3', guest_name: 'נשאר', check_in_date: '2026-10-11', check_out_date: '2026-10-14' })
    ], 'k3', day);
    expect(stay.roomStatus).toBe('בשהייה');
    expect(stay.staying.guest_name).toBe('נשאר');
    expect(stay.departing).toBeNull();
  });
});

describe('priorityDayCell', () => {
  const day = '2026-10-13';

  it('paints a stay, an arrival, a departure, a same-day swap, and an empty cabin', () => {
    expect(priorityDayCell([
      booking({ id: 's', unit_id: 'k1', guest_name: 'נשאר', check_in_date: '2026-10-11', check_out_date: '2026-10-16' })
    ], 'k1', day).kind).toBe('stay');
    expect(priorityDayCell([
      booking({ id: 'i', unit_id: 'k2', guest_name: 'נכנס', check_in_date: '2026-10-13', check_out_date: '2026-10-15' })
    ], 'k2', day).kind).toBe('in');
    expect(priorityDayCell([
      booking({ id: 'o', unit_id: 'k3', guest_name: 'יוצא', check_in_date: '2026-10-11', check_out_date: '2026-10-13' })
    ], 'k3', day).kind).toBe('out');
    const swap = priorityDayCell([
      booking({ id: 'o', unit_id: 'k4', guest_name: 'יוצא', check_in_date: '2026-10-11', check_out_date: '2026-10-13' }),
      booking({ id: 'i', unit_id: 'k4', guest_name: 'נכנס', check_in_date: '2026-10-13', check_out_date: '2026-10-15' })
    ], 'k4', day);
    expect(swap.kind).toBe('swap');
    expect(swap.out.guest_name).toBe('יוצא');
    expect(swap.inn.guest_name).toBe('נכנס');
    expect(priorityDayCell([], 'k5', day).kind).toBe('empty');
  });

  it('splits a checkout when the incoming block is a closed hold', () => {
    const blocked = priorityDayCell([
      booking({ id: 'o', unit_id: 'k6', guest_name: 'יוצא', check_in_date: '2026-10-11', check_out_date: '2026-10-13' }),
      booking({ id: 'h', unit_id: 'k6', guest_name: 'לא זמין', check_in_date: '2026-10-13', check_out_date: '2026-10-16' })
    ], 'k6', day);
    expect(blocked.kind).toBe('swap-hold');
    expect(blocked.out.guest_name).toBe('יוצא');
    expect(blocked.holdLabel).toBe('לא זמין');

    expect(priorityDayCell([
      booking({ id: 'o', unit_id: 'k7', guest_name: 'יוצא', check_in_date: '2026-10-11', check_out_date: '2026-10-13' }),
      booking({ id: 'h', unit_id: 'k7', guest_name: 'שיפוצים', check_in_date: '2026-10-13', check_out_date: '2026-10-18' })
    ], 'k7', day).holdLabel).toBe('שיפוצים');

    expect(priorityDayCell([
      booking({ id: 'o', unit_id: 'k8', guest_name: 'יוצא', check_in_date: '2026-10-11', check_out_date: '2026-10-13' }),
      booking({ id: 'h', unit_id: 'k8', guest_name: 'מזגן מקולקל', check_in_date: '2026-10-10', check_out_date: '2026-10-16' })
    ], 'k8', day).holdLabel).toBe('מקולקל');

    expect(priorityDayCell([
      booking({ id: 's', unit_id: 'k9', guest_name: 'נשאר', check_in_date: '2026-10-11', check_out_date: '2026-10-15' }),
      booking({ id: 'h', unit_id: 'k9', guest_name: 'לא זמין', check_in_date: '2026-10-11', check_out_date: '2026-10-20' })
    ], 'k9', day).kind).toBe('stay');
  });
});
