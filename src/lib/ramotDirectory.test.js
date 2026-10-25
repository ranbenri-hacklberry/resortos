import { describe, expect, it } from 'vitest';
import { isRamotPin, ramotPublicList, ramotSecrets } from './ramotDirectory.js';

describe('ramot directory', () => {
  it('lists only Ramot complexes with public nav links and no codes', () => {
    const list = ramotPublicList();
    expect(list.map((row) => row.id)).toEqual([
      'nurit', 'taj', 'mool', 'nofim', 'toscana', 'musical', 'maya'
    ]);
    expect(list.every((row) => row.wazeUrl && row.mapsUrl.includes('google.com'))).toBe(true);
    expect(JSON.stringify(list)).not.toMatch(/2310|Mial2026|MIAL2026|4696/);
  });

  it('accepts the three staff pins and returns lockbox plus wifi', () => {
    expect(isRamotPin('4696')).toBe(true);
    expect(isRamotPin('2102')).toBe(true);
    expect(isRamotPin('4141')).toBe(true);
    expect(isRamotPin('0000')).toBe(false);
    const taj = ramotSecrets('taj');
    expect(taj.gate).toBe('#2464');
    expect(taj.complexes[0].units.find((row) => row.id === 'k811').lockbox).toBe('2540');
    const all = ramotSecrets();
    const byId = Object.fromEntries(all.complexes.flatMap((row) => row.units.map((unit) => [unit.id, unit.lockbox])));
    expect(byId.k690).toBe('2610');
    expect(byId.k691).toBe('2620');
    expect(byId.k692).toBe('2630');
    expect(byId.k685).toBe('2810');
    expect(byId.k686).toBe('2820');
    expect(all.complexes.find((row) => row.id === 'toscana').units.map((unit) => unit.name)).toEqual([
      'טוסקנה · 1', 'טוסקנה · 2', 'טוסקנה · 3'
    ]);
    expect(taj.complexes[0].wifi[0].ssid).toBe('LUTUS');
  });
});
