/** Languages available in Field Ops / Login / Walkie partner picker. */
export const FIELD_UI_LANGUAGES = [
  { code: 'he', name: 'עברית', flag: '🇮🇱', bcp47: 'he-IL', he: 'עברית', native: 'דבר עברית', short: 'עברית' },
  { code: 'en', name: 'English', flag: '🇺🇸', bcp47: 'en-US', he: 'אנגלית', native: 'Speak English', short: 'EN' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', bcp47: 'ar-SA', he: 'ערבית', native: 'تحدث بالعربية', short: 'العربية' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭', bcp47: 'th-TH', he: 'תאילנדית', native: 'พูดภาษาไทย', short: 'ไทย' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺', bcp47: 'ru-RU', he: 'רוסית', native: 'Говорить по-русски', short: 'RU' }
];

export const FIELD_UI_LANG_CODES = FIELD_UI_LANGUAGES.map((row) => row.code);

export const FIELD_UI_LANG_BY_CODE = Object.fromEntries(
  FIELD_UI_LANGUAGES.map((row) => [row.code, row])
);

/** Second person in face-to-face chat: prefer Hebrew↔Thai when UI is one of them. */
export function defaultPartnerLang(deviceLang) {
  const base = String(deviceLang || 'he').split('-')[0].toLowerCase();
  if (base === 'he') return 'th';
  if (FIELD_UI_LANG_CODES.includes(base)) return 'he';
  return 'he';
}

export function normalizeFieldUiLang(lng) {
  const base = String(lng || 'he').split('-')[0].toLowerCase();
  return FIELD_UI_LANG_CODES.includes(base) ? base : 'he';
}
