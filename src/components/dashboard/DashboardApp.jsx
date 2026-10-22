import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ShieldCheck, Phone, KeyRound, LogOut, Sparkles, Building2, TrendingUp, AlertTriangle, RefreshCw, Zap } from 'lucide-react';
import FinancialCommandCenter from '../finance/FinancialCommandCenter';
import ResortOSOperations from '../ResortOSOperations';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const DASHBOARD_TOKEN_KEY = 'resortos_dashboard_token_v1';
const DASHBOARD_USER_KEY = 'resortos_dashboard_user_v1';

export default function DashboardApp() {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(DASHBOARD_TOKEN_KEY) || '';
    } catch {
      return '';
    }
  });

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(DASHBOARD_USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

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
    fetch('/api/dashboard/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data?.ok || !data?.user) {
          handleLogout();
        } else {
          setUser(data.user);
          localStorage.setItem(DASHBOARD_USER_KEY, JSON.stringify(data.user));
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
    try {
      const res = await fetch('/api/dashboard/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, username: authMode === 'otp' ? undefined : username })
      });
      const data = await res.json();
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
    try {
      const res = await fetch('/api/dashboard/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, challenge })
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.token) {
        throw new Error(data.message || data.error || 'קוד אימות שגוי');
      }
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem(DASHBOARD_TOKEN_KEY, data.token);
      localStorage.setItem(DASHBOARD_USER_KEY, JSON.stringify(data.user));
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
    try {
      const res = await fetch('/api/dashboard/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.token) {
        throw new Error(data.message || data.error || 'פרטי התחברות שגויים');
      }
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem(DASHBOARD_TOKEN_KEY, data.token);
      localStorage.setItem(DASHBOARD_USER_KEY, JSON.stringify(data.user));
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

  return (
    <div 
      dir="rtl"
      style={{
        minHeight: '100dvh',
        background: '#FAF8F3',
        color: '#26130F',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Heebo, Assistant, system-ui, sans-serif'
      }}
    >
      {/* Top Header */}
      <header
        style={{
          background: '#26130F',
          color: '#FDFBF7',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid rgba(197, 160, 89, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Top row: Brand + User Pill + Logout */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚡</span>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: '#FDFBF7', letterSpacing: '-0.02em' }}>
                ResortOS Dashboard
              </div>
              <div style={{ fontSize: '0.65rem', color: '#C5A059', fontWeight: 600 }}>
                {isFinanceOnly ? 'חמ״ל פיננסי בלעדי' : (isOperationsOnly ? 'לוח תפעול' : 'תפעול ופיננסים')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {user.username === 'adam' && (
              <button
                type="button"
                onClick={() => {
                  handleLogout();
                  setTimeout(() => {
                    setUsername('max');
                    setPassword('123456');
                    setPhone('0506102416');
                  }, 50);
                }}
                style={{
                  border: '1px solid #C5A059',
                  background: 'rgba(197, 160, 89, 0.22)',
                  color: '#F1D699',
                  padding: '0.3rem 0.65rem',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                title="החלף משתמש למקס"
              >
                <span>🔄</span>
                <span>החלף למקס (רני)</span>
              </button>
            )}

            <span 
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                background: 'rgba(197, 160, 89, 0.15)',
                color: '#F1D699',
                border: '1px solid rgba(197, 160, 89, 0.35)',
                padding: '0.3rem 0.65rem',
                borderRadius: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <span>👤</span>
              <span>{user.display_name || user.username}</span>
            </span>

            <button
              onClick={handleLogout}
              title="התנתק והחלף משתמש"
              style={{
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#D4C5B9',
                padding: '0.35rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <LogOut size={13} />
              <span>החלף משתמש / יציאה</span>
            </button>
          </div>
        </div>

        {/* Bottom row: Tabs Switcher (Visible to Managers) */}
        {!isFinanceOnly && !isOperationsOnly && (
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              width: '100%',
              paddingTop: '0.2rem'
            }}
          >
            <button
              onClick={() => setActiveTab('operations')}
              style={{
                flex: 1,
                border: 'none',
                borderRadius: '4px',
                padding: '0.55rem 0.75rem',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                background: activeTab === 'operations'
                  ? 'linear-gradient(135deg, #10B981, #059669)'
                  : 'rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                boxShadow: activeTab === 'operations' ? '0 4px 12px rgba(16, 185, 129, 0.35)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <Zap size={15} />
              <span>תפעול (Operations)</span>
            </button>

            <button
              onClick={() => setActiveTab('financials')}
              style={{
                flex: 1,
                border: activeTab === 'financials' ? '1px solid #C5A059' : 'none',
                borderRadius: '4px',
                padding: '0.55rem 0.75rem',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                background: activeTab === 'financials'
                  ? 'linear-gradient(135deg, #C5A059, #99742B)'
                  : 'rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                boxShadow: activeTab === 'financials' ? '0 4px 12px rgba(197, 160, 89, 0.35)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <span>💰</span>
              <span>חמ״ל פיננסי</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'financials' ? (
          <FinancialCommandCenter 
            tenantId={DEMO_TENANT_ID}
            session={{
              name: user.display_name || user.username,
              role: user.role,
              onLogout: handleLogout
            }}
          />
        ) : (
          <ResortOSOperations 
            theme="dark"
            tenantId={DEMO_TENANT_ID}
            sessionRole={user.role}
            operatorName={user.display_name || user.username}
          />
        )}
      </main>
    </div>
  );
}
