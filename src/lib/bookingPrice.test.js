import { describe, expect, it } from 'vitest';
import {
  nightlyFromTotalIls,
  nightlyIlsFromUnit,
  nightsCount,
  pricedStay,
  stayTotalIls
} from './bookingPrice';

describe('bookingPrice', () => {
  it('counts nights at noon and never returns zero for a valid stay', () => {
    expect(nightsCount('2026-08-27', '2026-08-28')).toBe(1);
    expect(nightsCount('2026-08-27', '2026-08-30')).toBe(3);
    expect(nightsCount('2026-08-27', '2026-08-27')).toBe(1);
  });

  it('defaults cabin nightly from unit agorot', () => {
    expect(nightlyIlsFromUnit({ base_price_agorot: 85000 })).toBe(850);
    expect(nightlyIlsFromUnit({ base_price_agorot: 120000 })).toBe(1200);
  });

  it('lets admin override to a test amount and keeps 20% deposit', () => {
    expect(stayTotalIls(5, 1)).toBe(5);
    expect(pricedStay(5, 1)).toEqual({ nightlyIls: 5, nights: 1, totalIls: 5, depositIls: 1 });
    expect(nightlyFromTotalIls(5, 1)).toBe(5);
    expect(pricedStay(850, 2, 1)).toEqual({ nightlyIls: 850, nights: 2, totalIls: 1700, depositIls: 340 });
  });
});
