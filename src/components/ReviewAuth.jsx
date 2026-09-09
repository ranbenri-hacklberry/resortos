import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from '../lib/lucide-reviews.js';
import {
  AUTH_ERRORS,
  fetchReviewConfig,
  loginReviewGoogle,
  loginReviewUser,
  registerReviewUser
} from '../lib/reviewAuth.js';
import { APP_NAME, APP_TAGLINE } from '../lib/reviewBrand.js';
import { TERMS_BODY, TERMS_SUMMARY, TERMS_TITLE, TERMS_VERSION } from '../lib/reviewTerms.js';
import { fieldStyle, labelStyle } from '../lib/reviewTheme.js';
import { normalizeOwnerPhone } from '../lib/reviewDispatch.js';
import { readLead } from '../lib/reviewLead.js';
import ReviewShell from './ReviewShell.jsx';

function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gis="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.gis = '1';
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function hintStyle(theme) {
  return {
    color: theme.error,
    fontSize: '0.75rem',
    fontWeight: 700,
    margin: '-4px 0 12px'
  };
}

export default function ReviewAuth({ onAuth, initialMode = 'register' }) {
  const lead = readLead();
  const [mode, setMode] = useState(initialMode === 'login' ? 'login' : 'register');
  const [step, setStep] = useState('form');
  const [name, setName] = useState(lead.name || '');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(lead.phone || '');
  const [accepted, setAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState({});
  const [busy, setBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleEmail, setGoogleEmail] = useState('');
  const googleBtn = useRef(null);
  const credentialRef = useRef('');
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  const googleStep = step === 'google';
  const registerMode = mode === 'register' || googleStep;

  useEffect(() => {
    fetchReviewConfig()
      .then((config) => setGoogleClientId(config.googleClientId || ''))
      .catch(() => setGoogleClientId(''));
  }, []);

  useEffect(() => {
    if (!googleClientId || googleStep || !googleBtn.current) return undefined;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !googleBtn.current) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async ({ credential }) => {
            setError('');
            setBusy(true);
            try {
              const result = await loginReviewGoogle(credential);
              if (result?.needsProfile) {
                credentialRef.current = credential;
                setGoogleEmail(result.email || '');
                if (result.suggestedName) setName(result.suggestedName);
                setPassword('');
                setMissing({});
                setStep('google');
                return;
              }
              onAuthRef.current(result);
            } catch (err) {
              setError(AUTH_ERRORS[err.message] || AUTH_ERRORS.GOOGLE_FAILED);
            } finally {
              setBusy(false);
            }
          }
        });
        googleBtn.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtn.current, {
          theme: 'outline',
          size: 'large',
          width: 360,
          text: mode === 'login' ? 'signin_with' : 'signup_with',
          locale: 'he',
          shape: 'pill'
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [googleClientId, mode, googleStep]);

  function markMissing(fields, message) {
    setMissing(fields);
    setError(message || 'יש להשלים את השדות המסומנים.');
  }

  function clearField(key) {
    setMissing((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (googleStep) {
      const fields = {};
      if (name.trim().length < 2 || name.trim().length > 60) fields.name = 'נא למלא שם משתמש (2–60 תווים).';
      if (!normalizeOwnerPhone(phone)) fields.phone = 'נא למלא טלפון נייד תקין.';
      if (!accepted) fields.terms = 'יש לאשר את הסכם השימוש.';
      if (Object.keys(fields).length) {
        markMissing(fields);
        return;
      }
      setBusy(true);
      try {
        const result = await loginReviewGoogle(credentialRef.current, {
          name: name.trim(),
          phone,
          acceptedTerms: true,
          termsVersion: TERMS_VERSION
        });
        if (result?.needsProfile) {
          markMissing({
            ...(result.missing?.name ? { name: 'נא למלא שם משתמש.' } : {}),
            ...(result.missing?.phone ? { phone: 'נא למלא טלפון נייד תקין.' } : {}),
            ...(result.missing?.terms ? { terms: 'יש לאשר את הסכם השימוש.' } : {})
          });
          return;
        }
        onAuth(result);
      } catch (err) {
        if (err.message === 'NAME_TAKEN') markMissing({ name: AUTH_ERRORS.NAME_TAKEN }, AUTH_ERRORS.NAME_TAKEN);
        else setError(AUTH_ERRORS[err.message] || AUTH_ERRORS.GOOGLE_FAILED);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'login') {
      const fields = {};
      if (!name.trim()) fields.name = 'נא למלא שם משתמש.';
      if (!password) fields.password = 'נא למלא סיסמה.';
      if (Object.keys(fields).length) {
        markMissing(fields);
        return;
      }
      setBusy(true);
      try {
        onAuth(await loginReviewUser(name, password));
      } catch (err) {
        markMissing(
          { name: AUTH_ERRORS.LOGIN_FAILED, password: AUTH_ERRORS.LOGIN_FAILED },
          AUTH_ERRORS[err.message] || AUTH_ERRORS.LOGIN_FAILED
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    const fields = {};
    if (name.trim().length < 2 || name.trim().length > 60) fields.name = 'נא למלא שם משתמש (2–60 תווים).';
    if (password.length < 6) fields.password = 'הסיסמה חייבת להכיל לפחות 6 תווים.';
    if (!normalizeOwnerPhone(phone)) fields.phone = 'נא למלא טלפון נייד תקין.';
    if (!accepted) fields.terms = 'יש לאשר את הסכם השימוש.';
    if (Object.keys(fields).length) {
      markMissing(fields);
      return;
    }
    setBusy(true);
    try {
      onAuth(await registerReviewUser(name, password, phone, {
        acceptedTerms: true,
        termsVersion: TERMS_VERSION
      }));
    } catch (err) {
      const map = {
        NAME_INVALID: { name: AUTH_ERRORS.NAME_INVALID },
        NAME_TAKEN: { name: AUTH_ERRORS.NAME_TAKEN },
        PASSWORD_SHORT: { password: AUTH_ERRORS.PASSWORD_SHORT },
        PHONE_INVALID: { phone: AUTH_ERRORS.PHONE_INVALID },
        TERMS_REQUIRED: { terms: AUTH_ERRORS.TERMS_REQUIRED }
      };
      if (map[err.message]) markMissing(map[err.message], AUTH_ERRORS[err.message]);
      else setError(AUTH_ERRORS[err.message] || 'לא הצלחנו להתחבר. נסו שוב.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ReviewShell>
      {({ theme, isLight }) => (
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 18,
                margin: '0 auto 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: theme.accentSoft,
                color: theme.accent
              }}
            >
              <Sparkles size={22} />
            </div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>
              {APP_NAME}
            </h1>
            <p style={{ margin: '6px 0 0', color: theme.muted, fontSize: '0.85rem', lineHeight: 1.5 }}>
              {googleStep
                ? 'חשבון Google מחובר — השלימו את הפרטים'
                : `${mode === 'register' ? 'הרשמה חינם' : 'כניסה'} · ${APP_TAGLINE}`}
            </p>
          </div>

          {googleStep ? (
            <div
              style={{
                background: theme.well,
                border: `1px solid ${theme.line}`,
                borderRadius: 14,
                padding: '0.7rem 0.85rem',
                marginBottom: 16,
                fontSize: '0.82rem',
                fontWeight: 700,
                color: theme.chipInk
              }}
            >
              מחובר עם Google{googleEmail ? `: ${googleEmail}` : ''}
              <button
                type="button"
                onClick={() => {
                  credentialRef.current = '';
                  setStep('form');
                  setGoogleEmail('');
                  setMissing({});
                  setError('');
                }}
                style={{
                  display: 'block',
                  marginTop: 6,
                  border: 'none',
                  background: 'none',
                  color: theme.accent,
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                בחירת חשבון אחר
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                ['register', 'הרשמה'],
                ['login', 'כניסה']
              ].map(([id, label]) => {
                const on = mode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setMode(id);
                      setError('');
                      setMissing({});
                    }}
                    style={{
                      border: on ? 'none' : `1px solid ${theme.line}`,
                      background: on ? theme.accent : theme.chip,
                      color: on ? (isLight ? '#FFF7ED' : '#1C1917') : theme.chipInk,
                      borderRadius: 12,
                      padding: '0.55rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {googleStep ? null : (
            <>
              <div
                ref={googleBtn}
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  minHeight: 44,
                  marginBottom: 4,
                  opacity: busy ? 0.6 : 1,
                  pointerEvents: busy ? 'none' : 'auto'
                }}
              />
              <div style={{ textAlign: 'center', margin: '12px 0 14px', color: theme.muted, fontSize: '0.75rem', fontWeight: 800 }}>
                או עם שם וסיסמה
              </div>
            </>
          )}

          <label style={labelStyle(theme)}>שם משתמש</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearField('name');
            }}
            placeholder="שם העסק או שם פרטי"
            autoComplete="username"
            style={{ ...fieldStyle(theme, Boolean(missing.name)), marginBottom: missing.name ? 6 : 12 }}
          />
          {missing.name ? <div style={hintStyle(theme)}>{missing.name}</div> : null}

          {googleStep ? null : (
            <>
              <label style={labelStyle(theme)}>סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearField('password');
                }}
                placeholder={mode === 'register' ? 'לפחות 6 תווים' : 'הסיסמה שלכם'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                style={{ ...fieldStyle(theme, Boolean(missing.password)), marginBottom: missing.password ? 6 : 12 }}
              />
              {missing.password ? <div style={hintStyle(theme)}>{missing.password}</div> : null}
            </>
          )}

          {registerMode ? (
            <>
              <label style={labelStyle(theme)}>טלפון נייד</label>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  clearField('phone');
                }}
                placeholder="050-0000000"
                autoComplete="tel"
                style={{ ...fieldStyle(theme, Boolean(missing.phone)), marginBottom: missing.phone ? 6 : 12 }}
              />
              {missing.phone ? <div style={hintStyle(theme)}>{missing.phone}</div> : null}

              <label
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  marginBottom: missing.terms ? 6 : 10,
                  padding: missing.terms ? '0.7rem 0.75rem' : 0,
                  border: missing.terms ? `2px solid ${theme.error}` : 'none',
                  borderRadius: 12,
                  background: missing.terms ? theme.accentSoft : 'transparent',
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  color: missing.terms ? theme.error : theme.chipInk,
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => {
                    setAccepted(e.target.checked);
                    clearField('terms');
                  }}
                  style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
                />
                <span>
                  {TERMS_SUMMARY}{' '}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowTerms((open) => !open);
                    }}
                    style={{ border: 'none', background: 'none', color: theme.accent, fontWeight: 800, cursor: 'pointer', padding: 0 }}
                  >
                    {showTerms ? 'הסתרת ההסכם' : 'קריאת ההסכם המלא'}
                  </button>
                </span>
              </label>
              {missing.terms ? <div style={hintStyle(theme)}>{missing.terms}</div> : null}

              {showTerms ? (
                <div
                  style={{
                    background: theme.well,
                    border: `1px solid ${theme.line}`,
                    borderRadius: 14,
                    padding: '0.85rem 0.9rem',
                    marginBottom: 14,
                    maxHeight: 220,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.75rem',
                    lineHeight: 1.55,
                    color: theme.chipInk
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 8, color: theme.ink }}>{TERMS_TITLE}</div>
                  {TERMS_BODY}
                </div>
              ) : null}
            </>
          ) : null}

          {error ? (
            <div style={{ color: theme.error, fontSize: '0.8rem', fontWeight: 700, marginBottom: 12 }}>{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 16,
              padding: '0.9rem',
              background: theme.accent,
              color: isLight ? '#FFF7ED' : '#1C1917',
              fontWeight: 900,
              fontSize: '1rem',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.7 : 1
            }}
          >
            {googleStep ? 'סיום הרשמה' : mode === 'register' ? 'יצירת חשבון' : 'כניסה'}
          </button>

          <a
            href="#/privacy"
            style={{
              display: 'block',
              marginTop: 12,
              textAlign: 'center',
              color: theme.muted,
              fontSize: '0.75rem',
              fontWeight: 700,
              textDecoration: 'none'
            }}
          >
            מדיניות פרטיות
          </a>
          <a
            href="#/"
            style={{
              display: 'block',
              marginTop: 8,
              textAlign: 'center',
              color: theme.muted,
              fontSize: '0.75rem',
              fontWeight: 700,
              textDecoration: 'none'
            }}
          >
            חזרה לדף הבית
          </a>
        </form>
      )}
    </ReviewShell>
  );
}
