import React, { useEffect, useMemo, useState } from 'react';
import { Baby, Banknote, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLiveBookings, useLiveUnits } from '../lib/resortos-db';
import { ensureCanonicalUnits, ensureGuestStayPublished, pushUnitToCloud, syncCloudBookingsToDexie, syncUnitOpsToDexie } from '../lib/cloudDb';
import { buildHousekeepingWhatsAppText, defaultReportDate, hebrewDateLabel, listDutyBoardRows, occupiesCalendarDay, shareHousekeepingWhatsApp, sortDutyBoardRows, turnaroundUnitIds, unitMatchesBoardArea } from '../lib/dailyDutyReport';
import { applyCalendarOccupancy, applyCalendarUnitStatus, applyAssignedStaff, persistRoomCompletions } from '../lib/housekeepingCycle';
import { fieldUnitDisplayName } from '../lib/fieldUnitCatalog';
import { lockboxCodeForUnit } from '../lib/guestProfileSeed';
import { unitDisplayStatus } from '../lib/unitStatus';
import { completionsFromUnit } from '../lib/roomCompletions';
import { calendarInventory, normalizeAllowedUnitIds } from '../lib/units';
import UnitOpsStatusSheet from './UnitOpsStatusSheet';
import DutyBookingSheet, { cashDueIls } from './DutyBookingSheet';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

const TABS = [
  { id: 'checkouts', label: 'יציאות', color: '#F97316' },
  { id: 'checkins', label: 'כניסות', color: '#10B981' },
  { id: 'occupied', label: 'מאוכלסים', color: '#818CF8' },
  { id: 'vacant', label: 'פנויים', color: '#38BDF8' }
];

