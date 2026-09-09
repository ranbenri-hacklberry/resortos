import Dexie from 'dexie';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const TASK_I18N_LANGS = ['he', 'en', 'ar', 'th'];

class TranslationCacheDB extends Dexie {
  constructor() {
    super('HotelOSTranslationCache');
    this.version(1).stores({
      entries: 'key, sourceLang, targetLang'
    });
  }
}

const cacheDb = new TranslationCacheDB();
const memoryCache = new Map();

export function normalizeLang(lng) {
  if (!lng || typeof lng !== 'string') return 'he';
  const base = lng.split('-')[0].toLowerCase();
  return TASK_I18N_LANGS.includes(base) ? base : 'he';
}

function cacheKey(sourceLang, targetLang, text) {
  return `${sourceLang}_${targetLang}_${text.trim()}`;
}

async function readCache(key) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const row = await cacheDb.table('entries').get(key);
    if (row?.translated) {
      memoryCache.set(key, row.translated);
      return row.translated;
    }
  } catch (_) {}
  return null;
}

async function writeCache(key, sourceLang, targetLang, translated) {
  memoryCache.set(key, translated);
  try {
    await cacheDb.table('entries').put({
      key,
      sourceLang,
      targetLang,
      translated,
      updated_at: new Date().toISOString()
    });
  } catch (_) {}
}

/**
 * Translates user-entered operations text. Memory + Dexie cache, then MyMemory.
 */
export async function translateDynamicText(text, targetLang, sourceLang = 'he') {
  if (!text || typeof text !== 'string' || !text.trim()) return text;

  const source = normalizeLang(sourceLang);
  const target = normalizeLang(targetLang);
  if (target === source) return text;

  const key = cacheKey(source, target, text);
  const cached = await readCache(key);
  if (cached) return cached;

  try {
    const langPair = `${source}|${target}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${encodeURIComponent(langPair)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Translation network error');

    const data = await response.json();
    const translated = data?.responseData?.translatedText;
    if (translated && typeof translated === 'string') {
      await writeCache(key, source, target, translated);
      return translated;
    }
  } catch (err) {
    console.warn('[LIVE TRANSLATOR WARN]', err);
  }

  return text;
}

/**
 * Prefetch he/en/ar/th for a task field. Source language is stored as-is.
 */
export async function translateToAllLanguages(text, sourceLang = 'he') {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  const source = normalizeLang(sourceLang);
  const result = { he: trimmed, en: trimmed, ar: trimmed, th: trimmed };
  if (!trimmed) return result;
  result[source] = trimmed;

  await Promise.all(
    TASK_I18N_LANGS.filter((lang) => lang !== source).map(async (lang) => {
      result[lang] = await translateDynamicText(trimmed, lang, source);
    })
  );

  return result;
}

export function useDynamicText(originalText, translationsMap, sourceLang = 'he') {
  const { i18n } = useTranslation();
  const currentLang = normalizeLang(i18n.language);
  const source = normalizeLang(sourceLang);

  const mapped = translationsMap ? translationsMap[currentLang] : undefined;
  const [displayText, setDisplayText] = useState(() => mapped || originalText || '');

  useEffect(() => {
    let isMounted = true;

    if (!originalText) {
      setDisplayText('');
      return;
    }

    if (mapped) {
      setDisplayText(mapped);
      return;
    }

    if (currentLang === source) {
      setDisplayText(originalText);
      return;
    }

    const key = cacheKey(source, currentLang, originalText);
    if (memoryCache.has(key)) {
      setDisplayText(memoryCache.get(key));
      return;
    }

    translateDynamicText(originalText, currentLang, source).then((res) => {
      if (isMounted) setDisplayText(res || originalText);
    });

    return () => {
      isMounted = false;
    };
  }, [originalText, currentLang, source, mapped]);

  return displayText;
}
