/** One next step on the command map, plus an explicit undo of the previous step. */

export const CARD_STATUS = {
  ready: 'מוכן',
  occupied: 'מאוכלס',
  dirty: 'לניקיון',
  cleaning: 'בנקיון',
  inspection: 'ממתין לבדיקה',
  alert: 'התראה',
  hold: 'סגור',
};

export const DRAWER_STATUS = {
  ready: 'מוכן',
  occupied: 'מאוכלס',
  dirty: 'ממתין לניקיון',
  cleaning: 'ניקיון בביצוע',
  inspection: 'ממתין לבדיקת מנהל',
  alert: 'התראה',
  hold: 'סגור',
};

export function todayTask({ status, departing, arriving }) {
  if (status === 'hold' || status === 'alert') return null;
  const hour = String(arriving?.plannedCheckIn || '').trim();
  if (arriving && status !== 'ready') {
    return {
      kind: 'turnover',
      label: 'החלפה',
      deadline: hour ? `מוכן עד ${hour}` : 'החלפה היום',
    };
  }
  if (!arriving && (status === 'dirty' || status === 'cleaning' || status === 'inspection')) {
    return { kind: 'clean', label: 'ניקיון בלבד', deadline: '' };
  }
  if (!arriving && status === 'occupied' && departing) {
    return { kind: 'depart', label: 'יציאה היום', deadline: '' };
  }
  return null;
}

export function arrivingLabel(cabin) {
  const stay = cabin?.day?.arriving;
  if (!stay || stay.checkedIn) return '';
  return 'מגיע היום';
}

export function showPrepWorkflow(cabin) {
  if (!cabin?.day || cabin.holdLabel || cabin.status === 'hold') return false;
  if (cabin.day.arriving) return true;
  return cabin.status === 'dirty' || cabin.status === 'cleaning' || cabin.status === 'inspection';
}

function arrivingCheckedIn(cabin) {
  return cabin?.day?.arriving?.checkedIn === true;
}

function checkedInToday(stay, today) {
  const at = String(stay?.checkedInAt || '');
  return Boolean(today && at.slice(0, 10) === today);
}

export function primaryAction(cabin) {
  if (!cabin || cabin.holdLabel || cabin.status === 'hold' || cabin.status === 'alert') return null;
  if (cabin.status === 'occupied') return { id: 'checkout', label: 'בצע צ׳ק־אאוט' };
  if (cabin.status === 'dirty' || cabin.status === 'cleaning') {
    const cleaner = String(cabin.day?.staff || cabin.cleanerName || '').trim();
    if (!cleaner) return null;
    return { id: 'finish-clean', label: 'אשר שהניקיון הסתיים' };
  }
  if (cabin.status === 'inspection') return { id: 'approve', label: 'אשר חדר כמוכן' };
  if (cabin.status === 'ready' && cabin.day?.arriving && !arrivingCheckedIn(cabin)) {
    return { id: 'checkin', label: 'בצע צ׳ק־אין' };
  }
  return null;
}

export function undoAction(cabin, today) {
  if (!cabin || cabin.holdLabel || cabin.status === 'hold' || cabin.status === 'alert') return null;
  if (arrivingCheckedIn(cabin)) {
    if (cabin.status === 'occupied' && checkedInToday(cabin.day?.arriving, today)) {
      return { id: 'undo-checkin', label: 'בטל צ׳ק־אין' };
    }
    return null;
  }
  if (cabin.status === 'dirty' && cabin.day?.departing?.checkedOut) {
    return { id: 'undo-checkout', label: 'בטל צ׳ק־אאוט' };
  }
  if (cabin.status === 'cleaning') return { id: 'undo-start', label: 'החזר לממתין לניקיון' };
  if (cabin.status === 'inspection') return { id: 'undo-finish', label: 'החזר לניקיון' };
  if (cabin.status === 'ready' && cabin.day?.approvedToday) {
    return { id: 'undo-ready', label: 'החזר לביקורת' };
  }
  return null;
}

const GENERIC_PREP_NOTES = [
  'ניקוי לאחר יציאה והכנה לכניסה',
  'ממתין לביקורת מנהל',
  'ניקיון בביצוע',
  'טופל',
];

export function usefulPrepNote(note) {
  const text = String(note || '').trim();
  if (!text) return '';
  if (GENERIC_PREP_NOTES.some((row) => text === row)) return '';
  return text;
}

export function cleaningStatusLine({ status, staff }) {
  const name = String(staff || '').trim();
  if (status === 'inspection') return name ? `${name} · ממתין לביקורת` : 'ממתין לביקורת';
  if (status === 'ready') return name ? `${name} · החדר מוכן` : 'החדר מוכן';
  if (status === 'occupied') return name ? `${name} · משובץ, ממתין ליציאה` : 'לא שויך מנקה';
  if (!name) return 'לא שויך מנקה · סיום לא אושר';
  return `${name} · סיום הניקיון לא אושר`;
}
