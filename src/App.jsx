import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import Login from './components/Login';
import { fetchStaffMe, getStoredToken, logoutStaff, setStoredToken } from './lib/staffAuth';
import { fetchKinorotSyncStatus, formatKinorotSyncLabel, hasUnseenKinorotChanges, rememberKinorotChanges, startKinorotSync, unseenKinorotChanges } from './lib/kinorotSyncApi';
import { canSeeFinancials, isOpsLead, isOwnerManager, isReception } from './lib/staffRoles';
import { agentPortalUrl } from './lib/guestStayUrl';
import { resolveStayToken } from './lib/stayToken';
import { isFieldStaffMode } from './lib/fieldStaff';
import { Calendar as CalendarIcon, DollarSign, ShieldCheck, Activity, Zap, RefreshCw } from 'lucide-react';
import './App.css';
import './index.css';

const FieldStaffView = lazy(() => import('./components/FieldStaffView'));
const ResortOSCalendar = lazy(() => import('./components/ResortOSCalendar'));
const ResortOSOperations = lazy(() => import('./components/ResortOSOperations'));
const FinancialSummary = lazy(() => import('./components/FinancialSummary'));
const GuestCheckout = lazy(() => import('./components/GuestCheckout'));
const Settings = lazy(() => import('./components/Settings'));
const SharedTaskTracker = lazy(() => import('./components/SharedTaskTracker'));
const KinorotSyncChangesModal = lazy(() => import('./components/KinorotSyncChangesModal'));

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';

