import { describe, expect, it } from 'vitest';
import {
  addCompletion,
  allCompletionsDone,
  completionsFromUnit,
  completionsReason,
  toggleCompletion,
  writeCompletionsIntoSop
} from './roomCompletions.js';

describe('room completions', () => {
  it('stores a checklist on sop_progress and summarizes open items', () => {
    const added = addCompletion([], 'מגבות');
    const withSoap = addCompletion(added, 'סבון / שמפו');
    expect(completionsReason(withSoap)).toBe('נקי · השלמות · מגבות, סבון / שמפו');
    const unit = { sop_progress: writeCompletionsIntoSop({ templateId: 'turnover-clean' }, withSoap) };
    expect(completionsFromUnit(unit).map((row) => row.text)).toEqual(['מגבות', 'סבון / שמפו']);
    expect(unit.sop_progress.templateId).toBe('turnover-clean');
  });

  it('becomes ready only after every item is checked', () => {
    const items = addCompletion(addCompletion([], 'מגבות'), 'סדינים');
    expect(allCompletionsDone(items)).toBe(false);
    const one = toggleCompletion(items, items[0].id, true);
    expect(allCompletionsDone(one)).toBe(false);
    const all = toggleCompletion(one, items[1].id, true);
    expect(allCompletionsDone(all)).toBe(true);
    expect(completionsReason(all)).toBe('ממתין לביקורת מנהל');
  });
});
