import { formatFullPriceList } from './priceList.js';

export type ExactKind = 'price' | 'inspection' | 'cleaning' | 'daily' | 'gate' | 'checkin' | 'checkout';

const PHRASES: Record<string, ExactKind> = {
  'מחירון': 'price',
  'מה המחירון': 'price',
  'מה ממתין לבדיקה': 'inspection',
  'מה ממתין לביקורת': 'inspection',
  'חדרים לביקורת': 'inspection',
  'מה ממתין לניקיון': 'cleaning',
  'חדרים לניקיון': 'cleaning',
  'סטטוס יומי': 'daily',
  'תמונת מצב': 'daily',
  'קוד השער': 'gate',
  'מה קוד השער': 'gate',
  "שעת צ'ק אין": 'checkin',
  'שעת כניסה': 'checkin',
  "שעת צ'ק אאוט": 'checkout',
  'שעת יציאה': 'checkout',
};

/** Collapse spaces and quote marks. Extra words stay, so the key no longer matches. */
export function normalizeExactText(text: string): string {
  return text
    .trim()
    .replace(/[׳']/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[?!.,]+$/g, '')
    .trim();
}

export function lookupExact(text: string): ExactKind | null {
  if (!text?.trim()) return null;
  return PHRASES[normalizeExactText(text)] ?? null;
}

const STATIC: Partial<Record<ExactKind, string>> = {
  price: '',
  gate: 'קוד שער מושב רמות: *#2464*',
  checkin: 'שעת צ׳ק-אין: *15:00*',
  checkout: 'שעת צ׳ק-אאוט: *11:00*',
};

export function exactStaticReply(kind: ExactKind): string | null {
  if (kind === 'price') return formatFullPriceList();
  return STATIC[kind] ?? null;
}