function shiftYmd(ymd, days) {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export default function FieldDutyBoard({
  theme = 'dark',
  sessionUser = null,
  dataEpoch = 0,
  boardArea = 'all'
}) {
  const { t, i18n } = useTranslation();
  const isLight = theme === 'light';
  const currentLang = (i18n.language || 'he').split('-')[0];
  const isRTL = currentLang === 'he' || currentLang === 'ar';
  const liveUnits = useLiveUnits(TENANT_ID);
  const bookings = useLiveBookings(TENANT_ID);
  const [tab, setTab] = useState('checkins');
  const [wideBoard, setWideBoard] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1100px)').matches
  ));
  const [opsUnitId, setOpsUnitId] = useState(null);
  const [detailBookingId, setDetailBookingId] = useState(null);
  const [unitOverrides, setUnitOverrides] = useState({});
  const [bookingOverrides, setBookingOverrides] = useState({});
  const [shareNote, setShareNote] = useState('');
  const today = defaultReportDate();

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(min-width: 1100px)');
    const onChange = () => setWideBoard(mq.matches);
    onChange();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const colors = {
    bg: isLight ? '#F6F3EC' : '#0A0A0C',
    card: isLight ? '#FFFFFF' : '#141416',
    text: isLight ? '#1C1917' : '#F8FAFC',
    muted: isLight ? '#57534E' : '#94A3B8',
    line: isLight ? 'rgba(28,25,23,0.1)' : 'rgba(255,255,255,0.1)'
  };

  const themeStyles = {
    wrapperBg: colors.card,
    inputBorder: colors.line,
    textPrimary: colors.text,
    textMuted: colors.muted
  };

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const from = shiftYmd(today, -2);
        const to = shiftYmd(today, 21);
        await ensureCanonicalUnits(TENANT_ID, { pullOnly: true, skipPurge: true });
        if (stop) return;
        await Promise.all([
          syncCloudBookingsToDexie(TENANT_ID, { from, to }),
          syncUnitOpsToDexie(TENANT_ID)
        ]);
      } catch (_) {}
    })();
    return () => { stop = true; };
  }, [dataEpoch, today]);

  const units = useMemo(() => {
    if (!Object.keys(unitOverrides).length) return liveUnits;
    return (liveUnits || []).map((unit) => (
      unitOverrides[unit.id] ? { ...unit, ...unitOverrides[unit.id] } : unit
    ));
  }, [liveUnits, unitOverrides]);

  const liveBookings = useMemo(() => {
    if (!Object.keys(bookingOverrides).length) return bookings;
    return (bookings || []).map((row) => (
      bookingOverrides[row.id] ? { ...row, ...bookingOverrides[row.id] } : row
    ));
  }, [bookings, bookingOverrides]);

  const cabins = useMemo(
    () => calendarInventory(units, sessionUser?.allowed_units, TENANT_ID),
    [units, sessionUser?.allowed_units]
  );
  const allowed = useMemo(
    () => normalizeAllowedUnitIds(sessionUser?.allowed_units),
    [sessionUser?.allowed_units]
  );
  const unitsById = useMemo(() => new Map(cabins.map((unit) => [unit.id, unit])), [cabins]);
  const bookingsById = useMemo(() => new Map((liveBookings || []).map((row) => [row.id, row])), [liveBookings]);

  const turnaround = useMemo(() => turnaroundUnitIds(liveBookings, today), [liveBookings, today]);

  const rowsByTab = useMemo(() => {
    const next = {};
    for (const item of TABS) {
      const filtered = listDutyBoardRows({
        bookings: liveBookings,
        units: cabins,
        dateStr: today,
        tab: item.id
      }).filter((row) => {
        if (allowed.length && !allowed.includes(row.unitId)) return false;
        const unit = unitsById.get(row.unitId) || { id: row.unitId, name: row.unitName };
        return unitMatchesBoardArea(unit, boardArea);
      });
      next[item.id] = sortDutyBoardRows(filtered, (row) => {
        const unit = unitsById.get(row.unitId) || { id: row.unitId };
        return unitDisplayStatus(unit, liveBookings, today).key;
      });
    }
    return next;
  }, [liveBookings, cabins, today, allowed, boardArea, unitsById]);

  const rows = rowsByTab[tab] || [];
  const showBoard = wideBoard;

  useEffect(() => {
    const arrivals = rowsByTab.checkins || [];
    if (!arrivals.length) return undefined;
    let stop = false;
    (async () => {
      for (const row of arrivals) {
        if (stop) return;
        const booking = bookingsById.get(row.bookingId);
        if (!booking?.checkout_token) continue;
        await ensureGuestStayPublished(booking).catch(() => {});
      }
    })();
    return () => { stop = true; };
  }, [rowsByTab, bookingsById]);

  const pushOpsQuiet = (patch, options) => (
    pushUnitToCloud(patch, { waitRemote: true, skipStayPublish: true, ...options })
  );

  const closeOpsSheet = () => setOpsUnitId(null);
  const closeDetail = () => setDetailBookingId(null);

  const bookingForRow = (row) => {
    if (row?.bookingId && !String(row.bookingId).startsWith('vacant:')) {
      return bookingsById.get(row.bookingId) || null;
    }
    return (liveBookings || []).find((b) => (
      b.unit_id === row.unitId
      && !b.deleted_at
      && b.booking_status !== 'CANCELED'
      && (
        occupiesCalendarDay(b, today)
        || b.check_in_date === today
        || b.check_out_date === today
      )
    )) || null;
  };

  const applyOptimistic = (unitId, patch) => {
    setUnitOverrides((prev) => ({
      ...prev,
      [unitId]: { ...(prev[unitId] || {}), ...patch, updated_at: new Date().toISOString() }
    }));
  };

  const onPick = async (status) => {
    const unit = unitsById.get(opsUnitId);
    if (!unit) return;
    if (status !== 'NEEDS_COMPLETIONS') closeOpsSheet();
    if (status === 'READY') {
      applyOptimistic(unit.id, {
        operational_status: 'READY',
        operational_domain: 'HOUSEKEEPING',
        custom_reason: 'ממתין לביקורת מנהל',
        is_escalated: false,
        cleaning_started_at: null
      });
    } else if (status === 'DIRTY') {
      applyOptimistic(unit.id, {
        operational_status: 'DIRTY',
        operational_domain: 'HOUSEKEEPING',
        custom_reason: 'ניקוי לאחר יציאה והכנה לכניסה',
        is_escalated: false,
        cleaning_started_at: null
      });
    } else {
      applyOptimistic(unit.id, { operational_status: status });
    }
    await applyCalendarUnitStatus({ tenantId: TENANT_ID, unit, status, pushUnitToCloud: pushOpsQuiet });
  };

  const onCompletions = async (items) => {
    const unit = unitsById.get(opsUnitId);
    if (!unit) return;
    applyOptimistic(unit.id, { operational_status: 'NEEDS_COMPLETIONS' });
    await persistRoomCompletions({ tenantId: TENANT_ID, unit, items, pushUnitToCloud: pushOpsQuiet });
  };

  const onOccupancy = async (occupancy) => {
    const unit = unitsById.get(opsUnitId);
    if (!unit) return;
    closeOpsSheet();
    applyOptimistic(unit.id, {
      staff_occupancy: occupancy === 'OCCUPIED' ? 'OCCUPIED' : 'VACANT'
    });
    await applyCalendarOccupancy({ tenantId: TENANT_ID, unit, occupancy, pushUnitToCloud: pushOpsQuiet });
  };

  const onAssign = async (assignedStaff) => {
    const unit = unitsById.get(opsUnitId);
    if (!unit) return;
    applyOptimistic(unit.id, { assigned_staff: assignedStaff });
    await applyAssignedStaff({ tenantId: TENANT_ID, unit, assignedStaff, pushUnitToCloud: pushOpsQuiet });
  };

  const unitNameOf = (unitId, fallback = '') => {
    const unit = unitsById.get(unitId);
    const i18nName = t(`${unitId}_name`, unit?.name || fallback || unitId);
    return fieldUnitDisplayName(unit || unitId, i18nName);
  };

  const sendCleanersWhatsApp = async () => {
    const text = buildHousekeepingWhatsAppText({
      bookings: liveBookings,
      units: cabins,
      dateStr: today,
      area: boardArea,
      unitIds: allowed,
      teamName: allowed.length
        ? (sessionUser?.display_name || sessionUser?.username || 'הצוות')
        : ''
    });
    const result = await shareHousekeepingWhatsApp(text);
    setShareNote(result.copied ? 'הועתק · נפתח וואטסאפ' : (result.ok ? 'נפתח וואטסאפ' : 'לא נשלח'));
    window.setTimeout(() => setShareNote(''), 2500);
  };

  const renderCard = (row, activeTab) => {
    const unit = unitsById.get(row.unitId);
    const booking = bookingForRow(row);
    const status = unitDisplayStatus(unit || { id: row.unitId }, liveBookings, today);
    const hour = (() => {
      if (row.vacant) return '';
      if (activeTab === 'checkouts') {
        return row.checkoutHour ? `יציאה ${row.checkoutHour}` : '';
      }
      if (activeTab === 'checkins') {
        const parts = [];
        if (row.checkinHour) parts.push(`כניסה ${row.checkinHour}`);
        if (row.checkoutHour) parts.push(`יציאה ${row.checkoutHour}`);
        return parts.join(' · ');
      }
      return '';
    })();
    const isTurnaround = turnaround.has(row.unitId) && activeTab !== 'occupied' && activeTab !== 'vacant';
    const cashIls = booking ? cashDueIls(booking) : 0;
    const isReady = status.key === 'READY';
    const needsCompletions = status.key === 'NEEDS_COMPLETIONS';
    const completions = needsCompletions ? completionsFromUnit(unit) : [];
    const openCompletions = completions.filter((item) => !item.done).map((item) => item.text);
    const lockbox = lockboxCodeForUnit(unit || { id: row.unitId });
    const cardBg = isReady
      ? (isLight ? '#D1FAE5' : 'rgba(16,185,129,0.22)')
      : colors.card;
    const cardBorder = isReady
      ? 'rgba(16,185,129,0.45)'
      : (isTurnaround ? 'rgba(249,115,22,0.35)' : (cashIls ? 'rgba(16,185,129,0.4)' : colors.line));
    return (
      <div
        key={row.bookingId || `${row.unitId}:${row.guest}`}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (booking?.id) setDetailBookingId(booking.id);
          else if (unit) setOpsUnitId(unit.id);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (booking?.id) setDetailBookingId(booking.id);
            else if (unit) setOpsUnitId(unit.id);
          }
        }}
        style={{
          width: '100%',
          textAlign: 'right',
          background: cardBg,
          border: `1px solid ${cardBorder}`,
          borderRadius: 14,
          padding: '0.85rem 0.9rem',
          marginBottom: 8,
          color: colors.text,
          cursor: 'pointer',
          touchAction: 'manipulation'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>
              {unitNameOf(row.unitId, row.unitName)}
            </div>
            {lockbox ? (
              <div style={{
                marginTop: 2,
                fontSize: '0.78rem',
                fontWeight: 800,
                color: colors.muted,
                letterSpacing: '0.04em',
                fontVariantNumeric: 'tabular-nums'
              }}>
                כספת {lockbox}
              </div>
            ) : null}
            <div style={{ marginTop: 4, color: colors.muted, fontWeight: 700, fontSize: '0.86rem' }}>
              {needsCompletions && openCompletions.length
                ? openCompletions.join(', ')
                : `${row.vacant ? 'פנוי' : (row.guest || 'אורח')}${hour ? ` · ${hour}` : ''}`}
            </div>
            {needsCompletions && openCompletions.length && !row.vacant ? (
              <div style={{ marginTop: 4, color: colors.muted, fontWeight: 700, fontSize: '0.8rem' }}>
                {row.guest || 'אורח'}
                {hour ? ` · ${hour}` : ''}
              </div>
            ) : null}
            {!row.vacant && (row.guestTotal > 0 || row.needsCrib) ? (
              <div style={{
                marginTop: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap'
              }}>
                {row.guestTotal > 0 ? (
                  <span style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    color: colors.text,
                    background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${colors.line}`,
                    borderRadius: 999,
                    padding: '2px 9px'
                  }}>
                    {row.peopleLabel && row.peopleLabel !== '—'
                      ? row.peopleLabel
                      : `${row.guestTotal} אורחים`}
                  </span>
                ) : null}
                {row.needsCrib ? (
                  <span
                    title="מיטת תינוק"
                    aria-label="מיטת תינוק"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      color: '#DB2777',
                      background: 'rgba(219,39,119,0.12)',
                      border: '1px solid rgba(219,39,119,0.28)',
                      borderRadius: 999,
                      padding: '2px 8px'
                    }}
                  >
                    <Baby size={13} strokeWidth={2.4} />
                    מיטת תינוק
                  </span>
                ) : null}
              </div>
            ) : null}
            {cashIls > 0 ? (
              <div style={{
                marginTop: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.8rem',
                fontWeight: 900,
                color: '#34D399',
                background: 'rgba(16,185,129,0.16)',
                border: '1px solid rgba(16,185,129,0.35)',
                borderRadius: 999,
                padding: '4px 10px'
              }}>
                <Banknote size={14} />
                מזומן · ₪{cashIls}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (unit) setOpsUnitId(unit.id);
            }}
            style={{
              flex: '0 0 auto',
              fontSize: '0.72rem',
              fontWeight: 800,
              color: status.color,
              background: status.bg,
              border: 'none',
              borderRadius: 999,
              padding: '5px 10px',
              cursor: unit ? 'pointer' : 'default'
            }}
          >
            {status.label}
          </button>
        </div>
        {isTurnaround ? (
          <div style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.74rem',
            fontWeight: 800,
            color: '#F97316',
            background: 'rgba(249,115,22,0.12)',
            border: '1px solid rgba(249,115,22,0.28)',
            borderRadius: 999,
            padding: '3px 10px'
          }}>
            חילוף היום ⚡
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        minHeight: '100%',
        background: colors.bg,
        color: colors.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        touchAction: 'manipulation'
      }}
    >
      <div style={{ padding: '0.85rem 1rem 0.5rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.muted }}>
          {hebrewDateLabel(today)}
        </div>
        <button
          type="button"
          onClick={sendCleanersWhatsApp}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            minHeight: 48,
            marginTop: 10,
            borderRadius: 14,
            border: 'none',
            background: '#25D366',
            color: '#052e16',
            fontWeight: 900,
            fontSize: '0.95rem',
            cursor: 'pointer'
          }}
        >
          <MessageCircle size={18} />
          {shareNote || 'שלח למנקים בוואטסאפ'}
        </button>
        {!showBoard ? (
          <div className="hotelos-duty-tab-chips" style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto' }}>
            {TABS.map((item) => {
              const active = tab === item.id;
              const count = (rowsByTab[item.id] || []).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  style={{
                    flex: '1 1 0',
                    minWidth: 72,
                    minHeight: 40,
                    borderRadius: 999,
                    border: active ? `1px solid ${item.color}73` : `1px solid ${colors.line}`,
                    background: active
                      ? `${item.color}24`
                      : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)'),
                    color: active ? item.color : colors.muted,
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    padding: '0 10px'
                  }}
                >
                  {item.label}
                  <span style={{ opacity: 0.8, marginInlineStart: 4 }}>{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <main style={{ padding: '0.5rem 1rem calc(1.5rem + env(safe-area-inset-bottom))' }}>
        {showBoard ? (
          <div
            className="hotelos-duty-board"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '0.85rem',
              alignItems: 'start'
            }}
          >
            {TABS.map((item) => {
              const colRows = rowsByTab[item.id] || [];
              return (
                <section
                  key={item.id}
                  style={{
                    minWidth: 0,
                    background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${colors.line}`,
                    borderRadius: 16,
                    padding: '0.7rem 0.65rem 0.75rem'
                  }}
                >
                  <header style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 10,
                    padding: '0 0.15rem'
                  }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 900, color: item.color }}>
                      {item.label}
                    </span>
                    <span style={{
                      minWidth: '1.4rem',
                      height: '1.4rem',
                      padding: '0 0.35rem',
                      borderRadius: 999,
                      background: `${item.color}28`,
                      color: item.color,
                      fontSize: '0.72rem',
                      fontWeight: 900,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {colRows.length}
                    </span>
                  </header>
                  <div>
                    {colRows.length
                      ? colRows.map((row) => renderCard(row, item.id))
                      : (
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: colors.muted,
                          textAlign: 'center',
                          padding: '1.1rem 0.4rem',
                          border: `1px dashed ${colors.line}`,
                          borderRadius: 12
                        }}>
                          אין שורות
                        </div>
                      )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : !rows.length ? (
          <div style={{
            marginTop: 24,
            textAlign: 'center',
            color: colors.muted,
            fontWeight: 700,
            fontSize: '0.92rem'
          }}>
            אין שורות ליום הזה
          </div>
        ) : rows.map((row) => renderCard(row, tab))}
      </main>

      {opsUnitId ? (
        <UnitOpsStatusSheet
          key={opsUnitId}
          unit={unitsById.get(opsUnitId)}
          bookings={liveBookings}
          unitName={unitNameOf(opsUnitId)}
          isLight={isLight}
          themeStyles={themeStyles}
          onClose={closeOpsSheet}
          onPick={onPick}
          onOccupancy={onOccupancy}
          onAssign={onAssign}
          onCompletions={onCompletions}
        />
      ) : null}

      {detailBookingId && bookingsById.get(detailBookingId) ? (
        <DutyBookingSheet
          key={detailBookingId}
          booking={bookingsById.get(detailBookingId)}
          unitName={unitNameOf(bookingsById.get(detailBookingId).unit_id)}
          isLight={isLight}
          onClose={closeDetail}
          onBookingSaved={(next) => {
            setBookingOverrides((prev) => ({ ...prev, [next.id]: next }));
            closeDetail();
          }}
        />
      ) : null}
    </div>
  );
}