function App() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState(localStorage.getItem('hotelos-theme') || 'dark');
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'operations' | 'financials'
  const [authReady, setAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState(null);
  const [kinorotSync, setKinorotSync] = useState(null);
  const [kinorotBusy, setKinorotBusy] = useState(false);
  const [kinorotSeenTick, setKinorotSeenTick] = useState(0);

  // Extract ?token=... from URL search params for Guest Self-Service Checkout
  const [guestToken, setGuestToken] = useState(() => resolveStayToken());

  useEffect(() => {
    if (!sessionUser) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchKinorotSyncStatus();
        if (!cancelled) setKinorotSync(next);
      } catch {
        /* button still works on next click */
      }
    };
    load();
    const id = setInterval(load, kinorotSync?.running ? 4000 : 12000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionUser, kinorotSync?.running]);

  useEffect(() => {
    if (!kinorotSync?.lastOkAt) return;
    window.dispatchEvent(new CustomEvent('hotelos-kinorot-synced', { detail: kinorotSync.lastOkAt }));
  }, [kinorotSync?.lastOkAt]);

  const handleKinorotSync = async () => {
    if (kinorotBusy || kinorotSync?.running) return;
    setKinorotBusy(true);
    try {
      const next = await startKinorotSync();
      setKinorotSync(next);
    } catch (err) {
      setKinorotSync((prev) => ({ ...(prev || {}), lastError: err.message || 'נכשל' }));
    } finally {
      setKinorotBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getStoredToken();
      if (!token) {
        if (!cancelled) setAuthReady(true);
        return;
      }
      try {
        const user = await fetchStaffMe();
        if (!cancelled && user) setSessionUser(user);
        else if (!cancelled) setStoredToken('');
      } catch {
        if (!cancelled) {
          setStoredToken('');
          setSessionUser(null);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('hotelos-theme', theme);
    const bg = theme === 'dark' ? '#0A0A0C' : '#F6F3EC';
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
  }, [theme]);

  const isLight = theme === 'light';
  const isCloudflarePublicDomain = window.location.hostname.includes('pages.dev')
    || window.location.hostname.endsWith('.ts.net');

  const lazyFallback = (
    <div style={{
      minHeight: '40vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: isLight ? '#44403C' : '#94A3B8',
      fontWeight: 700
    }}>
      ResortOS
    </div>
  );

  if (isFieldStaffMode()) {
    if (!authReady) {
      return (
        <div style={{
          minHeight: '100vh',
          background: isLight ? '#F6F3EC' : '#0A0A0C',
          color: isLight ? '#44403C' : '#94A3B8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontWeight: 700
        }}>
          ResortOS
        </div>
      );
    }
    if (!sessionUser) {
      return (
        <Login
          theme={theme}
          setTheme={setTheme}
          mode="field"
          onLoggedIn={({ user }) => setSessionUser(user)}
        />
      );
    }
    return (
      <Suspense fallback={lazyFallback}>
        <FieldStaffView
          theme={theme}
          setTheme={setTheme}
          sessionUser={sessionUser}
          onLogout={async () => {
            await logoutStaff();
            setSessionUser(null);
          }}
        />
      </Suspense>
    );
  }

  // 1. If guest token is present, render Guest Self-Service Checkout View
  if (guestToken) {
    return (
      <Suspense fallback={lazyFallback}>
        <GuestCheckout
          token={guestToken}
          theme={theme}
          onComplete={() => {
            window.history.replaceState({}, '', window.location.pathname);
            setGuestToken('');
          }}
        />
      </Suspense>
    );
  }

  // 2. Security Boundary: If accessed on Cloudflare Public Domain without token, block owner panel
  if (isCloudflarePublicDomain) {
    return (
      <div style={{
        minHeight: '100vh',
        background: isLight ? '#F6F3EC' : '#0A0A0C',
        color: isLight ? '#1C1917' : '#F8FAFC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        dir: 'rtl',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          background: isLight ? '#FAF8F3' : '#141416',
          border: `1px solid ${isLight ? 'rgba(28, 25, 23, 0.08)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: '20px',
          padding: '2.5rem 2rem',
          maxWidth: '440px',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
        }}>
          <div style={{
            background: 'rgba(99, 102, 241, 0.15)',
            width: '60px',
            height: '60px',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.2rem auto'
          }}>
            <ShieldCheck size={32} color="#6366F1" />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: '#6366F1' }}>
            ResortOS | פורטל אורחים מאובטח
          </h2>
          <p style={{ fontSize: '0.9rem', color: isLight ? '#44403C' : '#94A3B8', lineHeight: 1.6, margin: 0 }}>
            עמוד זה מיועד להשלמת הזמנות עבור אורחי הצימר בלבד.<br />
            אנא לחץ על הקישור האישי שקיבלת ב-WhatsApp להשלמת אישור ההזמנה.
          </p>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div style={{
        minHeight: '100vh',
        background: isLight ? '#F6F3EC' : '#0A0A0C',
        color: isLight ? '#44403C' : '#94A3B8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: 700
      }}>
        ResortOS
      </div>
    );
  }

  if (!sessionUser) {
    return (
      <Login
        theme={theme}
        setTheme={setTheme}
        onLoggedIn={({ user }) => setSessionUser(user)}
      />
    );
  }

  if (isReception(sessionUser.role)) {
    return (
      <div style={{
        minHeight: '100vh',
        background: isLight ? '#F6F3EC' : '#0A0A0C',
        color: isLight ? '#1C1917' : '#F8FAFC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>שלום {sessionUser.display_name || sessionUser.username}</h1>
          <p style={{ lineHeight: 1.6, fontWeight: 600 }}>
            הפקידות עובדות מדף החיובים בטלפון, בלי Tailscale.
          </p>
          <a
            href="https://resortos.app/desk"
            style={{
              display: 'inline-block',
              marginTop: '1rem',
              background: '#26130F',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 800,
              padding: '0.85rem 1.2rem',
              borderRadius: 12
            }}
          >
            לפתוח דלפק חיובים
          </a>
        </div>
      </div>
    );
  }

  const isManager = isOwnerManager(sessionUser.role);
  const canViewFinancials = canSeeFinancials(sessionUser.role);
  const canViewErrands = isOwnerManager(sessionUser.role);
  const tenantId = sessionUser.tenant_id || DEMO_TENANT_ID;
  const visibleTab = (
    (!canViewFinancials && activeTab === 'financials')
    || (!canViewErrands && activeTab === 'errands')
  ) ? 'calendar' : activeTab;

  const handleLogout = async () => {
    await logoutStaff();
    setSessionUser(null);
    setActiveTab('calendar');
  };

  // 3. Private staff dashboard (Tailscale / LAN). Same hotel data for every account.
  return (
    <div className={`app-shell ${isLight ? 'light' : ''}`} dir={document.documentElement.getAttribute('dir') || 'rtl'}>
      <header className="enterprise-header" style={{
        background: isLight ? '#FAF8F3' : '#141416',
        borderBottom: `1px solid ${isLight ? 'rgba(28, 25, 23, 0.08)' : 'rgba(255, 255, 255, 0.08)'}`,
        padding: '0.75rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}>
        {/* TOP ROW: CLEAN LOGO & SETTINGS GEAR */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className="logo-group">
            <h1 style={{
              margin: 0,
              fontSize: '1.15rem',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: isLight ? '#1C1917' : '#F8FAFC'
            }}>
              <span>ResortOS</span>
              <span style={{
                fontSize: '0.55rem',
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#10B981',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: 500
              }}>V5.2</span>
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <button
              type="button"
              onClick={handleKinorotSync}
              disabled={kinorotBusy || Boolean(kinorotSync?.running)}
              title={kinorotSync?.lastError || formatKinorotSyncLabel(kinorotSync)}
              style={{
                border: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
                background: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)',
                color: isLight ? '#44403C' : '#E2E8F0',
                borderRadius: '999px',
                padding: '0.35rem 0.7rem',
                fontSize: '0.7rem',
                fontWeight: 800,
                cursor: kinorotBusy || kinorotSync?.running ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                opacity: kinorotBusy || kinorotSync?.running ? 0.7 : 1
              }}
            >
              <RefreshCw size={12} className={kinorotSync?.running ? 'animate-spin' : undefined} />
              {formatKinorotSyncLabel(kinorotSync)}
              {hasUnseenKinorotChanges(kinorotSync) ? (
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: '#F59E0B',
                  display: 'inline-block'
                }} />
              ) : null}
            </button>
            {isOpsLead(sessionUser.role) ? (
              <a
                href={agentPortalUrl()}
                target="_blank"
                rel="noreferrer"
                style={{
                  border: isLight ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(16, 185, 129, 0.28)',
                  background: isLight ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.12)',
                  color: isLight ? '#047857' : '#6EE7B7',
                  borderRadius: '999px',
                  padding: '0.35rem 0.7rem',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                {t('NAV_AGENT_PORTAL', 'הזמנת סוכן')}
              </a>
            ) : null}
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: isLight ? '#57534E' : '#94A3B8',
              maxWidth: '140px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {sessionUser.display_name || sessionUser.username}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                border: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
                background: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)',
                color: isLight ? '#57534E' : '#94A3B8',
                borderRadius: '999px',
                padding: '0.35rem 0.7rem',
                fontSize: '0.72rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              {t('BTN_LOGOUT', 'יציאה')}
            </button>
            <Suspense fallback={null}>
              <Settings
                theme={theme}
                setTheme={setTheme}
                sessionUser={sessionUser}
                onSessionUserUpdate={setSessionUser}
              />
            </Suspense>
          </div>
        </div>

        {/* BOTTOM ROW: NAVIGATION TABS (Strict Order: 1. Occupancy, 2. Operations, 3. Financials) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%' }}>
          <button
            onClick={() => setActiveTab('calendar')}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: '10px',
              padding: '0.5rem 0.2rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.25rem',
              whiteSpace: 'nowrap',
              background: activeTab === 'calendar' 
                ? 'linear-gradient(135deg, #6366F1, #4F46E5)' 
                : (isLight ? '#EAE5DD' : '#1E293B'),
              color: activeTab === 'calendar' 
                ? '#FFFFFF' 
                : (isLight ? '#44403C' : '#94A3B8'),
              boxShadow: activeTab === 'calendar' ? '0 4px 12px rgba(99, 102, 241, 0.35)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <span>📅</span>
            <span>{t('OCCUPANCY_TAB', 'תפוסה')}</span>
          </button>

          <button
            onClick={() => setActiveTab('operations')}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: '10px',
              padding: '0.5rem 0.2rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.25rem',
              whiteSpace: 'nowrap',
              background: activeTab === 'operations' 
                ? 'linear-gradient(135deg, #10B981, #059669)' 
                : (isLight ? '#EAE5DD' : '#1E293B'),
              color: activeTab === 'operations' 
                ? '#FFFFFF' 
                : (isLight ? '#44403C' : '#94A3B8'),
              boxShadow: activeTab === 'operations' ? '0 4px 12px rgba(16, 185, 129, 0.35)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <span>⚡</span>
            <span>{t('OPERATIONS_TAB', 'תפעול')}</span>
          </button>

          {canViewErrands && (
          <button
            onClick={() => setActiveTab('errands')}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: '10px',
              padding: '0.5rem 0.2rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.25rem',
              whiteSpace: 'nowrap',
              background: activeTab === 'errands' 
                ? 'linear-gradient(135deg, #3B82F6, #1D4ED8)' 
                : (isLight ? '#EAE5DD' : '#1E293B'),
              color: activeTab === 'errands' 
                ? '#FFFFFF' 
                : (isLight ? '#44403C' : '#94A3B8'),
              boxShadow: activeTab === 'errands' ? '0 4px 12px rgba(59, 130, 246, 0.35)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <span>🛒</span>
            <span>{t('ERRANDS_TAB', 'סידורים וקניות')}</span>
          </button>
          )}

          {canViewFinancials && (
          <button
            onClick={() => setActiveTab('financials')}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: '10px',
              padding: '0.5rem 0.2rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.25rem',
              whiteSpace: 'nowrap',
              background: activeTab === 'financials' 
                ? 'linear-gradient(135deg, #F59E0B, #D97706)' 
                : (isLight ? '#EAE5DD' : '#1E293B'),
              color: activeTab === 'financials' 
                ? '#FFFFFF' 
                : (isLight ? '#44403C' : '#94A3B8'),
              boxShadow: activeTab === 'financials' ? '0 4px 12px rgba(245, 158, 11, 0.35)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <span>💰</span>
            <span>{t('FINANCIALS_TAB', 'פיננסים')}</span>
          </button>
          )}
        </div>
      </header>

      <main
        className={`main-stage${visibleTab === 'calendar' ? ' calendar-stage' : ''}${visibleTab === 'operations' ? ' operations-stage' : ''}`}
        style={{ padding: visibleTab === 'calendar' ? '0.75rem' : (visibleTab === 'operations' ? '0.5rem 0' : '1rem') }}
      >
        <Suspense fallback={lazyFallback}>
          {visibleTab === 'calendar' ? (
            <ResortOSCalendar
              theme={theme}
              tenantId={tenantId}
              allowedUnitIds={sessionUser?.allowed_units}
              canSeePayments={canViewFinancials}
              sessionUser={sessionUser}
            />
          ) : visibleTab === 'operations' ? (
            <ResortOSOperations
              theme={theme}
              tenantId={tenantId}
              sessionRole={sessionUser.role}
              canSwitchRole={isOpsLead(sessionUser.role)}
              allowedUnitIds={sessionUser?.allowed_units}
            />
          ) : visibleTab === 'errands' ? (
            <SharedTaskTracker theme={theme} sessionUser={sessionUser} />
          ) : (
            <FinancialSummary theme={theme} tenantId={tenantId} />
          )}
        </Suspense>
      </main>
      {hasUnseenKinorotChanges(kinorotSync) ? (
        <Suspense fallback={null}>
          <KinorotSyncChangesModal
            theme={theme}
            changes={unseenKinorotChanges(kinorotSync.changes)}
            onClose={() => {
              rememberKinorotChanges(unseenKinorotChanges(kinorotSync.changes), kinorotSync.changeId);
              setKinorotSeenTick((n) => n + 1);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export default App;
