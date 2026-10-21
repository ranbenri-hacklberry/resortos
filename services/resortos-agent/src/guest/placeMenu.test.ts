import { describe, expect, it } from 'vitest';
import { openStatus, placeDetail, placeMenuFor } from './placeMenu.js';

const saturdayMorning = new Date('2026-10-17T04:47:00Z');

describe('place follow-up', () => {
  it('numbers the grocery options', async () => {
    const menu = await placeMenuFor('איפה קונים חלב');
    expect(menu?.text).toContain('1. *סופרמרקט וגלריה · רמות*');
    expect(menu?.text).toContain('השיבו במספר מהרשימה');
    expect(menu?.ids[0]).toBe('shop_ramot_super');
  });

  it('says when a closed shop opens, and that a 24-hour shop is open', async () => {
    expect(openStatus('א׳–ה׳ 07:30–20:00 · ו׳ 07:30–17:00 · שבת 09:00–14:00', saturdayMorning)).toBe('סגור עכשיו. נפתח היום ב-09:00.');
    expect(openStatus('24/7 כולל שבת', saturdayMorning)).toBe('פתוח עכשיו, כל היממה.');
    const detail = await placeDetail('shop_ramot_super', saturdayMorning);
    expect(detail).toContain('סגור עכשיו');
    expect(detail).toContain('09:00');
    expect(detail).toContain('04-673-1408');
    expect(detail).toContain('וויז:');
    expect(detail).toContain('גוגל מפות:');
  });
});
