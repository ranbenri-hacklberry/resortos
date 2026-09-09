import React, { useEffect, useState } from 'react';
import { Settings as Gear, Eye, EyeOff } from 'lucide-react';
import { persistLanguage } from '../i18n';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { createStaffAccount, deactivateAgentAccount, deactivateStaffAccount, fetchAttendanceSettings, listAgents, listStaff, revealStaffPassword, saveAttendanceSettings, updateStaffAccount, upsertAgentAccount } from '../lib/staffAuth';
import { DEFAULT_SOP_TEMPLATES, fetchSopTemplates, saveSopTemplate, stepLabel } from '../lib/sop';
import { useLiveUnits } from '../lib/resortos-db';
import { DEFAULT_RESORT_UNITS, groupedInventoryUnits, inventoryUnits, normalizeAllowedUnitIds } from '../lib/units';
import { isOpsLead, isOwnerManager, STAFF_ROLES } from '../lib/staffRoles';
import { agentPortalUrl, normalizeGuestOrigin } from '../lib/guestStayUrl';
import { fetchSmsCredit } from '../lib/staffSmsApi';
import BookingRestrictionsSettings from './BookingRestrictionsSettings';

const LANGUAGES = [
  { code: 'he', name: 'עברית', flag: '🇮🇱' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭' }
];

const EMPTY_FORM = {
  display_name: '',
  username: '',
  password: '',
  role: 'HOUSEKEEPING',
  allow_remote_attendance: false,
  allowed_units: [],
  agent_access: false,
  agent_id: '',
  agent_phone: '',
  agent_pin: ''
};

const EMPTY_AGENT = {
  name: '',
  phone: '',
  pin: '',
  commission_rate: 0.1
};

function agentFieldsFromList(agents, staffId, phone) {
  const row = (agents || []).find((item) => item.staff_id === staffId)
    || (phone && (agents || []).find((item) => String(item.phone || '').replace(/\D/g, '') === String(phone || '').replace(/\D/g, '')));
  if (!row) return { agent_access: false, agent_id: '', agent_phone: '', agent_pin: '' };
  return { agent_access: true, agent_id: row.id, agent_phone: row.phone || '', agent_pin: '' };
}

export default function Settings({ theme, setTheme, sessionUser, onSessionUserUpdate }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('display');
  const { i18n, t } = useTranslation();
  const isManager = isOwnerManager(sessionUser?.role);
  const canOpenAgents = isOpsLead(sessionUser?.role);
  const isLight = theme === 'light';

  const [staffList, setStaffList] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [agents, setAgents] = useState([]);
  const [agentForm, setAgentForm] = useState(EMPTY_AGENT);
  const [revealedPins, setRevealedPins] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [staffForm, setStaffForm] = useState(EMPTY_FORM);
  const [staffError, setStaffError] = useState('');
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffSaved, setStaffSaved] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const [revealBusyId, setRevealBusyId] = useState('');
  const [revealHint, setRevealHint] = useState('');
  const [site, setSite] = useState({
    site_label: '',
    latitude: '',
    longitude: '',
    radius_meters: 150
  });
  const [siteError, setSiteError] = useState('');
  const [siteBusy, setSiteBusy] = useState(false);
  const tenantId = sessionUser?.tenant_id || '22222222-2222-2222-2222-222222222222';
  const liveUnits = useLiveUnits(tenantId);
  const pickerUnits = inventoryUnits(liveUnits).length ? inventoryUnits(liveUnits) : DEFAULT_RESORT_UNITS;
  const [sopTemplates, setSopTemplates] = useState(DEFAULT_SOP_TEMPLATES);
  const [sopTemplateId, setSopTemplateId] = useState('turnover-clean');
  const [sopNewStep, setSopNewStep] = useState('');
  const [sopError, setSopError] = useState('');
  const [sopBusy, setSopBusy] = useState(false);
  const [smsCredit, setSmsCredit] = useState(null);
  const [smsCreditError, setSmsCreditError] = useState('');

  const [customDomain, setCustomDomain] = useState(() => {
    const next = normalizeGuestOrigin(localStorage.getItem('hotelos-custom-domain'));
    try {
      localStorage.setItem('hotelos-custom-domain', next);
    } catch (_) {}
    return next;
  });

  useEffect(() => {
    if (!open || tab !== 'staff') return;
    setStaffError('');
    setStaffSaved(false);
    let cancelled = false;
    if (!isManager) {
      setEditingId(sessionUser.id);
      setStaffForm({
        display_name: sessionUser.display_name || '',
        username: sessionUser.username || '',
        password: '',
        role: sessionUser.role,
        allow_remote_attendance: Boolean(sessionUser.allow_remote_attendance),
        allowed_units: normalizeAllowedUnitIds(sessionUser.allowed_units),
        ...agentFieldsFromList(agents, sessionUser.id)
      });
      if (canOpenAgents) {
        listAgents()
          .then((rows) => {
            if (cancelled) return;
            setAgents(rows);
            setStaffForm((prev) => ({ ...prev, ...agentFieldsFromList(rows, sessionUser.id) }));
          })
          .catch(() => { if (!cancelled) setAgents([]); });
      }
      return () => { cancelled = true; };
    }
    setStaffLoading(true);
    listStaff()
      .then((rows) => {
        if (cancelled) return;
        setStaffList(rows);
        setStaffError('');
      })
      .catch(() => {
        if (!cancelled) setStaffError(t('SETTINGS_STAFF_LOAD_ERROR', 'לא ניתן לטעון את רשימת העובדים'));
      })
      .finally(() => { if (!cancelled) setStaffLoading(false); });
    if (canOpenAgents) {
      listAgents()
        .then((rows) => { if (!cancelled) setAgents(rows); })
        .catch(() => { if (!cancelled) setAgents([]); });
    }
    return () => { cancelled = true; };
  }, [open, tab, isManager, canOpenAgents, sessionUser?.id, sessionUser?.display_name, sessionUser?.username, sessionUser?.role, sessionUser?.allow_remote_attendance, t]);

  useEffect(() => {
    if (!open || !isManager || tab !== 'display') return;
    let cancelled = false;
    fetchSmsCredit()
      .then((row) => {
        if (cancelled) return;
        setSmsCredit(row);
        setSmsCreditError('');
      })
      .catch((err) => {
        if (!cancelled) setSmsCreditError(err.message || 'SMS');
      });
    return () => { cancelled = true; };
  }, [open, isManager, tab]);

  useEffect(() => {
    if (!open || !isManager) return;
    let cancelled = false;
    fetchAttendanceSettings()
      .then((settings) => {
        if (cancelled || !settings) return;
        setSite({
          site_label: settings.site_label || '',
          latitude: settings.latitude ?? '',
          longitude: settings.longitude ?? '',
          radius_meters: settings.radius_meters || 150
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, isManager]);

  useEffect(() => {
    if (!open || !isManager || tab !== 'sop') return;
    let cancelled = false;
    fetchSopTemplates(tenantId)
      .then((rows) => { if (!cancelled) setSopTemplates(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, isManager, tab, tenantId]);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    persistLanguage(lng);
  };

  const currentLang = (i18n.language || 'he').split('-')[0];

  const openEditor = (person) => {
    setStaffError('');
    setStaffSaved(false);
    setEditingId(person.id);
    setStaffForm({
      display_name: person.display_name || '',
      username: person.username || '',
      password: '',
      role: person.role || 'HOUSEKEEPING',
      allow_remote_attendance: Boolean(person.allow_remote_attendance),
      allowed_units: normalizeAllowedUnitIds(person.allowed_units),
      ...agentFieldsFromList(agents, person.id)
    });
  };

  const openNew = () => {
    setStaffError('');
    setStaffSaved(false);
    setEditingId('new');
    setStaffForm(EMPTY_FORM);
  };

  const openNewAgent = () => {
    setStaffError('');
    setStaffSaved(false);
    setEditingId('new-agent');
    setAgentForm(EMPTY_AGENT);
  };

  const deactivateAgentRow = async (agent) => {
    try {
      await deactivateAgentAccount(agent.id);
      setAgents((prev) => prev.map((row) => (row.id === agent.id ? { ...row, is_active: false } : row)));
    } catch (err) {
      setStaffError(mapStaffErr(err));
    }
  };

  const mapStaffErr = (err) => {
    const code = err.body?.error || err.message;
    if (code === 'USERNAME_TAKEN') return t('AUTH_USERNAME_TAKEN', 'שם המשתמש כבר תפוס');
    if (code === 'WEAK_PASSWORD') return t('AUTH_WEAK_PASSWORD', 'הסיסמה חייבת לפחות 6 תווים');
    if (code === 'INVALID') return t('AUTH_STAFF_INVALID', 'חסרים שם, שם משתמש או תפקיד תקין');
    if (code === 'FORBIDDEN') return t('AUTH_STAFF_FORBIDDEN', 'רק מנהל יכול להוסיף או לשנות עובדים');
    if (code === 'NOT_FOUND') return t('AUTH_STAFF_NOT_FOUND', 'העובד לא נמצא');
    if (code === 'PHONE_TAKEN') return t('SETTINGS_AGENT_PHONE_TAKEN', 'הטלפון כבר משויך לסוכן אחר');
    if (code === 'WEAK_PIN') return t('SETTINGS_AGENT_WEAK_PIN', 'קוד הסוכן חייב 4 ספרות');
    if (code === 'AGENT_PIN_MISSING') return t('SETTINGS_AGENT_PIN_MISSING', 'חסר סוד קוד סוכן בשרת');
    return t('SETTINGS_STAFF_LOAD_ERROR', 'לא ניתן לשמור את הפרטים');
  };

  const saveLinkedAgent = async (staffUser, form) => {
    const lead = form.role === 'MANAGER' || form.role === 'OPS_MANAGER';
    if (!lead) return;
    if (!form.agent_access) {
      if (form.agent_id) {
        await deactivateAgentAccount(form.agent_id);
        setAgents((prev) => prev.map((row) => (row.id === form.agent_id ? { ...row, is_active: false } : row)));
      }
      return;
    }
    const result = await upsertAgentAccount({
      id: form.agent_id || undefined,
      name: form.display_name,
      phone: form.agent_phone,
      pin: form.agent_pin,
      staff_id: staffUser.id,
      commission_rate: 0
    });
    if (result?.agent) {
      setAgents((prev) => {
        const rest = prev.filter((row) => row.id !== result.agent.id);
        return [...rest, result.agent];
      });
      if (result.pin) setRevealedPins((prev) => ({ ...prev, [result.agent.id]: result.pin }));
    }
  };

  const toggleRevealPassword = async (person) => {
    if (!person?.id) return;
    if (Object.prototype.hasOwnProperty.call(revealedPasswords, person.id)) {
      setRevealedPasswords((prev) => {
        const next = { ...prev };
        delete next[person.id];
        return next;
      });
      setRevealHint('');
      return;
    }
    setRevealBusyId(person.id);
    setRevealHint('');
    try {
      const result = await revealStaffPassword(person.id);
      if (result?.stored && result.password) {
        setRevealedPasswords((prev) => ({ ...prev, [person.id]: result.password }));
      } else {
        setRevealHint(t(
          'SETTINGS_STAFF_PASSWORD_NOT_STORED',
          'אין סיסמה שמורה לצפייה. שמור סיסמה חדשה פעם אחת ואפשר יהיה לראות אותה.'
        ));
      }
    } catch (err) {
      const code = err.body?.error || err.message;
      setRevealHint(code === 'FORBIDDEN'
        ? t('SETTINGS_STAFF_PASSWORD_FORBIDDEN', 'רק מנהל (לא מנהל תפעול) יכול לראות סיסמאות')
        : t('SETTINGS_STAFF_LOAD_ERROR', 'לא ניתן לטעון את הסיסמה'));
    } finally {
      setRevealBusyId('');
    }
  };

  const saveStaff = async () => {
    if (!editingId) return true;
    setStaffError('');
    setStaffSaved(false);
    setStaffBusy(true);
    try {
      if (editingId === 'new') {
        const result = await createStaffAccount(staffForm);
        if (result?.user) {
          setStaffList((prev) => [...prev, result.user]);
          if (staffForm.password) {
            setRevealedPasswords((prev) => ({ ...prev, [result.user.id]: staffForm.password }));
          }
          await saveLinkedAgent(result.user, staffForm);
          setEditingId(null);
          setStaffForm(EMPTY_FORM);
          setStaffSaved(true);
          return true;
        }
        return false;
      }
      if (editingId === 'new-agent') {
        const result = await upsertAgentAccount({
          name: agentForm.name,
          phone: agentForm.phone,
          pin: agentForm.pin,
          commission_rate: Number(agentForm.commission_rate) || 0.1
        });
        if (result?.agent) {
          setAgents((prev) => [...prev.filter((row) => row.id !== result.agent.id), result.agent]);
          if (result.pin) setRevealedPins((prev) => ({ ...prev, [result.agent.id]: result.pin }));
          setEditingId(null);
          setAgentForm(EMPTY_AGENT);
          setStaffSaved(true);
          return true;
        }
        return false;
      }
      const result = await updateStaffAccount(editingId, staffForm);
      if (result?.user) {
        setStaffList((prev) => prev.map((row) => (row.id === result.user.id ? { ...row, ...result.user } : row)));
        if (staffForm.password) {
          setRevealedPasswords((prev) => ({ ...prev, [result.user.id]: staffForm.password }));
        }
        await saveLinkedAgent(result.user, staffForm);
        setStaffForm((prev) => ({ ...prev, password: '', agent_pin: '' }));
        setStaffSaved(true);
        if (result.user.id === sessionUser.id && typeof onSessionUserUpdate === 'function') {
          onSessionUserUpdate((prev) => ({ ...prev, ...result.user }));
        }
        return true;
      }
      return false;
    } catch (err) {
      setStaffError(mapStaffErr(err));
      return false;
    } finally {
      setStaffBusy(false);
    }
  };

  const saveSite = async () => {
    const latitude = Number(site.latitude);
    const longitude = Number(site.longitude);
    const radius_meters = Number(site.radius_meters || 150);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setSiteError(t('SETTINGS_SITE_INVALID', 'חסר מיקום תקין של האתר'));
      return false;
    }
    setSiteError('');
    setSiteBusy(true);
    try {
      await saveAttendanceSettings({
        latitude,
        longitude,
        radius_meters,
        site_label: site.site_label
      });
      return true;
    } catch {
      setSiteError(t('SETTINGS_SITE_SAVE_ERROR', 'לא ניתן לשמור את מיקום הנוכחות'));
      return false;
    } finally {
      setSiteBusy(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setSiteError(t('SETTINGS_SITE_NO_GPS', 'הדפדפן לא מאפשר מיקום. הדביקו קואורדינטות ידנית.'));
      return;
    }
    setSiteBusy(true);
    setSiteError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSite((prev) => ({
          ...prev,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6))
        }));
        setSiteBusy(false);
      },
      () => {
        setSiteBusy(false);
        setSiteError(t('SETTINGS_SITE_NO_GPS', 'הדפדפן לא מאפשר מיקום. הדביקו קואורדינטות ידנית.'));
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const handleSaveAndClose = async () => {
    if (tab === 'attendance') {
      const ok = await saveSite();
      if (!ok) return;
    }
    if (tab === 'staff' && editingId) {
      const ok = await saveStaff();
      if (!ok) return;
    }
    if (tab === 'sop') {
      const ok = await saveSop();
      if (!ok) return;
    }
    setOpen(false);
  };

  const saveSop = async () => {
    setSopError('');
    setSopBusy(true);
    try {
      for (const template of sopTemplates) {
        await saveSopTemplate(tenantId, template);
      }
      return true;
    } catch {
      setSopError(t('SETTINGS_SOP_SAVE_ERROR', 'לא ניתן לשמור את המשימות הקבועות'));
      return false;
    } finally {
      setSopBusy(false);
    }
  };

  const deactivate = async (person) => {
    try {
      await deactivateStaffAccount(person.id);
      const linked = agents.find((row) => row.staff_id === person.id && row.is_active);
      if (linked) await deactivateAgentAccount(linked.id).catch(() => {});
      setStaffList((prev) => prev.map((row) => (
        row.id === person.id ? { ...row, is_active: false } : row
      )));
      if (linked) setAgents((prev) => prev.map((row) => (row.id === linked.id ? { ...row, is_active: false } : row)));
      if (editingId === person.id) setEditingId(null);
    } catch (err) {
      setStaffError(mapStaffErr(err));
    }
  };

  return (
    <div>
      <button
        onClick={() => {
          setTab('display');
          setEditingId(null);
          setOpen(!open);
        }}
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
          cursor: 'pointer'
        }}
      >
        <Gear size={18} />
      </button>

      <AnimatePresence>
        {open && (
          <>
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
                maxWidth: '440px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '1.5rem',
                borderRadius: '20px',
                background: isLight ? '#FFFFFF' : '#1E293B',
                border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                color: isLight ? '#1C1917' : '#F8FAFC'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                  {t('SETTINGS_SYSTEM_TITLE', 'הגדרות מערכת')}
                </h3>
                <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1.2rem' }}>
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.15rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'display', label: t('SETTINGS_TAB_DISPLAY', 'תצוגה') },
                  {
                    id: 'staff',
                    label: isManager
                      ? t('SETTINGS_TAB_STAFF', 'עובדים')
                      : t('SETTINGS_TAB_LOGIN', 'פרטי כניסה')
                  },
                  ...(isManager ? [
                    { id: 'attendance', label: t('SETTINGS_TAB_ATTENDANCE', 'נוכחות') },
                    { id: 'sop', label: t('SETTINGS_TAB_SOP', 'משימות') },
                    { id: 'holidays', label: t('SETTINGS_TAB_HOLIDAYS', 'חגים') }
                  ] : [])
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab(item.id);
                      if (isManager) setEditingId(null);
                      setStaffError('');
                      setStaffSaved(false);
                    }}
                    style={{
                      flex: '1 1 28%',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0.5rem 0.2rem',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      background: tab === item.id
                        ? 'linear-gradient(135deg, #6366F1, #4F46E5)'
                        : (isLight ? '#EAE5DD' : '#0F172A'),
                      color: tab === item.id ? '#FFFFFF' : (isLight ? '#44403C' : '#94A3B8')
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {tab === 'display' ? (
                <>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px' }}>
                      {t('SETTINGS_SELECT_LANG', 'בחר שפה:')}
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                      {LANGUAGES.map((lang) => {
                        const isActive = currentLang === lang.code;
                        return (
                          <button
                            key={lang.code}
                            type="button"
                            onClick={() => changeLanguage(lang.code)}
                            style={choiceStyle(isLight, isActive)}
                          >
                            <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{lang.flag}</div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700 }}>{lang.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px' }}>
                      {t('SETTINGS_SELECT_THEME', 'ערכת נושא:')}
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      {[
                        { id: 'dark', icon: '🌙', label: t('THEME_DARK', 'כהה') },
                        { id: 'light', icon: '☀️', label: t('THEME_LIGHT', 'קרם בהיר') }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTheme(opt.id)}
                          style={{
                            ...choiceStyle(isLight, theme === opt.id),
                            padding: '12px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem'
                          }}
                        >
                          <span>{opt.icon}</span>
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {isManager && (
                    <div style={{ marginBottom: '1.25rem' }}>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 'bold', marginBottom: '4px', color: '#94A3B8' }}>
                        {t('SETTINGS_WHATSAPP_DOMAIN', 'דומיין ל-WhatsApp (Cloudflare/Custom)')}
                      </label>
                      <input
                        type="text"
                        value={customDomain}
                        onChange={(e) => {
                          setCustomDomain(e.target.value);
                          localStorage.setItem('hotelos-custom-domain', e.target.value);
                        }}
                        placeholder="https://resortos.app"
                        style={staffInputStyle(isLight)}
                      />
                    </div>
                  )}

                  {isManager ? (
                    <div style={{
                      marginBottom: '0.5rem',
                      padding: '0.75rem 0.85rem',
                      borderRadius: '12px',
                      background: isLight ? 'rgba(14, 165, 233, 0.08)' : 'rgba(14, 165, 233, 0.12)',
                      border: isLight ? '1px solid rgba(14, 165, 233, 0.25)' : '1px solid rgba(56, 189, 248, 0.25)'
                    }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, marginBottom: '4px' }}>
                        סמס מיקרופיי
                      </div>
                      <div style={{ fontSize: '0.78rem', color: isLight ? '#334155' : '#94A3B8' }}>
                        {smsCreditError
                          ? `לא מחובר: ${smsCreditError}`
                          : (smsCredit?.credit != null || smsCredit?.ok
                            ? `יתרה: ${smsCredit.credit ?? smsCredit.taskId ?? '—'}`
                            : 'בודק יתרה…')}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : tab === 'attendance' ? (
                <AttendanceSiteForm
                  isLight={isLight}
                  site={site}
                  setSite={setSite}
                  siteError={siteError}
                  siteBusy={siteBusy}
                  t={t}
                  useCurrentLocation={useCurrentLocation}
                />
              ) : tab === 'sop' ? (
                <SopTemplatesForm
                  isLight={isLight}
                  t={t}
                  lang={currentLang}
                  templates={sopTemplates}
                  setTemplates={setSopTemplates}
                  templateId={sopTemplateId}
                  setTemplateId={setSopTemplateId}
                  newStep={sopNewStep}
                  setNewStep={setSopNewStep}
                  sopError={sopError}
                />
              ) : tab === 'holidays' ? (
                <BookingRestrictionsSettings tenantId={tenantId} isLight={isLight} t={t} />
              ) : (
                <StaffTab
                  isLight={isLight}
                  isManager={isManager}
                  canOpenAgents={canOpenAgents}
                  sessionUser={sessionUser}
                  staffList={staffList}
                  agents={agents}
                  agentForm={agentForm}
                  setAgentForm={setAgentForm}
                  editingId={editingId}
                  staffForm={staffForm}
                  setStaffForm={setStaffForm}
                  pickerUnits={pickerUnits}
                  staffLoading={staffLoading}
                  staffError={staffError}
                  staffSaved={staffSaved}
                  staffBusy={staffBusy}
                  revealedPasswords={revealedPasswords}
                  revealedPins={revealedPins}
                  revealBusyId={revealBusyId}
                  revealHint={revealHint}
                  onRevealPassword={toggleRevealPassword}
                  t={t}
                  openEditor={openEditor}
                  openNew={openNew}
                  openNewAgent={openNewAgent}
                  deactivate={deactivate}
                  deactivateAgentRow={deactivateAgentRow}
                  onSave={saveStaff}
                  onCancel={() => {
                    setEditingId(null);
                    setStaffError('');
                    setStaffSaved(false);
                    setRevealHint('');
                    setAgentForm(EMPTY_AGENT);
                  }}
                />
              )}

              <button
                type="button"
                disabled={staffBusy || siteBusy || sopBusy}
                onClick={handleSaveAndClose}
                style={{
                  width: '100%',
                  background: '#6366f1',
                  color: 'white',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: (staffBusy || siteBusy || sopBusy) ? 'wait' : 'pointer',
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

function StaffTab({
  isLight,
  isManager,
  canOpenAgents = false,
  sessionUser,
  staffList,
  agents = [],
  agentForm,
  setAgentForm,
  editingId,
  staffForm,
  setStaffForm,
  pickerUnits,
  staffLoading = false,
  staffError,
  staffSaved,
  staffBusy,
  revealedPasswords = {},
  revealedPins = {},
  revealBusyId = '',
  revealHint = '',
  onRevealPassword,
  t,
  openEditor,
  openNew,
  openNewAgent,
  deactivate,
  deactivateAgentRow,
  onSave,
  onCancel
}) {
  const showForm = Boolean(editingId);
  const isNew = editingId === 'new';
  const isNewAgent = editingId === 'new-agent';
  const salesAgents = agents.filter((row) => row.kind !== 'staff' && row.is_active);

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      {isManager && staffLoading && !staffList.length ? (
        <p style={{ color: '#94A3B8', fontSize: '0.75rem', fontWeight: 700, margin: '0 0 10px' }}>
          {t('SETTINGS_STAFF_LOADING', 'טוען עובדים…')}
        </p>
      ) : null}
      {isManager && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: showForm ? '12px' : '10px' }}>
          {staffList.map((person) => (
            <div
              key={person.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: editingId === person.id
                  ? 'rgba(99, 102, 241, 0.12)'
                  : (isLight ? '#FAF8F3' : 'rgba(255,255,255,0.04)'),
                opacity: person.is_active ? 1 : 0.5
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>
                  {person.display_name}
                  {!person.is_active ? ` · ${t('SETTINGS_STAFF_INACTIVE', 'מושבת')}` : ''}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                  {person.username} · {t(`ROLE_${person.role}`, person.role)}
                  {normalizeAllowedUnitIds(person.allowed_units).length
                    ? ` · ${normalizeAllowedUnitIds(person.allowed_units).length} ${t('SETTINGS_STAFF_UNITS_COUNT', 'יחידות')}`
                    : ` · ${t('SETTINGS_STAFF_UNITS_ALL', 'כל היחידות')}`}
                </div>
                {isManager && revealedPasswords[person.id] ? (
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, marginTop: '4px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {t('SETTINGS_STAFF_PASSWORD_LABEL', 'סיסמה')}: {revealedPasswords[person.id]}
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                {isManager && person.is_active && (
                  <button
                    type="button"
                    onClick={() => onRevealPassword(person)}
                    disabled={revealBusyId === person.id}
                    style={textBtn('#0EA5E9')}
                  >
                    {Object.prototype.hasOwnProperty.call(revealedPasswords, person.id)
                      ? t('SETTINGS_STAFF_PASSWORD_HIDE', 'הסתר סיסמה')
                      : t('SETTINGS_STAFF_PASSWORD_SHOW', 'הצג סיסמה')}
                  </button>
                )}
                {person.is_active && (
                  <button type="button" onClick={() => openEditor(person)} style={textBtn('#6366F1')}>
                    {t('SETTINGS_STAFF_EDIT', 'עריכה')}
                  </button>
                )}
                {person.is_active && person.id !== sessionUser.id && (
                  <button type="button" onClick={() => deactivate(person)} style={textBtn('#F87171')}>
                    {t('SETTINGS_STAFF_DEACTIVATE', 'השבת')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isManager && salesAgents.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#94A3B8' }}>
            {t('SETTINGS_AGENTS_TITLE', 'סוכנים חיצוניים')}
          </div>
          {salesAgents.map((agent) => (
            <div
              key={agent.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: isLight ? '#F3FBF6' : 'rgba(16,185,129,0.08)'
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>{agent.name}</div>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                  {agent.phone} · {Math.round((Number(agent.commission_rate) || 0) * 100)}%
                  {revealedPins[agent.id] ? ` · קוד ${revealedPins[agent.id]}` : ''}
                </div>
              </div>
              <button type="button" onClick={() => deactivateAgentRow(agent)} style={textBtn('#F87171')}>
                {t('SETTINGS_STAFF_DEACTIVATE', 'השבת')}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {showForm && !isNewAgent && (
        <StaffForm
          isLight={isLight}
          isManager={isManager}
          canOpenAgents={canOpenAgents}
          isNew={isNew}
          staffForm={staffForm}
          setStaffForm={setStaffForm}
          pickerUnits={pickerUnits}
          staffBusy={staffBusy}
          onSave={onSave}
          t={t}
        />
      )}

      {isNewAgent && (
        <AgentForm
          isLight={isLight}
          agentForm={agentForm}
          setAgentForm={setAgentForm}
          staffBusy={staffBusy}
          onSave={onSave}
          t={t}
        />
      )}

      {revealHint ? (
        <p style={{ color: '#F59E0B', fontSize: '0.75rem', fontWeight: 700, margin: '8px 0 0' }}>{revealHint}</p>
      ) : null}
      {staffError ? (
        <p style={{ color: '#F87171', fontSize: '0.75rem', fontWeight: 700, margin: '8px 0 0' }}>{staffError}</p>
      ) : null}
      {staffSaved && !staffError ? (
        <p style={{ color: '#10B981', fontSize: '0.75rem', fontWeight: 700, margin: '8px 0 0' }}>
          {t('SETTINGS_STAFF_SAVED', 'הפרטים נשמרו')}
        </p>
      ) : null}

      {showForm && isManager && (
        <button type="button" onClick={onCancel} style={{ ...secondaryBtn(isLight), width: '100%', marginTop: '8px' }}>
          {t('SETTINGS_STAFF_CANCEL', 'ביטול')}
        </button>
      )}

      {canOpenAgents && !isManager && !isNew && !isNewAgent ? (
        <a
          href={agentPortalUrl()}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'block',
            textAlign: 'center',
            marginTop: '8px',
            fontSize: '0.8rem',
            fontWeight: 800,
            color: '#059669'
          }}
        >
          {t('SETTINGS_AGENT_OPEN', 'פתח פורטל סוכנים')}
        </a>
      ) : null}
      {isManager && !isNew && !isNewAgent && (
        <>
          <button type="button" onClick={openNew} style={{ ...secondaryBtn(isLight), width: '100%', marginTop: '8px' }}>
            {t('SETTINGS_STAFF_CREATE', 'הוסף עובד')}
          </button>
          <button type="button" onClick={openNewAgent} style={{ ...secondaryBtn(isLight), width: '100%', marginTop: '8px' }}>
            {t('SETTINGS_AGENT_CREATE', 'הוסף סוכן')}
          </button>
          <a
            href={agentPortalUrl()}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block',
              textAlign: 'center',
              marginTop: '8px',
              fontSize: '0.8rem',
              fontWeight: 800,
              color: '#059669'
            }}
          >
            {t('SETTINGS_AGENT_OPEN', 'פתח פורטל סוכנים')}
          </a>
        </>
      )}
    </div>
  );
}

function AgentForm({ isLight, agentForm, setAgentForm, staffBusy, onSave, t }) {
  return (
    <>
      <input
        placeholder={t('SETTINGS_AGENT_NAME', 'שם הסוכן')}
        value={agentForm.name}
        onChange={(e) => setAgentForm((prev) => ({ ...prev, name: e.target.value }))}
        style={staffInputStyle(isLight)}
      />
      <input
        placeholder={t('SETTINGS_AGENT_PHONE', 'טלפון לכניסה')}
        inputMode="tel"
        value={agentForm.phone}
        onChange={(e) => setAgentForm((prev) => ({ ...prev, phone: e.target.value }))}
        style={{ ...staffInputStyle(isLight), marginTop: '6px' }}
      />
      <input
        placeholder={t('SETTINGS_AGENT_PIN', 'קוד בן 4 ספרות')}
        inputMode="numeric"
        value={agentForm.pin}
        onChange={(e) => setAgentForm((prev) => ({ ...prev, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
        style={{ ...staffInputStyle(isLight), marginTop: '6px' }}
      />
      <input
        placeholder={t('SETTINGS_AGENT_COMMISSION', 'עמלה (0.1 = 10%)')}
        inputMode="decimal"
        value={agentForm.commission_rate}
        onChange={(e) => setAgentForm((prev) => ({ ...prev, commission_rate: e.target.value }))}
        style={{ ...staffInputStyle(isLight), marginTop: '6px' }}
      />
      {onSave && (
        <button
          type="button"
          disabled={staffBusy}
          onClick={onSave}
          style={{
            width: '100%',
            marginTop: '10px',
            background: '#059669',
            color: 'white',
            border: 'none',
            padding: '10px',
            borderRadius: '8px',
            fontWeight: 800,
            cursor: staffBusy ? 'wait' : 'pointer',
            fontSize: '0.85rem'
          }}
        >
          {t('SETTINGS_AGENT_SAVE', 'שמור סוכן')}
        </button>
      )}
    </>
  );
}

function StaffForm({ isLight, isManager, canOpenAgents = false, isNew, staffForm, setStaffForm, pickerUnits, staffBusy, onSave, t }) {
  const selected = new Set(normalizeAllowedUnitIds(staffForm.allowed_units));
  const groups = groupedInventoryUnits(pickerUnits || []);
  const allIds = (pickerUnits || []).map((unit) => unit.id);
  const [showTypedPassword, setShowTypedPassword] = useState(false);
  const toggleUnit = (unitId) => {
    setStaffForm((prev) => {
      const current = new Set(normalizeAllowedUnitIds(prev.allowed_units));
      if (current.has(unitId)) current.delete(unitId);
      else current.add(unitId);
      return { ...prev, allowed_units: [...current] };
    });
  };
  const setGroup = (ids, on) => {
    setStaffForm((prev) => {
      const current = new Set(normalizeAllowedUnitIds(prev.allowed_units));
      for (const id of ids) {
        if (on) current.add(id);
        else current.delete(id);
      }
      return { ...prev, allowed_units: [...current] };
    });
  };

  return (
    <>
      <input
        placeholder={t('SETTINGS_STAFF_NAME', 'שם לתצוגה')}
        value={staffForm.display_name}
        onChange={(e) => setStaffForm((prev) => ({ ...prev, display_name: e.target.value }))}
        style={staffInputStyle(isLight)}
      />
      <input
        placeholder={t('SETTINGS_STAFF_USERNAME', 'שם משתמש')}
        autoComplete="off"
        value={staffForm.username}
        onChange={(e) => setStaffForm((prev) => ({ ...prev, username: e.target.value }))}
        style={{ ...staffInputStyle(isLight), marginTop: '6px' }}
      />
      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
        <input
          type={showTypedPassword ? 'text' : 'password'}
          placeholder={isNew
            ? t('SETTINGS_STAFF_PASSWORD', 'סיסמה (לפחות 6 תווים)')
            : t('SETTINGS_STAFF_PASSWORD_OPTIONAL', 'סיסמה חדשה (אופציונלי)')}
          autoComplete="new-password"
          value={staffForm.password}
          onChange={(e) => setStaffForm((prev) => ({ ...prev, password: e.target.value }))}
          style={{ ...staffInputStyle(isLight), marginTop: 0, flex: 1 }}
        />
        {isManager && (
          <button
            type="button"
            onClick={() => setShowTypedPassword((v) => !v)}
            style={{ ...textBtn('#94A3B8'), padding: '8px' }}
            aria-label={showTypedPassword ? 'הסתר' : 'הצג'}
          >
            {showTypedPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {isManager && (
        <select
          value={staffForm.role}
          onChange={(e) => setStaffForm((prev) => ({ ...prev, role: e.target.value }))}
          style={{ ...staffInputStyle(isLight), marginTop: '6px' }}
        >
          {STAFF_ROLES.map((role) => (
            <option key={role} value={role}>{t(`ROLE_${role}`, role)}</option>
          ))}
        </select>
      )}
      {staffForm.role === 'RECEPTION' && (
        <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '8px 0 0', lineHeight: 1.45, fontWeight: 700 }}>
          {t('SETTINGS_STAFF_RECEPTION_HELP', 'תפקיד פקידות פותח את דף החיובים בטלפון: resortos.app/desk — בלי Tailscale ובלי היומן המלא.')}
        </p>
      )}
      {canOpenAgents && (staffForm.role === 'MANAGER' || staffForm.role === 'OPS_MANAGER') && (
        <div style={{
          marginTop: '10px',
          padding: '10px',
          borderRadius: '10px',
          border: isLight ? '1px solid #D1FAE5' : '1px solid rgba(16,185,129,0.25)',
          background: isLight ? '#F0FDF4' : 'rgba(16,185,129,0.06)'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(staffForm.agent_access)}
              onChange={(e) => setStaffForm((prev) => ({ ...prev, agent_access: e.target.checked }))}
            />
            <span>{t('SETTINGS_AGENT_ACCESS', 'גישה לפורטל סוכנים (הזמנות טלפוניות)')}</span>
          </label>
          {staffForm.agent_access ? (
            <>
              <input
                placeholder={t('SETTINGS_AGENT_PHONE', 'טלפון לכניסה')}
                inputMode="tel"
                value={staffForm.agent_phone}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, agent_phone: e.target.value }))}
                style={{ ...staffInputStyle(isLight), marginTop: '8px' }}
              />
              <input
                placeholder={staffForm.agent_id
                  ? t('SETTINGS_AGENT_PIN_OPTIONAL', 'קוד חדש בן 4 ספרות (אופציונלי)')
                  : t('SETTINGS_AGENT_PIN', 'קוד בן 4 ספרות')}
                inputMode="numeric"
                value={staffForm.agent_pin}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, agent_pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                style={{ ...staffInputStyle(isLight), marginTop: '6px' }}
              />
              <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '6px 0 0', lineHeight: 1.4 }}>
                {t('SETTINGS_AGENT_ACCESS_HELP', 'נכנסים ב־resortos.app/agent עם הטלפון והקוד. עמלה 0% — הזמנה פנימית.')}
              </p>
            </>
          ) : null}
        </div>
      )}
      {isManager && (
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '10px',
          fontSize: '0.8rem',
          fontWeight: 700,
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={Boolean(staffForm.allow_remote_attendance)}
            onChange={(e) => setStaffForm((prev) => ({ ...prev, allow_remote_attendance: e.target.checked }))}
          />
          <span>{t('SETTINGS_STAFF_REMOTE', 'מותר לעדכן נוכחות גם מרחוק')}</span>
        </label>
      )}
      {onSave && (
        <button
          type="button"
          disabled={staffBusy}
          onClick={onSave}
          style={{
            width: '100%',
            marginTop: '10px',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            padding: '10px',
            borderRadius: '8px',
            fontWeight: 800,
            cursor: staffBusy ? 'wait' : 'pointer',
            fontSize: '0.85rem'
          }}
        >
          {t('SETTINGS_STAFF_SAVE', 'שמור פרטים')}
        </button>
      )}
      {isManager && (
        <div style={{
          marginTop: '12px',
          border: isLight ? '1px solid #E7E0D6' : '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '10px'
        }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, marginBottom: '4px' }}>
            {t('SETTINGS_STAFF_UNITS', 'יחידות שיראה')}
          </div>
          <p style={{ fontSize: '0.72rem', color: '#94A3B8', margin: '0 0 8px', lineHeight: 1.45 }}>
            {t('SETTINGS_STAFF_UNITS_HELP', 'בלי סימון — רואה את כל היחידות. סמן רק את הצימרים של הצוות הזה.')}
          </p>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            <button type="button" onClick={() => setStaffForm((prev) => ({ ...prev, allowed_units: [...allIds] }))} style={textBtn('#6366F1')}>
              {t('SETTINGS_STAFF_UNITS_SELECT_ALL', 'סמן הכל')}
            </button>
            <button type="button" onClick={() => setStaffForm((prev) => ({ ...prev, allowed_units: [] }))} style={textBtn('#94A3B8')}>
              {t('SETTINGS_STAFF_UNITS_CLEAR', 'כל היחידות')}
            </button>
          </div>
          <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'grid', gap: '10px' }}>
            {groups.map((group) => {
              const ids = group.units.map((unit) => unit.id);
              const allOn = ids.every((id) => selected.has(id));
              return (
                <div key={group.title}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, marginBottom: '4px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={allOn && ids.length > 0}
                      onChange={() => setGroup(ids, !allOn)}
                    />
                    {group.title}
                  </label>
                  <div style={{ display: 'grid', gap: '2px', paddingRight: '18px' }}>
                    {group.units.map((unit) => (
                      <label key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selected.has(unit.id)}
                          onChange={() => toggleUnit(unit.id)}
                        />
                        <span>{t(`${unit.id}_short`, unit.name)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function SopTemplatesForm({
  isLight,
  t,
  lang,
  templates,
  setTemplates,
  templateId,
  setTemplateId,
  newStep,
  setNewStep,
  sopError
}) {
  const current = templates.find((row) => row.id === templateId) || templates[0];
  const updateCurrent = (patch) => {
    setTemplates((prev) => prev.map((row) => (row.id === current.id ? { ...row, ...patch } : row)));
  };

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <p style={{ fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.45, margin: '0 0 12px' }}>
        {t('SETTINGS_SOP_HELP', 'רשימת פעולות שתוצמד אוטומטית למשימות לפי תחום. העובד יכול לסמן אותן ככלי עזר.')}
      </p>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => setTemplateId(template.id)}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: '10px',
              padding: '0.45rem 0.2rem',
              fontSize: '0.72rem',
              fontWeight: 800,
              cursor: 'pointer',
              background: template.id === current.id ? '#6366F1' : (isLight ? '#EAE5DD' : '#0F172A'),
              color: template.id === current.id ? '#FFF' : (isLight ? '#44403C' : '#94A3B8')
            }}
          >
            {t(`FILTER_${template.domain}`, template.domain)}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '8px' }}>
        {current?.title?.[lang] || current?.title?.he}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {(current?.steps || []).map((step) => (
          <div key={step.id} style={{ display: 'flex', gap: '6px' }}>
            <input
              value={stepLabel(step, lang)}
              onChange={(e) => {
                const value = e.target.value;
                updateCurrent({
                  steps: current.steps.map((row) => (
                    row.id === step.id
                      ? { ...row, label: { ...(row.label || {}), [lang]: value, he: lang === 'he' ? value : (row.label?.he || value) } }
                      : row
                  ))
                });
              }}
              style={staffInputStyle(isLight)}
            />
            <button
              type="button"
              onClick={() => updateCurrent({ steps: current.steps.filter((row) => row.id !== step.id) })}
              style={textBtn('#F87171')}
            >
              {t('SETTINGS_SOP_DELETE', 'מחק')}
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
        <input
          value={newStep}
          onChange={(e) => setNewStep(e.target.value)}
          placeholder={t('SETTINGS_SOP_ADD_PH', 'פעולה חדשה...')}
          style={staffInputStyle(isLight)}
        />
        <button
          type="button"
          onClick={() => {
            const text = newStep.trim();
            if (!text) return;
            updateCurrent({
              steps: [...(current.steps || []), { id: `s_${Date.now()}`, label: { he: text, [lang]: text } }]
            });
            setNewStep('');
          }}
          style={{ ...secondaryBtn(isLight), flex: '0 0 auto', padding: '8px 10px' }}
        >
          {t('SETTINGS_SOP_ADD', 'הוסף')}
        </button>
      </div>
      {sopError ? (
        <p style={{ color: '#F87171', fontSize: '0.75rem', fontWeight: 700, margin: '8px 0 0' }}>{sopError}</p>
      ) : null}
    </div>
  );
}

function AttendanceSiteForm({ isLight, site, setSite, siteError, siteBusy, t, useCurrentLocation }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <p style={{ fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.45, margin: '0 0 12px' }}>
        {t('SETTINGS_SITE_HELP', 'זה המיקום שממנו עובדים יכולים להחתים נוכחות. מי שלא מסומן כמרחוק חייב להיות בתוך הרדיוס.')}
      </p>
      <input
        placeholder={t('SETTINGS_SITE_LABEL', 'שם האתר (אופציונלי)')}
        value={site.site_label}
        onChange={(e) => setSite((prev) => ({ ...prev, site_label: e.target.value }))}
        style={staffInputStyle(isLight)}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
        <input
          inputMode="decimal"
          placeholder={t('SETTINGS_SITE_LAT', 'קו רוחב')}
          value={site.latitude}
          onChange={(e) => setSite((prev) => ({ ...prev, latitude: e.target.value }))}
          style={staffInputStyle(isLight)}
        />
        <input
          inputMode="decimal"
          placeholder={t('SETTINGS_SITE_LNG', 'קו אורך')}
          value={site.longitude}
          onChange={(e) => setSite((prev) => ({ ...prev, longitude: e.target.value }))}
          style={staffInputStyle(isLight)}
        />
      </div>
      <input
        inputMode="numeric"
        placeholder={t('SETTINGS_SITE_RADIUS', 'רדיוס במטרים')}
        value={site.radius_meters}
        onChange={(e) => setSite((prev) => ({ ...prev, radius_meters: e.target.value }))}
        style={{ ...staffInputStyle(isLight), marginTop: '6px' }}
      />
      <button
        type="button"
        disabled={siteBusy}
        onClick={useCurrentLocation}
        style={{ ...secondaryBtn(isLight), width: '100%', marginTop: '8px' }}
      >
        {t('SETTINGS_SITE_USE_GPS', 'קבע לפי המיקום הנוכחי')}
      </button>
      {siteError ? (
        <p style={{ color: '#F87171', fontSize: '0.75rem', fontWeight: 700, margin: '8px 0 0' }}>{siteError}</p>
      ) : (
        <p style={{ fontSize: '0.72rem', color: '#94A3B8', margin: '8px 0 0', lineHeight: 1.4 }}>
          {t('SETTINGS_SITE_MANUAL', 'אם ה-GPS חסום, הדביקו קואורדינטות מ-Google Maps.')}
        </p>
      )}
    </div>
  );
}

function choiceStyle(isLight, isActive) {
  return {
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
    color: 'inherit'
  };
}

function staffInputStyle(isLight) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.55rem 0.75rem',
    borderRadius: '8px',
    background: isLight ? '#FAF8F3' : '#111827',
    border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
    color: isLight ? '#1C1917' : '#F8FAFC',
    fontSize: '0.82rem',
    fontWeight: 700
  };
}

function textBtn(color) {
  return {
    border: 'none',
    background: 'transparent',
    color,
    fontSize: '0.7rem',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  };
}

function secondaryBtn(isLight) {
  return {
    flex: 1,
    background: isLight ? '#EAE5DD' : '#111827',
    color: isLight ? '#1C1917' : '#F8FAFC',
    border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'}`,
    padding: '8px',
    borderRadius: '8px',
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: '0.8rem'
  };
}
