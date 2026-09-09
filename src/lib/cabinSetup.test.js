import { describe, expect, it } from 'vitest';
import { CABIN_SETUP_ITEMS, housekeepingSopSteps } from './cabinSetup.js';
import { DEFAULT_SOP_TEMPLATES, ensureTaskSop, mergeTemplateSteps, SOP_IDS } from './sop.js';

describe('cabin setup SOP', () => {
  it('includes the full restock list after the clean steps', () => {
    const steps = housekeepingSopSteps();
    expect(steps[0].id).toBe('linens');
    expect(steps.some((row) => row.id === 'setup_bath_towels')).toBe(true);
    expect(steps.some((row) => row.id === 'setup_capsules')).toBe(true);
    expect(steps.some((row) => row.id === 'setup_wifi_codes')).toBe(true);
    expect(steps.length).toBeGreaterThan(40);
    expect(DEFAULT_SOP_TEMPLATES.find((row) => row.id === SOP_IDS.HOUSEKEEPING).steps).toEqual(steps);
  });

  it('adds new setup ids onto an old 8-step template and an open task', () => {
    const seed = DEFAULT_SOP_TEMPLATES.find((row) => row.id === SOP_IDS.HOUSEKEEPING);
    const old = {
      id: SOP_IDS.HOUSEKEEPING,
      domain: 'HOUSEKEEPING',
      title: seed.title,
      steps: seed.steps.slice(0, 8)
    };
    expect(mergeTemplateSteps(seed, old).steps.map((row) => row.id)).toEqual(seed.steps.map((row) => row.id));
    const merged = ensureTaskSop({
      domain: 'HOUSEKEEPING',
      sopProgress: { templateId: SOP_IDS.HOUSEKEEPING, steps: old.steps, doneIds: ['linens'] }
    }, [seed]);
    expect(merged.doneIds).toEqual(['linens']);
    expect(merged.steps.some((row) => row.id === 'setup_sheets')).toBe(true);
    expect(CABIN_SETUP_ITEMS.length).toBeGreaterThan(30);
  });
});
