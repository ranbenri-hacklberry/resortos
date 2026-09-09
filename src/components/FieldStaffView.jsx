import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ClipboardList, PackageMinus, Settings as Gear, Sparkles, Wrench, X } from 'lucide-react';
import { persistLanguage } from '../i18n';
import { db, useLiveBookings, useLiveUnits } from '../lib/resortos-db';
import {
  ensureCanonicalUnits,
  pushUnitToCloud,
  subscribeToRealtimeCloudBookings,
  subscribeToRealtimeUnitOps,
  syncCloudBookingsToDexie,
  syncUnitOpsToDexie
} from '../lib/cloudDb';
import {
  FAULT_CHIPS,
  SHORTAGE_CHIPS,
  canonicalFieldPhrase,
  fieldStaffCounts,
  guessFieldSourceLang,
  isCatalogFieldReason,
  listFieldStaffTasks,
  translateFieldReason
} from '../lib/fieldStaff';
import { translateToAllLanguages, useDynamicText } from '../lib/translator';
import { ensureTurnoverCleaning, markCabinCleanedForInspection, reopenCabinCleaning } from '../lib/housekeepingCycle';
import {
  countMonthlyCleans,
  decorateWorkLog,
  fetchStaffWorkLog,
  israelMonthStart,
  staffActor
} from '../lib/staffWorkLog';
import { unitFullName, visibleInventory } from '../lib/units';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

