import React from 'react';
import { Moon, Sun } from '../lib/lucide-reviews.js';
import { useReviewTheme } from '../lib/reviewTheme.js';

export default function ReviewShell({ children, tight = false }) {
  const { theme, isLight, toggleTheme } = useReviewTheme();

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        background: theme.page,
        color: theme.ink,
        padding: tight
          ? 'max(0.85rem, env(safe-area-inset-top, 0px)) 0.85rem max(1.2rem, env(safe-area-inset-bottom, 0px))'
          : 'max(1.25rem, env(safe-area-inset-top, 0px)) 1rem max(2rem, env(safe-area-inset-bottom, 0px))',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: theme.card,
          border: `1px solid ${theme.line}`,
          borderRadius: 28,
          padding: tight ? '1.05rem 1rem 1.1rem' : '1.35rem 1.2rem 1.4rem',
          boxShadow: theme.shadow,
          position: 'relative'
        }}
      >
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isLight ? 'מעבר לערכת נושא כהה' : 'מעבר לערכת נושא קרמית'}
          style={{
            position: 'absolute',
            top: 18,
            left: 18,
            width: 40,
            height: 40,
            borderRadius: 12,
            border: `1px solid ${theme.line}`,
            background: theme.well,
            color: theme.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          {isLight ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        {typeof children === 'function' ? children({ theme, isLight }) : children}
      </div>
    </div>
  );
}
