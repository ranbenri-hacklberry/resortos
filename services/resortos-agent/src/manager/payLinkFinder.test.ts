import { describe, it, expect, vi } from 'vitest';
import { createHypReportFinder, matchReportRow, type ReportRow } from './payLinkWatch.js';

// Ran 2026-10-28: HYP transactions report → TransId for a paid payment link. Report is mocked.
const link = { payRequestId: 'pr-1', bookingId: 'bk-test-1', amountAgorot: 65000, description: 'D1 · הזמנה KR-5531', createdAt: '2026-10-28T06:00:00.000Z' };
const row = (o: Partial<ReportRow>): ReportRow => ({ txn: 't', amount: 650, date: '2026-10-28', desc: '', ...o });

describe('matchReportRow', () => {
  it('single amount match after creation → its TransId', () => {
    expect(matchReportRow([row({ txn: 'A' }), row({ txn: 'B', amount: 100 })], link)).toBe('A');
  });
  it('prefers the row mentioning the booking ref when several share the amount', () => {
    expect(matchReportRow([row({ txn: 'A', desc: 'אחר' }), row({ txn: 'B', desc: 'D1 · הזמנה KR-5531' })], link)).toBe('B');
  });
  it('ambiguous (two same-amount rows, no ref) → undefined, never guesses', () => {
    expect(matchReportRow([row({ txn: 'A' }), row({ txn: 'B' })], link)).toBeUndefined();
    expect(matchReportRow([row({ txn: 'A', desc: 'KR-5531' }), row({ txn: 'B', desc: 'KR-5531' })], link)).toBeUndefined();
  });
  it('ignores rows dated before the link and wrong amounts', () => {
    expect(matchReportRow([row({ txn: 'OLD', date: '2026-10-20' })], link)).toBeUndefined();
    expect(matchReportRow([row({ txn: 'X', amount: 650.01 })], link)).toBeUndefined();
  });
});

describe('createHypReportFinder', () => {
  it('queries from the link creation day and does not reuse a TransId', async () => {
    const lister = vi.fn(async () => [row({ txn: 'A' })]);
    const f = createHypReportFinder(lister, () => new Date('2026-10-29T10:00:00Z'));
    expect(await f.find(link)).toBe('A');
    expect(lister).toHaveBeenCalledWith('2026-10-28', '2026-10-29');
    expect(await f.find({ ...link, payRequestId: 'pr-2' })).toBeUndefined();
  });
});
