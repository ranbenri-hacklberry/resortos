import { describe, expect, it } from 'vitest';
import { holdDoneText, proposesNightHold } from './nightHold.js';

describe('night hold phrase', () => {
  it('recognizes a one-night block', () => {
    expect(proposesNightHold('לא זמין')).toBe(true);
    expect(proposesNightHold('תחסום ללילה')).toBe(true);
    expect(proposesNightHold('חסימה')).toBe(true);
  });

  it('ignores a question and a normal status', () => {
    expect(proposesNightHold('למה לא זמין?')).toBe(false);
    expect(proposesNightHold('נורית 3 מוכן')).toBe(false);
    expect(proposesNightHold('גביתי 1000 מזומן')).toBe(false);
  });

  it('keeps the finished message to the calendar result', () => {
    expect(holdDoneText('מאיה 1', true)).toContain('יומן כינורות');
    expect(holdDoneText('מאיה 1', false)).toContain('עדיין לא נקלט');
  });
});