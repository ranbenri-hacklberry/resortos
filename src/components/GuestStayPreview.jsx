import React, { useEffect, useMemo, useState } from 'react';
import GuestChrome from './GuestChrome';
import GuestStay from './GuestStay';
import { applyGuestTheme, guestThemeStyles, persistGuestTheme, readGuestTheme } from '../lib/guestTheme';
import { GUEST_DEMO_PHASES, demoGuestBooking, normalizeDemoPhase } from '../lib/guestDemoStay';
import { startDemoCheckout } from '../lib/guestCheckoutApi';
import { unitFullName } from '../lib/units';

function readPhase() {
  if (typeof window === 'undefined') return 'pre';
  return normalizeDemoPhase(new URLSearchParams(window.location.search).get('phase'));
}

function writePhase(phase) {
  const url = new URL(window.location.href);
  url.searchParams.set('phase', phase);
  window.history.replaceState({}, '', url);
}

export default function GuestStayPreview({ theme: themeProp = 'light' }) {
  const [theme, setTheme] = useState(() => readGuestTheme(themeProp));
  const [phase, setPhase] = useState(readPhase);
  const [liveBooking, setLiveBooking] = useState(null);
  const localBooking = useMemo(() => demoGuestBooking(phase), [phase]);
  const booking = phase === 'pre' && liveBooking ? liveBooking : localBooking;

  useEffect(() => {
    let stop = false;
    startDemoCheckout('stay')
      .then((row) => {
        if (stop || !row?.checkout_token) return;
        setLiveBooking(row);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    applyGuestTheme(theme);
    persistGuestTheme(theme);
    document.title = 'השהייה שלי';
  }, [theme]);

  const themeStyles = guestThemeStyles(theme);
  const embed = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('embed');

  function choose(next) {
    const clean = normalizeDemoPhase(next);
    setPhase(clean);
    writePhase(clean);
  }

  return (
    <div
      style={{
        background: themeStyles.wrapperBg,
        minHeight: '100dvh',
        padding: '1.25rem 1rem 2rem',
        display: 'flex',
        justifyContent: 'center',
        fontFamily: themeStyles.font,
        color: themeStyles.textPrimary
      }}
    >
      <div style={{ width: '100%', maxWidth: embed ? 390 : 560 }}>
        {embed ? null : (
          <>
            <GuestChrome theme={theme} onThemeChange={setTheme} themeStyles={themeStyles} />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 6,
                marginBottom: '1rem',
                background: themeStyles.inputBg,
                border: `1px solid ${themeStyles.inputBorder}`,
                borderRadius: 16,
                padding: 5
              }}
            >
              {GUEST_DEMO_PHASES.map((row) => {
                const active = phase === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => choose(row.id)}
                    style={{
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: 12,
                      padding: '0.65rem 0.3rem',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      background: active ? themeStyles.accent : 'transparent',
                      color: active ? themeStyles.ctaText : themeStyles.textMuted
                    }}
                  >
                    {row.label}
                  </button>
                );
              })}
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: themeStyles.textMuted,
                marginBottom: '0.85rem',
                textAlign: 'center'
              }}
            >
              דמו חיוב · שהייה ₪5 · מקדמה ₪1 · יתרה בצ׳ק-אין ₪4
              {' · '}
              <a href="/checkout/demo" style={{ color: 'inherit', fontWeight: 800 }}>
                טופס מקדמה
              </a>
            </div>
          </>
        )}
        <GuestStay
          key={`${phase}-${booking.checkout_token || booking.id}`}
          booking={booking}
          unitName={unitFullName(booking.unit_id, 'בתי נורית 1')}
          themeStyles={themeStyles}
        />
      </div>
    </div>
  );
}
