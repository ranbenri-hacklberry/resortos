import { describe, expect, it } from 'vitest';
import {
  applyPaySplitView,
  cabinQuotesOrEqual,
  normalizePaySplit,
  splitRemainders
} from './paySplit';

const group = {
  unit_id: 'hill-1',
  cabin_ids: ['hill-1', 'hill-2', 'hill-3'],
  total_price_agorot: 900000,
  deposit_agorot: 180000,
  payment_status: 'DEPOSIT_PAID',
  stay: {
    pay_split: 'per_cabin',
    booker_cabin_id: 'hill-1',
    cabin_ids: ['hill-1', 'hill-2', 'hill-3'],
    cabin_quotes: [
      { cabin_id: 'hill-1', total_agorot: 300000 },
      { cabin_id: 'hill-2', total_agorot: 300000 },
      { cabin_id: 'hill-3', total_agorot: 300000 }
    ],
    hyp_deposit: { paid: true },
    cabin_parties: [
      { cabin_id: 'hill-1', occupant_name: 'מזמין', occupant_phone: '0500000001' },
      { cabin_id: 'hill-2', occupant_name: 'שכן', occupant_phone: '0500000002' }
    ]
  }
};

describe('paySplit', () => {
  it('requires an explicit choice only when more than one cabin', () => {
    expect(normalizePaySplit('', 1)).toBe('together');
    expect(normalizePaySplit('', 3)).toBe('');
    expect(normalizePaySplit('per_cabin', 3)).toBe('per_cabin');
  });

  it('credits the group deposit only to the booker cabin', () => {
    const remainders = splitRemainders(group.stay.cabin_quotes, 'per_cabin', 'hill-1', 180000);
    expect(remainders.map((row) => row.remainder_agorot)).toEqual([120000, 300000, 300000]);
  });

  it('quotes 1200 left for the booker and full price for other cabins', () => {
    const booker = applyPaySplitView(group, 'hill-1');
    expect(booker.total_price_agorot).toBe(300000);
    expect(booker.deposit_agorot).toBe(180000);
    expect(booker.payment_status).toBe('DEPOSIT_PAID');

    const other = applyPaySplitView(group, 'hill-2');
    expect(other.total_price_agorot).toBe(300000);
    expect(other.deposit_agorot).toBe(0);
    expect(other.payment_status).toBe('UNPAID');
    expect(other.guest_name).toBe('שכן');
  });

  it('fills missing cabin quotes evenly', () => {
    const quotes = cabinQuotesOrEqual(['a', 'b'], 900000, []);
    expect(quotes.map((row) => row.total_agorot)).toEqual([450000, 450000]);
  });
});
