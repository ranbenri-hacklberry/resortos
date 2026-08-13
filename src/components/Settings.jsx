import React, { useState } from 'react';
import { Settings as Gear, Moon, Sun, Globe, X, Check, Link } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

export default function Settings({ theme, setTheme }) {
  const [open, setOpen] = useState(false);
  const { i18n, t } = useTranslation();

  const [customDomain, setCustomDomain] = useState(() => {
    return localStorage.getItem('hotelos-custom-domain') || 'https://hotelos-9gg.pages.dev';
  });

  const handleDomainSave = (val) => {
    setCustomDomain(val);
    localStorage.setItem('hotelos-custom-domain', val);
  };

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    const isRtl = (lng === 'he' || lng === 'ar');
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lng);
  };

  const languages = [
    { code: 'he', name: 'עברית', flag: '🇮🇱' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
    { code: 'th', name: 'ไทย', flag: '🇹🇭' }
  ];

  const isLight = theme === 'light';

  return (
    <div>
      {/* Delicate Icon-Only Gear Button */}
      <button
        onClick={() => setOpen(!open)}
        title={t('SETTINGS')}
        style={{
          width: '34px',
          height: '34px',
          borderRadius: '50%',
          border: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
          background: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)',
          color: isLight ? '#57534E' : '#94A3B8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
      >
        <Gear size={18} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ 
                position: 'fixed', 
                inset: 0, 
                zIndex: 9998, 
                background: 'rgba(0,0,0,0.6)', 
                backdropFilter: 'blur(4px)' 
              }}
              onClick={() => setOpen(false)}
            />

            {/* Fixed position Settings Modal - Dead Center */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
              animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
              exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                zIndex: 9999,
                width: 'calc(100vw - 2rem)',
                maxWidth: '360px',
                padding: '1.5rem',
                borderRadius: '20px',
                background: isLight ? '#FFFFFF' : '#1E293B',
                border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                color: isLight ? '#1C1917' : '#F8FAFC'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                  {t('SETTINGS_SYSTEM_TITLE', 'הגדרות מערכת')}
                </h3>
                <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1.2rem' }}>
                  ✕
                </button>
              </div>

              {/* Language Selection Grid (4 Side-by-Side) */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px' }}>
                  {t('SETTINGS_SELECT_LANG', 'בחר שפה:')}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {languages.map(lang => {
                    const isActive = i18n.language === lang.code;
                    return (
                      <div
                        key={lang.code}
                        onClick={() => changeLanguage(lang.code)}
                        style={{
                          background: isActive
                            ? 'rgba(99, 102, 241, 0.12)'
                            : (isLight ? '#FAF8F3' : 'rgba(255,255,255,0.04)'),
                          border: isActive
                            ? '2px solid #6366f1'
                            : (isLight ? '2px solid rgba(0,0,0,0.08)' : '2px solid rgba(255,255,255,0.08)'),
                          borderRadius: '10px',
                          padding: '10px 4px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{lang.flag}</div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700 }}>{lang.name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Theme Selection Grid (2 Side-by-Side) */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px' }}>
                  {t('SETTINGS_SELECT_THEME', 'ערכת נושא:')}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {[
                    { id: 'dark', icon: '🌙', label: t('THEME_DARK', 'כהה') },
                    { id: 'light', icon: '☀️', label: t('THEME_LIGHT', 'קרם בהיר') }
                  ].map(opt => {
                    const isActive = theme === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => setTheme(opt.id)}
                        style={{
                          background: isActive
                            ? 'rgba(99, 102, 241, 0.12)'
                            : (isLight ? '#FAF8F3' : 'rgba(255,255,255,0.04)'),
                          border: isActive
                            ? '2px solid #6366f1'
                            : (isLight ? '2px solid rgba(0,0,0,0.08)' : '2px solid rgba(255,255,255,0.08)'),
                          borderRadius: '10px',
                          padding: '12px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: 'bold',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <span>{opt.icon}</span>
                        <span>{opt.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Domain Input */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 'bold', marginBottom: '4px', color: '#94A3B8' }}>
                  {t('SETTINGS_WHATSAPP_DOMAIN', 'דומיין ל-WhatsApp (Cloudflare/Custom)')}
                </label>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => handleDomainSave(e.target.value)}
                  placeholder="https://hotelos-9gg.pages.dev"
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '8px',
                    background: isLight ? '#FAF8F3' : '#111827',
                    border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
                    color: isLight ? '#1C1917' : '#F8FAFC',
                    fontSize: '0.82rem',
                    fontWeight: 700
                  }}
                />
              </div>

              {/* Save & Close Button */}
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: '100%',
                  background: '#6366f1',
                  color: 'white',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
                }}
              >
                {t('BTN_SAVE_AND_CLOSE', 'שמור וסגור')}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
