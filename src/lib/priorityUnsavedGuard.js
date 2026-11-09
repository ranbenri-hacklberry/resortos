/** Priority desk unsaved-change leave guard helpers. */

export function shouldBlockLeave(dirtyCount) {
  return Number(dirtyCount || 0) > 0;
}

export function dirtyFieldLabel(label, isDirty) {
  const text = String(label || '');
  if (!isDirty) return text;
  return text.includes('*') ? text : `${text} *`;
}

export const UNSAVED_LEAVE_ACTIONS = Object.freeze({
  SAVE: 'save',
  DISCARD: 'discard',
  STAY: 'stay'
});

export function unsavedLeaveCopy() {
  return {
    title: 'יש שינויים שלא נשמרו',
    body: 'לפני היציאה מהמסך צריך לבחור מה לעשות עם השינויים.',
    save: 'שמירה',
    discard: 'ביטול שינויים',
    stay: 'המשך בעריכה'
  };
}
