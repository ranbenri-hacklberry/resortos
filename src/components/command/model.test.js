import { describe, expect, it } from 'vitest';
import { applyDemoTick, cabinsForPrint, countsOf, createSeedCabins } from './model';

describe('ramot command model', () => {
  it('maps the 28 calendar units onto the seven compounds', () => {
    const cabins = createSeedCabins();
    expect(cabins).toHaveLength(28);
    expect(new Set(cabins.map((cabin) => cabin.id)).size).toBe(28);
    expect(cabins.filter((cabin) => cabin.compoundId === 'A').map((cabin) => cabin.id)).toEqual(['k680', 'k681', 'k682', 'k683', 'k684']);
    expect(cabins.filter((cabin) => cabin.compoundId === 'G').map((cabin) => cabin.id)).toEqual(['k671', 'k673', 'k674', 'k675', 'k676', 'k677', 'k678', 'k679']);
    expect(cabins.filter((cabin) => cabin.compoundId === 'F').map((cabin) => cabin.id)).toEqual(['k693', 'k694', 'k695']);
    expect(cabins.every((cabin) => cabin.isRealHardware === false)).toBe(true);
    const counts = countsOf(cabins);
    expect(counts.ready + counts.occupied + counts.cleaning + counts.inspection + counts.alert).toBe(28);
    expect(counts.alert).toBe(0);
  });

  it('promotes the next cleaning cabin and raises smoke on Maya 3', () => {
    const next = applyDemoTick(createSeedCabins());
    expect(next.find((cabin) => cabin.id === 'k682').status).toBe('inspection');
    expect(next.find((cabin) => cabin.id === 'k689').status).toBe('cleaning');
    const maya = next.find((cabin) => cabin.id === 'k695');
    expect(maya.status).toBe('alert');
    expect(maya.telemetry.vocIndex).toBeGreaterThan(400);
    expect(cabinsForPrint(next)[0].compoundId).toBe('A');
    expect(cabinsForPrint(next).at(-1).compoundId).toBe('F');
  });
});
