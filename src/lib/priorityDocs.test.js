import { describe, expect, it } from 'vitest';
import { blankPriorityDoc, docWordCount, normalizePriorityDocs, sanitizeDocHtml } from './priorityDocs.js';

describe('priority documents', () => {
  it('strips scripts and event handlers from the page', () => {
    const clean = sanitizeDocHtml('<p onclick="alert(1)">שלום</p><script>alert(1)</script>');
    expect(clean).toContain('שלום');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
  });

  it('keeps a blank document when the file is empty', () => {
    const docs = normalizePriorityDocs({});
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe('מסמך ללא שם');
  });

  it('counts words in the page', () => {
    expect(docWordCount('<p>שלום <b>עולם</b></p>')).toBe(2);
    expect(docWordCount('<p><br></p>')).toBe(0);
    expect(blankPriorityDoc().html).toContain('<p>');
  });
});
