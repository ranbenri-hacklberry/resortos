import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { persistLanguage } from '../i18n';
import GuestBrandMark from './GuestBrandMark';

const LANGS = [
  { code: 'he', label: 'עב' },
  { code: 'en', label: 'EN' },
  { code: 'ar', label: 'عر' }
];

export default function GuestChrome({ theme, onThemeChange, themeStyles, center = null }) {
  const { i18n } = useTranslation();
  const current = (i18n.language || 'he').split('-')[0];
  const isLight = theme === 'light';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: '0.65rem',
        direction: 'ltr'
      }}
    >
      <div style={{ minWidth: 44, display: 'flex', justifyContent: 'flex-start', flexShrink: 0 }}>
        <GuestBrandMark theme={theme} compact />
      </div>
      <div
        style={{
          display: 'flex',
          background: themeStyles.inputBg,
          border: `1px solid ${themeStyles.inputBorder}`,
          borderRadius: 999,
          padding: 2,
          gap: 2
        }}
      >
        {LANGS.map((lang) => {
          const active = current === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                i18n.changeLanguage(lang.code);
                persistLanguage(lang.code);
              }}
              style={{
                border: 'none',
                cursor: 'pointer',
                borderRadius: 999,
                padding: '0.28rem 0.58rem',
                fontWeight: 800,
                fontSize: '0.7rem',
                background: active ? themeStyles.accent : 'transparent',
                color: active ? themeStyles.ctaText : themeStyles.textMuted
              }}
            >
              {lang.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
        {center}
      </div>
      <button
        type="button"
        onClick={() => onThemeChange(isLight ? 'dark' : 'light')}
        aria-label={isLight ? 'Dark' : 'Light'}
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          border: `1px solid ${themeStyles.inputBorder}`,
          background: themeStyles.inputBg,
          color: themeStyles.textPrimary,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {isLight ? <Moon size={15} /> : <Sun size={15} />}
      </button>
    </div>
  );
}
