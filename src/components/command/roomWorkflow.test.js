import { describe, expect, it } from 'vitest';
import { arrivingLabel, cleaningStatusLine, primaryAction, showPrepWorkflow, todayTask, undoAction, usefulPrepNote } from './roomWorkflow';

const arriving = { plannedCheckIn: '15:00', checkedIn: false };
const departing = { checkedOut: true };

describe('room workflow', () => {
  it('keeps a turnover label on an occupied room until it is ready', () => {
    expect(todayTask({ status: 'occupied', departing, arriving })).toMatchObject({
      kind: 'turnover',
      deadline: 'מוכן עד 15:00',
    });
    expect(todayTask({ status: 'inspection', departing, arriving }).kind).toBe('turnover');
    expect(todayTask({ status: 'ready', departing, arriving })).toBeNull();
  });

  it('names cleaning without an arrival separately from turnover', () => {
    expect(todayTask({ status: 'dirty', departing, arriving: null })).toMatchObject({
      kind: 'clean',
      label: 'ניקיון בלבד',
    });
  });

  it('offers only checkout while the room is occupied', () => {
    const cabin = { status: 'occupied', day: { arriving, departing } };
    expect(primaryAction(cabin)).toEqual({ id: 'checkout', label: 'בצע צ׳ק־אאוט' });
    expect(undoAction(cabin, '2026-10-10')).toBeNull();
    expect(arrivingLabel(cabin)).toBe('מגיע היום');
    expect(showPrepWorkflow(cabin)).toBe(true);
    expect(primaryAction(cabin).id).toBe('checkout');
  });

  it('keeps both guests after checkout and then opens preparation', () => {
    const cabin = { status: 'dirty', day: { arriving, departing } };
    expect(arrivingLabel(cabin)).toBe('מגיע היום');
    expect(showPrepWorkflow(cabin)).toBe(true);
    expect(primaryAction(cabin)).toBeNull();
    expect(primaryAction({ ...cabin, day: { ...cabin.day, staff: 'נועה' } }).id).toBe('finish-clean');
  });

  it('undoes checkout only before the next guest is in', () => {
    const waiting = { status: 'dirty', day: { departing, arriving } };
    expect(undoAction(waiting, '2026-10-10')?.id).toBe('undo-checkout');
    const taken = {
      status: 'occupied',
      day: { departing, arriving: { ...arriving, checkedIn: true, checkedInAt: '2026-10-10T12:00:00.000Z' } },
    };
    expect(undoAction(taken, '2026-10-10')?.id).toBe('undo-checkin');
    expect(undoAction(taken, '2026-10-09')).toBeNull();
  });

  it('assigns cleaning before a manager can confirm it, and does not skip inspection', () => {
    expect(primaryAction({ status: 'dirty' })).toBeNull();
    expect(primaryAction({ status: 'dirty', day: { staff: 'נועה' } })).toEqual({
      id: 'finish-clean',
      label: 'אשר שהניקיון הסתיים',
    });
    expect(primaryAction({ status: 'cleaning', cleanerName: 'נועה' }).id).toBe('finish-clean');
    expect(primaryAction({ status: 'inspection' }).id).toBe('approve');
    expect(undoAction({ status: 'inspection' }, '2026-10-10')?.label).toBe('החזר לניקיון');
    expect(primaryAction({ status: 'ready', day: { arriving } }).id).toBe('checkin');
    expect(primaryAction({ status: 'ready', day: {} })).toBeNull();
  });

  it('hides generic turnover copy and keeps completion unconfirmed until the manager says so', () => {
    expect(usefulPrepNote('ניקוי לאחר יציאה והכנה לכניסה')).toBe('');
    expect(usefulPrepNote('החלפה היום')).toBe('החלפה היום');
    expect(usefulPrepNote('להשאיר עריסה ליד המיטה')).toBe('להשאיר עריסה ליד המיטה');
    expect(cleaningStatusLine({ status: 'dirty', staff: '' })).toContain('לא אושר');
    expect(cleaningStatusLine({ status: 'dirty', staff: 'נועה' })).toBe('נועה · סיום הניקיון לא אושר');
    expect(cleaningStatusLine({ status: 'inspection', staff: 'נועה' })).toBe('נועה · ממתין לביקורת');
  });
});