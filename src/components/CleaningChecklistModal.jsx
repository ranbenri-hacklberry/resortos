import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardCheck, Printer, X } from 'lucide-react';
import { listAssignableStaff } from '../lib/staffAuth';
import {
  defaultReportDate,
  DUTY_PRINT_AREAS,
  hebrewDateLabel
} from '../lib/dailyDutyReport';
import {
  groupChecklistRoomsByComplex,
  listCheckoutChecklistRooms,
  printCleaningChecklists
} from '../lib/cleaningChecklist';

function isHousekeepingStaff(row) {
  const role = String(row?.role || '').toUpperCase();
  return !role || role === 'HOUSEKEEPING' || role === 'MANAGER' || role === 'OPS_MANAGER';
}

export default function CleaningChecklistModal({
  open,
  onClose,
  bookings,
  units,
  themeStyles,
  buttonStyle,
  initialArea = 'all',
  initialDate
}) {
  const [dateStr, setDateStr] = useState(() => initialDate || defaultReportDate());
  const [area, setArea] = useState(initialArea || 'all');
  const [cleaners, setCleaners] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [selected, setSelected] = useState({});
  const [complexCleaner, setComplexCleaner] = useState({});

  useEffect(() => {
    if (!open) return;
    setDateStr(initialDate || defaultReportDate());
    setArea(initialArea || 'all');
  }, [open, initialDate, initialArea]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const staff = await listAssignableStaff();
        if (cancelled) return;
        const list = (Array.isArray(staff) ? staff : [])
          .filter((row) => row?.is_active !== false && isHousekeepingStaff(row))
          .map((row) => ({
            id: row.id,
            name: String(row.display_name || row.username || '').trim() || 'עובד'
          }))
          .filter((row) => row.name);
        setCleaners(list);
      } catch {
        if (!cancelled) setCleaners([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const rooms = useMemo(
    () => (open ? listCheckoutChecklistRooms({ bookings, units, dateStr, area }) : []),
    [open, bookings, units, dateStr, area]
  );

  const groups = useMemo(() => groupChecklistRoomsByComplex(rooms), [rooms]);

  useEffect(() => {
    if (!open) return;
    setSelected((prev) => {
      const next = {};
      for (const room of rooms) {
        next[room.unitId] = prev[room.unitId] !== false;
      }
      return next;
    });
    setAssignments((prev) => {
      const next = { ...prev };
      for (const room of rooms) {
        if (!(room.unitId in next)) next[room.unitId] = '';
      }
      return next;
    });
  }, [open, rooms]);

  if (!open) return null;

  const selectedRooms = rooms.filter((room) => selected[room.unitId]);
  const selectedCount = selectedRooms.length;

  const setRoomCleaner = (unitId, name) => {
    setAssignments((prev) => ({ ...prev, [unitId]: name }));
  };

  const assignComplex = (title, name) => {
    setComplexCleaner((prev) => ({ ...prev, [title]: name }));
    const group = groups.find((row) => row.title === title);
    if (!group) return;
    setAssignments((prev) => {
      const next = { ...prev };
      for (const room of group.rows) next[room.unitId] = name;
      return next;
    });
  };

  const toggleRoom = (unitId) => {
    setSelected((prev) => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  const toggleGroup = (title, value) => {
    const group = groups.find((row) => row.title === title);
    if (!group) return;
    setSelected((prev) => {
      const next = { ...prev };
      for (const room of group.rows) next[room.unitId] = value;
      return next;
    });
  };

  const selectAll = (value) => {
    setSelected(Object.fromEntries(rooms.map((room) => [room.unitId, value])));
  };

  const runPrint = () => {
    const payload = selectedRooms.map((room) => ({
      ...room,
      cleanerName: String(assignments[room.unitId] || '').trim()
    }));
    printCleaningChecklists({ rooms: payload, dateStr });
  };

  const inputStyle = {
    width: '100%',
    padding: '0.55rem 0.65rem',
    borderRadius: '10px',
    background: themeStyles.inputBg,
    border: `1px solid ${themeStyles.inputBorder}`,
    color: themeStyles.textPrimary,
    fontWeight: 700,
    fontSize: '0.85rem'
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 140,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        onClick={(event) => event.stopPropagation()}
        style={{
          background: themeStyles.wrapperBg,
          border: `1px solid ${themeStyles.inputBorder}`,
          borderRadius: '20px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          overflow: 'auto',
          padding: '1.35rem',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          color: themeStyles.textPrimary
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div>
            <div style={{ color: themeStyles.textMuted, fontSize: '0.75rem', fontWeight: 800 }}>הדפסה למנקים</div>
            <h3 style={{ margin: '0.3rem 0 0', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <ClipboardCheck size={18} />
              צ׳קליסט ניקיון
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: themeStyles.textMuted, cursor: 'pointer', padding: 4 }}
            aria-label="סגור"
          >
            <X size={20} />
          </button>
        </div>

        <label style={{ display: 'block', margin: '1rem 0 0.4rem', fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted }}>
          אזור
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.45rem' }}>
          {DUTY_PRINT_AREAS.map((row) => {
            const active = area === row.id;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setArea(row.id)}
                title={row.hint}
                style={{
                  border: active ? 'none' : `1px solid ${themeStyles.inputBorder}`,
                  borderRadius: '12px',
                  padding: '0.65rem 0.55rem',
                  background: active ? '#0D9488' : themeStyles.inputBg,
                  color: active ? '#fff' : themeStyles.textPrimary,
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  lineHeight: 1.35,
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                {row.label}
              </button>
            );
          })}
        </div>

        <label style={{ display: 'block', margin: '1rem 0 0.4rem', fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted }}>
          תאריך
        </label>
        <input
          type="date"
          value={dateStr}
          onChange={(event) => setDateStr(event.target.value)}
          style={inputStyle}
        />
        <div style={{ marginTop: '0.45rem', fontSize: '0.82rem', color: themeStyles.textMuted }}>
          {hebrewDateLabel(dateStr)} · {rooms.length} יציאות לניקיון · {selectedCount} להדפסה
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => selectAll(true)} style={{ ...buttonStyle, padding: '0.45rem 0.7rem', fontSize: '0.78rem' }}>
            סמן הכל להדפסה
          </button>
          <button type="button" onClick={() => selectAll(false)} style={{ ...buttonStyle, padding: '0.45rem 0.7rem', fontSize: '0.78rem' }}>
            נקה בחירה
          </button>
        </div>

        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.85rem' }}>
          {!rooms.length ? (
            <div style={{
              padding: '1rem',
              borderRadius: '12px',
              background: themeStyles.inputBg,
              border: `1px solid ${themeStyles.inputBorder}`,
              color: themeStyles.textMuted,
              fontWeight: 700,
              fontSize: '0.9rem'
            }}>
              אין יציאות בתאריך ובאזור שנבחרו.
            </div>
          ) : null}

          {groups.map((group) => {
            const allOn = group.rows.every((room) => selected[room.unitId]);
            return (
              <section
                key={group.title}
                style={{
                  border: `1px solid ${themeStyles.inputBorder}`,
                  borderRadius: '14px',
                  overflow: 'hidden',
                  background: themeStyles.inputBg
                }}
              >
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.7rem 0.8rem',
                  borderBottom: `1px solid ${themeStyles.inputBorder}`
                }}>
                  <div style={{ fontWeight: 900, fontSize: '0.88rem' }}>
                    {group.title}
                    <span style={{ marginRight: '0.4rem', color: themeStyles.textMuted, fontWeight: 700, fontSize: '0.78rem' }}>
                      · {group.rows.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.title, !allOn)}
                      style={{ ...buttonStyle, padding: '0.35rem 0.55rem', fontSize: '0.72rem' }}
                    >
                      {allOn ? 'בטל הדפסה' : 'הדפס מתחם'}
                    </button>
                    {cleaners.length ? (
                      <select
                        value={complexCleaner[group.title] || ''}
                        onChange={(event) => assignComplex(group.title, event.target.value)}
                        style={{ ...inputStyle, width: 'auto', minWidth: '140px', padding: '0.4rem 0.5rem', fontSize: '0.78rem' }}
                        aria-label={`מנקה לכל ${group.title}`}
                      >
                        <option value="">מנקה לכל המתחם…</option>
                        {cleaners.map((person) => (
                          <option key={person.id} value={person.name}>{person.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="מנקה לכל המתחם"
                        value={complexCleaner[group.title] || ''}
                        onChange={(event) => assignComplex(group.title, event.target.value)}
                        style={{ ...inputStyle, width: '150px', padding: '0.4rem 0.5rem', fontSize: '0.78rem' }}
                      />
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '0.35rem', padding: '0.55rem' }}>
                  {group.rows.map((room) => (
                    <div
                      key={room.unitId}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr minmax(120px, 150px)',
                        gap: '0.45rem',
                        alignItems: 'center',
                        padding: '0.45rem 0.5rem',
                        borderRadius: '10px',
                        background: themeStyles.wrapperBg,
                        border: `1px solid ${themeStyles.inputBorder}`
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[room.unitId])}
                          onChange={() => toggleRoom(room.unitId)}
                        />
                      </label>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {room.displayName || room.unitName}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: themeStyles.textMuted, fontWeight: 600 }}>
                          {[
                            room.checkoutHour ? `יציאה ${room.checkoutHour}` : '',
                            room.peopleLabel || '',
                            room.lockbox ? `כספת ${room.lockbox}` : ''
                          ].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {cleaners.length ? (
                        <select
                          value={assignments[room.unitId] || ''}
                          onChange={(event) => setRoomCleaner(room.unitId, event.target.value)}
                          style={{ ...inputStyle, padding: '0.4rem 0.45rem', fontSize: '0.75rem' }}
                          aria-label={`מנקה ל${room.displayName || room.unitName}`}
                        >
                          <option value="">בלי שם</option>
                          {cleaners.map((person) => (
                            <option key={person.id} value={person.name}>{person.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="שם מנקה"
                          value={assignments[room.unitId] || ''}
                          onChange={(event) => setRoomCleaner(room.unitId, event.target.value)}
                          style={{ ...inputStyle, padding: '0.4rem 0.45rem', fontSize: '0.75rem' }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1.15rem' }}>
          <button
            type="button"
            onClick={runPrint}
            disabled={!selectedCount}
            style={{
              ...buttonStyle,
              width: '100%',
              padding: '0.8rem',
              justifyContent: 'center',
              background: selectedCount ? '#0D9488' : themeStyles.inputBg,
              color: selectedCount ? '#fff' : themeStyles.textMuted,
              border: 'none',
              opacity: selectedCount ? 1 : 0.7,
              cursor: selectedCount ? 'pointer' : 'not-allowed'
            }}
          >
            <Printer size={15} />
            הדפס {selectedCount || 0} צ׳קליסטים (דף לחדר)
          </button>
        </div>
      </motion.div>
    </div>
  );
}
