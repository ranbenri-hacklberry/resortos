import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { syncCloudBookingsToDexie, syncUnitOpsToDexie } from '../lib/cloudDb';
import {
  fetchKinorotSyncStatus,
  formatKinorotSyncClock,
  formatKinorotSyncLabel,
  startKinorotSync
} from '../lib/kinorotSyncApi';
import { isOpsLead, isOwnerManager } from '../lib/staffRoles';
import { BOARD_AREA_FILTERS } from '../lib/dailyDutyReport';
import FieldDutyBoard from './FieldDutyBoard';
import FieldStaffView from './FieldStaffView';

const Settings = lazy(() => import('./Settings'));
const ResortOSOperations = lazy(() => import('./ResortOSOperations'));
const SharedTaskTracker = lazy(() => import('./SharedTaskTracker'));

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

function boardAreaStorageKey(userId) {
  return `hotelos-board-area:${userId || 'anon'}`;
}

function readBoardArea(userId) {
  try {
    const raw = localStorage.getItem(boardAreaStorageKey(userId)) || 'all';
    if (BOARD_AREA_FILTERS.some((row) => row.id === raw)) return raw;
  } catch (_) {}
  return 'all';
}

export default function FieldOpsShell({
  theme = 'dark',
  setTheme,
  sessionUser = null,
  onLogout,
  onSessionUserUpdate
}) {
  const { t, i18n } = useTranslation();
  const isLight = theme === 'light';
  const currentLang = (i18n.language || 'he').split('-')[0];
  const isRTL = currentLang === 'he' || currentLang === 'ar';
  const isManager = isOwnerManager(sessionUser?.role);
  const opsLead = isOpsLead(sessionUser?.role);
  const canManageDesk = opsLead;
  const canViewErrands = isOwnerManager(sessionUser?.role);
  const tenantId = sessionUser?.tenant_id || TENANT_ID;

  const shellTabs = useMemo(() => {
    const tabs = [
      { id: 'tasks', label: 'תפעול' },
      { id: 'duty', label: 'יום' }
    ];
    if (canViewErrands) tabs.push({ id: 'errands', label: 'קניות וסידורים' });
    return tabs;
  }, [canViewErrands]);

  const [shellTab, setShellTab] = useState('tasks');
  const [boardArea, setBoardArea] = useState(() => readBoardArea(sessionUser?.id || sessionUser?.username));

  useEffect(() => {
    setBoardArea(readBoardArea(sessionUser?.id || sessionUser?.username));
  }, [sessionUser?.id, sessionUser?.username]);

  const onBoardArea = useCallback((next) => {
    setBoardArea(next);
    try {
      localStorage.setItem(boardAreaStorageKey(sessionUser?.id || sessionUser?.username), next);
    } catch (_) {}
  }, [sessionUser?.id, sessionUser?.username]);

  useEffect(() => {
    if (shellTab === 'errands' && !canViewErrands) setShellTab('tasks');
  }, [shellTab, canViewErrands]);
  const [dataEpoch, setDataEpoch] = useState(0);
  const [kinorotRunning, setKinorotRunning] = useState(false);
  const [kinorotStatus, setKinorotStatus] = useState(null);
  const [syncNote, setSyncNote] = useState('');
  const [pullBusy, setPullBusy] = useState(false);
  const lastOkAtRef = useRef('');
  const kinorotBusyRef = useRef(false);
  const canKinorot = opsLead;

  const colors = {
    bg: isLight ? '#F6F3EC' : '#0A0A0C',
    text: isLight ? '#1C1917' : '#F8FAFC',
    muted: isLight ? '#57534E' : '#94A3B8',
    line: isLight ? 'rgba(28,25,23,0.1)' : 'rgba(255,255,255,0.1)'
  };

  const bumpEpoch = useCallback(() => {
    setDataEpoch((n) => n + 1);
  }, []);

  const pullCloudOnce = useCallback(async (options = {}) => {
    setPullBusy(true);
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
      const [y, m, d] = today.split('-').map(Number);
      const fromDt = new Date(y, m - 1, d - 2);
      const toDt = new Date(y, m - 1, d + 2);
      const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const pulled = await syncCloudBookingsToDexie(tenantId, {
        from: fmt(fromDt),
        to: fmt(toDt),
        force: Boolean(options.force)
      });
      await syncUnitOpsToDexie(tenantId);
      const clock = formatKinorotSyncClock(new Date().toISOString());
      if (pulled?.ok) setSyncNote(`נתונים מהסטודיו · ${pulled.count || 0} הזמנות · ${clock}`);
      else setSyncNote(pulled?.error ? `סנכרון נכשל: ${pulled.error}` : 'סנכרון נכשל');
      return pulled;
    } catch (err) {
      setSyncNote(`סנכרון נכשל: ${err?.message || err}`);
      return { ok: false };
    } finally {
      setPullBusy(false);
    }
  }, [tenantId]);

  const applyKinorotDone = useCallback((status) => {
    setKinorotStatus(status || null);
    if (!status?.lastOkAt) return;
    if (status.lastOkAt === lastOkAtRef.current) return;
    lastOkAtRef.current = status.lastOkAt;
    window.dispatchEvent(new CustomEvent('hotelos-kinorot-synced', { detail: status.lastOkAt }));
    bumpEpoch();
    void pullCloudOnce({ force: true });
  }, [bumpEpoch, pullCloudOnce]);

  const runKinorot = useCallback(async () => {
    if (!canKinorot || kinorotBusyRef.current) return;
    kinorotBusyRef.current = true;
    setKinorotRunning(true);
    try {
      const started = await startKinorotSync({ mode: 'duty' });
      setKinorotStatus(started || null);
      if (started?.lastOkAt) lastOkAtRef.current = started.lastOkAt;
      if (started?.running) return;
      kinorotBusyRef.current = false;
      setKinorotRunning(false);
      applyKinorotDone(started);
    } catch (err) {
      kinorotBusyRef.current = false;
      setKinorotRunning(false);
      setKinorotStatus((prev) => ({
        ...(prev || {}),
        running: false,
        lastError: err?.message || 'KINOROT_SYNC_FAILED'
      }));
    }
  }, [applyKinorotDone, canKinorot]);

  useEffect(() => {
    if (shellTab !== 'duty') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchKinorotSyncStatus();
        if (!cancelled) {
          setKinorotStatus(status);
          if (status?.lastOkAt) lastOkAtRef.current = status.lastOkAt;
        }
      } catch (_) {}
      await pullCloudOnce();
      // Manual Kinorot only — auto-sync was restarting the board on phones.
    })();
    return () => { cancelled = true; };
  }, [shellTab, pullCloudOnce]);

  useEffect(() => {
    if (!kinorotRunning) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await fetchKinorotSyncStatus();
        if (cancelled) return;
        setKinorotStatus(status);
        if (status?.running) return;
        kinorotBusyRef.current = false;
        setKinorotRunning(false);
        if (status?.lastError) return;
        applyKinorotDone(status);
      } catch (_) {
        if (!cancelled) {
          kinorotBusyRef.current = false;
          setKinorotRunning(false);
        }
      }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [kinorotRunning, applyKinorotDone]);

  const onRefresh = async () => {
    await pullCloudOnce({ force: true });
    bumpEpoch();
    if (shellTab === 'duty' && canKinorot) void runKinorot();
  };

  const kinorotBanner = (() => {
    if (kinorotRunning) return 'מסנכרן כינורות (יום)…';
    if (kinorotStatus?.lastError && !kinorotStatus?.running) {
      return `כינורות נכשל · ${kinorotStatus.lastError}`;
    }
    if (kinorotStatus?.lastOkAt) {
      const clock = formatKinorotSyncClock(kinorotStatus.lastOkAt);
      const mode = kinorotStatus.mode === 'duty' ? 'יום' : 'מלא';
      const rows = Number(kinorotStatus.rows) || 0;
      return `כינורות סונכרן (${mode}) · ${clock}${rows ? ` · ${rows} שהיות` : ''}`;
    }
    return formatKinorotSyncLabel(kinorotStatus);
  })();

  const showBanner = shellTab === 'duty'
    && (kinorotRunning || syncNote || kinorotStatus?.lastOkAt || kinorotStatus?.lastError);

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        minHeight: '100dvh',
        background: colors.bg,
        color: colors.text,
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: colors.bg,
        borderBottom: `1px solid ${colors.line}`,
        padding: '0.55rem 0.75rem',
        display: 'grid',
        gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            flex: 1,
            fontWeight: 900,
            fontSize: '0.95rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {sessionUser?.display_name || sessionUser?.username || 'ResortOS'}
            {isManager ? (
              <span style={{
                marginInlineStart: 8,
                fontSize: '0.62rem',
                fontWeight: 800,
                color: '#10B981',
                border: '1px solid rgba(16,185,129,0.35)',
                borderRadius: 999,
                padding: '2px 7px'
              }}>
                מנהל
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={pullBusy || kinorotRunning}
            title="רענון"
            aria-label="רענון"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: `1px solid ${colors.line}`,
              background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
              color: (kinorotRunning || pullBusy) ? '#10B981' : colors.muted,
              display: 'grid',
              placeItems: 'center',
              cursor: pullBusy ? 'wait' : 'pointer',
              opacity: pullBusy ? 0.7 : 1
            }}
          >
            <RefreshCw size={18} style={{
              animation: (kinorotRunning || pullBusy) ? 'field-ops-spin 1s linear infinite' : 'none'
            }} />
          </button>
          {canManageDesk ? (
            <Suspense fallback={null}>
              <Settings
                theme={theme}
                setTheme={setTheme}
                sessionUser={sessionUser}
                onSessionUserUpdate={onSessionUserUpdate}
              />
            </Suspense>
          ) : null}
          <button
            type="button"
            onClick={onLogout}
            style={{
              border: `1px solid ${colors.line}`,
              background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
              color: colors.muted,
              borderRadius: 999,
              padding: '0.4rem 0.75rem',
              fontSize: '0.72rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            {t('BTN_LOGOUT', 'יציאה')}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {shellTabs.map((item) => {
            const active = shellTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setShellTab(item.id)}
                style={{
                  flex: shellTabs.length <= 3 ? 1 : '0 0 auto',
                  minWidth: shellTabs.length <= 3 ? 0 : 110,
                  minHeight: 40,
                  borderRadius: 999,
                  border: active ? '1px solid rgba(16,185,129,0.45)' : `1px solid ${colors.line}`,
                  background: active
                    ? 'rgba(16,185,129,0.14)'
                    : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)'),
                  color: active ? '#10B981' : colors.muted,
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  padding: '0 14px',
                  whiteSpace: 'nowrap'
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {shellTab !== 'errands' ? (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {BOARD_AREA_FILTERS.map((item) => {
              const active = boardArea === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onBoardArea(item.id)}
                  style={{
                    flex: '0 0 auto',
                    minHeight: 34,
                    borderRadius: 999,
                    border: active ? '1px solid rgba(99,102,241,0.45)' : `1px solid ${colors.line}`,
                    background: active
                      ? 'rgba(99,102,241,0.14)'
                      : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)'),
                    color: active ? '#818CF8' : colors.muted,
                    fontWeight: 800,
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    padding: '0 12px'
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {showBanner ? (
        <div style={{
          padding: '0.4rem 1rem',
          fontSize: '0.72rem',
          fontWeight: 800,
          color: kinorotRunning
            ? '#10B981'
            : (kinorotStatus?.lastError ? '#F87171' : colors.muted),
          borderBottom: `1px solid ${colors.line}`,
          display: 'grid',
          gap: 2
        }}>
          <div>{kinorotBanner}</div>
          {syncNote && !kinorotRunning ? <div style={{ fontWeight: 700 }}>{syncNote}</div> : null}
        </div>
      ) : null}

      <style>{`@keyframes field-ops-spin { to { transform: rotate(360deg); } }`}</style>

      {shellTab === 'tasks' ? (
        opsLead ? (
          <Suspense fallback={<div style={{ padding: '1.5rem', color: colors.muted, fontWeight: 800 }}>טוען תפעול…</div>}>
            <div className="main-stage operations-stage" style={{ padding: '0.5rem 0' }}>
              <ResortOSOperations
                theme={theme}
                tenantId={tenantId}
                sessionRole={sessionUser?.role || 'MANAGER'}
                canSwitchRole={opsLead}
                allowedUnitIds={sessionUser?.allowed_units}
                boardArea={boardArea}
              />
            </div>
          </Suspense>
        ) : (
          <FieldStaffView
            theme={theme}
            setTheme={setTheme}
            sessionUser={sessionUser}
            onLogout={onLogout}
            liveSync={false}
            dataEpoch={dataEpoch}
            boardArea={boardArea}
          />
        )
      ) : shellTab === 'errands' && canViewErrands ? (
        <Suspense fallback={<div style={{ padding: '1.5rem', color: colors.muted, fontWeight: 800 }}>טוען קניות…</div>}>
          <div style={{ padding: '0.75rem 0.5rem 1.5rem' }}>
            <SharedTaskTracker theme={theme} sessionUser={sessionUser} />
          </div>
        </Suspense>
      ) : (
        <FieldDutyBoard
          theme={theme}
          sessionUser={sessionUser}
          dataEpoch={dataEpoch}
          boardArea={boardArea}
        />
      )}
    </div>
  );
}
