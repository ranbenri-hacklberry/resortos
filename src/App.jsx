import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './i18n';
import HotelOSCalendar from './components/HotelOSCalendar';
import HotelOSOperations from './components/HotelOSOperations';
import FinancialSummary from './components/FinancialSummary';
import GuestCheckout from './components/GuestCheckout';
import Settings from './components/Settings';
import { Calendar as CalendarIcon, DollarSign, ShieldCheck, Activity, Zap } from 'lucide-react';
import './App.css';
import './index.css';

function App() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState(localStorage.getItem('hotelos-theme') || 'dark');
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'operations' | 'financials'
  
  // Extract ?token=... from URL search params for Guest Self-Service Checkout
  const [guestToken, setGuestToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  });

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('hotelos-theme', theme);
    const bg = theme === 'dark' ? '#0A0A0C' : '#F6F3EC';
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
  }, [theme]);

  const isLight = theme === 'light';
  const isCloudflarePublicDomain = window.location.hostname.includes('pages.dev');

  // 1. If guest token is present, render Guest Self-Service Checkout View
  if (guestToken) {
    return (
      <GuestCheckout
        token={guestToken}
        theme={theme}
        onComplete={() => {
          window.history.replaceState({}, '', window.location.pathname);
          setGuestToken('');
        }}
      />
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
            HotelOS | פורטל אורחים מאובטח
          </h2>
          <p style={{ fontSize: '0.9rem', color: isLight ? '#44403C' : '#94A3B8', lineHeight: 1.6, margin: 0 }}>
            עמוד זה מיועד להשלמת הזמנות עבור אורחי הצימר בלבד.<br />
            אנא לחץ על הקישור האישי שקיבלת ב-WhatsApp להשלמת אישור ההזמנה.
          </p>
        </div>
      </div>
    );
  }

  // 3. Private Owner Dashboard (Accessible on Mac Studio & Local)
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
              <span>HotelOS</span>
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

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Settings theme={theme} setTheme={setTheme} />
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
        </div>
      </header>

      <main className="main-stage" style={{ padding: '1rem' }}>
        {activeTab === 'calendar' ? (
          <HotelOSCalendar theme={theme} />
        ) : activeTab === 'operations' ? (
          <HotelOSOperations theme={theme} />
        ) : (
          <FinancialSummary theme={theme} />
        )}
      </main>
    </div>
  );
}

export default App;
