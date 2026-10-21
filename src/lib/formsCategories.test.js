import { describe, expect, it } from 'vitest';
import { resolveCategory, itemInCategory, categoryFromLocation } from './formsCategories.js';
import { REGULATIONS } from './regulationsCatalog.js';

describe('forms categories', () => {
  it('old hospitality/reports ids redirect to merged operations tab', () => {
    expect(resolveCategory('hospitality')).toBe('operations');
    expect(resolveCategory('reports')).toBe('operations');
    expect(resolveCategory('')).toBe('all');
  });
  it('operations tab shows items of both former tabs', () => {
    expect(itemInCategory({ category: 'hospitality' }, 'operations')).toBe(true);
    expect(itemInCategory({ category: 'reports' }, 'operations')).toBe(true);
    expect(itemInCategory({ category: 'qr' }, 'operations')).toBe(false);
    expect(itemInCategory({ category: 'reports' }, 'reports')).toBe(true);
  });
  it('deep links', () => {
    expect(categoryFromLocation({ search: '?formsCategory=reports' })).toBe('operations');
    expect(categoryFromLocation({ hash: '#forms/hospitality' })).toBe('operations');
    expect(categoryFromLocation({ hash: '#forms/regulations' })).toBe('regulations');
  });
  it('regulations list carries the draft cancellation policy', () => {
    const p = REGULATIONS.find((r) => r.id === 'reg-cancellation-policy');
    expect(p.isDraft).toBe(true);
    expect(p.url).toBe('/regulations/cancellation-policy-v1.1.2-draft.pdf');
    expect(p.htmlUrl).toBe('/regulations/cancellation-policy-v1.1.2-draft.html');
    expect(p.priorityDocId).toBe('doc-cxlpolicy-110-draft');
  });
});