const LANGUAGES = [
  { code: 'he', name: 'עברית', flag: '🇮🇱' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭' }
];

export default function FieldStaffView({ theme = 'dark', setTheme, sessionUser = null, onLogout }) {
  const { t, i18n } = useTranslation();
  const isLight = theme === 'light';
  const currentLang = (i18n.language || 'he').split('-')[0];
  const isRTL = currentLang === 'he' || currentLang === 'ar';
  const units = useLiveUnits(TENANT_ID);
  const bookings = useLiveBookings(TENANT_ID);
  const [busyId, setBusyId] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportKind, setReportKind] = useState('fault');
  const [reportUnitId, setReportUnitId] = useState('');
  const [reportText, setReportText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [toast, setToast] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workLog, setWorkLog] = useState([]);

  const actor = useMemo(() => staffActor(sessionUser), [sessionUser]);
  const pushAsStaff = useCallback((patch, options = {}) => (
    pushUnitToCloud({
      ...patch,
      assigned_staff: actor?.name || patch.assigned_staff
    }, { ...options, actor })
  ), [actor]);

  const allowedUnitIds = sessionUser?.allowed_units;
  const tasks = useMemo(
    () => listFieldStaffTasks(units, bookings, undefined, allowedUnitIds),
    [units, bookings, allowedUnitIds]
  );
  const counts = useMemo(() => fieldStaffCounts(tasks), [tasks]);
  const cabins = useMemo(() => visibleInventory(units, allowedUnitIds), [units, allowedUnitIds]);
  const monthCleans = useMemo(() => countMonthlyCleans(workLog), [workLog]);
  const logRows = useMemo(() => decorateWorkLog(workLog, units), [workLog, units]);

  const reloadLog = useCallback(async () => {
    if (!actor?.id) return;
    const rows = await fetchStaffWorkLog({
      tenantId: TENANT_ID,
      staffId: actor.id,
      monthStart: israelMonthStart()
    });
    setWorkLog(rows);
  }, [actor]);

  useEffect(() => {
    document.title = `${t('FIELD_TITLE')} · ResortOS`;
    document.body.classList.add('field-staff-page');
    return () => document.body.classList.remove('field-staff-page');
  }, [t]);

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        await ensureCanonicalUnits(TENANT_ID);
        if (stop) return;
        await Promise.all([
          syncUnitOpsToDexie(TENANT_ID),
          syncCloudBookingsToDexie(TENANT_ID)
        ]);
        if (stop) return;
        const liveUnits = (await db.units.toArray()).filter((row) => row.tenant_id === TENANT_ID);
        const liveBookings = (await db.bookings.toArray()).filter((row) => row.tenant_id === TENANT_ID);
        await ensureTurnoverCleaning({
          tenantId: TENANT_ID,
          units: liveUnits,
          bookings: liveBookings,
          pushUnitToCloud
        });
      } catch (_) {}
    }
    pull();
    const offBookings = subscribeToRealtimeCloudBookings(TENANT_ID);
    const offOps = subscribeToRealtimeUnitOps(TENANT_ID);
    const tick = setInterval(pull, 20000);
    return () => {
      stop = true;
      if (typeof offBookings === 'function') offBookings();
      if (typeof offOps === 'function') offOps();
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    reloadLog();
  }, [reloadLog]);

  useEffect(() => {
    if (!reportUnitId && cabins[0]?.id) setReportUnitId(cabins[0].id);
  }, [cabins, reportUnitId]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  const colors = {
    bg: isLight ? '#F6F3EC' : '#0A0A0C',
    card: isLight ? '#FFFFFF' : '#141416',
    text: isLight ? '#1C1917' : '#F8FAFC',
    muted: isLight ? '#57534E' : '#94A3B8',
    line: isLight ? 'rgba(28,25,23,0.1)' : 'rgba(255,255,255,0.1)'
  };

  const flash = () => {
    try { navigator.vibrate?.(14); } catch (_) {}
  };

  const toggleTask = async (task) => {
    if (!task?.unit || busyId) return;
    setBusyId(task.id);
    flash();
    try {
      if (!task.open) {
        if (task.kind === 'done' && (task.unit.operational_domain === 'GARDENING' || task.unit.operational_domain === 'MAINTENANCE')) {
          const gardening = task.unit.operational_domain === 'GARDENING';
          await pushAsStaff({
            id: task.unit.id,
            tenant_id: TENANT_ID,
            name: task.unit.name,
            operational_status: gardening ? 'GARDENING' : 'MAINTENANCE_ALERT',
            operational_domain: gardening ? 'GARDENING' : 'MAINTENANCE',
            custom_reason: gardening ? 'עבודת גינון פתוחה' : 'תקלת אחזקה פתוחה',
            is_escalated: false,
            cleaning_started_at: null,
            updated_at: new Date().toISOString()
          });
        } else {
          await reopenCabinCleaning({
            tenantId: TENANT_ID,
            unit: task.unit,
            pushUnitToCloud: pushAsStaff
          });
        }
        return;
      }
      if (task.kind === 'maintenance' || task.kind === 'gardening') {
        await pushAsStaff({
          id: task.unit.id,
          tenant_id: TENANT_ID,
          name: task.unit.name,
          operational_status: 'READY',
          operational_domain: task.kind === 'gardening' ? 'GARDENING' : 'MAINTENANCE',
          custom_reason: 'טופל',
          is_escalated: false,
          cleaning_started_at: null,
          updated_at: new Date().toISOString()
        });
        return;
      }
      await markCabinCleanedForInspection({
        tenantId: TENANT_ID,
        unit: task.unit,
        pushUnitToCloud: pushAsStaff
      });
    } finally {
      setBusyId('');
      reloadLog();
    }
  };

  const openReport = (unitId = '', kind = 'fault') => {
    setReportKind(kind === 'shortage' ? 'shortage' : 'fault');
    setReportUnitId(unitId || cabins[0]?.id || '');
    setReportText('');
    setUrgent(false);
    setReportOpen(true);
  };

  const submitReport = async () => {
    const unit = cabins.find((row) => row.id === reportUnitId) || cabins[0];
    if (!unit || busyId) return;
    const shortage = reportKind === 'shortage';
    const typed = reportText.trim();
    const chips = shortage ? SHORTAGE_CHIPS : FAULT_CHIPS;
    const canonical = canonicalFieldPhrase(typed, chips, t);
    const reason = shortage
      ? (canonical ? `חוסר: ${canonical}` : 'חוסר בציוד')
      : (canonical || 'תקלת אחזקה פתוחה');
    setBusyId('report');
    try {
      const keepDirty = shortage && (unit.operational_status === 'DIRTY' || unit.operational_status === 'IN_PROGRESS');
      const prev = String(unit.custom_reason || '').trim();
      const stored = (shortage && keepDirty && prev && !prev.includes(reason)) ? `${prev} · ${reason}` : reason;
      const sourceLang = guessFieldSourceLang(stored, currentLang);
      const reason_i18n = await translateToAllLanguages(stored, sourceLang);
      await pushAsStaff({
        id: unit.id,
        tenant_id: TENANT_ID,
        name: unit.name,
        operational_status: shortage
          ? (keepDirty ? unit.operational_status : 'DIRTY')
          : 'MAINTENANCE_ALERT',
        operational_domain: shortage ? 'HOUSEKEEPING' : 'MAINTENANCE',
        custom_reason: stored,
        reason_i18n,
        text_source_lang: sourceLang,
        is_escalated: urgent,
        cleaning_started_at: shortage ? (unit.cleaning_started_at || null) : null,
        updated_at: new Date().toISOString()
      });
      setToast(shortage ? t('FIELD_TOAST_SHORTAGE') : t('FIELD_TOAST_FAULT'));
      setReportOpen(false);
      flash();
    } finally {
      setBusyId('');
    }
  };

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        minHeight: '100dvh',
        background: colors.bg,
        color: colors.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        touchAction: 'manipulation'
      }}
    >
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: colors.bg,
        padding: '0.85rem 1rem 0.7rem',
        borderBottom: `1px solid ${colors.line}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.muted }}>
              {sessionUser?.display_name || sessionUser?.username || 'ResortOS'}
            </div>
            <h1 style={{ margin: '0.15rem 0 0', fontSize: '1.25rem' }}>{t('FIELD_TITLE')}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              color: '#10B981',
              background: 'rgba(16,185,129,0.12)',
              border: '1px solid rgba(16,185,129,0.28)',
              borderRadius: 999,
              padding: '4px 10px'
            }}>
              {t('FIELD_BADGE')}
            </span>
            {typeof onLogout === 'function' ? (
              <button
                type="button"
                onClick={onLogout}
                style={{
                  minHeight: 36,
                  borderRadius: 999,
                  border: `1px solid ${colors.line}`,
                  background: 'transparent',
                  color: colors.muted,
                  fontWeight: 800,
                  padding: '0 10px',
                  cursor: 'pointer'
                }}
              >
                {t('BTN_LOGOUT')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title={t('SETTINGS')}
              aria-label={t('SETTINGS')}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: `1px solid ${colors.line}`,
                background: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)',
                color: colors.muted,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                touchAction: 'manipulation'
              }}
            >
              <Gear size={18} />
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <div style={countChip(isLight, '#F97316')}>
            <b>{counts.open}</b>
            <span>{t('FIELD_OPEN')}</span>
          </div>
          <div style={countChip(isLight, '#10B981')}>
            <b>{counts.inspect}</b>
            <span>{t('FIELD_DONE')}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLogOpen(true)}
          style={{
            marginTop: 10,
            width: '100%',
            minHeight: 44,
            borderRadius: 12,
            border: `1px solid ${colors.line}`,
            background: colors.card,
            color: colors.text,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            cursor: 'pointer',
            touchAction: 'manipulation'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardList size={16} />
            {t('FIELD_MONTH_CLEANS', { count: monthCleans })}
          </span>
          <span style={{ color: colors.muted, fontSize: '0.78rem' }}>{t('FIELD_MY_LOG')}</span>
        </button>
      </header>

      <main style={{ padding: '0.9rem 1rem calc(1.4rem + env(safe-area-inset-bottom))' }}>
        {tasks.length ? tasks.map((task) => (
          <article
            key={task.id}
            style={{
              background: colors.card,
              border: `1px solid ${task.open ? 'rgba(249,115,22,0.28)' : 'rgba(16,185,129,0.28)'}`,
              borderRadius: 14,
              padding: '0.35rem 0.45rem 0.35rem 0.35rem',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 52
            }}
          >
            <button
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => toggleTask(task)}
              aria-label={task.open ? t('FIELD_MARK_DONE') : t('FIELD_REOPEN')}
              style={{
                width: 48,
                height: 48,
                flex: '0 0 48px',
                borderRadius: 14,
                border: 'none',
                background: task.open ? '#F97316' : '#10B981',
                color: '#FFF',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                touchAction: 'manipulation'
              }}
            >
              {task.open
                ? (task.kind === 'maintenance' ? <Wrench size={22} /> : <Sparkles size={22} />)
                : <Check size={22} />}
            </button>
            <button
              type="button"
              onClick={() => openReport(task.id, task.kind === 'maintenance' ? 'fault' : 'shortage')}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 48,
                background: 'none',
                border: 'none',
                color: colors.text,
                textAlign: isRTL ? 'right' : 'left',
                padding: '0 4px',
                cursor: 'pointer',
                touchAction: 'manipulation'
              }}
            >
              <div style={{
                fontWeight: 900,
                fontSize: '0.98rem',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {task.name}
              </div>
              {!task.cleaning && task.reason ? (
                <div style={{
                  color: colors.muted,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  <FieldReasonText
                    text={task.reason}
                    translations={task.unit?.reason_i18n}
                    sourceLang={task.unit?.text_source_lang}
                  />
                </div>
              ) : null}
              {task.cleaning && task.guests?.total ? (
                <div style={{
                  color: colors.text,
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  marginTop: 2,
                  lineHeight: 1.3
                }}>
                  {t('FIELD_GUESTS')}: {[
                    task.guests.adults ? t('FIELD_PAX_ADULTS', { count: task.guests.adults }) : '',
                    task.guests.children ? t('FIELD_PAX_CHILDREN', { count: task.guests.children }) : '',
                    task.guests.infants ? t('FIELD_PAX_INFANTS', { count: task.guests.infants }) : ''
                  ].filter(Boolean).join(' · ')}
                </div>
              ) : null}
              {task.cleaning && task.lockbox ? (
                <div style={{
                  color: '#F59E0B',
                  fontSize: '0.78rem',
                  fontWeight: 900,
                  marginTop: 2,
                  letterSpacing: '0.04em',
                  fontVariantNumeric: 'tabular-nums'
                }}>
                  {t('FIELD_LOCKBOX')}: {task.lockbox}
                </div>
              ) : null}
            </button>
          </article>
        )) : (
          <div style={{ textAlign: 'center', color: colors.muted, fontWeight: 700, padding: '3rem 1rem' }}>
            {t('FIELD_NO_TASKS')}
          </div>
        )}
      </main>

      {settingsOpen ? (
        <div
          role="presentation"
          onClick={() => setSettingsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 45,
            background: 'rgba(0,0,0,0.55)',
            display: 'grid',
            placeItems: 'center',
            padding: 16
          }}
        >
          <div
            role="dialog"
            aria-label={t('SETTINGS')}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(100%, 420px)',
              background: colors.card,
              borderRadius: 20,
              border: `1px solid ${colors.line}`,
              padding: '1.25rem 1.15rem 1.35rem',
              boxShadow: '0 25px 50px rgba(0,0,0,0.45)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{t('SETTINGS_SYSTEM_TITLE')}</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label={t('BTN_CLOSE', 'סגור')}
                style={{
                  width: 36,
                  height: 36,
                  border: 'none',
                  background: 'none',
                  color: colors.text,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: 8 }}>{t('SETTINGS_SELECT_LANG')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
              {LANGUAGES.map((lang) => {
                const isActive = currentLang === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      i18n.changeLanguage(lang.code);
                      persistLanguage(lang.code);
                    }}
                    aria-label={lang.name}
                    style={{
                      minHeight: 56,
                      borderRadius: 12,
                      border: isActive ? '2px solid #6366f1' : `1px solid ${colors.line}`,
                      background: isActive ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                      color: colors.text,
                      cursor: 'pointer',
                      fontWeight: 800,
                      fontSize: '0.72rem',
                      touchAction: 'manipulation'
                    }}
                  >
                    <div style={{ fontSize: '1.25rem' }}>{lang.flag}</div>
                    {lang.name}
                  </button>
                );
              })}
            </div>
            {typeof setTheme === 'function' ? (
              <>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: 8 }}>{t('SETTINGS_SELECT_THEME')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { id: 'dark', label: t('THEME_DARK') },
                    { id: 'light', label: t('THEME_LIGHT') }
                  ].map((opt) => {
                    const isActive = theme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTheme(opt.id)}
                        style={{
                          minHeight: 48,
                          borderRadius: 12,
                          border: isActive ? '2px solid #6366f1' : `1px solid ${colors.line}`,
                          background: isActive ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                          color: colors.text,
                          cursor: 'pointer',
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          touchAction: 'manipulation'
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {reportOpen ? (
        <div
          role="presentation"
          onClick={() => setReportOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'flex-end'
          }}
        >
          <div
            role="dialog"
            aria-label={t('FIELD_REPORT_TITLE')}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              background: colors.card,
              borderRadius: '20px 20px 0 0',
              padding: '1rem 1rem calc(1.2rem + env(safe-area-inset-bottom))',
              color: colors.text
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{t('FIELD_REPORT_TITLE')}</h2>
              <button type="button" onClick={() => setReportOpen(false)} style={{ background: 'none', border: 'none', color: colors.muted }}>
                <X size={22} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {[{ id: 'fault', label: t('FIELD_FAULT'), Icon: Wrench }, { id: 'shortage', label: t('FIELD_SHORTAGE'), Icon: PackageMinus }].map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => { setReportKind(row.id); setReportText(''); }}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 12,
                    border: reportKind === row.id ? '2px solid #EF4444' : `1px solid ${colors.line}`,
                    background: reportKind === row.id ? 'rgba(239,68,68,0.12)' : 'transparent',
                    color: colors.text,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    touchAction: 'manipulation'
                  }}
                >
                  <row.Icon size={16} />
                  {row.label}
                </button>
              ))}
            </div>
            <label style={{ display: 'block', marginTop: 14, fontSize: '0.78rem', fontWeight: 800, color: colors.muted }}>
              {t('FIELD_PICK_UNIT')}
              <select
                value={reportUnitId}
                onChange={(event) => setReportUnitId(event.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 6,
                  minHeight: 48,
                  borderRadius: 12,
                  border: `1px solid ${colors.line}`,
                  background: isLight ? '#FFF' : '#0A0A0C',
                  color: colors.text,
                  padding: '0 0.75rem',
                  fontWeight: 800
                }}
              >
                {cabins.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unitFullName(unit)}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {(reportKind === 'shortage' ? SHORTAGE_CHIPS : FAULT_CHIPS).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setReportText(t(chip.key))}
                  style={{
                    minHeight: 40,
                    borderRadius: 999,
                    border: `1px solid ${reportText === t(chip.key) || reportText === chip.value ? '#EF4444' : colors.line}`,
                    background: (reportText === t(chip.key) || reportText === chip.value) ? 'rgba(239,68,68,0.12)' : 'transparent',
                    color: colors.text,
                    fontWeight: 800,
                    padding: '0 0.75rem',
                    touchAction: 'manipulation'
                  }}
                >
                  {t(chip.key)}
                </button>
              ))}
            </div>
            <textarea
              value={reportText}
              onChange={(event) => setReportText(event.target.value)}
              placeholder={reportKind === 'shortage' ? t('FIELD_DESC_SHORTAGE') : t('FIELD_DESC_FAULT')}
              rows={4}
              style={{
                width: '100%',
                marginTop: 12,
                borderRadius: 12,
                border: `1px solid ${colors.line}`,
                background: isLight ? '#FFF' : '#0A0A0C',
                color: colors.text,
                padding: '0.8rem',
                fontWeight: 700,
                resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {[{ id: false, label: t('FIELD_PRIORITY_NORMAL') }, { id: true, label: t('FIELD_PRIORITY_URGENT') }].map((row) => (
                <button
                  key={String(row.id)}
                  type="button"
                  onClick={() => setUrgent(row.id)}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 12,
                    border: urgent === row.id ? '2px solid #EF4444' : `1px solid ${colors.line}`,
                    background: urgent === row.id ? 'rgba(239,68,68,0.12)' : 'transparent',
                    color: colors.text,
                    fontWeight: 800,
                    touchAction: 'manipulation'
                  }}
                >
                  {row.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busyId === 'report'}
              onClick={submitReport}
              style={{
                width: '100%',
                minHeight: 52,
                marginTop: 14,
                border: 'none',
                borderRadius: 14,
                background: '#EF4444',
                color: '#FFF',
                fontWeight: 900,
                touchAction: 'manipulation'
              }}
            >
              {reportKind === 'shortage'
                ? <PackageMinus size={16} style={{ marginLeft: 6, verticalAlign: 'middle' }} />
                : <Wrench size={16} style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
              {reportKind === 'shortage' ? t('FIELD_SUBMIT_SHORTAGE') : t('FIELD_SUBMIT_FAULT')}
            </button>
          </div>
        </div>
      ) : null}

      {logOpen ? (
        <div
          role="presentation"
          onClick={() => setLogOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'flex-end'
          }}
        >
          <div
            role="dialog"
            aria-label={t('FIELD_MY_LOG')}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '78dvh',
              overflow: 'auto',
              background: colors.card,
              borderRadius: '20px 20px 0 0',
              padding: '1rem 1rem calc(1.2rem + env(safe-area-inset-bottom))',
              color: colors.text
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{t('FIELD_MY_LOG')}</h2>
              <button type="button" onClick={() => setLogOpen(false)} style={{ background: 'none', border: 'none', color: colors.muted }}>
                <X size={22} />
              </button>
            </div>
            <p style={{ margin: '8px 0 14px', color: colors.muted, fontWeight: 700, fontSize: '0.86rem' }}>
              {t('FIELD_MONTH_SUMMARY', { count: monthCleans })}
              {actor?.name ? ` · ${actor.name}` : ''}
            </p>
            {logRows.length ? logRows.map((row) => (
              <div
                key={row.id}
                style={{
                  borderTop: `1px solid ${colors.line}`,
                  padding: '10px 0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{row.unitName}</div>
                  <div style={{ color: colors.muted, fontSize: '0.78rem', fontWeight: 700 }}>
                    {row.domain === 'MAINTENANCE' ? t('FIELD_DOMAIN_MAINT') : (row.domain === 'GARDENING' ? t('FIELD_DOMAIN_GARDEN') : t('FIELD_DOMAIN_HK'))}
                    {row.reason ? <> · <FieldReasonText text={row.reason} /></> : ''}
                  </div>
                </div>
                <div style={{ color: colors.muted, fontWeight: 800, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  {row.whenLabel}
                </div>
              </div>
            )) : (
              <div style={{ color: colors.muted, fontWeight: 700, textAlign: 'center', padding: '1.5rem 0' }}>
                {t('FIELD_LOG_EMPTY')}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div style={{
          position: 'fixed',
          top: 16,
          left: 16,
          right: 16,
          zIndex: 50,
          background: '#065F46',
          color: '#D1FAE5',
          borderRadius: 14,
          padding: '0.85rem 1rem',
          fontWeight: 800,
          textAlign: 'center'
        }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function FieldReasonText({ text, translations, sourceLang }) {
  const { t } = useTranslation();
  const catalog = isCatalogFieldReason(text, t);
  const dict = translateFieldReason(text, t);
  const source = sourceLang || guessFieldSourceLang(text);
  const live = useDynamicText(catalog ? '' : (text || ''), catalog ? null : (translations || null), source);
  return catalog ? dict : (live || dict);
}

function countChip(isLight, color) {
  return {
    flex: 1,
    borderRadius: 14,
    padding: '0.65rem 0.75rem',
    background: isLight ? '#FFFFFF' : '#141416',
    border: `1px solid ${color}33`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  };
}
