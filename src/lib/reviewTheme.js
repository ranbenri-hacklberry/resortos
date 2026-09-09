import { useEffect, useState } from 'react';

export const THEME_STORE = 'resortos-review-theme';

export const THEMES = {
  light: {
    page: '#F6F3EC',
    card: '#FAF8F3',
    ink: '#1C1917',
    muted: '#78716C',
    faint: '#A8A29E',
    line: 'rgba(28, 25, 23, 0.10)',
    well: '#F3EDE3',
    input: '#FFFFFF',
    chip: '#EDE6DA',
    chipInk: '#44403C',
    warn: '#B45309',
    error: '#B91C1C',
    accent: '#C2410C',
    accentSoft: 'rgba(194, 65, 12, 0.12)',
    shadow: '0 18px 40px rgba(87, 64, 40, 0.10)'
  },
  dark: {
    page: '#0C0A09',
    card: '#1C1917',
    ink: '#F5F5F4',
    muted: '#A8A29E',
    faint: '#A8A29E',
    line: '#292524',
    well: '#0C0A09',
    input: '#0C0A09',
    chip: '#292524',
    chipInk: '#E7E5E4',
    warn: '#FBBF24',
    error: '#F87171',
    accent: '#F59E0B',
    accentSoft: 'rgba(245, 158, 11, 0.12)',
    shadow: '0 24px 60px rgba(0, 0, 0, 0.45)'
  }
};

export function readThemeName() {
  try {
    const stored = localStorage.getItem(THEME_STORE);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (_) {}
  return 'light';
}

export function useReviewTheme() {
  const [themeName, setThemeName] = useState(readThemeName);
  const theme = THEMES[themeName] || THEMES.light;

  useEffect(() => {
    localStorage.setItem(THEME_STORE, themeName);
    document.documentElement.style.background = theme.page;
    document.body.style.background = theme.page;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.page);
  }, [themeName, theme.page]);

  return {
    theme,
    themeName,
    isLight: themeName === 'light',
    toggleTheme: () => setThemeName((current) => (current === 'light' ? 'dark' : 'light'))
  };
}

export function fieldStyle(theme, invalid = false) {
  return {
    width: '100%',
    background: theme.input,
    border: `1px solid ${invalid ? theme.error : theme.line}`,
    borderRadius: 12,
    padding: '0.8rem 1rem',
    color: theme.ink,
    fontSize: '0.92rem',
    boxSizing: 'border-box',
    outline: invalid ? `2px solid ${theme.error}` : 'none',
    outlineOffset: invalid ? 1 : 0,
    boxShadow: invalid ? `0 0 0 4px ${theme.accentSoft}` : 'none'
  };
}

export function labelStyle(theme) {
  return {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 800,
    color: theme.muted,
    marginBottom: 6
  };
}
