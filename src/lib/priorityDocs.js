const BLOCKED_TAG = /<\/?(?:script|iframe|object|embed|link|meta)\b[^>]*>/gi;
const EVENT_ATTR = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const MAX_HTML = 200_000;
const MAX_DOCS = 40;

export function sanitizeDocHtml(html) {
  return String(html || '')
    .replace(BLOCKED_TAG, '')
    .replace(EVENT_ATTR, '')
    .replace(/javascript:/gi, '')
    .slice(0, MAX_HTML);
}

export function blankPriorityDoc(now = new Date().toISOString()) {
  return {
    id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: 'מסמך ללא שם',
    html: '<p><br></p>',
    updatedAt: now
  };
}

export function normalizePriorityDocs(raw) {
  const list = Array.isArray(raw?.docs) ? raw.docs : [];
  const docs = list.slice(0, MAX_DOCS).map((row) => {
    const title = String(row?.title || '').trim().slice(0, 80) || 'מסמך ללא שם';
    const id = String(row?.id || '').trim().slice(0, 40);
    if (!id) return null;
    return {
      id,
      title,
      html: sanitizeDocHtml(row?.html || '<p><br></p>') || '<p><br></p>',
      updatedAt: String(row?.updatedAt || '')
    };
  }).filter(Boolean);
  return docs.length ? docs : [blankPriorityDoc()];
}

export function docWordCount(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 0;
  return text.split(' ').length;
}
