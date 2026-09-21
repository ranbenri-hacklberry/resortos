import { describe, expect, it } from 'vitest';
import { enrichTaskData, fieldUnitDisplayName, listFieldComplexes, resolveFieldUnit, stripLegendPlotNumber } from './fieldUnitCatalog';

const UNITS = [
  { id: 'k810', name: "טאג' מאהל · בקתה 3" },
  { id: 'k690', name: 'חצר מוסיקלית · חליל' },
  { id: 'dome-red', name: 'כיפת שמיים אדום' },
  { id: 'k827', name: 'קאסה נובה · Bloom' },
  { id: 'k682', name: 'מול הנוף · בקתה 3' },
];

function mapsDestination(url) {
  try {
    return new URL(url).searchParams.get('destination') || '';
  } catch (_) {
    return '';
  }
}

describe('fieldUnitCatalog', () => {
  it('resolves property + cabin number', () => {
    const hit = resolveFieldUnit(UNITS, { unit_number: 3, property_name: "טאג'" }, '');
    expect(hit?.unit_id).toBe('k810');
    expect(hit?.thai_sign).toBe('Ⓔ');
    expect(hit?.wazeUrl).toContain('waze.com');
  });

  it('resolves Thai/staff signs by name', () => {
    expect(resolveFieldUnit(UNITS, {}, 'חליל תקלת ג׳קוזי')?.unit_id).toBe('k690');
    expect(resolveFieldUnit(UNITS, {}, 'כיפה אדום לנקות')?.unit_id).toBe('dome-red');
    expect(resolveFieldUnit(UNITS, { unit_label: 'Bloom' }, '')?.unit_id).toBe('k827');
  });

  it('disambiguates same cabin number across properties', () => {
    const hit = enrichTaskData(
      { unit_number: 3, property_name: 'מול הנוף', task_he: 'מגבות' },
      { units: UNITS, spokenText: 'מול הנוף בקתה 3 מגבות' }
    );
    expect(hit.unit_id).toBe('k682');
    expect(hit.resolved).toBe(true);
    expect(hit.mapsUrl).toContain('google.com/maps');
  });

  it('refuses bare cabin number without property', () => {
    const hit = enrichTaskData(
      { unit_number: 3, task_he: 'תקלת חשמל בחדר 3' },
      { units: UNITS, spokenText: 'תקלת חשמל בחדר 3 מעל המיטה' }
    );
    expect(hit.resolved).toBe(false);
    expect(hit.needs_property).toBe(true);
    expect(hit.candidate_properties.map((p) => p.id).sort()).toEqual(['mool', 'taj'].sort());
  });

  it('resolves after property pick with guest listing query', () => {
    const hit = enrichTaskData(
      { unit_number: 3, task_he: 'מגבות' },
      { units: UNITS, spokenText: 'טאג בקתה 3 מגבות', property_id: 'taj' }
    );
    expect(hit.unit_id).toBe('k810');
    expect(hit.resolved).toBe(true);
    expect(mapsDestination(hit.mapsUrl)).toBe("טאג' מאהל מושב רמות");
  });

  it('resolves Thai map legend letter/code', () => {
    const hit = enrichTaskData(
      { unit_number: 3, property_name: 'A', task_he: 'מגבות' },
      { units: UNITS, spokenText: 'במתחם A בקתה 3 מגבות', property_id: 'mool' }
    );
    expect(hit.unit_id).toBe('k682');
    expect(hit.unit_name).toMatch(/^Ⓐ /);
    expect(hit.unit_name).not.toContain('29');
    expect(hit.legend_letter).toBe('A');
  });

  it('keeps the Thai letter in titles and drops the plot number', () => {
    expect(stripLegendPlotNumber('Ⓐ29 מול הנוף · בקתה 1')).toBe('Ⓐ מול הנוף · בקתה 1');
    expect(fieldUnitDisplayName({ id: 'k680', name: 'Ⓐ29 מול הנוף · בקתה 1' })).toBe('Ⓐ מול הנוף · בקתה 1');
    expect(listFieldComplexes().find((row) => row.id === 'mool')?.label).toBe('Ⓐ מול הנוף');
  });

  it('shows Musical Courtyard cabins as numbers, not instrument names', () => {
    expect(fieldUnitDisplayName({ id: 'k690', name: 'חצר מוסיקלית · חליל' })).toBe('Ⓓ חצר מוסיקלית · בקתה 1');
    expect(fieldUnitDisplayName({ id: 'k691', name: 'Ⓓ26 חצר מוסיקלית · מיתר' })).toBe('Ⓓ חצר מוסיקלית · בקתה 2');
    expect(fieldUnitDisplayName({ id: 'k692', name: 'חצר מוסיקלית · פעמון' })).toBe('Ⓓ חצר מוסיקלית · בקתה 3');
    expect(fieldUnitDisplayName('ticket-1', 'חצר מוסיקלית · חליל')).toBe('Ⓓ חצר מוסיקלית · בקתה 1');
  });

  it('lists complexes by name without cabins', () => {
    const list = listFieldComplexes();
    expect(list.some((row) => row.id === 'mool' && row.label.includes('מול הנוף'))).toBe(true);
    expect(list.some((row) => row.id === 'taj')).toBe(true);
    expect(list.every((row) => row.label && !/בקתה/.test(row.label))).toBe(true);
  });
});
