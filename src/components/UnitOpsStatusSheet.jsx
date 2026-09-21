import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { UNIT_OPS_CHOICES, UNIT_STATUS_BADGES, isEffectivelyOccupied, unitDisplayStatus } from '../lib/unitStatus';
import { listAssignableStaff } from '../lib/staffAuth';
import { staffOptionName } from '../lib/staffPhones';
import { completionsFromUnit, NEEDS_COMPLETIONS } from '../lib/roomCompletions';
import RoomCompletionsEditor from './RoomCompletionsEditor';

export default function UnitOpsStatusSheet({
  unit,
  bookings,
  unitName,
  isLight,
  themeStyles,
  onClose,
  onPick,
  onOccupancy,
  onAssign,
  onCompletions
}) {
  const [staff, setStaff] = useState([]);
  const [assignee, setAssignee] = useState(unit?.assigned_staff || '');

  useEffect(() => {
    setAssignee(unit?.assigned_staff || '');
  }, [unit?.id, unit?.assigned_staff]);

  useEffect(() => {
    let cancelled = false;
    listAssignableStaff()
      .then((rows) => {
        if (!cancelled) setStaff(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setStaff([]);
      });
    return () => { cancelled = true; };
  }, []);

  if (!unit || typeof document === 'undefined') return null;
  const occupied = isEffectivelyOccupied(unit, bookings);
  const shown = unitDisplayStatus(unit, bookings);
  const current = unit.operational_status || 'READY';
  const knownNames = new Set(staff.map((row) => staffOptionName(row)).filter(Boolean));
  const extraAssignee = assignee && !knownNames.has(assignee) ? assignee : '';

  const pickAssignee = (name) => {
    setAssignee(name);
    if (typeof onAssign === 'function') onAssign(name);
  };

  const sheet = (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0.75rem'
      }}
    >
      <div
        role="dialog"
        aria-label={`סטטוס ${unitName}`}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          background: themeStyles.wrapperBg,
          border: `1px solid ${themeStyles.inputBorder}`,
          borderRadius: 20,
          padding: '1rem 1rem 1.15rem',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.28)',
          color: themeStyles.textPrimary
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: themeStyles.textMuted }}>סטטוס בקתה</div>
            <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.2rem' }}>{unitName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{ background: 'none', border: 'none', color: themeStyles.textMuted, cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {current === NEEDS_COMPLETIONS ? (
          <>
            <div style={{
              marginTop: 12,
              fontSize: '0.72rem',
              fontWeight: 800,
              color: '#0F766E',
              background: '#CCFBF1',
              borderRadius: 999,
              padding: '4px 10px',
              display: 'inline-block'
            }}>
              השלמות
            </div>
            <RoomCompletionsEditor
              items={completionsFromUnit(unit)}
              isLight={isLight}
              textColor={themeStyles.textPrimary}
              mutedColor={themeStyles.textMuted}
              lineColor={themeStyles.inputBorder}
              onChange={(items) => onCompletions?.(items)}
            />
            <div style={{
              marginTop: 16,
              marginBottom: 6,
              fontSize: '0.72rem',
              fontWeight: 800,
              color: themeStyles.textMuted
            }}>
              שנה סטטוס
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8
            }}>
              {UNIT_OPS_CHOICES.filter((choice) => choice.key !== NEEDS_COMPLETIONS).map((choice) => {
                const badge = UNIT_STATUS_BADGES[choice.key];
                return (
                  <button
                    key={choice.key}
                    type="button"
                    onClick={() => onPick(choice.key)}
                    style={{
                      minHeight: 56,
                      textAlign: 'right',
                      borderRadius: 14,
                      border: `1px solid ${themeStyles.inputBorder}`,
                      background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                      color: themeStyles.textPrimary,
                      cursor: 'pointer',
                      padding: '0.55rem 0.75rem',
                      fontWeight: 800
                    }}
                  >
                    <div style={{ fontSize: '0.95rem', color: badge.color }}>{badge.label}</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: themeStyles.textMuted, marginTop: 2 }}>
                      {choice.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
        <div style={{ marginTop: 10 }}>
          <span style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            color: shown.color,
            background: shown.bg,
            borderRadius: 999,
            padding: '3px 9px'
          }}>
            {shown.label}
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginTop: 12
        }}>
          {[{
            key: 'VACANT',
            label: 'פנוי',
            hint: 'אפשר כניסה / מכירה',
            color: '#10B981',
            bg: 'rgba(16, 185, 129, 0.16)',
            selected: !occupied
          }, {
            key: 'OCCUPIED',
            label: 'תפוס',
            hint: 'יש אורח בחדר',
            color: '#8B5CF6',
            bg: 'rgba(139, 92, 246, 0.16)',
            selected: occupied
          }].map((choice) => (
            <button
              key={choice.key}
              type="button"
              onClick={() => onOccupancy(choice.key)}
              style={{
                minHeight: 64,
                textAlign: 'right',
                borderRadius: 14,
                border: choice.selected ? `2px solid ${choice.color}` : `1px solid ${themeStyles.inputBorder}`,
                background: choice.selected ? choice.bg : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)'),
                color: themeStyles.textPrimary,
                cursor: 'pointer',
                padding: '0.65rem 0.8rem',
                fontWeight: 800
              }}
            >
              <div style={{ fontSize: '1.05rem', color: choice.color }}>{choice.label}</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: themeStyles.textMuted, marginTop: 3 }}>
                {choice.hint}
              </div>
            </button>
          ))}
        </div>

        <div style={{
          marginTop: 14,
          marginBottom: 6,
          fontSize: '0.72rem',
          fontWeight: 800,
          color: themeStyles.textMuted
        }}>
          אחראי על היחידה
        </div>
        <select
          value={assignee}
          onChange={(event) => pickAssignee(event.target.value)}
          style={{
            width: '100%',
            minHeight: 46,
            borderRadius: 12,
            border: `1px solid ${themeStyles.inputBorder}`,
            background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
            color: themeStyles.textPrimary,
            fontWeight: 800,
            fontSize: '0.88rem',
            padding: '0 0.75rem',
            boxSizing: 'border-box'
          }}
        >
          <option value="">לא נבחר</option>
          {extraAssignee ? <option value={extraAssignee}>{extraAssignee}</option> : null}
          {staff.map((row) => {
            const name = staffOptionName(row);
            if (!name) return null;
            return (
              <option key={row.id || name} value={name}>
                {name}
              </option>
            );
          })}
        </select>

        <div style={{
          marginTop: 14,
          marginBottom: 6,
          fontSize: '0.72rem',
          fontWeight: 800,
          color: themeStyles.textMuted
        }}>
          ניקיון ותקלות
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8
        }}>
          {UNIT_OPS_CHOICES.map((choice) => {
            const badge = UNIT_STATUS_BADGES[choice.key];
            const selected = current === choice.key;
            return (
              <button
                key={choice.key}
                type="button"
                onClick={() => onPick(choice.key)}
                style={{
                  minHeight: 72,
                  textAlign: 'right',
                  borderRadius: 14,
                  border: selected ? `2px solid ${badge.color}` : `1px solid ${themeStyles.inputBorder}`,
                  background: selected
                    ? badge.bg
                    : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)'),
                  color: themeStyles.textPrimary,
                  cursor: 'pointer',
                  padding: '0.7rem 0.8rem',
                  fontWeight: 800
                }}
              >
                <div style={{ fontSize: '1rem', color: badge.color }}>{badge.label}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: themeStyles.textMuted, marginTop: 3 }}>
                  {choice.hint}
                </div>
              </button>
            );
          })}
        </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
