import React, { useState, useEffect, Suspense, lazy } from 'react';
import { 
  ShieldCheck, Phone, KeyRound, LogOut, Sparkles, Building2, TrendingUp, 
  AlertTriangle, RefreshCw, Zap, Settings as Gear, Users, Sun, Moon, 
  ChevronDown, Check, Globe, MapPin, ClipboardList, CheckSquare, X, SlidersHorizontal
} from 'lucide-react';
import FinancialCommandCenter from '../finance/FinancialCommandCenter';
import ResortOSOperations from '../ResortOSOperations';
import ChloeDashboardChat from '../chloe/ChloeDashboardChat';
import Settings from '../Settings';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const DASHBOARD_TOKEN_KEY = 'resortos_dashboard_token_v1';
const DASHBOARD_USER_KEY = 'resortos_dashboard_user_v1';

const DEFAULT_DEV_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  username: 'max',
  display_name: 'מקס (רני)',
  role: 'MANAGER',
  phone: '0506102416',
  tenant_id: DEMO_TENANT_ID
};

const PRESET_STAFF_SWITCH = [
  { id: '00000000-0000-0000-0000-000000000001', username: 'max', display_name: 'מקס (רני)', role: 'MANAGER', phone: '0506102416', tenant_id: DEMO_TENANT_ID },
  { id: '00000000-0000-0000-0000-000000000002', username: 'adam', display_name: 'אדם', role: 'MANAGER', phone: '0543387383', tenant_id: DEMO_TENANT_ID },
  { id: '00000000-0000-0000-0000-000000000003', username: 'daniel', display_name: 'דניאל', role: 'MANAGER', phone: '0501234567', tenant_id: DEMO_TENANT_ID },
  { id: '00000000-0000-0000-0000-000000000004', username: 'barak', display_name: 'ברק', role: 'MANAGER', phone: '0503934696', tenant_id: DEMO_TENANT_ID },
  { id: '00000000-0000-0000-0000-000000000005', username: 'ops', display_name: 'צוות תפעול (אבו/טופ)', role: 'OPERATIONS', phone: '0540000000', tenant_id: DEMO_TENANT_ID }
];

const isLocalHost = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.endsWith('.local')
);

