import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { persistLanguage } from '../i18n';
import { loginStaff } from '../lib/staffAuth';

const LANGUAGES = [
  { code: 'he', name: 'עברית', flag: '🇮🇱' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭' }
];

export default function Login({ theme, setTheme, onLoggedIn, mode = 'admin' }) {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isLight = theme === 'light';
  const currentLang = (i18n.language || 'he').split('-')[0];
  const isRTL = currentLang === 'he' || currentLang === 'ar';

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    persistLanguage(lng);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await loginStaff(username, password);
      onLoggedIn(result);
    } catch (err) {
      const code = err.body?.error || err.message;
      if (code === 'RATE_LIMIT') setError(t('LOGIN_RATE_LIMIT', 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.'));
      else setError(t('LOGIN_ERROR', 'שם משתמש או סיסמה שגויים'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
      minHeight: '100vh',
      background: isLight ? '#F6F3EC' : '#0A0A0C',
      color: isLight ? '#1C1917' : '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflowY: 'auto',
      padding: '1.5rem',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: isLight ? '#FAF8F3' : '#141416',
          border: `1px solid ${isLight ? 'rgba(28, 25, 23, 0.08)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: '20px',
          padding: '2.25rem 1.75rem',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
        }}
      >
        <div style={{
          background: 'rgba(99, 102, 241, 0.15)',
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.1rem auto'
        }}>
          <ShieldCheck size={28} color="#6366F1" />
        </div>
        <h1 style={{
          fontSize: '1.35rem',
          fontWeight: 800,
          margin: '0 0 1.4rem 0',
          textAlign: 'center',
          color: '#6366F1'
        }}>
          {mode === 'field' ? t('FIELD_TITLE') : 'ResortOS'}
        </h1>
        {mode === 'field' ? (
          <p style={{
            textAlign: 'center',
            color: isLight ? '#57534E' : '#94A3B8',
            fontSize: '0.86rem',
            fontWeight: 700,
            margin: '-0.6rem 0 1.2rem'
          }}>
            {t('FIELD_LOGIN_HINT')}
          </p>
        ) : null}

        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px' }}>
          {t('SETTINGS_SELECT_LANG', 'בחר שפה:')}
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '1rem' }}>
          {LANGUAGES.map((lang) => {
            const isActive = currentLang === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => changeLanguage(lang.code)}
                style={{
                  background: isActive
                    ? 'rgba(99, 102, 241, 0.12)'
                    : (isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)'),
                  border: isActive
                    ? '2px solid #6366f1'
                    : (isLight ? '2px solid rgba(0,0,0,0.08)' : '2px solid rgba(255,255,255,0.08)'),
                  borderRadius: '10px',
                  padding: '10px 4px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  color: isLight ? '#1C1917' : '#F8FAFC'
                }}
              >
                <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{lang.flag}</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700 }}>{lang.name}</div>
              </button>
            );
          })}
        </div>

        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px' }}>
          {t('SETTINGS_SELECT_THEME', 'ערכת נושא:')}
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '1.25rem' }}>
          {[
            { id: 'dark', icon: '🌙', label: t('THEME_DARK', 'כהה') },
            { id: 'light', icon: '☀️', label: t('THEME_LIGHT', 'קרם בהיר') }
          ].map((opt) => {
            const isActive = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                style={{
                  background: isActive
                    ? 'rgba(99, 102, 241, 0.12)'
                    : (isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)'),
                  border: isActive
                    ? '2px solid #6366f1'
                    : (isLight ? '2px solid rgba(0,0,0,0.08)' : '2px solid rgba(255,255,255,0.08)'),
                  borderRadius: '10px',
                  padding: '12px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  color: isLight ? '#1C1917' : '#F8FAFC'
                }}
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px' }}>
          {t('LOGIN_USERNAME', 'שם משתמש')}
        </label>
        <input
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle(isLight)}
        />

        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, margin: '0.85rem 0 6px' }}>
          {t('LOGIN_PASSWORD', 'סיסמה')}
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              ...inputStyle(isLight),
              paddingInlineEnd: '2.75rem'
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((open) => !open)}
            aria-label={showPassword ? t('LOGIN_HIDE_PASSWORD') : t('LOGIN_SHOW_PASSWORD')}
            aria-pressed={showPassword}
            style={{
              position: 'absolute',
              insetInlineEnd: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 36,
              height: 36,
              border: 'none',
              background: 'transparent',
              color: isLight ? '#57534E' : '#94A3B8',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              padding: 0
            }}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {error ? (
          <p style={{ color: '#F87171', fontSize: '0.82rem', fontWeight: 700, margin: '0.85rem 0 0' }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          style={{
            width: '100%',
            marginTop: '1.25rem',
            background: busy ? '#818CF8' : '#6366F1',
            color: 'white',
            border: 'none',
            padding: '12px',
            borderRadius: '10px',
            fontWeight: 800,
            cursor: busy ? 'wait' : 'pointer',
            fontSize: '0.95rem',
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
          }}
        >
          {busy ? t('LOGIN_LOADING', 'מתחבר…') : t('LOGIN_SUBMIT', 'כניסה')}
        </button>
      </form>
    </div>
  );
}

function inputStyle(isLight) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.7rem 0.85rem',
    borderRadius: '10px',
    background: isLight ? '#FFFFFF' : '#111827',
    border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
    color: isLight ? '#1C1917' : '#F8FAFC',
    fontSize: '0.92rem',
    fontWeight: 600
  };
}
