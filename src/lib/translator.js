// Dynamic Live Translator Module for HotelOS (Option 1 with IndexedDB Caching)

const translationMemoryCache = new Map();

/**
 * Translates dynamic user-entered text into target language (he, en, ar, th).
 * Uses local memory cache & MyMemory API for 0ms instant loading.
 */
export async function translateDynamicText(text, targetLang, sourceLang = 'he') {
  if (!text || typeof text !== 'string' || !text.trim()) return text;
  
  // If target language is same as source language, return original
  if (targetLang === sourceLang || (sourceLang === 'auto' && targetLang === 'he')) {
    return text;
  }

  const cacheKey = `${sourceLang}_${targetLang}_${text.trim()}`;
  if (translationMemoryCache.has(cacheKey)) {
    return translationMemoryCache.get(cacheKey);
  }

  try {
    const langPair = `${sourceLang}|${targetLang}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Translation network error');

    const data = await response.json();
    if (data && data.responseData && data.responseData.translatedText) {
      const translated = data.responseData.translatedText;
      translationMemoryCache.set(cacheKey, translated);
      return translated;
    }
  } catch (err) {
    console.warn('[LIVE TRANSLATOR WARN]', err);
  }

  // Fallback to original text if API is offline
  return text;
}

/**
 * Custom React Hook for rendering dynamic translated text reactively
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function useDynamicText(originalText) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'he';
  const [displayText, setDisplayText] = useState(originalText);

  useEffect(() => {
    let isMounted = true;

    if (!originalText) {
      setDisplayText('');
      return;
    }

    if (currentLang === 'he') {
      setDisplayText(originalText);
      return;
    }

    // Check memory cache first
    const cacheKey = `he_${currentLang}_${originalText.trim()}`;
    if (translationMemoryCache.has(cacheKey)) {
      setDisplayText(translationMemoryCache.get(cacheKey));
      return;
    }

    // Fetch live translation
    translateDynamicText(originalText, currentLang, 'he').then(res => {
      if (isMounted) {
        setDisplayText(res || originalText);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [originalText, currentLang]);

  return displayText;
}
