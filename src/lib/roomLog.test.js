import { describe, expect, it } from 'vitest';
import { appendRoomLog, buildRoomLogEvents, visibleRoomLog } from './roomLog.js';

const at = '2026-10-17T03:47:00.000Z';

describe('room log', () => {
  it('logs cleaner entry, exit, and the exact report', () => {
    const entered = buildRoomLogEvents(
      { operational_status: 'DIRTY' },
      { operational_status: 'IN_PROGRESS', assigned_staff: 'ברק' },
      'נכנסתי לנקות',
      at
    );
    expect(entered[0].kind).toBe('enter');
    expect(entered[0].quote).toBe('נכנסתי לנקות');

    const left = buildRoomLogEvents(
      { operational_status: 'IN_PROGRESS', assigned_staff: 'ברק' },
      { operational_status: 'READY', custom_reason: 'ממתין לביקורת מנהל', assigned_staff: 'ברק' },
      'סיימתי',
      '2026-10-17T04:12:00.000Z'
    );
    expect(left[0].kind).toBe('leave');
    expect(left[0].text).toBe('יצא מהחדר');

    const approved = buildRoomLogEvents(
      { operational_status: 'READY', custom_reason: 'ממתין לביקורת מנהל' },
      { operational_status: 'READY', custom_reason: 'אושר ע״י מנהל', assigned_staff: 'רני' },
      'נורית 3 מוכן',
      '2026-10-17T04:20:00.000Z'
    );
    expect(approved[0].kind).toBe('ready');
    expect(approved[0].quote).toBe('נורית 3 מוכן');
  });

  it('keeps older cycles and shows the latest cleaning entry by default', () => {
    const log = appendRoomLog({ templateId: 'turnover-clean' }, [
      { id: '1', kind: 'report', at: '2026-10-16T10:00:00.000Z', text: 'אתמול', quote: 'דליפה' },
      { id: '2', kind: 'enter', at: '2026-10-17T06:00:00.000Z', text: 'נכנס לניקיון', quote: '' },
      { id: '3', kind: 'leave', at: '2026-10-17T06:40:00.000Z', text: 'יצא מהחדר', quote: '' }
    ]);
    expect(log.templateId).toBe('turnover-clean');
    expect(visibleRoomLog(log.roomLog, 'cycle').map((row) => row.id)).toEqual(['2', '3']);
    expect(visibleRoomLog(log.roomLog, 'all')).toHaveLength(3);
  });
});