export default function DashboardApp() {
  const [token, setToken] = useState(() => {
    if (isLocalHost) return 'dev-local-token';
    try {
      const saved = localStorage.getItem(DASHBOARD_TOKEN_KEY);
      if (saved) return saved;
      return '';
    } catch {
      return '';
    }
  });

  const [user, setUser] = useState(() => {
    if (isLocalHost) return DEFAULT_DEV_USER;
    try {
      const saved = localStorage.getItem(DASHBOARD_USER_KEY);
      if (saved) return JSON.parse(saved);
      return null;
    } catch {
      return null;
    }
  });

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('hotelos-theme') || 'light';
    } catch {
      return 'light';
    }
  });

  const handleSetTheme = (newTheme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem('hotelos-theme', newTheme);
    } catch {}
  };

  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('display');

  const openSettingsTab = (tabName) => {
    setSettingsInitialTab(tabName);
    setShowSettingsModal(true);
    setShowOptionsMenu(false);
  };

  const handleSwitchUser = (targetStaff) => {
    setUser(targetStaff);
    setToken('dev-local-token');
    try {
      localStorage.setItem(DASHBOARD_TOKEN_KEY, 'dev-local-token');
      localStorage.setItem(DASHBOARD_USER_KEY, JSON.stringify(targetStaff));
    } catch {}
    setShowOptionsMenu(false);
    if (targetStaff.role === 'FINANCE') {
      setActiveTab('financials');
    }
  };

  const [activeTab, setActiveTab] = useState(() => {
    const role = user?.role;
    if (role === 'FINANCE') return 'financials';
    return 'operations';
  });

  // Auth form states
  const [authMode, setAuthMode] = useState('otp'); // 'otp' | 'password'
  const [phone, setPhone] = useState('0506102416'); // default owner mobile
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Password fallback states (prefilled with max/123456 for convenience)
  const [username, setUsername] = useState('max');
  const [password, setPassword] = useState('123456');

  // Verify stored session on boot
  useEffect(() => {
    if (!token) return;
    if (isLocalHost && token.startsWith('dev-')) {
      return;
    }
    fetch('/api/dashboard/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        try {
          return await res.json();
        } catch {
          return { ok: res.ok };
        }
      })
      .then((data) => {
        if (!data?.ok || !data?.user) {
          handleLogout();
        } else {
          setUser(data.user);
          try {
            localStorage.setItem(DASHBOARD_USER_KEY, JSON.stringify(data.user));
          } catch {}
          if (data.user.role === 'FINANCE') {
            setActiveTab('financials');
          }
        }
      })
      .catch(() => {
        // If offline or network error, retain existing user state
      });
  }, [token]);

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    if (isLocalHost) {
      setToken('dev-local-token');
      setUser(DEFAULT_DEV_USER);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/dashboard/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, username: authMode === 'otp' ? undefined : username })
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = { ok: res.ok };
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.message || data.error || 'שגיאה בשליחת קוד אימות');
      }
      setChallenge(data.challenge || '');
      setOtpSent(true);
      setOtpMessage(data.message || 'קוד אימות נשלח בהצלחה.');
      setOtp('');
    } catch (err) {
      setError(err.message || 'שגיאה בשליחת קוד האימות');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    if (isLocalHost) {
      setToken('dev-local-token');
      setUser(DEFAULT_DEV_USER);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/dashboard/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, challenge })
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = { ok: res.ok };
      }
      if (!res.ok || !data.ok || !data.token) {
        throw new Error(data.message || data.error || 'קוד אימות שגוי');
      }
      setToken(data.token);
      setUser(data.user);
      try {
        localStorage.setItem(DASHBOARD_TOKEN_KEY, data.token);
        localStorage.setItem(DASHBOARD_USER_KEY, JSON.stringify(data.user));
      } catch {}
      if (data.user.role === 'FINANCE') {
        setActiveTab('financials');
      } else {
        setActiveTab('operations');
      }
    } catch (err) {
      setError(err.message || 'שגיאה באימות הקוד');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    if (isLocalHost) {
      setToken('dev-local-token');
      setUser(DEFAULT_DEV_USER);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/dashboard/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = { ok: res.ok };
      }
      if (!res.ok || !data.ok || !data.token) {
        throw new Error(data.message || data.error || 'פרטי התחברות שגויים');
      }
      setToken(data.token);
      setUser(data.user);
      try {
        localStorage.setItem(DASHBOARD_TOKEN_KEY, data.token);
        localStorage.setItem(DASHBOARD_USER_KEY, JSON.stringify(data.user));
      } catch {}
      if (data.user.role === 'FINANCE') {
        setActiveTab('financials');
      } else {
        setActiveTab('operations');
      }
    } catch (err) {
      setError(err.message || 'שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setOtpSent(false);
    setOtp('');
    setChallenge('');
    try {
      localStorage.removeItem(DASHBOARD_TOKEN_KEY);
      localStorage.removeItem(DASHBOARD_USER_KEY);
    } catch {}
  };

  const handleDevBypass = () => {
    setToken('dev-local-token');
    setUser(DEFAULT_DEV_USER);
    try {
      localStorage.setItem(DASHBOARD_TOKEN_KEY, 'dev-local-token');
      localStorage.setItem(DASHBOARD_USER_KEY, JSON.stringify(DEFAULT_DEV_USER));
    } catch (_) {}
  };

  // If NOT logged in, show luxury OTP auth modal
  if (!token || !user) {
    return (
      <div 
        dir="rtl" 
        style={{
          minHeight: '100dvh',
          background: 'linear-gradient(135deg, #1C0F0C 0%, #26130F 50%, #150907 100%)',
          color: '#FDFBF7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.25rem',
          fontFamily: 'Heebo, Assistant, system-ui, sans-serif'
        }}
      >
        <div 
          style={{
            width: '100%',
            maxWidth: '430px',
            background: 'rgba(38, 19, 15, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(197, 160, 89, 0.35)',
            borderRadius: '6px',
            padding: '2rem 1.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)'
          }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div 
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '4px',
                background: 'linear-gradient(135deg, #C5A059, #8C6B28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
                boxShadow: '0 8px 24px rgba(197, 160, 89, 0.4)'
              }}
            >
              <ShieldCheck size={30} color="#FFFFFF" />
            </div>
            <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.45rem', fontWeight: 900, color: '#FDFBF7' }}>
              ResortOS Dashboard
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#C5A059', fontWeight: 600 }}>
              שער כניסה מאובטח — תפעול וחמ״ל פיננסי
            </p>
          </div>

          {/* Localhost Direct Dev Bypass Button */}
          {isLocalHost && (
            <div style={{ marginBottom: '1.4rem' }}>
              <button
                type="button"
                onClick={handleDevBypass}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.15))',
                  border: '1.5px solid #10B981',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                  color: '#34D399',
                  fontSize: '0.9rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)'
                }}
              >
                <span>⚡</span>
                <span>כניסה ישירה כמנהל (מצב פיתוח - ללא SMS)</span>
              </button>
            </div>
          )}

          {error && (
            <div 
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#FCA5A5',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                fontSize: '0.82rem',
                fontWeight: 600,
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Form: OTP Channel */}
          {authMode === 'otp' ? (
            <div>
              {!otpSent ? (
                <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#D4C5B9', fontWeight: 700, marginBottom: '0.4rem' }}>
                      מספר טלפון מורשה (לוואטסאפ / SMS)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="tel"
                        dir="ltr"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="050-6102416 / 054-8317887"
                        style={{
                          width: '100%',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(197, 160, 89, 0.4)',
                          borderRadius: '14px',
                          padding: '0.85rem 1rem',
                          color: '#FFFFFF',
                          fontSize: '1rem',
                          fontWeight: 700,
                          textAlign: 'left',
                          boxSizing: 'border-box',
                          outline: 'none'
                        }}
                      />
                    </div>
                    <div style={{ marginTop: '0.45rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setPhone('0506102416')}
                        style={{ background: 'rgba(197, 160, 89, 0.2)', border: '1px solid rgba(197, 160, 89, 0.4)', color: '#F1D699', borderRadius: '8px', padding: '0.2rem 0.55rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}
                      >
                        מקס (נייד 050-6102416)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhone('0548317887')}
                        style={{ background: 'rgba(197, 160, 89, 0.2)', border: '1px solid rgba(197, 160, 89, 0.4)', color: '#F1D699', borderRadius: '8px', padding: '0.2rem 0.55rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}
                      >
                        מקס (ווטסאפ 054-8317887)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhone('0543387383')}
                        style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#D4C5B9', borderRadius: '8px', padding: '0.2rem 0.55rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}
                      >
                        אדם (054-3387383)
                      </button>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#9E897C', display: 'block', marginTop: '0.35rem' }}>
                      מקס (נייד: 050-6102416 / ווטסאפ: 054-8317887), אדם (054-3387383) או מנהלי מתחם מורשים
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      marginTop: '0.5rem',
                      background: 'linear-gradient(135deg, #C5A059, #99742B)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '14px',
                      padding: '0.9rem',
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      cursor: loading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 6px 16px rgba(197, 160, 89, 0.35)'
                    }}
                  >
                    {loading ? <RefreshCw size={18} className="animate-spin" /> : <Sparkles size={18} />}
                    <span>{loading ? 'שולח קוד אימות...' : 'שלח קוד אימות OTP'}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ background: 'rgba(197, 160, 89, 0.1)', border: '1px solid rgba(197, 160, 89, 0.3)', borderRadius: '12px', padding: '0.75rem', fontSize: '0.8rem', color: '#F1D699' }}>
                    {otpMessage}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#D4C5B9', fontWeight: 700, marginBottom: '0.4rem' }}>
                      הזן קוד אימות בן 6 ספרות
                    </label>
                    <input 
                      type="text"
                      dir="ltr"
                      maxLength={6}
                      autoFocus
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      style={{
                        width: '100%',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '2px solid #C5A059',
                        borderRadius: '14px',
                        padding: '0.85rem',
                        color: '#FFFFFF',
                        fontSize: '1.4rem',
                        fontWeight: 900,
                        letterSpacing: '0.35em',
                        textAlign: 'center',
                        boxSizing: 'border-box',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.length < 6}
                    style={{
                      background: 'linear-gradient(135deg, #10B981, #059669)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '14px',
                      padding: '0.9rem',
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      cursor: loading || otp.length < 6 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      opacity: otp.length < 6 ? 0.6 : 1,
                      boxShadow: '0 6px 16px rgba(16, 185, 129, 0.35)'
                    }}
                  >
                    {loading ? <RefreshCw size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                    <span>{loading ? 'מאמת...' : 'אמת והיכנס לדשבורד'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#A89487',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    החלף מספר טלפון
                  </button>
                </form>
              )}

              <div style={{ marginTop: '1.5rem', textAlign: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => { setAuthMode('password'); setError(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#C5A059',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  מעבר לכניסה באמצעות שם משתמש וסיסמה / PIN
                </button>
              </div>
            </div>
          ) : (
            /* Form: Password Fallback */
            <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#D4C5B9', fontWeight: 700, marginBottom: '0.4rem' }}>
                  שם משתמש
                </label>
                <input 
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="adam / daniel / max"
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(197, 160, 89, 0.4)',
                    borderRadius: '14px',
                    padding: '0.85rem 1rem',
                    color: '#FFFFFF',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#D4C5B9', fontWeight: 700, marginBottom: '0.4rem' }}>
                  סיסמה / קוד PIN
                </label>
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(197, 160, 89, 0.4)',
                    borderRadius: '14px',
                    padding: '0.85rem 1rem',
                    color: '#FFFFFF',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: '0.5rem',
                  background: 'linear-gradient(135deg, #C5A059, #99742B)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '14px',
                  padding: '0.9rem',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  cursor: loading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 6px 16px rgba(197, 160, 89, 0.35)'
                }}
              >
                {loading ? <RefreshCw size={18} className="animate-spin" /> : <KeyRound size={18} />}
                <span>{loading ? 'מתחבר...' : 'התחבר לדשבורד'}</span>
              </button>

              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => { setAuthMode('otp'); setError(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#C5A059',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  חזרה לכניסה מהירה באמצעות קוד SMS (OTP)
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // LOGGED IN USER INTERFACE:
  const isFinanceOnly = user.role === 'FINANCE';
  const isOperationsOnly = user.role === 'OPERATIONS';
  const isManager = user.role === 'MANAGER' || user.role === 'OWNER' || user.username === 'adam' || user.username === 'max';
  const isDark = theme === 'dark';

  return (
    <div 
      dir="rtl"
      style={{
        minHeight: '100dvh',
        background: isDark ? '#26130F' : '#FAF8F3',
        color: isDark ? '#FDFBF7' : '#26130F',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Heebo, Assistant, system-ui, sans-serif'
      }}
    >
      {/* Top Header */}
      <header
        style={{
          background: isDark ? '#26130F' : '#FFFFFF',
          color: isDark ? '#FDFBF7' : '#26130F',
          padding: '0.75rem 1rem',
          borderBottom: isDark ? '1px solid rgba(197, 160, 89, 0.3)' : '1px solid rgba(197, 160, 89, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          boxShadow: isDark ? '0 4px 16px rgba(0, 0, 0, 0.25)' : '0 2px 10px rgba(0, 0, 0, 0.04)'
        }}
      >
        {/* Top row: Brand + User Pill + Logout */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚡</span>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: isDark ? '#FDFBF7' : '#26130F', letterSpacing: '-0.02em' }}>
                ResortOS Dashboard
              </div>
              <div style={{ fontSize: '0.65rem', color: isDark ? '#C5A059' : '#8C6B28', fontWeight: 700 }}>
                {isFinanceOnly ? 'חמ״ל פיננסי בלעדי' : (isOperationsOnly ? 'לוח תפעול' : 'תפעול ופיננסים')}
              </div>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            {/* Options Popup Trigger Button */}
            <button
              type="button"
              onClick={() => setShowOptionsMenu((prev) => !prev)}
              style={{
                border: isDark ? '1px solid rgba(197, 160, 89, 0.45)' : '1px solid rgba(197, 160, 89, 0.35)',
                background: showOptionsMenu 
                  ? (isDark ? 'rgba(197, 160, 89, 0.25)' : 'rgba(197, 160, 89, 0.18)')
                  : (isDark ? 'rgba(38, 19, 15, 0.7)' : '#F5F2EB'),
                color: isDark ? '#FDFBF7' : '#26130F',
                padding: '0.35rem 0.65rem',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.15s ease',
                boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.25)' : '0 1px 4px rgba(0,0,0,0.06)'
              }}
              title="תפריט אפשרויות והגדרות"
            >
              <div 
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #C5A059, #8C6B28)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  fontSize: '0.78rem'
                }}
              >
                {user.display_name ? user.display_name[0] : (user.username ? user.username[0].toUpperCase() : '👤')}
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: isDark ? '#FDFBF7' : '#26130F', lineHeight: 1.2 }}>
                  {user.display_name || user.username}
                </span>
                <span style={{ fontSize: '0.62rem', color: isDark ? '#C5A059' : '#8C6B28', fontWeight: 700, lineHeight: 1.1 }}>
                  {isManager ? 'מנהל מערכת' : 'צוות'} · אפשרויות ▾
                </span>
              </div>
              <ChevronDown 
                size={14} 
                color={isDark ? '#C5A059' : '#8C6B28'} 
                style={{ 
                  transform: showOptionsMenu ? 'rotate(180deg)' : 'none', 
                  transition: 'transform 0.2s ease' 
                }} 
              />
            </button>

            {/* POPUP / POPOVER MENU */}
            {showOptionsMenu && (
              <>
                {/* Backdrop to close on click outside */}
                <div 
                  onClick={() => setShowOptionsMenu(false)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9989,
                    background: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.15)',
                    backdropFilter: 'blur(2px)',
                    WebkitBackdropFilter: 'blur(2px)'
                  }}
                />

                {/* Popover Card */}
                <div
                  dir="rtl"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    zIndex: 9990,
                    width: '315px',
                    maxWidth: 'calc(100vw - 2rem)',
                    background: isDark ? 'rgba(28, 14, 11, 0.98)' : '#FFFFFF',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    border: isDark ? '1.5px solid rgba(197, 160, 89, 0.45)' : '1.5px solid rgba(197, 160, 89, 0.35)',
                    borderRadius: '14px',
                    padding: '1rem',
                    boxShadow: isDark 
                      ? '0 20px 45px rgba(0, 0, 0, 0.75), 0 0 20px rgba(197, 160, 89, 0.15)' 
                      : '0 15px 35px rgba(38, 19, 15, 0.12), 0 0 15px rgba(197, 160, 89, 0.08)',
                    color: isDark ? '#FDFBF7' : '#26130F',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem'
                  }}
                >
                  {/* User Profile Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: isDark ? '1px solid rgba(197, 160, 89, 0.2)' : '1px solid rgba(197, 160, 89, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div 
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: 'linear-gradient(135deg, #C5A059, #8C6B28)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FFFFFF',
                          fontWeight: 900,
                          fontSize: '1.05rem',
                          boxShadow: '0 4px 12px rgba(197, 160, 89, 0.3)'
                        }}
                      >
                        {user.display_name ? user.display_name[0] : '👤'}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 900, color: isDark ? '#FFFFFF' : '#26130F' }}>
                          {user.display_name || user.username}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: isDark ? '#D4C5B9' : '#736055', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>{user.phone || '050-6102416'}</span>
                          <span>•</span>
                          <span style={{ color: '#059669', fontWeight: 800 }}>● פעיל</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOptionsMenu(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isDark ? '#D4C5B9' : '#736055',
                        cursor: 'pointer',
                        padding: '0.2rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Section 1: Quick Theme Switcher */}
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: isDark ? '#C5A059' : '#8C6B28', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ערכת נושא
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={() => handleSetTheme('dark')}
                        style={{
                          background: isDark ? 'rgba(197, 160, 89, 0.25)' : '#F8F6F0',
                          border: isDark ? '1.5px solid #C5A059' : '1px solid rgba(38, 19, 15, 0.12)',
                          color: isDark ? '#F1D699' : '#736055',
                          borderRadius: '8px',
                          padding: '0.45rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <Moon size={13} />
                        <span>כהה</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetTheme('light')}
                        style={{
                          background: !isDark ? 'rgba(197, 160, 89, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                          border: !isDark ? '1.5px solid #C5A059' : '1px solid rgba(255, 255, 255, 0.1)',
                          color: !isDark ? '#8C6B28' : '#D4C5B9',
                          borderRadius: '8px',
                          padding: '0.45rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <Sun size={13} />
                        <span>קרם בהיר</span>
                      </button>
                    </div>
                  </div>

                  {/* Section 2: Desk System Options */}
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: isDark ? '#C5A059' : '#8C6B28', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      הגדרות מערכת מהדסק
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => openSettingsTab('staff')}
                          style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FAF8F3',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(197, 160, 89, 0.22)',
                            color: isDark ? '#FDFBF7' : '#26130F',
                            borderRadius: '8px',
                            padding: '0.5rem 0.7rem',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            textAlign: 'right'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Users size={15} color={isDark ? '#C5A059' : '#8C6B28'} />
                            <span>ניהול עובדים והרשאות</span>
                          </div>
                          <span style={{ fontSize: '0.7rem', color: isDark ? '#C5A059' : '#8C6B28' }}>←</span>
                        </button>
                      )}

                      {isManager && (
                        <button
                          type="button"
                          onClick={() => openSettingsTab('attendance')}
                          style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FAF8F3',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(197, 160, 89, 0.22)',
                            color: isDark ? '#FDFBF7' : '#26130F',
                            borderRadius: '8px',
                            padding: '0.5rem 0.7rem',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            textAlign: 'right'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <MapPin size={15} color={isDark ? '#C5A059' : '#8C6B28'} />
                            <span>נוכחות ומיקום מתחם</span>
                          </div>
                          <span style={{ fontSize: '0.7rem', color: isDark ? '#C5A059' : '#8C6B28' }}>←</span>
                        </button>
                      )}

                      {isManager && (
                        <button
                          type="button"
                          onClick={() => openSettingsTab('sop')}
                          style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FAF8F3',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(197, 160, 89, 0.22)',
                            color: isDark ? '#FDFBF7' : '#26130F',
                            borderRadius: '8px',
                            padding: '0.5rem 0.7rem',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            textAlign: 'right'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ClipboardList size={15} color={isDark ? '#C5A059' : '#8C6B28'} />
                            <span>משימות וצ׳קליסטים (SOP)</span>
                          </div>
                          <span style={{ fontSize: '0.7rem', color: isDark ? '#C5A059' : '#8C6B28' }}>←</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openSettingsTab('display')}
                        style={{
                          background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FAF8F3',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(197, 160, 89, 0.22)',
                          color: isDark ? '#FDFBF7' : '#26130F',
                          borderRadius: '8px',
                          padding: '0.5rem 0.7rem',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          textAlign: 'right'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Globe size={15} color={isDark ? '#C5A059' : '#8C6B28'} />
                          <span>שפה, WhatsApp ו-SMS</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: isDark ? '#C5A059' : '#8C6B28' }}>←</span>
                      </button>

                      {isManager && (
                        <button
                          type="button"
                          onClick={() => openSettingsTab('agents-connected')}
                          style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FAF8F3',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(197, 160, 89, 0.22)',
                            color: isDark ? '#FDFBF7' : '#26130F',
                            borderRadius: '8px',
                            padding: '0.5rem 0.7rem',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            textAlign: 'right'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ShieldCheck size={15} color={isDark ? '#C5A059' : '#8C6B28'} />
                            <span>סוכנים מחוברים</span>
                          </div>
                          <span style={{ fontSize: '0.7rem', color: isDark ? '#C5A059' : '#8C6B28' }}>←</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Section 3: Fast Switch User */}
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: isDark ? '#C5A059' : '#8C6B28', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      החלפת משתמש מהירה
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {PRESET_STAFF_SWITCH.map((staff) => {
                        const isCurrent = user.username === staff.username;
                        return (
                          <button
                            key={staff.username}
                            type="button"
                            onClick={() => handleSwitchUser(staff)}
                            style={{
                              background: isCurrent 
                                ? 'rgba(197, 160, 89, 0.2)' 
                                : (isDark ? 'rgba(255, 255, 255, 0.03)' : '#FAF8F3'),
                              border: isCurrent 
                                ? '1px solid #C5A059' 
                                : (isDark ? '1px solid transparent' : '1px solid rgba(38, 19, 15, 0.08)'),
                              color: isCurrent 
                                ? (isDark ? '#F1D699' : '#8C6B28') 
                                : (isDark ? '#D4C5B9' : '#26130F'),
                              borderRadius: '7px',
                              padding: '0.4rem 0.6rem',
                              fontSize: '0.75rem',
                              fontWeight: isCurrent ? 800 : 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              textAlign: 'right'
                            }}
                          >
                            <span>{staff.display_name}</span>
                            {isCurrent ? (
                              <span style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <Check size={12} />
                                מחובר
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.68rem', color: isDark ? '#94A3B8' : '#736055' }}>{staff.phone}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 4: Logout */}
                  <div style={{ borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(38, 19, 15, 0.1)', paddingTop: '0.6rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowOptionsMenu(false);
                        handleLogout();
                      }}
                      style={{
                        width: '100%',
                        background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                        border: isDark ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid #FCA5A5',
                        color: isDark ? '#FCA5A5' : '#DC2626',
                        borderRadius: '8px',
                        padding: '0.6rem 0.8rem',
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem'
                      }}
                    >
                      <LogOut size={15} />
                      <span>יציאה מהחשבון</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bottom row: Tabs Switcher (Visible to Managers) */}
        {!isFinanceOnly && !isOperationsOnly && (
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              background: isDark ? 'rgba(0, 0, 0, 0.35)' : '#F5F2EB',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(197, 160, 89, 0.28)',
              borderRadius: '9px',
              padding: '3px',
              gap: '4px',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('operations')}
              style={{
                flex: 1,
                border: activeTab === 'operations' 
                  ? (isDark ? '1px solid rgba(197, 160, 89, 0.45)' : '1px solid rgba(197, 160, 89, 0.35)') 
                  : '1px solid transparent',
                borderRadius: '7px',
                padding: '0.45rem 0.75rem',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                background: activeTab === 'operations'
                  ? (isDark ? 'linear-gradient(135deg, #C5A059, #8C6B28)' : 'linear-gradient(135deg, #C5A059, #9E7D3B)')
                  : 'transparent',
                color: activeTab === 'operations' 
                  ? '#FFFFFF' 
                  : (isDark ? '#C7B9AD' : '#736055'),
                boxShadow: activeTab === 'operations' 
                  ? (isDark ? '0 2px 10px rgba(197, 160, 89, 0.25)' : '0 2px 8px rgba(197, 160, 89, 0.22)') 
                  : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Zap size={14} color={activeTab === 'operations' ? '#FFFFFF' : (isDark ? '#C5A059' : '#8C6B28')} />
              <span>תפעול</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('financials')}
              style={{
                flex: 1,
                border: activeTab === 'financials' 
                  ? (isDark ? '1px solid rgba(197, 160, 89, 0.45)' : '1px solid rgba(197, 160, 89, 0.35)') 
                  : '1px solid transparent',
                borderRadius: '7px',
                padding: '0.45rem 0.75rem',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                background: activeTab === 'financials'
                  ? (isDark ? 'linear-gradient(135deg, #C5A059, #8C6B28)' : 'linear-gradient(135deg, #C5A059, #9E7D3B)')
                  : 'transparent',
                color: activeTab === 'financials' 
                  ? '#FFFFFF' 
                  : (isDark ? '#C7B9AD' : '#736055'),
                boxShadow: activeTab === 'financials' 
                  ? (isDark ? '0 2px 10px rgba(197, 160, 89, 0.25)' : '0 2px 8px rgba(197, 160, 89, 0.22)') 
                  : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{ fontSize: '0.85rem' }}>💰</span>
              <span>פיננסים</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('chloe')}
              style={{
                flex: 1,
                border: activeTab === 'chloe' 
                  ? (isDark ? '1px solid rgba(197, 160, 89, 0.45)' : '1px solid rgba(197, 160, 89, 0.35)') 
                  : '1px solid transparent',
                borderRadius: '7px',
                padding: '0.45rem 0.75rem',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                background: activeTab === 'chloe'
                  ? (isDark ? 'linear-gradient(135deg, #C5A059, #8C6B28)' : 'linear-gradient(135deg, #C5A059, #9E7D3B)')
                  : 'transparent',
                color: activeTab === 'chloe' 
                  ? '#FFFFFF' 
                  : (isDark ? '#C7B9AD' : '#736055'),
                boxShadow: activeTab === 'chloe' 
                  ? (isDark ? '0 2px 10px rgba(197, 160, 89, 0.25)' : '0 2px 8px rgba(197, 160, 89, 0.22)') 
                  : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Sparkles size={14} color={activeTab === 'chloe' ? '#FFFFFF' : (isDark ? '#C5A059' : '#8C6B28')} />
              <span>קלואי</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, overflow: activeTab === 'chloe' ? 'hidden' : 'auto' }}>
        {activeTab === 'financials' ? (
          <FinancialCommandCenter 
            tenantId={DEMO_TENANT_ID}
            session={{
              name: user.display_name || user.username,
              role: user.role,
              onLogout: handleLogout
            }}
          />
        ) : activeTab === 'chloe' ? (
          <ChloeDashboardChat 
            sessionUser={user}
            theme={theme}
          />
        ) : (
          <ResortOSOperations 
            theme={theme}
            tenantId={DEMO_TENANT_ID}
            sessionRole={user.role}
            operatorName={user.display_name || user.username}
          />
        )}
      </main>

      {/* Full Settings Modal from Desk */}
      <Suspense fallback={null}>
        <Settings
          theme={theme}
          setTheme={handleSetTheme}
          sessionUser={user}
          onSessionUserUpdate={setUser}
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          initialTab={settingsInitialTab}
          hideTrigger={true}
        />
      </Suspense>
    </div>
  );
}
