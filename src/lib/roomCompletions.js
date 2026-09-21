export const NEEDS_COMPLETIONS = 'NEEDS_COMPLETIONS';

export const COMPLETIONS_REASON = 'נקי · השלמות';

export function normalizeCompletions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((row, index) => {
      if (typeof row === 'string') {
        const text = row.trim();
        if (!text) return null;
        return { id: `c${index + 1}`, text, done: false };
      }
      const text = String(row?.text || row?.label || '').trim();
      if (!text) return null;
      return {
        id: String(row.id || `c${index + 1}`),
        text,
        done: Boolean(row.done)
      };
    })
    .filter(Boolean);
}

export function completionsFromUnit(unit) {
  const sop = unit?.sop_progress && typeof unit.sop_progress === 'object' ? unit.sop_progress : {};
  const fromSop = normalizeCompletions(sop.completions);
  if (fromSop.length) return fromSop;
  return normalizeCompletions(unit?.completions);
}

export function writeCompletionsIntoSop(sop, items) {
  const base = sop && typeof sop === 'object' ? { ...sop } : {};
  return { ...base, completions: normalizeCompletions(items) };
}

export function completionsReason(items) {
  const list = normalizeCompletions(items);
  const open = list.filter((row) => !row.done).map((row) => row.text);
  if (!open.length) return list.length ? 'ממתין לביקורת מנהל' : COMPLETIONS_REASON;
  return `${COMPLETIONS_REASON} · ${open.join(', ')}`;
}

export function allCompletionsDone(items) {
  const list = normalizeCompletions(items);
  return list.length > 0 && list.every((row) => row.done);
}

export function addCompletion(items, text) {
  const label = String(text || '').trim();
  if (!label) return normalizeCompletions(items);
  const list = normalizeCompletions(items);
  if (list.some((row) => row.text === label)) return list;
  return [...list, { id: `c${Date.now().toString(36)}${list.length}`, text: label, done: false }];
}

export function toggleCompletion(items, id, done) {
  return normalizeCompletions(items).map((row) => (
    row.id === id ? { ...row, done: done == null ? !row.done : Boolean(done) } : row
  ));
}

export function removeCompletion(items, id) {
  return normalizeCompletions(items).filter((row) => row.id !== id);
}
